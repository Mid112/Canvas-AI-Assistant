"""
End-to-end tests for the ToolExecutionError user-safe error boundary
(app/backend/app/mcp_tools/dispatcher.py).

parse_action/execute_tool raise ToolExecutionError with two distinct
messages: a safe `user_message` meant for the chatbox, and a `log_detail`
(often containing raw LLM output, internal IDs, or exception text) meant
only for server-side logs. services/chat.py is supposed to return only
user_message in the HTTP response and never leak log_detail. That boundary
is exercised at the unit level by test_dispatcher.py/test_execute.py, but
was never verified end-to-end over real HTTP — these tests close that gap.
"""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.mcp_tools.dispatcher import ToolExecutionError

CANVAS_URL = "https://canvas.example.edu"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register(client) -> dict:
    email = f"errtest_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Error Test User", "email": email, "password": "Secret123!"},
    )
    token = reg.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _register_with_canvas(client) -> tuple[dict, int]:
    """Register a fresh instructor, connect Canvas, seed one course, and
    set it active — the active-course PATCH also seeds canvas_course_names
    (see set_active_course's sync_courses_if_stale call), which is what
    lets a chat turn with no explicit local_course_id and no course_name
    in the mocked LLM reply still resolve a course via the
    UserPreference.active_course_id fallback in get_or_create_conversation."""
    email = f"errtest_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Error Test User", "email": email, "password": "Secret123!"},
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": f"test-token-{uuid.uuid4()}", "canvas_url": CANVAS_URL},
            headers=headers,
        )

    canvas_course_id = uuid.uuid4().int % 10_000_000
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = [{
            "id": canvas_course_id,
            "name": "CPSC 310",
            "course_code": "CPSC310",
            "enrollment_term_id": 1,
            "workflow_state": "available",
        }]
        resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
        local_course_id = resp.json()[0]["local_id"]
        active_resp = client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_course_id},
            headers=headers,
        )
        assert active_resp.status_code == 200, active_resp.text

    return headers, local_course_id


# Verifies: Malformed llm json soft-degrades without leaking raw output (#1304).
def test_malformed_llm_json_returns_safe_message_without_leaking_raw_output(client):
    """parse_action's JSON-decode failure path: log_detail embeds the raw
    LLM output verbatim (f"...Raw output: {raw_llm_output!r}") — that must
    never reach the client. After a failed strict-JSON retry we degrade to
    a respond action (is_error false) instead of a hard error."""
    headers = _register(client)
    raw_output = "SECRET_INTERNAL_TOKEN_xyz not-json-at-all{{{"

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = [raw_output, raw_output]

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "do something"},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is False
    assert body["reply"]["action"] == "respond"
    assert "trouble formatting" in body["reply"]["message"].lower()
    # The raw LLM output (and any internal detail) must not leak into the
    # response body at all.
    assert "SECRET_INTERNAL_TOKEN_xyz" not in response.text
    assert "Raw output" not in response.text


# Verifies: Unknown action returns safe message without leaking action name.
def test_unknown_action_returns_safe_message_without_leaking_action_name(client):
    """dispatcher's unknown-action path logs the literal unsupported action
    name in log_detail — the client should only see the generic message."""
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "delete_entire_database"}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "do something forbidden"},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is True
    assert "isn't supported" in body["reply"]["error"]
    assert "delete_entire_database" not in response.text


# Verifies: Confirm unknown course returns safe message.
def test_confirm_unknown_course_returns_safe_message(client):
    """_resolve_course's ToolExecutionError ("That course could not be
    found in your account.") must reach the client as-is, without the
    log_detail's internal local_course_id/user_id detail.

    The LLM never supplies local_course_id itself (see COURSE RESOLUTION
    in build_system_prompt) — the app injects the real one server-side
    once a course_name resolves, so a bad/unowned id can no longer be
    fabricated by mocking the model's output alone. This reproduces
    _resolve_course's "not found" path the same way a stale/deleted
    course reference would in production: the model names a real, owned
    course, and _resolve_course is made to fail specifically during
    execution. fetch_assignments is a read action, so it executes
    directly on the normal turn now (see READ_ACTIONS in
    handle_chat_message) — there is no separate preview/confirm step to
    fail at."""
    headers, local_course_id = _register_with_canvas(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "fetch_assignments", "course_name": "CPSC 310"}'
    )
    with (
        patch("app.services.chat.get_llm_adapter", return_value=mock_adapter),
        patch(
            "app.mcp_tools.dispatcher._resolve_course",
            new=AsyncMock(
                side_effect=ToolExecutionError(
                    "That course could not be found in your account.",
                    log_detail=f"local_course_id={local_course_id} not found or not owned by user_id=<redacted>",
                )
            ),
        ),
    ):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "show me assignments"},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is True
    assert "could not be found in your account" in body["reply"]["error"]
    # log_detail includes the internal local_course_id — it should not be
    # visible to the client.
    assert str(local_course_id) not in response.text
