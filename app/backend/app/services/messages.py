import json
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.integrations.canvas import post_announcement
from app.models.message_draft import MessageDraft
from app.models.user import User
from app.schemas.messages import MessageDraftCreate, MessageDraftUpdate
from app.services.canvas import get_owned_course, require_canvas_token
from app.services.llm.llm_setting import get_llm_adapter


async def _generate_draft_content(prompt: str, template_name: str | None) -> tuple[str, str]:
    system = (
        "You draft class announcement emails for instructors. "
        "Respond with JSON only: {\"subject\": \"...\", \"body\": \"...\"}"
    )
    user_msg = f"Template: {template_name or 'general'}\nRequest: {prompt}"
    adapter = get_llm_adapter({"provider": settings.DEFAULT_LLM_PROVIDER})
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
        subject, content = await _generate_draft_content(body.prompt, body.template_name)

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

    course = await get_owned_course(draft.course_id, user, canvas_url, db)
    token = require_canvas_token(user, canvas_url)
    result = await post_announcement(
        int(course.canvas_course_id),
        draft.subject,
        draft.body,
        token,
        canvas_url,
    )

    draft.status = "sent"
    draft.sent_at = datetime.now(UTC)
    draft.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(draft)
    draft.canvas_topic_id = result.get("id")  # type: ignore[attr-defined]
    return draft
