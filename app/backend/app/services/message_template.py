from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.message_template import MessageTemplate
from app.models.user import User
from app.schemas.message_template import MessageTemplateCreate, MessageTemplateUpdate


async def list_message_templates(
    db: AsyncSession,
    user: User,
    course_id: int | None = None,
) -> list[MessageTemplate]:
    query = select(MessageTemplate).where(MessageTemplate.user_id == user.id)
    if course_id is not None:
        await _require_owned_course(db, user, course_id)
        query = query.where(MessageTemplate.course_id == course_id)
    result = await db.scalars(query.order_by(MessageTemplate.created_at.desc()))
    return list(result)


async def create_message_template(
    db: AsyncSession,
    user: User,
    body: MessageTemplateCreate,
) -> MessageTemplate:
    if body.course_id is not None:
        await _require_owned_course(db, user, body.course_id)

    template = MessageTemplate(
        user_id=user.id,
        course_id=body.course_id,
        title=body.title.strip(),
        content=body.content.strip(),
    )
    _validate_template_text(template.title, template.content)
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


async def get_message_template(
    db: AsyncSession,
    user: User,
    template_id: int,
) -> MessageTemplate:
    template = await db.scalar(
        select(MessageTemplate).where(
            MessageTemplate.id == template_id,
            MessageTemplate.user_id == user.id,
        )
    )
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message template not found")
    return template


async def update_message_template(
    db: AsyncSession,
    user: User,
    template_id: int,
    body: MessageTemplateUpdate,
) -> MessageTemplate:
    template = await get_message_template(db, user, template_id)

    if body.course_id is not None:
        await _require_owned_course(db, user, body.course_id)
        template.course_id = body.course_id
    if body.title is not None:
        template.title = body.title.strip()
    if body.content is not None:
        template.content = body.content.strip()

    _validate_template_text(template.title, template.content)
    await db.commit()
    await db.refresh(template)
    return template


async def delete_message_template(db: AsyncSession, user: User, template_id: int) -> None:
    template = await get_message_template(db, user, template_id)
    await db.delete(template)
    await db.commit()


async def _require_owned_course(db: AsyncSession, user: User, course_id: int) -> None:
    course = await db.scalar(select(Course).where(Course.id == course_id, Course.instructor_id == user.id))
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")


def _validate_template_text(title: str, content: str) -> None:
    if not title:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Title cannot be empty")
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Content cannot be empty")
