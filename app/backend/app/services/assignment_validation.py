# app/backend/app/services/assignment_validation.py
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.user import User


async def validate_assignment_for_create(
    local_course_id: int,
    user: User,
    title: str,
    description: str | None,
    due_date: str | None,
    points_possible: float | None,
    db: AsyncSession,
) -> Course:
    """Validates all semantic constraints before creating an assignment.
    Pydantic schemas catch type errors upstream; this catches semantic
    errors that Pydantic cannot: past due dates, empty strings that
    pass min_length, missing required business fields, and course
    ownership. Returns the resolved Course on success so callers do
    not have to look it up again."""

    # 1. course must exist and belong to this instructor
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

    # 2. title must be a non-empty, non-whitespace string
    if not title or not title.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Assignment title cannot be empty.",
        )

    # 3. description must be non-empty
    if not description or not description.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Assignment description cannot be empty.",
        )

    # 4. due date is required and must be in the future
    if not due_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Due date is required for assignments.",
        )
    try:
        due_dt = datetime.fromisoformat(due_date)
        if due_dt.tzinfo is None:
            due_dt = due_dt.replace(tzinfo=UTC)
        if due_dt <= datetime.now(UTC):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Due date must be in the future.",
            )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid due date format: {due_date}. Use ISO 8601, e.g. 2026-09-01T23:59:00.",
        )

    # 5. points must be positive when provided
    if points_possible is not None and points_possible <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Points possible must be greater than zero.",
        )

    return course
