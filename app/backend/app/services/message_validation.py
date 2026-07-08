# app/backend/app/services/message_validation.py
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.canvas import fetch_assignments, fetch_submissions
from app.models.course import Course
from app.models.user import User
from app.services.canvas import require_canvas_token
from app.services.course_access import get_owned_course_or_404
from app.services.student import get_students


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


async def _validate_recipients_in_course(
    course: Course,
    recipient_canvas_user_ids: list[int],
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> list[int]:
    if not recipient_canvas_user_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one recipient is required for a targeted message.",
        )

    roster = await get_students(course.id, user, canvas_url, db)
    allowed_ids = {int(student.canvas_user_id) for student in roster}

    if not allowed_ids:
        allowed_ids = await _submission_recipient_ids(course, user, canvas_url)

    invalid_ids = [
        recipient_id
        for recipient_id in recipient_canvas_user_ids
        if recipient_id not in allowed_ids
    ]

    if invalid_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "One or more recipients are not enrolled in this course: "
                f"{', '.join(str(value) for value in invalid_ids)}"
            ),
        )

    return recipient_canvas_user_ids


async def _submission_recipient_ids(
    course: Course,
    user: User,
    canvas_url: str,
) -> set[int]:
    token = require_canvas_token(user, canvas_url)
    canvas_course_id = int(course.canvas_course_id)
    assignments = await fetch_assignments(canvas_course_id, token, canvas_url)
    allowed_ids: set[int] = set()

    # Some Canvas instances expose submission placeholder rows even when the
    # enrollment endpoint is empty. Those rows still prove that Canvas
    # recognizes the user in the course, so they are valid message targets.
    for assignment in assignments:
        submissions = await fetch_submissions(
            canvas_course_id,
            int(assignment["id"]),
            token,
            canvas_url,
        )
        allowed_ids.update(int(submission["user_id"]) for submission in submissions)

    return allowed_ids


async def validate_message_for_send(
    local_course_id: int,
    user: User,
    subject: str,
    body: str,
    db: AsyncSession,
    *,
    canvas_url: str,
    recipient_canvas_user_ids: list[int] | None = None,
) -> Course:
    """Validates message content and, when provided, targeted recipients."""

    course = await get_owned_course_or_404(local_course_id, user, db)

    _check_subject(subject)
    _check_body(body)

    if recipient_canvas_user_ids:
        await _validate_recipients_in_course(
            course,
            recipient_canvas_user_ids,
            user,
            canvas_url,
            db,
        )

    return course
