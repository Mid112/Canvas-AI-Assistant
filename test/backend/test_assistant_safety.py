from canvas_test_utils import unique_canvas_token

"""
Assistant safety coverage (#710).

Complements test_chat_endpoint / test_chat_confirm / test_error_handling:
out_of_scope handling, LLM timeout / rate-limit user messages, confirm
ownership boundaries, and that client bodies cannot redefine proposed actions.
"""
import uuid
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app

CANVAS_URL = "https://canvas.example.edu"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register(client) -> dict:
    email = f"safe_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Safety User", "email": email, "password": "Secret123!"},
    )
    token = reg.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _register_with_course(client) -> tuple[dict, int]:
    headers = _register(client)
    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": unique_canvas_token(), "canvas_url": CANVAS_URL},
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
    return headers, resp.json()[0]["local_id"]


# ---------------------------------------------------------------------------
# out_of_scope
# ---------------------------------------------------------------------------

def test_out_of_scope_returns_safe_reply_without_canvas_call(client):
    headers = _register(client)
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "out_of_scope", "message": "Write a poem about cats"}'
    )

    with (
        patch("app.services.chat.get_llm_adapter", return_value=mock_adapter),
        patch("app.mcp_tools.dispatcher.get_courses", new_callable=AsyncMock) as mock_courses,
        patch(
            "app.mcp_tools.dispatcher.create_course_assignment",
            new_callable=AsyncMock,
        ) as mock_create,
    ):
        resp = client.post(
            "/api/v1/chat/",
            json={"message": "Write a poem about cats"},
            headers=headers,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["is_error"] is False
    assert body["reply"]["action"] == "out_of_scope"
    assert body["reply"]["out_of_scope"] is True
    assert "out of scope" in body["reply"]["message"].lower()
    assert "poem" in body["reply"]["detail"].lower()
    mock_courses.assert_not_called()
    mock_create.assert_not_called()


# ---------------------------------------------------------------------------
# LLM timeout / rate limit — user-facing messages only
# ---------------------------------------------------------------------------

def test_llm_timeout_returns_friendly_message(client):
    headers = _register(client)
    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = TimeoutError()

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        resp = client.post(
            "/api/v1/chat/",
            json={"message": "List my courses"},
            headers=headers,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["is_error"] is True
    assert "took too long" in body["reply"]["error"].lower()
    # Internal timeout detail must not leak
    assert "TimeoutError" not in resp.text
    assert "LLM request timed out" not in resp.text


def test_llm_rate_limit_returns_friendly_message(client):
    headers = _register(client)
    mock_adapter = AsyncMock()
    request = httpx.Request("POST", "https://api.groq.com/v1/chat")
    response = httpx.Response(429, request=request)
    mock_adapter.generate.side_effect = httpx.HTTPStatusError(
        "rate limited", request=request, response=response
    )

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        resp = client.post(
            "/api/v1/chat/",
            json={"message": "List my courses"},
            headers=headers,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["is_error"] is True
    assert "rate-limited" in body["reply"]["error"].lower() or "rate" in body["reply"]["error"].lower()
    assert "Groq" not in resp.text


def test_llm_http_error_returns_generic_message(client):
    headers = _register(client)
    mock_adapter = AsyncMock()
    request = httpx.Request("POST", "https://api.groq.com/v1/chat")
    response = httpx.Response(500, request=request)
    mock_adapter.generate.side_effect = httpx.HTTPStatusError(
        "server error", request=request, response=response
    )

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        resp = client.post(
            "/api/v1/chat/",
            json={"message": "List my courses"},
            headers=headers,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["is_error"] is True
    assert "try again" in body["reply"]["error"].lower()
    assert "500" not in resp.text


# ---------------------------------------------------------------------------
# Raw read action auto-wrap (same safety as write wrap)
# ---------------------------------------------------------------------------

def test_raw_read_action_executes_directly_without_a_confirm_step(client):
    """A read action can never mutate Canvas state, so — unlike a write —
    it's never gated behind intent_preview/confirm: it executes directly on
    the normal turn (see READ_ACTIONS in services/chat.py's
    handle_chat_message). This still matters as a safety property: the
    fetch actually happens (nothing here can accidentally skip it and leave
    stale-looking success), and no pending action is left dangling for a
    later confirm to (mis)execute."""
    headers, local_course_id = _register_with_course(client)
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        f'{{"action": "fetch_assignments", "local_course_id": {local_course_id}}}'
    )

    with (
        patch("app.services.chat.get_llm_adapter", return_value=mock_adapter),
        patch("app.mcp_tools.dispatcher.get_assignments", new=AsyncMock(return_value=[])) as mock_fetch,
    ):
        resp = client.post(
            "/api/v1/chat/",
            json={"message": "show assignments", "local_course_id": local_course_id},
            headers=headers,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["is_error"] is False
    assert body["reply"]["assignments"] == []
    assert "pending_message_id" not in body["reply"]
    mock_fetch.assert_awaited_once()


# ---------------------------------------------------------------------------
# Confirm: client cannot redefine the action; ownership enforced
# ---------------------------------------------------------------------------

def test_confirm_ignores_client_supplied_action_fields(client):
    """Confirm body only accepts conversation_id + pending_message_id.
    Extra fields must be ignored — the server loads proposed_action from Workflow."""
    from app.schemas.canvas import AssignmentResponse

    headers, local_course_id = _register_with_course(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "intent_preview", "summary": "Create midterm", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "Midterm", '
        '"description": "Ch 1", "due_date": "2030-12-01T23:59:00", '
        '"points_possible": 100}}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        preview = client.post(
            "/api/v1/chat/",
            json={"message": "create midterm", "local_course_id": local_course_id},
            headers=headers,
        )
    assert preview.status_code == 200, preview.json()
    pending_message_id = preview.json()["reply"]["pending_message_id"]
    conversation_id = preview.json()["conversation_id"]

    fake_assignment = AssignmentResponse(
        id=55,
        name="Midterm",
        description="Ch 1",
        due_at="2030-12-01T23:59:00",
        points_possible=100.0,
        course_id=1,
    )
    with (
        patch(
            "app.mcp_tools.dispatcher.create_course_assignment",
            new=AsyncMock(return_value=fake_assignment),
        ) as mock_create,
        patch(
            "app.mcp_tools.dispatcher.send_course_message",
            new_callable=AsyncMock,
        ) as mock_send,
    ):
        confirm = client.post(
            "/api/v1/chat/confirm",
            json={
                "conversation_id": conversation_id,
                "pending_message_id": pending_message_id,
                # Adversarial extras — must not change what gets executed
                "proposed_action": {
                    "action": "send_message",
                    "subject": "HACKED",
                    "body": "should never send",
                },
                "action": "send_message",
            },
            headers=headers,
        )

    assert confirm.status_code == 200, confirm.json()
    assert confirm.json()["is_error"] is False
    assert confirm.json()["reply"]["success"] is True
    mock_create.assert_awaited_once()
    mock_send.assert_not_called()


def test_confirm_rejects_other_users_pending_message(client):
    headers_a, local_course_id = _register_with_course(client)
    headers_b = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "intent_preview", "summary": "Create midterm", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "Midterm", '
        '"description": "Ch 1", "due_date": "2030-12-01T23:59:00", '
        '"points_possible": 100}}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        preview = client.post(
            "/api/v1/chat/",
            json={"message": "create midterm", "local_course_id": local_course_id},
            headers=headers_a,
        )
    pending_message_id = preview.json()["reply"]["pending_message_id"]
    conversation_id = preview.json()["conversation_id"]

    confirm = client.post(
        "/api/v1/chat/confirm",
        json={
            "conversation_id": conversation_id,
            "pending_message_id": pending_message_id,
        },
        headers=headers_b,
    )
    # Other user must not execute A's pending write
    assert confirm.status_code in (403, 404) or (
        confirm.status_code == 200 and confirm.json().get("is_error") is True
    )


# ---------------------------------------------------------------------------
# System prompt is passed to the LLM (SCOPE CHECK present)
# ---------------------------------------------------------------------------

def test_chat_passes_system_prompt_with_scope_check(client):
    headers = _register(client)
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "respond", "message": "Hi"}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        resp = client.post(
            "/api/v1/chat/",
            json={"message": "hello"},
            headers=headers,
        )

    assert resp.status_code == 200
    mock_adapter.generate.assert_awaited()
    system_prompt = mock_adapter.generate.await_args.args[0]
    assert "SCOPE CHECK" in system_prompt
    assert "out_of_scope" in system_prompt
