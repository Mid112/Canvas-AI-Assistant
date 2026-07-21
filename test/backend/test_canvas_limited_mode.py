"""Tests for #1245 limited-mode Canvas credential gating and deferred requests."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.canvas_assistant_gate import (
    classify_action_for_limited_mode,
    user_has_canvas_credentials,
)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register(client):
    email = f"limited_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Limited User", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_classify_blocks_canvas_reads_and_allows_respond():
    assert classify_action_for_limited_mode("respond") == "allow"
    assert classify_action_for_limited_mode("clarify") == "allow"
    assert classify_action_for_limited_mode("get_active_course") == "allow"
    assert classify_action_for_limited_mode("fetch_assignments") == "block"
    assert classify_action_for_limited_mode("send_message") == "block"
    assert (
        classify_action_for_limited_mode(
            "intent_preview",
            {"action": "create_assignment", "title": "Quiz"},
        )
        == "block"
    )
    assert (
        classify_action_for_limited_mode(
            "intent_preview",
            {"action": "respond", "message": "hi"},
        )
        == "allow"
    )


def test_user_has_canvas_credentials_requires_encrypted_token():
    class Conn:
        encrypted_token = "enc"

    class Empty:
        encrypted_token = None

    class User:
        def __init__(self, connections):
            self.canvas_connections = connections

    assert user_has_canvas_credentials(User([Conn()])) is True
    assert user_has_canvas_credentials(User([Empty()])) is False
    assert user_has_canvas_credentials(User([])) is False


def test_limited_mode_defers_canvas_read_before_tool_execution(client):
    headers = _register(client)
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "fetch_courses"}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "List my courses"},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is True
    assert body["reply"]["requires_canvas_token"] is True
    assert body["reply"]["limited_mode"] is True
    assert isinstance(body["reply"]["deferred_request_id"], int)
    assert body["reply"]["deferred_message"] == "List my courses"

    deferred = client.get("/api/v1/chat/deferred", headers=headers)
    assert deferred.status_code == 200
    items = deferred.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == body["reply"]["deferred_request_id"]
    assert items[0]["message"] == "List my courses"
    assert items[0]["status"] == "deferred"


def test_limited_mode_allows_general_respond(client):
    headers = _register(client)
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "respond", "message": "Office hours vary by instructor."}'
    )

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "What are typical office hours?"},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is False
    assert body["reply"]["action"] == "respond"


def test_resume_deferred_requires_canvas_credentials(client):
    headers = _register(client)
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "fetch_courses"}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        chat = client.post(
            "/api/v1/chat/",
            json={"message": "Show courses"},
            headers=headers,
        )
    deferred_id = chat.json()["reply"]["deferred_request_id"]

    blocked = client.post(
        f"/api/v1/chat/deferred/{deferred_id}/resume",
        headers=headers,
    )
    assert blocked.status_code == 403

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": "https://canvas.ubc.ca"},
            headers=headers,
        )

    resumed = client.post(
        f"/api/v1/chat/deferred/{deferred_id}/resume",
        headers=headers,
    )
    assert resumed.status_code == 200
    assert resumed.json()["status"] == "resumed"
    assert resumed.json()["message"] == "Show courses"

    empty = client.get("/api/v1/chat/deferred", headers=headers)
    assert empty.json()["items"] == []
