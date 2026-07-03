# app/backend/app/services/chat.py
import asyncio
import json

import httpx
from fastapi import HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.canvas_connection import CanvasConnection


from app.mcp_tools.dispatcher import ToolExecutionError, execute_tool, parse_action
from app.mcp_tools.schemas import ACTION_SCHEMAS
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user import User
from app.services.llm.llm_setting import get_llm_adapter
from app.config import settings

LLM_TIMEOUT_SECONDS = 90.0
HISTORY_WINDOW = 10


from datetime import datetime, date

def _json_dumps(obj) -> str:
    """json.dumps with datetime serialization support.
    Pydantic model_dump() returns Python datetime objects for
    DateTime fields — standard json.dumps can't handle these."""
    def default(o):
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")
    return json.dumps(obj, default=default)

async def get_or_create_conversation(
    db: AsyncSession,
    user: User,
    conversation_id: int | None,
    local_course_id: int | None,
) -> Conversation:
    if conversation_id is not None:
        conversation = await db.scalar(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user.id,
            )
        )
        if conversation:
            return conversation

    conversation = Conversation(user_id=user.id, course_id=local_course_id)
    db.add(conversation)
    await db.flush()
    return conversation


async def log_message(
    db: AsyncSession,
    conversation: Conversation,
    role: str,
    content: str,
) -> Message:
    message = Message(
        conversation_id=conversation.id, role=role, content=content
    )
    db.add(message)
    await db.flush()
    await db.refresh(message)
    return message


async def update_message_content(
    db: AsyncSession,
    conversation_id: int,
    message_id: int,
    new_content: str,
) -> Message:
    """Updates the content of an existing message row in place.
    Used when a user modifies a proposed action — the old intent_preview
    message is overwritten with the new preview so conversation history
    reflects only the latest agreed plan. This prevents the LLM from
    seeing both the old and new preview on the next turn, and keeps the
    messages table as a clean record of current state rather than an
    append-only log of every intermediate draft.

    Ownership is enforced via conversation_id — only messages belonging
    to the given conversation can be updated."""
    message = await db.scalar(
        select(Message).where(
            Message.id == message_id,
            Message.conversation_id == conversation_id,
        )
    )
    if not message:
        raise ToolExecutionError(
            "Preview message not found.",
            log_detail=f"message_id={message_id} not found in conversation_id={conversation_id}",
        )
    message.content = new_content
    await db.flush()
    await db.refresh(message)
    return message


async def _get_recent_messages(
    db: AsyncSession, conversation_id: int
) -> list[dict]:
    """Fetch the last N messages for LLM context. Excludes the most
    recently logged message since generate() appends the current user
    turn explicitly — including it here would cause the current message
    to appear twice in the LLM's context window.

    In a future iteration this step gets replaced by a vector retrieval
    call that fetches semantically relevant history rather than just
    the most recent N messages."""
    rows = await db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(desc(Message.id))
        .limit(HISTORY_WINDOW + 1)
    )
    messages = list(rows)
    messages.reverse()
    # drop the last message — it's the current user turn, which generate()
    # will append separately, and including it here causes duplication
    if messages:
        messages = messages[:-1]
    return [{"role": m.role, "content": m.content} for m in messages]


def build_system_prompt() -> str:
    tool_list = "\n".join(
        f"- {name}: {schema.model_json_schema()}"
        for name, schema in ACTION_SCHEMAS.items()
        if name not in {"out_of_scope", "clarify", "intent_preview", "respond"}
    )

    return """You are a Canvas LMS assistant for instructors. You help
with course management, assignments, student submissions, and
communicating with students.

SCOPE CHECK — do this first, before anything else:
Decide whether the request is about Canvas course management or student
communication. If the request is not about Canvas (e.g. creative
writing, roleplay, general coding help, personal advice, anything
unrelated to teaching), respond ONLY with:
{"action": "out_of_scope", "message": "<brief description of the request>"}

AMBIGUITY CHECK — if the request is in scope but missing information:
If you cannot confidently identify which course, assignment, or
students the user means, respond ONLY with:
{"action": "clarify", "question": "<one specific question>", "partial_plan": <dict>}
Only ask ONE question per turn. Do not ask for information you can infer.

INTENT PREVIEW — if the request is clear enough to act on:
Before executing any action, always show the user what you are about to do:
{"action": "intent_preview", "summary": "<plain English description>", "proposed_action": <dict>}
The user will confirm, modify, or cancel from here.

CONVERSATION HISTORY:
Previous messages in this conversation are provided below. If this is
a follow-up to a clarification question or a refinement of a previous
plan, incorporate the user's feedback into the updated partial_plan
before responding.

META QUESTIONS — if the user asks what you can do, asks for help,
or needs a natural language reply that isn't a Canvas tool call, respond with:
{"action": "respond", "message": "<your natural language answer here>"}
Use this for greetings, capability questions, and clarifying what is in scope.

AVAILABLE ACTIONS (only used inside proposed_action):
""" + tool_list


async def handle_chat_message(
    db: AsyncSession,
    user: User,
    message: str,
    local_course_id: int | None,
    conversation_id: int | None,
    pending_message_id: int | None = None,
) -> tuple[Conversation, dict, bool]:
    """Main chat handler. Two distinct flows:

    Normal turn (pending_message_id=None):
      logs user message, calls LLM, parses response, executes tool,
      logs assistant message as a new row, returns result.

    Modify turn (pending_message_id=<id>):
      same as normal, but if the result is an intent_preview, the old
      preview message is overwritten in place rather than a new row
      being appended. This keeps conversation history clean so the LLM
      sees only the latest agreed plan on subsequent turns."""

    conversation = await get_or_create_conversation(
        db, user, conversation_id, local_course_id
    )
    await log_message(db, conversation, role="user", content=message)

    history = await _get_recent_messages(db, conversation.id)

    system_prompt = build_system_prompt()
    adapter = get_llm_adapter({"provider": settings.DEFAULT_LLM_PROVIDER})

    try:
        raw_output = await asyncio.wait_for(
            adapter.generate(
                system_prompt, message, history=history,
                timeout=LLM_TIMEOUT_SECONDS,
            ),
            timeout=LLM_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        log_detail = f"LLM request timed out after {LLM_TIMEOUT_SECONDS}s"
        await log_message(db, conversation, role="assistant", content=log_detail)
        await db.commit()
        return (
            conversation,
            {"error": "The assistant took too long to respond. Please try again."},
            True,
        )
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            log_detail = "Groq rate limit hit"
            user_message = "The assistant is temporarily rate-limited. Please wait a moment and try again."
        else:
            log_detail = f"LLM API error: {e.response.status_code}"
            user_message = "The assistant service returned an error. Please try again shortly."
        await log_message(db, conversation, role="assistant", content=log_detail)
        await db.commit()
        return conversation, {"error": user_message}, True
    except Exception as e:
        log_detail = f"LLM request failed: {type(e).__name__}: {e}"
        await log_message(db, conversation, role="assistant", content=log_detail)
        await db.commit()
        return (
            conversation,
            {"error": "The assistant is currently unavailable. Please try again shortly."},
            True,
        )

    try:
        action = parse_action(raw_output)
        result = await execute_tool(db, user, action)
    except ToolExecutionError as e:
        await log_message(db, conversation, role="assistant", content=e.log_detail)
        await db.commit()
        return conversation, {"error": e.user_message}, True

    # Log the assistant result — if this is a modify turn superseding a
    # previous intent_preview, overwrite that message in place rather than
    # appending a new row, so the LLM's next turn sees only the updated plan
    if result.get("intent_preview") and pending_message_id:
        assistant_msg = await update_message_content(
            db, conversation.id, pending_message_id, _json_dumps(result)
        )
    else:
        assistant_msg = await log_message(
            db, conversation, role="assistant", content=_json_dumps(result)
        )

    await db.commit()

    # attach the stored message ID so the client can confirm by ID
    if result.get("intent_preview"):
        result["pending_message_id"] = assistant_msg.id

    return conversation, result, False


async def handle_confirmed_action(
    db: AsyncSession,
    user: User,
    conversation_id: int,
    pending_message_id: int,
) -> tuple[Conversation, dict, bool]:
    """Executes the action stored in a previous intent_preview message.
    The client confirms by message ID only — it cannot redefine what
    action gets executed. The server loads the proposed_action from its
    own stored message, verifying ownership and that the message actually
    contains an intent_preview, before executing anything.

    This is PATH B in the dispatcher's two-path architecture: by the
    time execute_tool is called here, the user has already confirmed,
    so write action cases call Canvas directly without generating another
    preview."""

    conversation = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    preview_message = await db.scalar(
        select(Message).where(
            Message.id == pending_message_id,
            Message.conversation_id == conversation_id,
            Message.role == "assistant",
        )
    )
    if not preview_message:
        raise HTTPException(
            status_code=404,
            detail="Preview message not found in this conversation.",
        )

    try:
        stored = json.loads(preview_message.content)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(
            status_code=409,
            detail="Referenced message is not a confirmable action.",
        )
    

    if not stored.get("intent_preview") or "proposed_action" not in stored:
        raise HTTPException(
            status_code=409,
            detail="Referenced message is not a confirmable action.",
        )

    # reload user with relationships eagerly loaded for this db session —
    # the user object from get_current_user may have canvas_connections
    # loaded in a different session context, causing greenlet errors when
    # execute_tool accesses them during async execution
    from sqlalchemy import select as sa_select
    user = await db.scalar(
        sa_select(User)
        .where(User.id == user.id)
        .options(selectinload(User.canvas_connections))
    )

    await log_message(db, conversation, role="user", content="[confirmed action]")



    try:
        action = parse_action(json.dumps(stored["proposed_action"]))
        result = await execute_tool(db, user, action)
    except ToolExecutionError as e:
        await log_message(db, conversation, role="assistant", content=e.log_detail)
        await db.commit()
        return conversation, {"error": e.user_message}, True
    except HTTPException as e:
        # Semantic validators (e.g. validate_assignment_for_create) and
        # services/canvas.py raise HTTPException directly rather than
        # ToolExecutionError. Left uncaught, this propagates past
        # ChatResponse and the client gets a bare {"detail": ...} body
        # with no "reply" key. Fold it into the same error-reply shape
        # so the user actually sees why the confirmed action failed.
        detail = e.detail if isinstance(e.detail, str) else str(e.detail)
        await log_message(db, conversation, role="assistant", content=f"HTTPException {e.status_code}: {detail}")
        await db.commit()
        return conversation, {"error": detail}, True

    await log_message(
        db, conversation, role="assistant", content=_json_dumps(result)
    )
    await db.commit()
    return conversation, result, False


async def get_conversation_with_messages(
    db: AsyncSession, user: User, conversation_id: int
) -> Conversation | None:
    return await db.scalar(
        select(Conversation)
        .where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
        .options(selectinload(Conversation.messages))
    )