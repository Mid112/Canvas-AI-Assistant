"""
Integration: preview and confirmation workflows (#713 / parent #687).

Covers the human-in-the-loop write path:
  chat intent_preview → confirm executes once
  chat intent_preview → cancel blocks later confirm
  confirm replay is rejected (409)
  pending preview is visible in workflow history before confirmation
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from integration_helpers import (
    fake_assignment,
    propose_create_assignment,
    register_with_canvas,
)


@pytest.fixture(scope="module")
def client():
    app.state.limiter.enabled = False
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


# Verifies: Preview is required before a write and lands in pending history.
def test_preview_creates_pending_workflow_before_confirm(client):
    headers, local_course_id = register_with_canvas(client, prefix="prev")
    conversation_id, pending_message_id = propose_create_assignment(
        client, headers, local_course_id, title="Preview Only"
    )

    assert conversation_id > 0
    assert pending_message_id > 0

    history = client.get("/api/v1/history/workflows", headers=headers)
    assert history.status_code == 200
    item = history.json()["items"][0]
    assert item["status"] == "pending"
    assert item["action_name"] == "create_assignment"
    assert item["proposed_action"]["title"] == "Preview Only"


# Verifies: Confirm executes the Canvas write exactly once.
def test_confirm_executes_write_once(client):
    headers, local_course_id = register_with_canvas(client, prefix="confirm")
    conversation_id, pending_message_id = propose_create_assignment(
        client, headers, local_course_id, title="Confirmed Exam"
    )

    with patch(
        "app.mcp_tools.dispatcher.create_course_assignment",
        new=AsyncMock(return_value=fake_assignment("Confirmed Exam")),
    ) as mock_create:
        first = client.post(
            "/api/v1/chat/confirm",
            json={
                "conversation_id": conversation_id,
                "pending_message_id": pending_message_id,
            },
            headers=headers,
        )
        assert first.status_code == 200
        assert first.json()["reply"]["success"] is True
        mock_create.assert_called_once()

        replay = client.post(
            "/api/v1/chat/confirm",
            json={
                "conversation_id": conversation_id,
                "pending_message_id": pending_message_id,
            },
            headers=headers,
        )
        assert replay.status_code == 409
        mock_create.assert_called_once()

    history = client.get("/api/v1/history/workflows", headers=headers)
    assert history.status_code == 200
    statuses = {item["status"] for item in history.json()["items"]}
    assert "executed" in statuses


# Verifies: Cancel blocks Canvas execution and subsequent confirm.
def test_cancel_blocks_confirm(client):
    headers, local_course_id = register_with_canvas(client, prefix="cancel")
    conversation_id, pending_message_id = propose_create_assignment(
        client, headers, local_course_id, title="Cancelled Exam"
    )

    with patch(
        "app.mcp_tools.dispatcher.create_course_assignment",
        new_callable=AsyncMock,
    ) as mock_create:
        cancel = client.post(
            "/api/v1/chat/cancel",
            json={
                "conversation_id": conversation_id,
                "pending_message_id": pending_message_id,
            },
            headers=headers,
        )
        assert cancel.status_code == 200
        assert cancel.json()["reply"]["cancelled"] is True
        mock_create.assert_not_called()

        confirm = client.post(
            "/api/v1/chat/confirm",
            json={
                "conversation_id": conversation_id,
                "pending_message_id": pending_message_id,
            },
            headers=headers,
        )
        assert confirm.status_code in (409, 404)
        mock_create.assert_not_called()

    history = client.get("/api/v1/history/workflows", headers=headers)
    assert history.status_code == 200
    assert any(item["status"] == "cancelled" for item in history.json()["items"])


# Verifies: Unknown pending message cannot be confirmed.
def test_confirm_unknown_pending_message_fails(client):
    headers, local_course_id = register_with_canvas(client, prefix="unknown")
    conversation_id, _ = propose_create_assignment(
        client, headers, local_course_id, title="Known Preview"
    )

    resp = client.post(
        "/api/v1/chat/confirm",
        json={"conversation_id": conversation_id, "pending_message_id": 999_999_999},
        headers=headers,
    )
    assert resp.status_code == 404
