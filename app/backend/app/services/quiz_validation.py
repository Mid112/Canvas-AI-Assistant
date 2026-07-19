# app/backend/app/services/quiz_validation.py
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
            detail="Quiz title cannot be empty.",
        )


def _check_description(description: str) -> None:
    if not description or not description.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Quiz description cannot be empty.",
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


def _check_allowed_attempts(allowed_attempts: int | None) -> None:
    if allowed_attempts is not None and allowed_attempts < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Allowed attempts must be at least 1.",
        )


def _check_time_limit(time_limit: int | None) -> None:
    if time_limit is not None and time_limit < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Time limit must be at least 1 minute when set.",
        )


def _check_questions(questions: list[dict] | None) -> None:
    if not questions:
        return
    for index, question in enumerate(questions):
        text = question.get("question_text") if isinstance(question, dict) else None
        if not isinstance(text, str) or not text.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question {index + 1} is missing question_text.",
            )
        points = question.get("points_possible") if isinstance(question, dict) else None
        if points is not None:
            try:
                if float(points) <= 0:
                    raise ValueError
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Question {index + 1} points_possible must be greater than zero.",
                )


def _check_question_bank_groups(
    quiz_engine: str, groups: list[dict] | None
) -> None:
    if not groups:
        return
    if quiz_engine != "classic":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Question-bank groups are supported only for Classic Quizzes.",
        )
    for index, group in enumerate(groups):
        bank_id = group.get("bank_id") if isinstance(group, dict) else None
        pick_count = group.get("pick_count") if isinstance(group, dict) else None
        question_points = (
            group.get("question_points") if isinstance(group, dict) else None
        )
        if not isinstance(bank_id, int) or bank_id <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question bank group {index + 1} has an invalid bank_id.",
            )
        if not isinstance(pick_count, int) or pick_count <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question bank group {index + 1} pick_count must be positive.",
            )
        if not isinstance(question_points, int | float) or question_points <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Question bank group {index + 1} question_points must be positive.",
            )


async def validate_quiz_for_create(
    local_course_id: int,
    user: User,
    title: str,
    description: str | None,
    due_date: str | None,
    points_possible: float | None,
    db: AsyncSession,
    *,
    allowed_attempts: int | None = None,
    time_limit: int | None = None,
    questions: list[dict] | None = None,
    quiz_engine: str = "classic",
    question_bank_groups: list[dict] | None = None,
) -> Course:
    """Semantic validation before creating a Canvas quiz. Mirrors
    validate_assignment_for_create so the quiz preview/confirm path
    rejects incomplete or invalid proposals before any Canvas write."""

    course = await get_owned_course_or_404(local_course_id, user, db)

    _check_title(title)
    _check_description(description)

    if not due_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Due date is required for quizzes.",
        )
    _check_due_date(due_date)

    if points_possible is not None:
        _check_points_possible(points_possible)

    _check_allowed_attempts(allowed_attempts)
    _check_time_limit(time_limit)
    _check_questions(questions)
    _check_question_bank_groups(quiz_engine, question_bank_groups)

    return course
