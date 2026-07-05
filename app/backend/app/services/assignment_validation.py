# app/backend/app/services/assignment_validation.py
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.user import User
from app.services.course_access import get_owned_course_or_404


def _check_title(title: str) -> None:
    if not title or not title.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Assignment title cannot be empty.",
        )


def _check_description(description: str) -> None:
    if not description or not description.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Assignment description cannot be empty.",
        )


def _check_due_date(due_date: str) -> None:
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


def _check_points_possible(points_possible: float) -> None:
    if points_possible <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Points possible must be greater than zero.",
        )


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

    course = await get_owned_course_or_404(local_course_id, user, db)

    _check_title(title)
    _check_description(description)

    if not due_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Due date is required for assignments.",
        )
    _check_due_date(due_date)

    if points_possible is not None:
        _check_points_possible(points_possible)

    return course


async def validate_assignment_for_update(
    local_course_id: int,
    user: User,
    title: str | None,
    description: str | None,
    due_date: str | None,
    points_possible: float | None,
    db: AsyncSession,
) -> Course:
    """Validates a partial assignment update. Unlike create, every field
    is optional — None means "the user didn't ask to change this," so
    each check only runs against fields that were actually provided.
    This matters most for due_date: updating just the title on an
    already-overdue assignment must not trip the future-date check,
    since that check only ever applies to a newly-provided due date."""

    course = await get_owned_course_or_404(local_course_id, user, db)

    if title is None and description is None and due_date is None and points_possible is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No fields were provided to update. Include at least one of "
            "title, description, due_date, or points_possible.",
        )

    if title is not None:
        _check_title(title)
    if description is not None:
        _check_description(description)
    if due_date is not None:
        _check_due_date(due_date)
    if points_possible is not None:
        _check_points_possible(points_possible)

    return course
