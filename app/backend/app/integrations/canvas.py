import asyncio
import logging
import re
from typing import Literal
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.core.canvas_url import resolve_server_canvas_url

logger = logging.getLogger(__name__)


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _canvas_error_detail(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return response.text.strip()

    if isinstance(data, dict):
        for key in ("message", "error", "errors"):
            value = data.get(key)
            if isinstance(value, str):
                return value
            if isinstance(value, list) and value:
                messages: list[str] = []
                for item in value:
                    if isinstance(item, dict):
                        nested = item.get("message") or item.get("error")
                        messages.append(str(nested if nested is not None else item))
                    else:
                        messages.append(str(item))
                return "; ".join(messages)
            if isinstance(value, dict):
                return "; ".join(f"{field}: {message}" for field, message in value.items())

    return str(data)


def _raise_for_canvas_error(response: httpx.Response) -> None:
    # Canvas 401 means bad/expired token — re-map to 422 so callers don't confuse it
    # with our own JWT 401 (two different auth layers)
    if response.status_code == 401:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid Canvas API token")
    if response.status_code == 403:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Canvas token lacks permission for this resource")
    if response.status_code == 404:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canvas resource not found")
    if response.is_server_error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Canvas server error: {response.status_code}")
    if response.is_error:
        detail = _canvas_error_detail(response)
        message = f"Canvas API error: {response.status_code}"
        if detail:
            message = f"{message} - {detail}"
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=message)


_TIMEOUT = httpx.Timeout(10.0)
# Maximum number of pages to follow before giving up — guards against runaway pagination
_MAX_PAGES = 50
_RETRY_DELAY = 1.0


def _parse_next_link(link_header: str) -> str | None:
    for part in link_header.split(","):
        match = re.match(r'\s*<([^>]+)>;\s*rel="next"', part.strip())
        if match:
            return match.group(1)
    return None


async def _get_with_retry(client: httpx.AsyncClient, url: str, **kwargs) -> httpx.Response:
    # Single retry on transient Canvas 5xx — network blips shouldn't fail the whole request.
    response = await client.get(url, **kwargs)
    if response.is_server_error:
        logger.warning("Canvas returned %d for %s — retrying once", response.status_code, url)
        await asyncio.sleep(_RETRY_DELAY)
        response = await client.get(url, **kwargs)
    return response


async def _fetch_all_pages(
    client: httpx.AsyncClient,
    url: str,
    headers: dict,
    params: dict | None = None,
) -> list[dict]:
    # Follow Canvas Link-header pagination and return all results concatenated
    results: list[dict] = []
    next_url: str | None = url
    page_params: dict | None = params

    for _ in range(_MAX_PAGES):
        response = await _get_with_retry(client, next_url, headers=headers, params=page_params)
        _raise_for_canvas_error(response)
        results.extend(response.json())

        next_url = _parse_next_link(response.headers.get("link", ""))
        if not next_url:
            break
        # Params are encoded in the next URL already — don't re-send them
        page_params = None
    else:
        logger.warning("Canvas pagination exceeded %d pages for %s — truncating", _MAX_PAGES, url)

    return results


async def validate_token(token: str, canvas_url: str = settings.CANVAS_API_URL) -> None:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await _get_with_retry(
                client,
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


async def check_token_status(token: str, canvas_url: str = settings.CANVAS_API_URL) -> CanvasTokenStatus:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await _get_with_retry(
                client,
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
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            return await _fetch_all_pages(
                client,
                f"{canvas_url}/api/v1/courses",
                headers=_headers(token),
                params={
                    # Filter to instructor-role only — TAs and students are excluded
                    "enrollment_type": "teacher",
                    # Include past and unpublished courses so instructors can review older data
                    "state[]": ["available", "unpublished", "completed"],
                    # term → term name for display; total_students → course card stats
                    "include[]": ["term", "total_students"],
                    "per_page": 100,
                },
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def fetch_assignments(course_id: int, token: str, canvas_url: str = settings.CANVAS_API_URL) -> list[dict]:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            return await _fetch_all_pages(
                client,
                f"{canvas_url}/api/v1/courses/{course_id}/assignments",
                headers=_headers(token),
                params={"per_page": 100},
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def fetch_assignment(
    course_id: int,
    assignment_id: int,
    token: str,
    canvas_url: str = settings.CANVAS_API_URL,
) -> dict:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await _get_with_retry(
                client,
                f"{canvas_url}/api/v1/courses/{course_id}/assignments/{assignment_id}",
                headers=_headers(token),
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def create_assignment(
    course_id: int,
    payload: dict,
    token: str,
    canvas_url: str = settings.CANVAS_API_URL,
) -> dict:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                f"{canvas_url}/api/v1/courses/{course_id}/assignments",
                headers=_headers(token),
                json={"assignment": payload},
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def update_assignment(
    course_id: int,
    assignment_id: int,
    payload: dict,
    token: str,
    canvas_url: str = settings.CANVAS_API_URL,
) -> dict:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.put(
                f"{canvas_url}/api/v1/courses/{course_id}/assignments/{assignment_id}",
                headers=_headers(token),
                json={"assignment": payload},
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def create_announcement(
    course_id: int,
    title: str,
    message: str,
    token: str,
    canvas_url: str = settings.CANVAS_API_URL,
) -> dict:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                f"{canvas_url}/api/v1/courses/{course_id}/discussion_topics",
                headers=_headers(token),
                json={"title": title, "message": message, "is_announcement": True},
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def fetch_submissions(
    course_id: int,
    assignment_id: int,
    token: str,
    canvas_url: str = settings.CANVAS_API_URL,
) -> list[dict]:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            return await _fetch_all_pages(
                client,
                f"{canvas_url}/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions",
                headers=_headers(token),
                # include[]=user populates submission["user"]["name"] so we can store student_name
                params={"per_page": 100, "include[]": "user"},
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def fetch_user_profile(
    user_id: int,
    token: str,
    canvas_url: str = settings.CANVAS_API_URL,
) -> dict:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await _get_with_retry(
                client,
                f"{canvas_url}/api/v1/users/{user_id}/profile",
                headers=_headers(token),
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def fetch_enrollments(
    course_id: int,
    token: str,
    canvas_url: str = settings.CANVAS_API_URL,
) -> list[dict]:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            return await _fetch_all_pages(
                client,
                f"{canvas_url}/api/v1/courses/{course_id}/enrollments",
                headers=_headers(token),
                params={
                    # Students only — exclude teachers, TAs, observers
                    "type[]": "StudentEnrollment",
                    # Active enrollments only — exclude concluded/invited/inactive
                    "state[]": "active",
                    # Nested user object required for name/login_id formatting
                    "include[]": "user",
                    "per_page": 100,
                },
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def post_announcement(
    course_id: int,
    subject: str,
    body: str,
    token: str,
    canvas_url: str = settings.CANVAS_API_URL,
) -> dict:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                f"{canvas_url}/api/v1/courses/{course_id}/discussion_topics",
                headers=_headers(token),
                json={
                    "title": subject,
                    "message": body,
                    "is_announcement": True,
                },
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def send_conversation(
    course_id: int,
    recipient_canvas_user_ids: list[int],
    subject: str,
    body: str,
    token: str,
    canvas_url: str = settings.CANVAS_API_URL,
) -> dict:
    canvas_url = resolve_server_canvas_url(canvas_url)
    form_data = [
        ("subject", subject),
        ("body", body),
        ("context_code", f"course_{course_id}"),
        ("group_conversation", "false"),
    ]
    # Canvas expects repeated recipients[] form fields. Keeping these as tuples
    # avoids client-library ambiguity around dict values that are arrays.
    form_data.extend(
        ("recipients[]", str(user_id)) for user_id in recipient_canvas_user_ids
    )
    form_body = urlencode(form_data)

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                f"{canvas_url}/api/v1/conversations",
                headers={
                    **_headers(token),
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                content=form_body,
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")
