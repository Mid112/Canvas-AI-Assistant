<<<<<<< HEAD
from cryptography.fernet import InvalidToken
from fastapi import HTTPException, status
from app.core.security import decrypt_canvas_token
from app.integrations.canvas import fetch_assignments, fetch_courses, fetch_submissions
from app.models.user import User
from app.schemas.canvas import AssignmentResponse, CourseResponse, SubmissionResponse


def _require_canvas_token(user: User, canvas_url: str) -> str:
    # normalize here too in case the URL came from a query param instead of the request body validator
    canvas_url = canvas_url.rstrip("/")
    # canvas_connections is already eager-loaded in get_current_user, so this is just an in-memory lookup
    conn = next((c for c in user.canvas_connections if c.canvas_url == canvas_url), None)
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"No Canvas token for {canvas_url}. PATCH to /api/v1/auth/me/canvas-token first.",
        )
    try:
        return decrypt_canvas_token(conn.encrypted_token)
    except InvalidToken:
        # token was saved with a different encryption key — user needs to re-enter it
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Canvas token is corrupted — please reconnect Canvas.",
        )


async def get_courses(user: User, canvas_url: str) -> list[CourseResponse]:
    token = _require_canvas_token(user, canvas_url)
    data = await fetch_courses(token, canvas_url)
    return [CourseResponse(**item) for item in data]


async def get_assignments(course_id: int, user: User, canvas_url: str) -> list[AssignmentResponse]:
    token = _require_canvas_token(user, canvas_url)
    data = await fetch_assignments(course_id, token, canvas_url)
    return [AssignmentResponse(**item) for item in data]


async def get_submissions(course_id: int, assignment_id: int, user: User, canvas_url: str) -> list[SubmissionResponse]:
    token = _require_canvas_token(user, canvas_url)
    data = await fetch_submissions(course_id, assignment_id, token, canvas_url)
=======
from app.integrations.canvas import fetch_assignments, fetch_courses, fetch_submissions
from app.schemas.canvas import AssignmentResponse, CourseResponse, SubmissionResponse


async def get_courses() -> list[CourseResponse]:
    data = await fetch_courses()
    return [CourseResponse(**item) for item in data]


async def get_assignments(course_id: int) -> list[AssignmentResponse]:
    data = await fetch_assignments(course_id)
    return [AssignmentResponse(**item) for item in data]


async def get_submissions(course_id: int, assignment_id: int) -> list[SubmissionResponse]:
    data = await fetch_submissions(course_id, assignment_id)
>>>>>>> 7b05ec2 (implement Canvas API integration, service layer)
    return [SubmissionResponse(**item) for item in data]
