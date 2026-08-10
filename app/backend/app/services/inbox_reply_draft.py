import json

import httpx
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.schemas.inbox import (
    InboxReplyDraftRequest,
    InboxReplyDraftResponse,
    InboxReplyPreviewRequest,
    InboxReplyPreviewResponse,
)
from app.services.inbox import get_inbox_thread
from app.services.llm.json_extraction import loads_llm_json
from app.services.llm.llm_setting import get_llm_adapter
from app.services.message_validation import check_message_profanity


def _thread_context_for_llm(messages: list) -> str:
    """Build LLM context using roles only — no student names or ids."""
    lines: list[str] = []
    for message in messages:
        role = "Instructor" if message.author.role == "instructor" else "Student"
        lines.append(f"{role}: {message.body}")
    return "\n".join(lines)


async def generate_inbox_reply_draft(
    conversation_id: int,
    body: InboxReplyDraftRequest,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
    *,
    local_course_id: int | None = None,
) -> InboxReplyDraftResponse:
    thread = await get_inbox_thread(
        conversation_id, user, canvas_url, db, local_course_id=local_course_id
    )
    if not thread.messages:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Need at least one message in the thread before drafting a reply.",
        )

    system = (
        "You draft concise, professional Canvas inbox replies for instructors. "
        "Respond with JSON only: {\"body\": \"plain text reply\"}. "
        "Do not include student email addresses or login identifiers."
    )
    context_parts = [
        f"Thread subject: {thread.subject}",
        "Conversation:",
        _thread_context_for_llm(thread.messages),
    ]
    if body.prompt and body.prompt.strip():
        context_parts.append(f"Instructor guidance: {body.prompt.strip()}")
    user_msg = "\n".join(context_parts)

    adapter = get_llm_adapter({"provider": settings.DEFAULT_LLM_PROVIDER})
    try:
        raw = await adapter.generate(system, user_msg)
    except httpx.HTTPStatusError as error:
        if error.response.status_code == 429:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="The reply generator is temporarily rate-limited. Please try again.",
            ) from error
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The reply generator is temporarily unavailable.",
        ) from error
    except httpx.RequestError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The reply generator is temporarily unavailable.",
        ) from error

    try:
        data = loads_llm_json(raw)
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Could not generate a reply draft. Try adding guidance about "
                "what you want to say."
            ),
        ) from error

    draft_body = str(data.get("body") or "").strip()
    if not draft_body:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Need more context to draft a reply. Add guidance about the "
                "topic or tone you want."
            ),
        )

    return InboxReplyDraftResponse(body=draft_body)


async def preview_inbox_reply(
    conversation_id: int,
    body: InboxReplyPreviewRequest,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
    *,
    local_course_id: int | None = None,
) -> InboxReplyPreviewResponse:
    trimmed = body.body.strip()
    if not trimmed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Reply body cannot be empty.",
        )
    check_message_profanity(trimmed)

    thread = await get_inbox_thread(
        conversation_id, user, canvas_url, db, local_course_id=local_course_id
    )
    recipient_count = sum(
        1 for participant in thread.participants if participant.role == "student"
    )
    preview = trimmed if len(trimmed) <= 240 else f"{trimmed[:240].rstrip()}…"
    recipient_label = (
        f"{recipient_count} student{'s' if recipient_count != 1 else ''}"
        if recipient_count
        else "thread participants"
    )

    return InboxReplyPreviewResponse(
        summary=f"Send a reply to {recipient_label} in “{thread.subject}”.",
        recipient_count=recipient_count,
        body_preview=preview,
    )
