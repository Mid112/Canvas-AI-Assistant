import logging
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.canvas import (
    add_conversation_message,
    fetch_conversation,
    fetch_conversations,
    fetch_self,
)
from app.models.user import User
from app.schemas.inbox import (
    InboxMessage,
    InboxParticipant,
    InboxThreadDetail,
    InboxThreadList,
    InboxThreadSummary,
)
from app.services.canvas import get_owned_course, require_canvas_token
from app.services.message_validation import check_message_profanity

logger = logging.getLogger(__name__)


async def _resolve_self_canvas_id(
    user: User,
    token: str,
    canvas_url: str,
) -> str | None:
    """The Canvas user id of the connected account, used to label the
    instructor's own messages. Prefer the authoritative token owner from
    Canvas (our local user.canvas_user_id is frequently unset); fall back to
    the stored value only if the Canvas lookup fails."""
    try:
        profile = await fetch_self(token, canvas_url)
        canvas_id = profile.get("id")
        if canvas_id is not None:
            return str(canvas_id)
    except Exception as error:  # noqa: BLE001 — labeling must not break the inbox
        logger.warning("Could not resolve Canvas self id: %s", error)
    return user.canvas_user_id


def _parse_datetime(value: object) -> datetime:
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            logger.warning("Could not parse Canvas timestamp %r", value)
    return datetime.now(UTC)


def _participant(
    canvas_id: object,
    name: object,
    instructor_canvas_id: str | None,
) -> InboxParticipant:
    identifier = str(canvas_id)
    role = "instructor" if instructor_canvas_id and identifier == instructor_canvas_id else "student"
    return InboxParticipant(
        id=identifier,
        name=str(name) if name else "Unknown",
        role=role,
    )


def _map_participants(
    raw: dict,
    instructor_canvas_id: str | None,
) -> list[InboxParticipant]:
    participants = raw.get("participants")
    if not isinstance(participants, list):
        return []
    return [
        _participant(
            person.get("id"),
            person.get("name") or person.get("full_name"),
            instructor_canvas_id,
        )
        for person in participants
        if isinstance(person, dict)
    ]


def _resolve_course_name(raw: dict, course_name: str | None) -> str:
    if course_name:
        return course_name
    context = raw.get("context_name")
    return str(context) if context else ""


def _map_summary(
    raw: dict,
    *,
    course_id: int | None,
    course_name: str | None,
    instructor_canvas_id: str | None,
) -> InboxThreadSummary:
    return InboxThreadSummary(
        id=str(raw.get("id")),
        course_id=course_id,
        course_name=_resolve_course_name(raw, course_name),
        subject=str(raw.get("subject") or "(no subject)"),
        preview=str(raw.get("last_message") or ""),
        participants=_map_participants(raw, instructor_canvas_id),
        unread_count=1 if raw.get("workflow_state") == "unread" else 0,
        updated_at=_parse_datetime(raw.get("last_message_at")),
    )


def _map_detail(
    raw: dict,
    *,
    course_id: int | None,
    course_name: str | None,
    instructor_canvas_id: str | None,
) -> InboxThreadDetail:
    participants = _map_participants(raw, instructor_canvas_id)
    names_by_id = {person.id: person for person in participants}

    messages: list[InboxMessage] = []
    raw_messages = raw.get("messages")
    if isinstance(raw_messages, list):
        for entry in raw_messages:
            if not isinstance(entry, dict):
                continue
            author_id = str(entry.get("author_id"))
            author = names_by_id.get(author_id) or _participant(
                author_id, None, instructor_canvas_id
            )
            messages.append(
                InboxMessage(
                    id=str(entry.get("id")),
                    author=author,
                    body=str(entry.get("body") or ""),
                    sent_at=_parse_datetime(entry.get("created_at")),
                )
            )

    # Canvas returns messages newest-first; the thread view reads top-to-bottom.
    messages.sort(key=lambda message: message.sent_at)

    updated_at = _parse_datetime(raw.get("last_message_at"))
    if messages:
        updated_at = max(updated_at, messages[-1].sent_at)

    preview = str(raw.get("last_message") or "")
    if not preview and messages:
        preview = messages[-1].body

    return InboxThreadDetail(
        id=str(raw.get("id")),
        course_id=course_id,
        course_name=_resolve_course_name(raw, course_name),
        subject=str(raw.get("subject") or "(no subject)"),
        preview=preview,
        participants=participants,
        unread_count=1 if raw.get("workflow_state") == "unread" else 0,
        updated_at=updated_at,
        messages=messages,
    )


async def _resolve_course_scope(
    local_course_id: int | None,
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> tuple[str | None, int | None, str | None]:
    """Returns (context_code, local_course_id, course_name) for the inbox scope.

    When a course is selected we look it up (validating ownership) so Canvas can
    filter server-side and threads carry the local course id + display name."""
    if local_course_id is None:
        return None, None, None
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    return f"course_{int(course.canvas_course_id)}", course.id, course.name


async def list_inbox_threads(
    user: User,
    canvas_url: str,
    db: AsyncSession,
    *,
    local_course_id: int | None = None,
) -> InboxThreadList:
    token = require_canvas_token(user, canvas_url)
    context_code, course_id, course_name = await _resolve_course_scope(
        local_course_id, user, canvas_url, db
    )
    self_canvas_id = await _resolve_self_canvas_id(user, token, canvas_url)
    raw_threads = await fetch_conversations(
        token, canvas_url, course_context_code=context_code
    )
    threads = [
        _map_summary(
            raw,
            course_id=course_id,
            course_name=course_name,
            instructor_canvas_id=self_canvas_id,
        )
        for raw in raw_threads
        if isinstance(raw, dict)
    ]
    threads.sort(key=lambda thread: thread.updated_at, reverse=True)
    return InboxThreadList(threads=threads)


async def get_inbox_thread(
    conversation_id: int,
    user: User,
    canvas_url: str,
    db: AsyncSession,
    *,
    local_course_id: int | None = None,
) -> InboxThreadDetail:
    token = require_canvas_token(user, canvas_url)
    _, course_id, course_name = await _resolve_course_scope(
        local_course_id, user, canvas_url, db
    )
    self_canvas_id = await _resolve_self_canvas_id(user, token, canvas_url)
    raw = await fetch_conversation(conversation_id, token, canvas_url)
    return _map_detail(
        raw,
        course_id=course_id,
        course_name=course_name,
        instructor_canvas_id=self_canvas_id,
    )


async def reply_to_inbox_thread(
    conversation_id: int,
    body: str,
    user: User,
    canvas_url: str,
    db: AsyncSession,
    *,
    local_course_id: int | None = None,
) -> InboxThreadDetail:
    trimmed = body.strip()
    if not trimmed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Reply body cannot be empty.",
        )
    check_message_profanity(trimmed)

    token = require_canvas_token(user, canvas_url)
    _, course_id, course_name = await _resolve_course_scope(
        local_course_id, user, canvas_url, db
    )
    self_canvas_id = await _resolve_self_canvas_id(user, token, canvas_url)

    # We build the recipient list by excluding ourselves from the participants.
    # If we can't confirm our own Canvas id, the exclusion filter would match
    # nobody and the instructor would be added as a recipient of their own
    # reply — so refuse rather than send to the wrong recipients.
    if self_canvas_id is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't confirm your Canvas identity. Please try again.",
        )

    # Canvas add_message needs an explicit recipient list, so read the current
    # participants first and reply to everyone except the instructor themselves.
    existing = await fetch_conversation(conversation_id, token, canvas_url)
    recipient_ids = [
        int(person["id"])
        for person in existing.get("participants", [])
        if isinstance(person, dict)
        and person.get("id") is not None
        and str(person.get("id")) != self_canvas_id
    ]

    await add_conversation_message(
        conversation_id, trimmed, recipient_ids, token, canvas_url
    )

    # Re-fetch so the response reflects the full, updated thread history.
    raw = await fetch_conversation(conversation_id, token, canvas_url)
    return _map_detail(
        raw,
        course_id=course_id,
        course_name=course_name,
        instructor_canvas_id=self_canvas_id,
    )
