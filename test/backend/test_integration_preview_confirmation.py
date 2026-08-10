"""
Integration: preview and confirmation workflows (#713 / parent #687).

Covers the human-in-the-loop write path:
  chat intent_preview → confirm executes once
  chat intent_preview → cancel blocks later confirm
  confirm replay is rejected (409)
  pending preview is visible in workflow history before confirmation
  chat modify snapshots previous proposed action
  non-chat assignment preview endpoint (dry-run metadata)
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from integration_helpers import (
    CANVAS_URL,
    chat_turn,
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


# Verifies: Modify updates the pending preview and keeps a one-step previous snapshot.
def test_modify_updates_pending_preview_then_confirm(client):
    headers, local_course_id = register_with_canvas(client, prefix="modify")
    conversation_id, pending_message_id = propose_create_assignment(
        client, headers, local_course_id, title="Modifiable Exam"
    )

    modified = chat_turn(
        client,
        headers,
        "make it worth 50 points",
        (
            '{"action": "intent_preview", "summary": "Create Modifiable Exam worth 50", '
            '"proposed_action": {"action": "create_assignment", '
            f'"local_course_id": {local_course_id}, "title": "Modifiable Exam", '
            '"description": "Covers chapters 1 through 5", "due_date": "2030-01-01T00:00:00", '
            '"points_possible": 50}}'
        ),
        conversation_id=conversation_id,
        pending_message_id=pending_message_id,
    )
    reply = modified["reply"]
    assert reply["pending_message_id"] == pending_message_id
    assert reply["proposed_action"]["points_possible"] == 50
    assert reply["previous_proposed_action"]["points_possible"] == 100

    with patch(
        "app.mcp_tools.dispatcher.create_course_assignment",
        new=AsyncMock(return_value=fake_assignment("Modifiable Exam")),
    ) as mock_create:
        confirm = client.post(
            "/api/v1/chat/confirm",
            json={
                "conversation_id": conversation_id,
                "pending_message_id": pending_message_id,
            },
            headers=headers,
        )
    assert confirm.status_code == 200
    assert confirm.json()["reply"]["success"] is True
    mock_create.assert_called_once()


# Verifies: Structured review-form edits regenerate and replace the exact
# server-stored preview without allowing internal IDs to be overwritten.
def test_structured_preview_edit_regenerates_metadata(client):
    headers, local_course_id = register_with_canvas(client, prefix="formedit")
    conversation_id, pending_message_id = propose_create_assignment(
        client, headers, local_course_id, title="Editable Exam"
    )

    edited = client.patch(
        "/api/v1/chat/preview",
        json={
            "conversation_id": conversation_id,
            "pending_message_id": pending_message_id,
            "changes": {
                "title": "Edited Exam",
                "points_possible": 75,
            },
        },
        headers=headers,
    )

    assert edited.status_code == 200, edited.json()
    reply = edited.json()["reply"]
    assert reply["pending_message_id"] == pending_message_id
    assert reply["proposed_action"]["title"] == "Edited Exam"
    assert reply["proposed_action"]["points_possible"] == 75
    assert reply["proposed_action"]["local_course_id"] == local_course_id
    assert reply["previous_proposed_action"]["title"] == "Editable Exam"
    assert "Edited Exam" in reply["preview_metadata"]["summary"]

    forbidden = client.patch(
        "/api/v1/chat/preview",
        json={
            "conversation_id": conversation_id,
            "pending_message_id": pending_message_id,
            "changes": {"local_course_id": local_course_id + 1},
        },
        headers=headers,
    )
    assert forbidden.status_code == 422


# Verifies: Non-chat assignment preview returns dry-run metadata without writing.
def test_non_chat_assignment_preview_does_not_write(client):
    headers, local_course_id = register_with_canvas(client, prefix="asnprev")
    payload = {
        "name": "Previewed Lab",
        "description": "Dry run only",
        "due_at": "2030-09-01T23:59:00Z",
        "points_possible": 10,
    }

    with patch(
        "app.services.canvas.create_assignment",
        new_callable=AsyncMock,
    ) as mock_create:
        preview = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/assignments/preview"
            f"?canvas_url={CANVAS_URL}",
            json=payload,
            headers=headers,
        )

    assert preview.status_code == 200, preview.json()
    body = preview.json()
    assert body["action"] == "create_assignment"
    assert "Previewed Lab" in body["summary"]
    assert body["metadata"]["name"] == "Previewed Lab"
    assert body["metadata"]["title"] == "Previewed Lab"
    assert "10" in str(body["metadata"]["points_possible"])
    assert isinstance(body["affected_resources"], list)
    mock_create.assert_not_called()


# Verifies: Generate-draft preview path returns structured assignment fields.
def test_assignment_generate_draft_preview(client):
    headers, _ = register_with_canvas(client, prefix="draftprev")
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"title": "Draft Quiz", "description": "Cover recursion concepts clearly.", '
        '"due_at": null, "points_possible": 20}'
    )

    with patch(
        "app.services.assignment_draft.get_llm_adapter",
        return_value=mock_adapter,
    ):
        resp = client.post(
            "/api/v1/canvas/courses/1/assignments/generate-draft",
            json={"prompt": "Create a quiz on recursion"},
            headers=headers,
        )

    assert resp.status_code == 200, resp.json()
    assert resp.json()["title"] == "Draft Quiz"
    assert resp.json()["points_possible"] == 20
