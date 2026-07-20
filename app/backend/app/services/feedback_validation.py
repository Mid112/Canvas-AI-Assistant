from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.user import User
from app.services.course_access import get_owned_course_or_404
from app.services.student import get_students


async def verify_canvas_student_in_course(
    local_course_id: int,
    canvas_student_id: int,
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> Course:
    """Ensure the student belongs to the instructor-owned course roster."""
    course = await get_owned_course_or_404(local_course_id, user, db)
    roster = await get_students(local_course_id, user, canvas_url, db)
    allowed_ids = {
        int(student.canvas_user_id)
        for student in roster
        if str(student.canvas_user_id).isdigit()
    }
    if canvas_student_id not in allowed_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student is not enrolled in this course.",
        )
    return course


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


async def validate_feedback_for_post(
    local_course_id: int,
    assignment_id: int,
    canvas_student_id: int,
    new_grade: str,
    user: User,
    canvas_url: str,
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
    return await verify_canvas_student_in_course(
        local_course_id, canvas_student_id, user, canvas_url, db
    )
