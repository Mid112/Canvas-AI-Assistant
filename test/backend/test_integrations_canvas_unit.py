"""Direct unit tests for app/integrations/canvas.py.

Every fetch/write function in this module shares the same
try/except-httpx.TimeoutException/httpx.RequestError shape around an
`httpx.AsyncClient` call. Rather than writing ten near-identical tests, this
parametrizes over every such function so the shared error-handling branches
are all exercised from a single table. A few functions with distinct
behavior (check_token_status's "invalid" return instead of raising,
_get_with_retry's 5xx retry, pagination) get their own dedicated tests.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException

from app.integrations.canvas import (
    _canvas_error_detail,
    _fetch_all_pages,
    _get_with_retry,
    _parse_next_link,
    _raise_for_canvas_error,
    check_token_status,
    create_announcement,
    create_assignment,
    fetch_assignment,
    fetch_assignments,
    fetch_courses,
    fetch_enrollments,
    fetch_student_enrollment,
    fetch_submissions,
    fetch_user_profile,
    post_announcement,
    send_conversation,
    update_assignment,
    update_submission_grade,
    validate_token,
)

CANVAS_URL = "https://canvas.test"


def _client_raising(exc: Exception, *, method: str = "get") -> MagicMock:
    """A mock httpx.AsyncClient() context manager whose given HTTP method
    raises `exc` when called."""
    client = AsyncMock()
    setattr(client, method, AsyncMock(side_effect=exc))
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


# Every (callable, args, kwargs, http-method-used) combination that shares
# the timeout->504 / request-error->502 mapping.
_ENDPOINTS = [
    (validate_token, ("tok", CANVAS_URL), {}, "get"),
    (fetch_courses, ("tok", CANVAS_URL), {}, "get"),
    (fetch_assignments, (1, "tok", CANVAS_URL), {}, "get"),
    (fetch_assignment, (1, 2, "tok", CANVAS_URL), {}, "get"),
    (fetch_submissions, (1, 2, "tok", CANVAS_URL), {}, "get"),
    (fetch_user_profile, (1, "tok", CANVAS_URL), {}, "get"),
    (fetch_enrollments, (1, "tok", CANVAS_URL), {}, "get"),
    (create_assignment, (1, {"name": "A"}, "tok", CANVAS_URL), {}, "post"),
    (update_assignment, (1, 2, {"name": "A"}, "tok", CANVAS_URL), {}, "put"),
    (update_submission_grade, (1, 2, 3, "88", "tok", CANVAS_URL), {}, "put"),
    (create_announcement, (1, "Subject", "Body", "tok", CANVAS_URL), {}, "post"),
    (post_announcement, (1, "Subject", "Body", "tok", CANVAS_URL), {}, "post"),
    (send_conversation, (1, [10, 11], "Subject", "Body", "tok", CANVAS_URL), {}, "post"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("func,args,kwargs,method", _ENDPOINTS)
async def test_endpoint_maps_timeout_to_504(func, args, kwargs, method):
    with patch(
        "app.integrations.canvas.httpx.AsyncClient",
        return_value=_client_raising(httpx.TimeoutException("timed out"), method=method),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await func(*args, **kwargs)

    assert exc_info.value.status_code == 504


@pytest.mark.asyncio
@pytest.mark.parametrize("func,args,kwargs,method", _ENDPOINTS)
async def test_endpoint_maps_request_error_to_502(func, args, kwargs, method):
    with patch(
        "app.integrations.canvas.httpx.AsyncClient",
        return_value=_client_raising(httpx.RequestError("unreachable"), method=method),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await func(*args, **kwargs)

    assert exc_info.value.status_code == 502


def _client_returning(response: httpx.Response, *, method: str = "get") -> MagicMock:
    client = AsyncMock()
    setattr(client, method, AsyncMock(return_value=response))
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "func,args",
    [
        (fetch_assignment, (1, 2, "tok", CANVAS_URL)),
        (fetch_user_profile, (1, "tok", CANVAS_URL)),
    ],
)
async def test_single_resource_get_success_returns_json_body(func, args):
    response = httpx.Response(200, json={"id": 7}, request=httpx.Request("GET", "https://canvas.test/x"))
    with patch(
        "app.integrations.canvas.httpx.AsyncClient",
        return_value=_client_returning(response, method="get"),
    ):
        result = await func(*args)

    assert result == {"id": 7}


@pytest.mark.asyncio
async def test_validate_token_success_does_not_raise():
    response = httpx.Response(200, json={"id": 1}, request=httpx.Request("GET", "https://canvas.test/api/v1/users/self"))
    with patch("app.integrations.canvas.httpx.AsyncClient", return_value=_client_returning(response, method="get")):
        await validate_token("tok", CANVAS_URL)  # no exception raised


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "func,args,method",
    [
        (create_assignment, (1, {"name": "A"}, "tok", CANVAS_URL), "post"),
        (update_assignment, (1, 2, {"name": "A"}, "tok", CANVAS_URL), "put"),
        (update_submission_grade, (1, 2, 3, "88", "tok", CANVAS_URL), "put"),
        (create_announcement, (1, "Subject", "Body", "tok", CANVAS_URL), "post"),
        (post_announcement, (1, "Subject", "Body", "tok", CANVAS_URL), "post"),
        (send_conversation, (1, [10, 11], "Subject", "Body", "tok", CANVAS_URL), "post"),
    ],
)
async def test_write_endpoint_success_returns_json_body(func, args, method):
    response = httpx.Response(200, json={"id": 42}, request=httpx.Request(method.upper(), "https://canvas.test/x"))
    with patch(
        "app.integrations.canvas.httpx.AsyncClient",
        return_value=_client_returning(response, method=method),
    ):
        result = await func(*args)

    assert result == {"id": 42}


@pytest.mark.asyncio
async def test_update_submission_grade_sends_grade_and_comment():
    response = httpx.Response(
        200,
        json={"id": 11, "grade": "88"},
        request=httpx.Request("PUT", "https://canvas.test/api/v1/submissions/3"),
    )
    client_cm = _client_returning(response, method="put")

    with patch("app.integrations.canvas.httpx.AsyncClient", return_value=client_cm):
        result = await update_submission_grade(
            1,
            2,
            3,
            "88",
            "tok",
            comment="Adjusted after rubric review",
            canvas_url="https://canvas.test",
        )

    client = await client_cm.__aenter__()
    client.put.assert_awaited_once_with(
        "https://canvas.test/api/v1/courses/1/assignments/2/submissions/3",
        headers={"Authorization": "Bearer tok"},
        json={
            "submission": {"posted_grade": "88"},
            "comment": {"text_comment": "Adjusted after rubric review"},
        },
    )
    assert result == {"id": 11, "grade": "88"}


@pytest.mark.asyncio
async def test_update_submission_grade_can_send_comment_without_grade():
    response = httpx.Response(
        200,
        json={"id": 11, "grade": "88"},
        request=httpx.Request("PUT", "https://canvas.test/api/v1/submissions/3"),
    )
    client_cm = _client_returning(response, method="put")

    with patch("app.integrations.canvas.httpx.AsyncClient", return_value=client_cm):
        result = await update_submission_grade(
            1,
            2,
            3,
            None,
            "tok",
            comment="Work changes. You can do it.",
            canvas_url="https://canvas.test",
        )

    client = await client_cm.__aenter__()
    client.put.assert_awaited_once_with(
        "https://canvas.test/api/v1/courses/1/assignments/2/submissions/3",
        headers={"Authorization": "Bearer tok"},
        json={"comment": {"text_comment": "Work changes. You can do it."}},
    )
    assert result == {"id": 11, "grade": "88"}


# ---------------------------------------------------------------------------
# check_token_status — returns a status string rather than raising
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_check_token_status_network_failure_returns_invalid():
    with patch(
        "app.integrations.canvas.httpx.AsyncClient",
        return_value=_client_raising(httpx.RequestError("unreachable"), method="get"),
    ):
        result = await check_token_status("tok", CANVAS_URL)

    assert result == "invalid"


@pytest.mark.asyncio
async def test_check_token_status_401_is_expired():
    response = httpx.Response(401, request=httpx.Request("GET", "https://canvas.test/api/v1/users/self"))
    client = AsyncMock()
    client.get = AsyncMock(return_value=response)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client)
    cm.__aexit__ = AsyncMock(return_value=False)

    with patch("app.integrations.canvas.httpx.AsyncClient", return_value=cm):
        result = await check_token_status("tok", CANVAS_URL)

    assert result == "expired"


@pytest.mark.asyncio
async def test_check_token_status_success_is_valid():
    response = httpx.Response(200, json={"id": 1}, request=httpx.Request("GET", "https://canvas.test/api/v1/users/self"))
    client = AsyncMock()
    client.get = AsyncMock(return_value=response)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client)
    cm.__aexit__ = AsyncMock(return_value=False)

    with patch("app.integrations.canvas.httpx.AsyncClient", return_value=cm):
        result = await check_token_status("tok", CANVAS_URL)

    assert result == "valid"


@pytest.mark.asyncio
async def test_check_token_status_other_error_is_invalid():
    response = httpx.Response(500, request=httpx.Request("GET", "https://canvas.test/api/v1/users/self"))
    client = AsyncMock()
    client.get = AsyncMock(return_value=response)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client)
    cm.__aexit__ = AsyncMock(return_value=False)

    with patch("app.integrations.canvas.httpx.AsyncClient", return_value=cm):
        result = await check_token_status("tok", CANVAS_URL)

    assert result == "invalid"


# ---------------------------------------------------------------------------
# _get_with_retry — single retry on a transient 5xx
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_with_retry_retries_once_on_server_error():
    server_error = httpx.Response(503, request=httpx.Request("GET", "https://canvas.test/x"))
    success = httpx.Response(200, json={"ok": True}, request=httpx.Request("GET", "https://canvas.test/x"))
    client = AsyncMock()
    client.get = AsyncMock(side_effect=[server_error, success])

    with patch("app.integrations.canvas.asyncio.sleep", new=AsyncMock()):
        result = await _get_with_retry(client, "https://canvas.test/x")

    assert result is success
    assert client.get.await_count == 2


@pytest.mark.asyncio
async def test_get_with_retry_logs_transient_retries_at_info(caplog):
    """#1295: retry noise must stay at info so dashboard fallback stays quiet."""
    import logging

    server_error = httpx.Response(502, request=httpx.Request("GET", "https://canvas.test/x"))
    success = httpx.Response(200, json={"ok": True}, request=httpx.Request("GET", "https://canvas.test/x"))
    client = AsyncMock()
    client.get = AsyncMock(side_effect=[server_error, success])

    with (
        patch("app.integrations.canvas.asyncio.sleep", new=AsyncMock()),
        caplog.at_level(logging.INFO, logger="app.integrations.canvas"),
    ):
        await _get_with_retry(client, "https://canvas.test/x")

    retry_records = [
        record
        for record in caplog.records
        if "Canvas returned 502" in record.message and "retry" in record.message
    ]
    assert retry_records
    assert all(record.levelno == logging.INFO for record in retry_records)
    assert not any(record.levelno >= logging.WARNING for record in retry_records)


@pytest.mark.asyncio
async def test_get_with_retry_no_retry_on_success():
    success = httpx.Response(200, json={"ok": True}, request=httpx.Request("GET", "https://canvas.test/x"))
    client = AsyncMock()
    client.get = AsyncMock(return_value=success)

    result = await _get_with_retry(client, "https://canvas.test/x")

    assert result is success
    assert client.get.await_count == 1


# ---------------------------------------------------------------------------
# fetch_enrollments / fetch_student_enrollment — active-only enrollment state
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.parametrize(
    "func,args",
    [
        (fetch_enrollments, (1, "tok", CANVAS_URL)),
        (fetch_student_enrollment, (1, 2, "tok", CANVAS_URL)),
    ],
)
async def test_enrollment_fetchers_request_active_state_only(func, args):
    """Canvas exposes "invited"/"creation_pending" enrollments alongside
    "active" ones, but every consumer of these two functions (roster counts,
    course-overview/dashboard metrics, messaging recipients, the AI
    assistant's student summaries) treats "active" as the only state that
    counts as an enrolled student — see student-analytics.ts's matching
    frontend filter. That invariant depends entirely on these two functions
    never asking Canvas for anything but state[]=active; pin it here so a
    future change can't silently widen the filter without also updating
    every downstream consumer.
    """
    response = httpx.Response(
        200, json=[], request=httpx.Request("GET", "https://canvas.test/x")
    )
    client = _client_returning(response, method="get")

    with patch("app.integrations.canvas.httpx.AsyncClient", return_value=client):
        await func(*args)

    inner_client = client.__aenter__.return_value
    call_params = inner_client.get.call_args.kwargs["params"]
    assert call_params["state[]"] == "active"


# ---------------------------------------------------------------------------
# _fetch_all_pages — pagination follow + max-page truncation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fetch_all_pages_follows_link_header_across_pages():
    page1 = httpx.Response(
        200,
        json=[{"id": 1}],
        headers={"link": '<https://canvas.test/x?page=2>; rel="next"'},
        request=httpx.Request("GET", "https://canvas.test/x"),
    )
    page2 = httpx.Response(
        200,
        json=[{"id": 2}],
        request=httpx.Request("GET", "https://canvas.test/x?page=2"),
    )
    client = AsyncMock()
    client.get = AsyncMock(side_effect=[page1, page2])

    result = await _fetch_all_pages(client, "https://canvas.test/x", headers={}, params={"per_page": 100})

    assert result == [{"id": 1}, {"id": 2}]
    assert client.get.await_count == 2


@pytest.mark.asyncio
async def test_fetch_all_pages_stops_at_max_pages():
    looping_page = httpx.Response(
        200,
        json=[{"id": 1}],
        headers={"link": '<https://canvas.test/x?page=next>; rel="next"'},
        request=httpx.Request("GET", "https://canvas.test/x"),
    )
    client = AsyncMock()
    client.get = AsyncMock(return_value=looping_page)

    result = await _fetch_all_pages(client, "https://canvas.test/x", headers={})

    assert client.get.await_count == 50  # _MAX_PAGES
    assert len(result) == 50


def test_parse_next_link_returns_none_when_no_next_rel():
    assert _parse_next_link('<https://canvas.test/x?page=1>; rel="first"') is None


def test_parse_next_link_extracts_next_url():
    assert (
        _parse_next_link('<https://canvas.test/x?page=1>; rel="first", <https://canvas.test/x?page=2>; rel="next"')
        == "https://canvas.test/x?page=2"
    )


# ---------------------------------------------------------------------------
# _raise_for_canvas_error / _canvas_error_detail
# ---------------------------------------------------------------------------

def _response(status_code: int, json_body=None, text: str = ""):
    kwargs = {"request": httpx.Request("GET", "https://canvas.test/x")}
    if json_body is not None:
        return httpx.Response(status_code, json=json_body, **kwargs)
    return httpx.Response(status_code, text=text, **kwargs)


def test_raise_for_canvas_error_401_maps_to_422():
    with pytest.raises(HTTPException) as exc_info:
        _raise_for_canvas_error(_response(401))
    assert exc_info.value.status_code == 422


def test_raise_for_canvas_error_403_maps_to_403():
    with pytest.raises(HTTPException) as exc_info:
        _raise_for_canvas_error(_response(403))
    assert exc_info.value.status_code == 403


def test_raise_for_canvas_error_404_maps_to_404():
    with pytest.raises(HTTPException) as exc_info:
        _raise_for_canvas_error(_response(404))
    assert exc_info.value.status_code == 404


def test_raise_for_canvas_error_5xx_maps_to_502():
    with pytest.raises(HTTPException) as exc_info:
        _raise_for_canvas_error(_response(503))
    assert exc_info.value.status_code == 502


def test_raise_for_canvas_error_other_4xx_includes_detail():
    with pytest.raises(HTTPException) as exc_info:
        _raise_for_canvas_error(_response(400, json_body={"message": "Bad field"}))
    assert exc_info.value.status_code == 502
    assert "Bad field" in exc_info.value.detail


def test_raise_for_canvas_error_success_does_not_raise():
    _raise_for_canvas_error(_response(200, json_body={"ok": True}))


def test_canvas_error_detail_non_json_body_returns_text():
    assert _canvas_error_detail(_response(500, text="internal error")) == "internal error"


def test_canvas_error_detail_error_list_of_dicts():
    detail = _canvas_error_detail(
        _response(400, json_body={"errors": [{"message": "bad title"}, {"message": "bad date"}]})
    )
    assert detail == "bad title; bad date"


def test_canvas_error_detail_error_list_with_non_dict_items():
    detail = _canvas_error_detail(_response(400, json_body={"errors": ["plain string error"]}))
    assert detail == "plain string error"


def test_canvas_error_detail_error_dict_of_field_messages():
    detail = _canvas_error_detail(_response(400, json_body={"errors": {"title": "is required"}}))
    assert detail == "title: is required"


def test_canvas_error_detail_falls_back_to_str():
    detail = _canvas_error_detail(_response(400, json_body={"unexpected": "shape"}))
    assert detail == "{'unexpected': 'shape'}"
