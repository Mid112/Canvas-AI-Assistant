# app/backend/app/services/chat.py
import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.mcp_tools.dispatcher import ToolExecutionError, execute_tool, parse_action
from app.mcp_tools.schemas import ACTION_SCHEMAS
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user import User
from app.services.llm.llm_setting import get_llm_adapter

LLM_TIMEOUT_SECONDS = 30.0


async def get_or_create_conversation(
    db: AsyncSession, user: User, conversation_id: int | None, local_course_id: int | None
) -> Conversation:
    if conversation_id is not None:
        conversation = await db.scalar(
            select(Conversation).where(
                Conversation.id == conversation_id, Conversation.user_id == user.id
            )
        )
        if conversation:
            return conversation
        # falls through to create a new one if the given id wasn't found/owned —
        # avoids 404ing a chat session over a stale client-side id

    conversation = Conversation(user_id=user.id, course_id=local_course_id)
    db.add(conversation)
    await db.flush()  # populates conversation.id without a full commit yet
    return conversation


async def log_message(db: AsyncSession, conversation: Conversation, role: str, content: str) -> Message:
    message = Message(conversation_id=conversation.id, role=role, content=content)
    db.add(message)
    await db.flush()
    return message


def build_system_prompt() -> str:
    tool_list = "\n".join(
        f"- {name}: {schema.model_json_schema()}"
        for name, schema in ACTION_SCHEMAS.items()
    )
    return (
        "You are a Canvas course management assistant. "
        "Respond ONLY with a single JSON object matching one of the following "
        "action schemas. Do not include any text outside the JSON object.\n\n"
        f"{tool_list}"
    )


async def handle_chat_message(
    db: AsyncSession,
    user: User,
    message: str,
    local_course_id: int | None,
    conversation_id: int | None,
) -> tuple[Conversation, dict, bool]:
    """Returns (conversation, reply_payload, is_error)."""

    conversation = await get_or_create_conversation(db, user, conversation_id, local_course_id)
    await log_message(db, conversation, role="user", content=message)

    system_prompt = build_system_prompt()
    adapter = get_llm_adapter({"provider": "vllm"})  # TODO: read from per-user settings

    try:
        raw_output = await asyncio.wait_for(
            adapter.generate(system_prompt, message, timeout=LLM_TIMEOUT_SECONDS),
            timeout=LLM_TIMEOUT_SECONDS,
        )
    except (asyncio.TimeoutError, Exception) as e:
        is_timeout = isinstance(e, asyncio.TimeoutError)
        log_detail = "LLM request timed out" if is_timeout else f"LLM request failed: {e}"
        await log_message(db, conversation, role="system", content=log_detail)
        await db.commit()
        return (
            conversation,
            {"error": "The assistant is taking too long or is unavailable. Please try again."},
            True,
        )

    try:
        action = parse_action(raw_output)
        result = await execute_tool(db, user, action)
    except ToolExecutionError as e:
        await log_message(db, conversation, role="system", content=e.log_detail)
        await db.commit()
        return conversation, {"error": e.user_message}, True

    await log_message(db, conversation, role="assistant", content=str(result))
    await db.commit()
    return conversation, result, False


async def get_conversation_with_messages(
    db: AsyncSession, user: User, conversation_id: int
) -> Conversation | None:
    return await db.scalar(
        select(Conversation)
        .where(Conversation.id == conversation_id, Conversation.user_id == user.id)
        .options(selectinload(Conversation.messages))
    )