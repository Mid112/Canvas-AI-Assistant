import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.canvas import AssignmentResponse

CANVAS_URL = "https://canvas.ubc.ca"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> tuple[dict, int]:
    """Register a fresh instructor, connect Canvas, seed one course. Returns (headers, local_course_id)."""
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Instructor", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": CANVAS_URL},
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
    return headers, local_course_id


def _propose_create_assignment(client, headers, local_course_id) -> tuple[int, int]:
    """Drives a chat turn that produces a create_assignment intent_preview.
    Returns (conversation_id, pending_message_id)."""
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "intent_preview", "summary": "Create Midterm Exam", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "Midterm Exam", '
        '"description": "Covers chapters 1-5", "due_date": "2030-01-01T00:00:00", '
        '"points_possible": 100}}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "create a midterm exam"},
            headers=headers,
        )
    body = response.json()
    return body["conversation_id"], body["reply"]["pending_message_id"]


def test_confirm_replay_is_rejected(client):
    """The core regression test: confirming the same pending_message_id
    twice must not execute the Canvas write twice."""
    headers, local_course_id = _register_with_canvas(client)
    conversation_id, pending_message_id = _propose_create_assignment(
        client, headers, local_course_id
    )

    fake_assignment = AssignmentResponse(
        id=42,
        name="Midterm Exam",
        description="Covers chapters 1-5",
        due_at="2030-01-01T00:00:00",
        points_possible=100.0,
        course_id=9999,
    )
    with patch(
        "app.mcp_tools.dispatcher.create_course_assignment", new=AsyncMock(return_value=fake_assignment)
    ) as mock_create:
        first = client.post(
            "/api/v1/chat/confirm",
            json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
            headers=headers,
        )
        assert first.status_code == 200
        assert first.json()["reply"]["success"] is True
        mock_create.assert_called_once()

        second = client.post(
            "/api/v1/chat/confirm",
            json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
            headers=headers,
        )
        assert second.status_code == 409
        # still exactly one call — the replay never reached Canvas
        mock_create.assert_called_once()


def test_confirm_unknown_pending_message_id_404s(client):
    headers, local_course_id = _register_with_canvas(client)
    conversation_id, _ = _propose_create_assignment(client, headers, local_course_id)

    response = client.post(
        "/api/v1/chat/confirm",
        json={"conversation_id": conversation_id, "pending_message_id": 999999999},
        headers=headers,
    )
    assert response.status_code == 404


def test_course_id_backfill(client):
    """conversations.course_id should be backfilled from the proposed
    action's local_course_id once a write preview is generated, even
    though the client (matching non_unit_test/test_vague_llm.py's
    behavior) never sends local_course_id up front."""
    headers, local_course_id = _register_with_canvas(client)
    conversation_id, _ = _propose_create_assignment(client, headers, local_course_id)

    history = client.get(f"/api/v1/chat/conversations/{conversation_id}", headers=headers)
    assert history.status_code == 200
    assert history.json()["course_id"] == local_course_id


def test_confirm_canvas_failure_returns_chat_error(client):
    """Canvas failures on confirm return a user-friendly chat error, not a bare HTTP response."""
    headers, local_course_id = _register_with_canvas(client)
    conversation_id, pending_message_id = _propose_create_assignment(
        client, headers, local_course_id
    )

    with patch(
        "app.mcp_tools.dispatcher.create_course_assignment",
        new=AsyncMock(
            side_effect=HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Canvas server error: 503",
            )
        ),
    ):
        response = client.post(
            "/api/v1/chat/confirm",
            json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is True
    assert body["reply"]["error"] == "Canvas server error: 503"
