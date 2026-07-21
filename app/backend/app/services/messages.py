import json
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.message_draft import MessageDraft
from app.models.user import User
from app.schemas.messages import MessageDraftCreate, MessageDraftUpdate
from app.services.llm.llm_setting import get_llm_adapter
from app.services.llm.provider_registry import get_active_llm_config
from app.services.message_validation import validate_message_for_send


async def _generate_draft_content(
    prompt: str,
    template_name: str | None,
    db: AsyncSession | None = None,
) -> tuple[str, str]:
    system = (
        "You draft class announcement emails for instructors. "
        "Respond with JSON only: {\"subject\": \"...\", \"body\": \"...\"}"
    )
    user_msg = f"Template: {template_name or 'general'}\nRequest: {prompt}"
    if db is None:
        adapter_settings = {"provider": settings.DEFAULT_LLM_PROVIDER}
    else:
        llm_config = await get_active_llm_config(db)
        adapter_settings = {
            "provider": llm_config.provider,
            "model": llm_config.model,
        }
    adapter = get_llm_adapter(adapter_settings)
    raw = await adapter.generate(system, user_msg)
    try:
        data = json.loads(raw[raw.find("{") : raw.rfind("}") + 1])
        return data.get("subject", "Course Announcement"), data.get("body", prompt)
    except (json.JSONDecodeError, ValueError):
        return "Course Announcement", prompt


async def create_message_draft(db: AsyncSession, user: User, body: MessageDraftCreate) -> MessageDraft:
    subject = body.subject or "Course Announcement"
    content = body.body or ""

    if body.prompt and not body.body:
        try:
            subject, content = await _generate_draft_content(
                body.prompt, body.template_name, db
            )
        except Exception:
            subject = body.subject or f"{body.template_name or 'Course'} Announcement"
            content = body.prompt

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
    canvas_url: str,
) -> MessageDraft:
    draft = await get_message_draft(db, user, draft_id)
    if draft.status != "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Draft already sent")
    if not draft.course_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Draft has no course")

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
        canvas_url=canvas_url,
        recipient_canvas_user_ids=recipient_canvas_user_ids,
    )

    from app.services.canvas import send_course_message

    result = await send_course_message(
        draft.course_id,
        draft.subject,
        draft.body,
        user,
        canvas_url,
        db,
        recipient_canvas_user_ids=recipient_canvas_user_ids,
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
