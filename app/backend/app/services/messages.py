import json
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.secret_redaction import safe_exception_text
from app.models.audit_log import AuditLog
from app.models.conversation import Conversation
from app.models.course import Course
from app.models.message_draft import MessageDraft
from app.models.user import User
from app.models.workflow import Workflow
from app.schemas.messages import (
    MessageDraftCreate,
    MessageDraftResponse,
    MessageDraftUpdate,
)
from app.services.ai_health import record_ai_call_outcome
from app.services.llm.llm_connections import resolve_generation_adapter_settings
from app.services.llm.llm_setting import get_llm_adapter
from app.services.message_validation import validate_message_for_send


def infer_delivery_mode(draft: MessageDraft) -> str | None:
    """Match send_course_message: no recipients → course announcement."""
    ephemeral = getattr(draft, "delivery_mode", None)
    if ephemeral:
        return ephemeral
    if draft.status != "sent":
        return None
    recipients = draft.recipients or []
    return "announcement" if len(recipients) == 0 else "conversation"


def to_message_draft_response(draft: MessageDraft) -> MessageDraftResponse:
    response = MessageDraftResponse.model_validate(draft)
    return response.model_copy(update={"delivery_mode": infer_delivery_mode(draft)})


async def list_message_drafts(
    db: AsyncSession,
    user: User,
    *,
    status_filter: str | None = None,
    course_id: int | None = None,
) -> list[MessageDraft]:
    stmt = select(MessageDraft).where(MessageDraft.user_id == user.id)
    if status_filter:
        stmt = stmt.where(MessageDraft.status == status_filter)
    if course_id is not None:
        stmt = stmt.where(MessageDraft.course_id == course_id)
    # Sent first by sent_at; drafts without sent_at fall back to updated_at.
    stmt = stmt.order_by(
        MessageDraft.sent_at.desc().nulls_last(),
        MessageDraft.updated_at.desc(),
    )
    result = await db.scalars(stmt)
    return list(result.all())


_DRAFT_SYSTEM_PROMPT = """You write the announcement or private message an
instructor has just asked for. You are writing the message itself — not
advice about writing one.

Respond with JSON only: {"subject": "...", "body": "..."}

subject: a short, specific line an instructor would actually send. "Midterm 2
  Reminder", not "Course Update".
body: the finished message, addressed to the students who will receive it.
  Open the way a teacher opens a note to their class, say the thing, and stop.
  Two or three sentences is usually right.

Write only from what the instructor told you. Do not invent a date, a time, a
room, a weighting or a link they did not give you — an announcement that
states a due date nobody set is worse than one that omits it. If a detail
would obviously help and you do not have it, leave it out rather than guess.

Never emit instructions or placeholders. "Remind students about the
assignment, due date, and any next steps." is a description of a message, and
sending it to a class is the failure this prompt exists to prevent."""


async def draft_subject_and_body(
    prompt: str,
    template_name: str | None = None,
    *,
    adapter: Any,
) -> tuple[str, str]:
    """Write a real subject and body from an instructor's own words.

    The single place a message is drafted, so the Messages tab's own "generate
    from a prompt" and a chat turn that hands off to it produce the same
    quality of writing. They used to differ: chat handed over an empty draft
    and the Messages page filled the gap with a template preset, so the
    instructor was shown "Remind students about the assignment, due date, and
    any next steps." — a description of a message, sitting in the body field
    of a message about to go to a class.

    Never raises. On any failure the prompt itself becomes the body: it is at
    least the instructor's own words, which is a far better starting point for
    editing than a placeholder about what they might write.
    """
    try:
        raw = await adapter.generate(
            _DRAFT_SYSTEM_PROMPT,
            f"Template: {template_name or 'general'}\nInstructor's request: {prompt}",
        )
        data = json.loads(raw[raw.find("{") : raw.rfind("}") + 1])
        subject = str(data.get("subject") or "").strip()
        body = str(data.get("body") or "").strip()
        if not body:
            return subject or "Course Announcement", prompt
        return subject or "Course Announcement", body
    except Exception:
        return "Course Announcement", prompt


async def _generate_draft_content(
    prompt: str,
    template_name: str | None,
    adapter_settings: dict[str, str] | None = None,
) -> tuple[str, str]:
    """Draft a subject and body from a prompt, building an adapter from
    already-resolved settings.

    Takes settings rather than a session: the caller has to resolve them
    anyway to file the AI-health record under the right provider, and doing it
    twice invites the two disagreeing. The writing itself is
    draft_subject_and_body's job.
    """
    adapter = get_llm_adapter(
        adapter_settings or {"provider": settings.DEFAULT_LLM_PROVIDER}
    )
    return await draft_subject_and_body(prompt, template_name, adapter=adapter)


async def create_message_draft(db: AsyncSession, user: User, body: MessageDraftCreate) -> MessageDraft:
    subject = body.subject or "Course Announcement"
    content = body.body or ""

    if body.prompt and not body.body:
        # Resolved once, before the call, so the outcome record names the
        # provider that actually ran. It also attaches the instructor's own
        # stored key: this used to build settings straight from the deployment
        # config, so a personal provider connection was never used here.
        try:
            provider, adapter_settings = await resolve_generation_adapter_settings(
                db,
                user.id,
                body.model_settings.model_dump(exclude_none=True)
                if body.model_settings
                else None,
            )
        except (KeyError, ValueError) as e:
            # A draft is still worth having without a model — the prompt
            # becomes the body, exactly as it does when generation fails
            # below. Failing the request outright would lose what they typed.
            provider = settings.DEFAULT_LLM_PROVIDER
            adapter_settings = None
            generation_error: Exception | None = e
        else:
            generation_error = None

        if generation_error is None:
            try:
                subject, content = await _generate_draft_content(
                    body.prompt, body.template_name, adapter_settings
                )
            except Exception as e:  # noqa: BLE001 - recorded and degraded below
                generation_error = e

        if generation_error is None:
            await record_ai_call_outcome(
                db, user.id, provider, operation="message_draft"
            )
        else:
            subject = body.subject or f"{body.template_name or 'Course'} Announcement"
            content = body.prompt
            await record_ai_call_outcome(
                db,
                user.id,
                provider,
                error_detail=safe_exception_text(generation_error)[:500],
                operation="message_draft",
            )

    draft = MessageDraft(
        user_id=user.id,
        course_id=body.course_id,
        subject=subject,
        body=content,
        template_id=body.template_id,
        template_name=body.template_name,
        recipients=[r.model_dump() for r in body.recipients],
        status="draft",
    )
    db.add(draft)
    await db.commit()
    await db.refresh(draft)
    return draft


async def get_message_draft(db: AsyncSession, user: User, draft_id: int) -> MessageDraft:
    draft = await db.get(MessageDraft, draft_id)
    if not draft or draft.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found")
    return draft


async def update_message_draft(
    db: AsyncSession, user: User, draft_id: int, body: MessageDraftUpdate
) -> MessageDraft:
    draft = await get_message_draft(db, user, draft_id)
    if draft.status != "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Draft already sent")

    if body.subject is not None:
        draft.subject = body.subject
    if body.body is not None:
        draft.body = body.body
    if body.recipients is not None:
        draft.recipients = [r.model_dump() for r in body.recipients]
    draft.updated_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(draft)
    return draft


async def send_message_draft(
    db: AsyncSession,
    user: User,
    draft_id: int,
    canvas_url: str | None,
    *,
    conversation_id: int | None = None,
) -> MessageDraft:
    draft = await get_message_draft(db, user, draft_id)
    if draft.status != "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Draft already sent")
    if not draft.course_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Draft has no course")

    course = await db.scalar(
        select(Course).where(
            Course.id == draft.course_id,
            Course.instructor_id == user.id,
        )
    )
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found or does not belong to you.",
        )
    resolved_canvas_url = course.canvas_url

    recipient_canvas_user_ids: list[int] | None = None
    if draft.recipients:
        try:
            recipient_canvas_user_ids = [int(recipient["id"]) for recipient in draft.recipients]
        except (KeyError, TypeError, ValueError) as error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Draft recipients must include valid Canvas user IDs.",
            ) from error

    # Same recipient-membership check the chat/dispatcher send_message path
    # already enforces — without this, a draft could target Canvas user IDs
    # that aren't actually enrolled in the course.
    await validate_message_for_send(
        draft.course_id,
        user,
        draft.subject,
        draft.body,
        db,
        canvas_url=resolved_canvas_url,
        recipient_canvas_user_ids=recipient_canvas_user_ids,
    )

    from app.services.canvas import send_course_message

    result = await send_course_message(
        draft.course_id,
        draft.subject,
        draft.body,
        user,
        resolved_canvas_url,
        db,
        recipient_canvas_user_ids=recipient_canvas_user_ids,
    )

    linked_conversation_id: int | None = None
    if conversation_id is not None:
        conversation = await db.scalar(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user.id,
            )
        )
        if conversation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found.",
            )
        linked_conversation_id = conversation.id

    proposed_action = {
        "action": "send_message",
        "local_course_id": draft.course_id,
        "subject": draft.subject,
        "body": draft.body,
        "recipient_canvas_user_ids": recipient_canvas_user_ids,
    }
    workflow = Workflow(
        conversation_id=linked_conversation_id,
        user_id=user.id,
        course_id=draft.course_id,
        source_user_message_id=None,
        preview_message_id=None,
        action_name="send_message",
        user_prompt=draft.subject,
        proposed_action=proposed_action,
        affected_resources=[
            {"type": "course", "id": draft.course_id, "status": "unchanged"},
            {
                "type": result.delivery_mode,
                "id": None,
                "name": draft.subject,
                "status": "created",
            },
        ],
        status="executed",
        executed_at=datetime.now(UTC),
    )
    db.add(workflow)
    await db.flush()

    db.add(
        AuditLog(
            user_id=user.id,
            workflow_id=workflow.id,
            course_id=draft.course_id,
            action="send_message",
            resource_type=result.delivery_mode,
            resource_id=None,
            operation="create",
            status="success",
            request_payload=proposed_action,
        )
    )

    draft.status = "sent"
    draft.sent_at = datetime.now(UTC)
    draft.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(draft)
    draft.canvas_topic_id = None  # type: ignore[attr-defined]
    draft.delivery_mode = result.delivery_mode  # type: ignore[attr-defined]
    draft.recipient_count = result.audience_size  # type: ignore[attr-defined]
    return draft
