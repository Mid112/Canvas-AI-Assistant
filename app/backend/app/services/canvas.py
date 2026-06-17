from cryptography.fernet import InvalidToken
from fastapi import HTTPException, status
from app.core.security import decrypt_canvas_token
from app.integrations.canvas import fetch_assignments, fetch_courses, fetch_submissions
from app.models.user import User
from app.schemas.canvas import AssignmentResponse, CourseResponse, SubmissionResponse


def _require_canvas_token(user: User) -> str:
    if not user.canvas_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Canvas token not set. PATCH to /api/v1/auth/me/canvas-token first.",
        )
    try:
        return decrypt_canvas_token(user.canvas_token)
    except InvalidToken:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Canvas token is corrupted — please reconnect Canvas.",
        )


async def get_courses(user: User) -> list[CourseResponse]:
    token = _require_canvas_token(user)
    data = await fetch_courses(token)
    return [CourseResponse(**item) for item in data]


async def get_assignments(course_id: int, user: User) -> list[AssignmentResponse]:
    token = _require_canvas_token(user)
    data = await fetch_assignments(course_id, token)
    return [AssignmentResponse(**item) for item in data]


async def get_submissions(course_id: int, assignment_id: int, user: User) -> list[SubmissionResponse]:
    token = _require_canvas_token(user)
    data = await fetch_submissions(course_id, assignment_id, token)
    return [SubmissionResponse(**item) for item in data]
