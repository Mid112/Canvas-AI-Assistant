"""Service note: centralizes course visibility and active-course checks used by instructor workflows."""
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.user import User


async def get_owned_course_or_404(
    local_course_id: int, user: User, db: AsyncSession
) -> Course:
    course = await db.scalar(
        select(Course).where(
            Course.id == local_course_id,
            Course.instructor_id == user.id,
        )
    )
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found or does not belong to you.",
        )
    return course
