# app/backend/app/services/chat.py
import asyncio
import json

import httpx
from fastapi import HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.mcp_tools.dispatcher import ToolExecutionError, execute_tool, parse_action
from app.mcp_tools.schemas import ACTION_SCHEMAS
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user import User
from app.services.llm.llm_setting import get_llm_adapter

LLM_TIMEOUT_SECONDS = 90.0
HISTORY_WINDOW = 10  # how many previous messages to send to the LLM


async def get_or_create_conversation(
    db: AsyncSession, user: User, conversation_id: int | None, local_course_id: int | None
) -> Conversation:
    if conversation_id is not None:
        conversation = await db.scalar(
            select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user.id)
        )
        if conversation:
            return conversation

    conversation = Conversation(user_id=user.id, course_id=local_course_id)
    db.add(conversation)
    await db.flush()
    return conversation


async def log_message(db: AsyncSession, conversation: Conversation, role: str, content: str) -> Message:
    message = Message(conversation_id=conversation.id, role=role, content=content)
    db.add(message)
    await db.flush()
    return message


async def _get_recent_messages(db: AsyncSession, conversation_id: int) -> list[dict]:
    """Fetch the last N messages from this conversation to give the LLM
    context for follow-up turns. This is what lets the LLM see its own
    previous clarify/partial_plan response when the user sends a refinement.
    In a future iteration this step gets replaced by a vector retrieval
    call that fetches semantically relevant history rather than just recent."""
    rows = await db.scalars(
        select(Message).where(Message.conversation_id == conversation_id).order_by(desc(Message.id)).limit(HISTORY_WINDOW)
    )
    messages = list(rows)
    messages.reverse()
    return [{"role": m.role, "content": m.content} for m in messages]


def build_system_prompt() -> str:
    tool_list = "\n".join(
        f"- {name}: {schema.model_json_schema()}"
        for name, schema in ACTION_SCHEMAS.items()
        if name not in {"out_of_scope", "clarify", "intent_preview"}
    )

    return (
        """You are a Canvas LMS assistant for instructors. You help
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
"""
        + tool_list
    )


async def handle_chat_message(
    db: AsyncSession,
    user: User,
    message: str,
    local_course_id: int | None,
    conversation_id: int | None,
) -> tuple[Conversation, dict, bool]:
    conversation = await get_or_create_conversation(db, user, conversation_id, local_course_id)
    await log_message(db, conversation, role="user", content=message)

    history = await _get_recent_messages(db, conversation.id)

    system_prompt = build_system_prompt()
    adapter = get_llm_adapter({"provider": "groq"})

    try:
        raw_output = await asyncio.wait_for(
            adapter.generate(system_prompt, message, history=history),
            timeout=LLM_TIMEOUT_SECONDS,
        )
    except TimeoutError:
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

    await log_message(db, conversation, role="assistant", content=str(result))
    await db.commit()
    return conversation, result, False


async def handle_confirmed_action(
    db: AsyncSession,
    user: User,
    conversation_id: int,
    proposed_action: dict,
) -> tuple[Conversation, dict, bool]:
    """Executes a previously proposed action directly, with no LLM call.
    This is what runs when the user confirms an intent_preview basically."""

    conversation = await db.scalar(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user.id)
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    await log_message(db, conversation, role="user", content="[confirmed action]")

    try:
        action = parse_action(json.dumps(proposed_action))
        result = await execute_tool(db, user, action)
    except ToolExecutionError as e:
        await log_message(db, conversation, role="assistant", content=e.log_detail)
        await db.commit()
        return conversation, {"error": e.user_message}, True

    await log_message(db, conversation, role="assistant", content=str(result))
    await db.commit()
    return conversation, result, False


async def get_conversation_with_messages(db: AsyncSession, user: User, conversation_id: int) -> Conversation | None:
    return await db.scalar(
        select(Conversation)
        .where(Conversation.id == conversation_id, Conversation.user_id == user.id)
        .options(selectinload(Conversation.messages))
    )
