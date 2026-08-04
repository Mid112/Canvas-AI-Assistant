from fastapi import HTTPException, status
from sqlalchemy import or_, select
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
    # Always scope templates to the current user first, then narrow to a course when requested.
    query = select(MessageTemplate).where(MessageTemplate.user_id == user.id)
    if course_id is not None:
        await _require_owned_course(db, user, course_id)
        # Course-scoped compose should surface both course templates and
        # user-wide templates (course_id IS NULL).
        query = query.where(
            or_(
                MessageTemplate.course_id == course_id,
                MessageTemplate.course_id.is_(None),
            )
        )
    result = await db.scalars(query.order_by(MessageTemplate.created_at.desc()))
    return list(result)


async def create_message_template(
    db: AsyncSession,
    user: User,
    body: MessageTemplateCreate,
) -> MessageTemplate:
    # Course-linked templates are only allowed when the instructor owns that course.
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
    # A template is visible only to its owner.
    template = await db.scalar(
        select(MessageTemplate).where(
            MessageTemplate.id == template_id,
            MessageTemplate.user_id == user.id,
        )
    )
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Message template not found")
    return template


async def update_message_template(
    db: AsyncSession,
    user: User,
    template_id: int,
    body: MessageTemplateUpdate,
) -> MessageTemplate:
    # Reuse the ownership check above so the update path stays consistent.
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
    # Deletion follows the same owner check as read and update.
    template = await get_message_template(db, user, template_id)
    await db.delete(template)
    await db.commit()


async def _require_owned_course(db: AsyncSession, user: User, course_id: int) -> None:
    # Prevent templates from referencing a course the instructor does not control.
    course = await db.scalar(select(Course).where(Course.id == course_id, Course.instructor_id == user.id))
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")


def _validate_template_text(title: str, content: str) -> None:
    # Keep template bodies non-empty after trimming whitespace.
    if not title:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Title cannot be empty")
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Content cannot be empty")
