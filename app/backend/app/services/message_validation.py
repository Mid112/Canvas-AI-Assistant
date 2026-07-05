# app/backend/app/services/message_validation.py
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.user import User
from app.services.course_access import get_owned_course_or_404


def _check_subject(subject: str) -> None:
    if not subject or not subject.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message subject cannot be empty.",
        )


def _check_body(body: str) -> None:
    if not body or not body.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message body cannot be empty.",
        )


async def validate_message_for_send(
    local_course_id: int,
    user: User,
    subject: str,
    body: str,
    db: AsyncSession,
) -> Course:
    """Validates the semantic constraints for posting a class announcement.
    Course roster size is deliberately not checked here — that requires a
    live Canvas call, and this validation layer stays Canvas-free by the
    same convention as generate_write_preview."""

    course = await get_owned_course_or_404(local_course_id, user, db)

    _check_subject(subject)
    _check_body(body)

    return course
