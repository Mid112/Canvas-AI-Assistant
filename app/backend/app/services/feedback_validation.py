"""Service note: owns backend feedback validation business logic behind routers, tests, and assistant tool execution."""

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.canvas import fetch_student_enrollment
from app.models.course import Course
from app.models.user import User
from app.services.canvas import get_assignment, get_owned_course, require_canvas_token
from app.services.message_validation import check_message_profanity


async def verify_canvas_student_in_course(
    local_course_id: int,
    canvas_student_id: int,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
) -> Course:
    """Ensure the student belongs to the instructor-owned course roster.

    Queries Canvas for this one user's enrollment instead of paging the full
    course roster (which can be hundreds of students).
    """
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    resolved_canvas_url = course.canvas_url
    token = require_canvas_token(user, resolved_canvas_url)
    enrollments = await fetch_student_enrollment(
        int(course.canvas_course_id),
        canvas_student_id,
        token,
        resolved_canvas_url,
    )
    if not enrollments:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student is not enrolled in this course.",
        )
    return course


async def verify_assignment_in_course(
    local_course_id: int,
    assignment_id: int,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
) -> None:
    """Ensure the Canvas assignment exists on the instructor-owned course."""
    try:
        await get_assignment(local_course_id, assignment_id, user, canvas_url, db)
    except HTTPException as error:
        if error.status_code in {404, 403}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Assignment is not available in this course.",
            ) from error
        raise


def _check_grade(new_grade: str | None) -> None:
    if not new_grade or not str(new_grade).strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Grade is required.",
        )


def _check_feedback(feedback: str | None) -> None:
    if feedback is not None and not str(feedback).strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Feedback cannot be blank when provided.",
        )
    if feedback:
        # Same blocklist as instructor messaging (#1300) — student-facing comments
        # should not ship with clearly inappropriate language.
        check_message_profanity(str(feedback), content_label="Feedback")


async def validate_feedback_for_post(
    local_course_id: int,
    assignment_id: int,
    canvas_student_id: int,
    new_grade: str,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
    *,
    feedback: str | None = None,
) -> Course:
    if assignment_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A valid assignment is required.",
        )
    if canvas_student_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A valid student is required.",
        )
    _check_grade(new_grade)
    _check_feedback(feedback)
    await verify_assignment_in_course(
        local_course_id, assignment_id, user, canvas_url, db
    )
    return await verify_canvas_student_in_course(
        local_course_id, canvas_student_id, user, canvas_url, db
    )
