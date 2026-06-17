import httpx
from fastapi import HTTPException, status

from app.config import settings

_HEADERS = lambda: {"Authorization": f"Bearer {settings.CANVAS_API_TOKEN}"}


def _raise_for_canvas_error(response: httpx.Response) -> None:
    if response.status_code == 401:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Canvas API token")
    if response.status_code == 404:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canvas resource not found")
    if response.is_error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Canvas API error: {response.status_code}")


async def fetch_courses() -> list[dict]:
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{settings.CANVAS_API_URL}/courses",
                headers=_HEADERS(),
                params={"enrollment_type": "teacher", "state[]": "available"},
            )
    except httpx.RequestError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Could not reach Canvas: {e}")
    _raise_for_canvas_error(response)
    return response.json()


async def fetch_assignments(course_id: int) -> list[dict]:
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{settings.CANVAS_API_URL}/courses/{course_id}/assignments",
                headers=_HEADERS(),
            )
    except httpx.RequestError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Could not reach Canvas: {e}")
    _raise_for_canvas_error(response)
    return response.json()


async def fetch_submissions(course_id: int, assignment_id: int) -> list[dict]:
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{settings.CANVAS_API_URL}/courses/{course_id}/assignments/{assignment_id}/submissions",
                headers=_HEADERS(),
            )
    except httpx.RequestError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Could not reach Canvas: {e}")
    _raise_for_canvas_error(response)
    return response.json()
