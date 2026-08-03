import asyncio
import logging
import re
from typing import Literal
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status

from app.core.canvas_url import resolve_server_canvas_url

logger = logging.getLogger(__name__)


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _canvas_error_detail(response: httpx.Response) -> str:
    def flatten(value) -> str:
        if isinstance(value, str):
            return value
        if isinstance(value, list):
            return "; ".join(message for item in value if (message := flatten(item)))
        if isinstance(value, dict):
            for key in ("message", "error"):
                nested = value.get(key)
                if isinstance(nested, str):
                    return nested
            messages = []
            for field, nested in value.items():
                message = flatten(nested)
                if message:
                    messages.append(f"{field}: {message}")
            return "; ".join(messages)
        return str(value) if value is not None else ""

    try:
        data = response.json()
    except ValueError:
        return response.text.strip()

    if isinstance(data, dict):
        for key in ("message", "error", "errors"):
            value = data.get(key)
            if value:
                return flatten(value)

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
_MAX_READ_RETRIES = 2


def _parse_next_link(link_header: str) -> str | None:
    for part in link_header.split(","):
        match = re.match(r'\s*<([^>]+)>;\s*rel="next"', part.strip())
        if match:
            return match.group(1)
    return None


async def _get_with_retry(client: httpx.AsyncClient, url: str, **kwargs) -> httpx.Response:
    # Feature Reliability (#1190): retry transient Canvas 5xx / timeouts on
    # safe reads with short backoff. Writes must not use this helper.
    # #1295: retry attempts are expected noise on dashboard mirror refresh —
    # log at info so callers that fall back quietly are not drowned in warnings.
    last_error: Exception | None = None
    for attempt in range(_MAX_READ_RETRIES + 1):
        try:
            response = await client.get(url, **kwargs)
        except httpx.TimeoutException as exc:
            last_error = exc
            if attempt >= _MAX_READ_RETRIES:
                raise
            logger.info(
                "Canvas GET timed out for %s — retry %s/%s",
                url,
                attempt + 1,
                _MAX_READ_RETRIES,
            )
            await asyncio.sleep(_RETRY_DELAY * (attempt + 1))
            continue
        except httpx.RequestError as exc:
            last_error = exc
            if attempt >= _MAX_READ_RETRIES:
                raise
            logger.info(
                "Canvas GET network error for %s — retry %s/%s",
                url,
                attempt + 1,
                _MAX_READ_RETRIES,
            )
            await asyncio.sleep(_RETRY_DELAY * (attempt + 1))
            continue

        if response.is_server_error and attempt < _MAX_READ_RETRIES:
            logger.info(
                "Canvas returned %d for %s — retry %s/%s",
                response.status_code,
                url,
                attempt + 1,
                _MAX_READ_RETRIES,
            )
            await asyncio.sleep(_RETRY_DELAY * (attempt + 1))
            continue
        return response

    if last_error is not None:
        raise last_error
    raise RuntimeError("Canvas GET retry loop exited without a response")


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
        if next_url is None:
            break
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


async def validate_token(token: str, canvas_url: str) -> None:
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


async def fetch_self(token: str, canvas_url: str) -> dict:
    """Returns the Canvas profile of the user the token authenticates as.

    This is the authoritative "who am I" for the connected Canvas account —
    used to tell the instructor's own conversation messages apart from
    students', since our local user.canvas_user_id is often unset."""
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await _get_with_retry(
                client,
                f"{canvas_url}/api/v1/users/self",
                headers=_headers(token),
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


CanvasTokenStatus = Literal["valid", "expired", "invalid"]


async def check_token_status(token: str, canvas_url: str) -> CanvasTokenStatus:
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


async def fetch_courses(token: str, canvas_url: str) -> list[dict]:
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


async def fetch_accounts(token: str, canvas_url: str) -> list[dict]:
    """Accounts the token can view/manage — needed to POST a new course."""
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            return await _fetch_all_pages(
                client,
                f"{canvas_url}/api/v1/accounts",
                headers=_headers(token),
                params={"per_page": 100},
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def create_course(
    account_id: int,
    payload: dict,
    token: str,
    canvas_url: str,
    *,
    offer: bool = False,
    enroll_me: bool = True,
) -> dict:
    """Create a course under a Canvas account (POST /accounts/:id/courses)."""
    canvas_url = resolve_server_canvas_url(canvas_url)
    body: dict = {
        "course": payload,
        "enroll_me": enroll_me,
        "offer": offer,
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                f"{canvas_url}/api/v1/accounts/{account_id}/courses",
                headers=_headers(token),
                json=body,
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def update_course(
    course_id: int,
    payload: dict,
    token: str,
    canvas_url: str,
) -> dict:
    """Update a Canvas course (PUT /courses/:id) — used for publish/unpublish events."""
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.put(
                f"{canvas_url}/api/v1/courses/{course_id}",
                headers=_headers(token),
                json={"course": payload},
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def fetch_assignments(course_id: int, token: str, canvas_url: str) -> list[dict]:
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
    canvas_url: str,
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
    canvas_url: str,
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
    canvas_url: str,
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


async def delete_assignment(
    course_id: int,
    assignment_id: int,
    token: str,
    canvas_url: str,
) -> dict:
    # Only ever called from undo_workflow, to revert a create_assignment
    # action — never a standalone user-facing "delete assignment" action.
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.delete(
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


async def create_announcement(
    course_id: int,
    title: str,
    message: str,
    token: str,
    canvas_url: str,
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
    canvas_url: str,
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


async def update_submission_grade(
    course_id: int,
    assignment_id: int,
    student_id: int,
    posted_grade: str | None,
    token: str,
    canvas_url: str,
    *,
    feedback: str | None = None,
    comment: str | None = None,
) -> dict:
    canvas_url = resolve_server_canvas_url(canvas_url)
    # Canvas accepts grade and comment together on the submission update
    # endpoint. Keeping them in one request prevents a grade from being
    # changed without the instructor's audit note appearing beside it.
    payload: dict = {}
    if posted_grade and posted_grade.strip():
        payload["submission"] = {"posted_grade": posted_grade.strip()}
    feedback_text = feedback if feedback is not None else comment
    if feedback_text and feedback_text.strip():
        payload["comment"] = {"text_comment": feedback_text.strip()}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.put(
                (
                    f"{canvas_url}/api/v1/courses/{course_id}/assignments/"
                    f"{assignment_id}/submissions/{student_id}"
                ),
                headers=_headers(token),
                json=payload,
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Canvas API timed out",
        )
    except httpx.RequestError as exc:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Canvas",
        ) from exc


async def fetch_user_profile(
    user_id: int,
    token: str,
    canvas_url: str,
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
    canvas_url: str,
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


async def fetch_student_enrollment(
    course_id: int,
    canvas_user_id: int,
    token: str,
    canvas_url: str,
) -> list[dict]:
    """Return active StudentEnrollment rows for one Canvas user in a course.

    Prefer this over fetch_enrollments when verifying a single student — Canvas
    can filter by user_id, so we avoid paging the full roster.
    """
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            return await _fetch_all_pages(
                client,
                f"{canvas_url}/api/v1/courses/{course_id}/enrollments",
                headers=_headers(token),
                params={
                    "type[]": "StudentEnrollment",
                    "state[]": "active",
                    "user_id[]": canvas_user_id,
                    "include[]": "user",
                    "per_page": 10,
                },
            )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Canvas API timed out",
        )
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Canvas",
        ) from e


async def post_announcement(
    course_id: int,
    subject: str,
    body: str,
    token: str,
    canvas_url: str,
) -> dict:
    # Keep this older announcement helper compatible with the browser-facing
    # localhost URL and the backend/container-facing Canvas alias.
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
    canvas_url: str,
) -> dict:
    canvas_url = resolve_server_canvas_url(canvas_url)
    form_data = [
        ("subject", subject),
        ("body", body),
        ("context_code", f"course_{course_id}"),
        ("group_conversation", "false"),
    ]
    # Canvas expects repeated recipients[] form fields. Build that as a tuple
    # list first so a debugger can inspect the exact logical payload before it
    # gets encoded for transport.
    form_data.extend(
        ("recipients[]", str(user_id)) for user_id in recipient_canvas_user_ids
    )
    # httpx.AsyncClient cannot safely send tuple-list form data as a sync stream.
    # Encoding explicitly preserves repeated recipients[] while keeping the
    # request async-safe.
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


async def fetch_conversations(
    token: str,
    canvas_url: str,
    course_context_code: str | None = None,
) -> list[dict]:
    """Lists the authenticated user's Canvas inbox conversation summaries.

    Canvas conversations are per-user, not per-course. When course_context_code
    (e.g. "course_42") is given, Canvas filters server-side to that context so
    the instructor only sees threads tied to the selected course."""
    canvas_url = resolve_server_canvas_url(canvas_url)
    params: dict = {"per_page": 100}
    if course_context_code:
        # filter[] scopes the inbox to a single context; filter_mode=and keeps
        # only conversations matching every provided filter (just the one here).
        params["filter[]"] = course_context_code
        params["filter_mode"] = "and"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            return await _fetch_all_pages(
                client,
                f"{canvas_url}/api/v1/conversations",
                headers=_headers(token),
                params=params,
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def fetch_conversation(
    conversation_id: int,
    token: str,
    canvas_url: str,
) -> dict:
    """Fetches a single conversation with its full message history. Note that
    Canvas marks the conversation as read as a side effect of this GET."""
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await _get_with_retry(
                client,
                f"{canvas_url}/api/v1/conversations/{conversation_id}",
                headers=_headers(token),
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def list_quizzes(
    course_id: int,
    token: str,
    canvas_url: str,
) -> list[dict]:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            return await _fetch_all_pages(
                client,
                f"{canvas_url}/api/v1/courses/{course_id}/quizzes",
                headers=_headers(token),
                params={"per_page": 100},
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def fetch_quiz(
    course_id: int,
    quiz_id: int,
    token: str,
    canvas_url: str,
) -> dict:
    """Fetch one classic quiz — not an assignment; IDs are not interchangeable."""
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await _get_with_retry(
                client,
                f"{canvas_url}/api/v1/courses/{course_id}/quizzes/{quiz_id}",
                headers=_headers(token),
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def update_quiz(
    course_id: int,
    quiz_id: int,
    payload: dict,
    token: str,
    canvas_url: str,
) -> dict:
    """Update a classic quiz via the Quizzes API (not Assignments PUT)."""
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.put(
                f"{canvas_url}/api/v1/courses/{course_id}/quizzes/{quiz_id}",
                headers=_headers(token),
                json={"quiz": payload},
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def create_quiz(
    course_id: int,
    payload: dict,
    token: str,
    canvas_url: str,
) -> dict:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                f"{canvas_url}/api/v1/courses/{course_id}/quizzes",
                headers=_headers(token),
                json={"quiz": payload},
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def create_quiz_question(
    course_id: int,
    quiz_id: int,
    payload: dict,
    token: str,
    canvas_url: str,
) -> dict:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                f"{canvas_url}/api/v1/courses/{course_id}/quizzes/{quiz_id}/questions",
                headers=_headers(token),
                json={"question": payload},
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def delete_quiz(
    course_id: int,
    quiz_id: int,
    token: str,
    canvas_url: str,
) -> dict:
    # Only ever called from undo_workflow to revert create_quiz.
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.delete(
                f"{canvas_url}/api/v1/courses/{course_id}/quizzes/{quiz_id}",
                headers=_headers(token),
            )
            _raise_for_canvas_error(response)
            return response.json() if response.content else {}
    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas")


async def probe_new_quizzes(
    course_id: int,
    token: str,
    canvas_url: str,
) -> tuple[bool, str | None]:
    """Soft capability probe for the separate New Quizzes service."""
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.get(
                f"{canvas_url}/api/quiz/v1/courses/{course_id}/quizzes",
                headers=_headers(token),
                params={"per_page": 1},
            )
            if response.is_success:
                return True, None
            if response.status_code in (401, 403):
                return False, "Your Canvas role cannot create New Quizzes in this course."
            if response.status_code == 404:
                return False, "This Canvas instance does not expose the New Quizzes API."
            return False, f"Canvas could not verify New Quizzes (HTTP {response.status_code})."
    except (httpx.TimeoutException, httpx.RequestError):
        return False, "Canvas could not be reached to verify New Quizzes."


async def list_new_quizzes(
    course_id: int,
    token: str,
    canvas_url: str,
) -> list[dict]:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            return await _fetch_all_pages(
                client,
                f"{canvas_url}/api/quiz/v1/courses/{course_id}/quizzes",
                headers=_headers(token),
                params={"per_page": 100},
            )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Canvas New Quizzes API timed out",
        )
    except httpx.RequestError as exc:
        logger.error("Could not reach Canvas New Quizzes at %s: %s", canvas_url, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Canvas New Quizzes",
        ) from exc


async def list_question_banks(
    course_id: int,
    token: str,
    canvas_url: str,
) -> list[dict]:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            return await _fetch_all_pages(
                client,
                f"{canvas_url}/api/v1/question_banks",
                headers=_headers(token),
                params={
                    "context_type": "Course",
                    "context_id": course_id,
                    "include_question_count": "true",
                    "per_page": 100,
                },
            )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Canvas API timed out",
        )
    except httpx.RequestError as exc:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Canvas",
        ) from exc


async def create_quiz_question_group(
    course_id: int,
    quiz_id: int,
    payload: dict,
    token: str,
    canvas_url: str,
) -> dict:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                f"{canvas_url}/api/v1/courses/{course_id}/quizzes/{quiz_id}/groups",
                headers=_headers(token),
                json={"quiz_groups": [payload]},
            )
            _raise_for_canvas_error(response)
            data = response.json()
            return data[0] if isinstance(data, list) and data else data
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Canvas API timed out",
        )
    except httpx.RequestError as exc:
        logger.error("Could not reach Canvas at %s: %s", canvas_url, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Canvas",
        ) from exc


async def create_new_quiz(
    course_id: int,
    payload: dict,
    token: str,
    canvas_url: str,
) -> dict:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                f"{canvas_url}/api/quiz/v1/courses/{course_id}/quizzes",
                headers=_headers(token),
                json={"quiz": payload},
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Canvas New Quizzes API timed out",
        )
    except httpx.RequestError as exc:
        logger.error("Could not reach Canvas New Quizzes at %s: %s", canvas_url, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Canvas New Quizzes",
        ) from exc


async def fetch_new_quiz(
    course_id: int,
    assignment_id: int,
    token: str,
    canvas_url: str,
) -> dict:
    """Fetch one New Quiz. Canvas keys New Quizzes by assignment_id."""
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await _get_with_retry(
                client,
                (
                    f"{canvas_url}/api/quiz/v1/courses/{course_id}/quizzes/"
                    f"{assignment_id}"
                ),
                headers=_headers(token),
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Canvas New Quizzes API timed out",
        )
    except httpx.RequestError as exc:
        logger.error("Could not reach Canvas New Quizzes at %s: %s", canvas_url, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Canvas New Quizzes",
        ) from exc


async def update_new_quiz(
    course_id: int,
    assignment_id: int,
    payload: dict,
    token: str,
    canvas_url: str,
) -> dict:
    """Patch a New Quiz via the New Quizzes API (not classic Quizzes PUT)."""
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.patch(
                (
                    f"{canvas_url}/api/quiz/v1/courses/{course_id}/quizzes/"
                    f"{assignment_id}"
                ),
                headers=_headers(token),
                json={"quiz": payload},
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Canvas New Quizzes API timed out",
        )
    except httpx.RequestError as exc:
        logger.error("Could not reach Canvas New Quizzes at %s: %s", canvas_url, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Canvas New Quizzes",
        ) from exc


async def create_new_quiz_item(
    course_id: int,
    assignment_id: int,
    payload: dict,
    token: str,
    canvas_url: str,
) -> dict:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                (
                    f"{canvas_url}/api/quiz/v1/courses/{course_id}/quizzes/"
                    f"{assignment_id}/items"
                ),
                headers=_headers(token),
                json={"item": payload},
            )
            _raise_for_canvas_error(response)
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Canvas New Quizzes API timed out",
        )
    except httpx.RequestError as exc:
        logger.error("Could not reach Canvas New Quizzes at %s: %s", canvas_url, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Canvas New Quizzes",
        ) from exc


async def delete_new_quiz(
    course_id: int,
    assignment_id: int,
    token: str,
    canvas_url: str,
) -> dict:
    canvas_url = resolve_server_canvas_url(canvas_url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.delete(
                (
                    f"{canvas_url}/api/quiz/v1/courses/{course_id}/quizzes/"
                    f"{assignment_id}"
                ),
                headers=_headers(token),
            )
            _raise_for_canvas_error(response)
            return response.json() if response.content else {}
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Canvas New Quizzes API timed out",
        )
    except httpx.RequestError as exc:
        logger.error("Could not reach Canvas New Quizzes at %s: %s", canvas_url, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Canvas New Quizzes",
        ) from exc


async def add_conversation_message(
    conversation_id: int,
    body: str,
    recipient_canvas_user_ids: list[int],
    token: str,
    canvas_url: str,
) -> dict:
    """Appends a reply to an existing conversation. Canvas requires an explicit
    recipients[] list, so callers pass the current participant ids."""
    canvas_url = resolve_server_canvas_url(canvas_url)
    form_data = [("body", body)]
    form_data.extend(
        ("recipients[]", str(user_id)) for user_id in recipient_canvas_user_ids
    )
    form_body = urlencode(form_data)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                f"{canvas_url}/api/v1/conversations/{conversation_id}/add_message",
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
