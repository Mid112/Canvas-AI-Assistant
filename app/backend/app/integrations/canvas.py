import logging
from typing import Literal

import httpx
from fastapi import HTTPException, status

from app.config import settings

logger = logging.getLogger(__name__)


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _raise_for_canvas_error(response: httpx.Response) -> None:
    # Canvas returns 401 when the token is wrong — we re-map to 422 so our client
    # doesn't confuse it with our own auth (which uses 401 for expired JWT)
    if response.status_code == 401:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid Canvas API token")
    if response.status_code == 404:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canvas resource not found")
    if response.is_error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Canvas API error: {response.status_code}")


_TIMEOUT = httpx.Timeout(10.0)


async def validate_token(token: str, canvas_url: str = settings.CANVAS_API_URL) -> None:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.get(
                f"{canvas_url}/api/v1/users/self",
                headers=_headers(token),
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")
    _raise_for_canvas_error(response)


CanvasTokenStatus = Literal["valid", "expired", "invalid"]


async def check_token_status(
    token: str, canvas_url: str = settings.CANVAS_API_URL
) -> CanvasTokenStatus:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.get(
                f"{canvas_url}/api/v1/users/self",
                headers=_headers(token),
            )
    except (httpx.TimeoutException, httpx.RequestError) as e:
        if isinstance(e, httpx.RequestError):
            logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        return "invalid"

    if response.status_code == 401:
        return "expired"
    if response.is_success:
        return "valid"
    return "invalid"


async def fetch_courses(token: str, canvas_url: str = settings.CANVAS_API_URL) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.get(
                f"{canvas_url}/api/v1/courses",
                headers=_headers(token),
                params={"state[]": ["available", "unpublished", "completed"]},
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")
    _raise_for_canvas_error(response)
    return response.json()


async def fetch_assignments(course_id: int, token: str, canvas_url: str = settings.CANVAS_API_URL) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.get(
                f"{canvas_url}/api/v1/courses/{course_id}/assignments",
                headers=_headers(token),
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")
    _raise_for_canvas_error(response)
    return response.json()


async def fetch_submissions(
    course_id: int,
    assignment_id: int,
    token: str,
    canvas_url: str = settings.CANVAS_API_URL,
) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.get(
                f"{canvas_url}/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions",
                headers=_headers(token),
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")
    _raise_for_canvas_error(response)
    return response.json()
