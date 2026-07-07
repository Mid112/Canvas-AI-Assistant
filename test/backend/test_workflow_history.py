"""Tests for workflow history retrieval (UR2.26 / #622)."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

CANVAS_URL = "https://canvas.ubc.ca"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> tuple[dict, int]:
    email = f"history_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "History Instructor", "email": email, "password": "secret123"},
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


def _create_pending_workflow(client, headers, local_course_id) -> None:
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
    assert response.status_code == 200


def test_workflow_history_returns_created_workflow(client):
    headers, local_course_id = _register_with_canvas(client)
    _create_pending_workflow(client, headers, local_course_id)

    response = client.get("/api/v1/history/workflows", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1

    item = body["items"][0]
    assert item["action_name"] == "create_assignment"
    assert item["user_prompt"] == "create a midterm exam"
    assert item["status"] == "pending"
    assert item["proposed_action"]["action"] == "create_assignment"
    assert item["user_name"] == "History Instructor"
    assert item["conversation_id"] > 0
    assert item["created_at"] is not None
    assert item["executed_at"] is None
    assert isinstance(item["affected_resources"], list)
    assert len(item["affected_resources"]) >= 1
    resource_types = {r["type"] for r in item["affected_resources"]}
    assert "course" in resource_types
    assert "assignment" in resource_types


def test_workflow_history_scoped_to_current_user(client):
    headers_a, local_course_id_a = _register_with_canvas(client)
    _create_pending_workflow(client, headers_a, local_course_id_a)

    headers_b, _ = _register_with_canvas(client)

    response = client.get("/api/v1/history/workflows", headers=headers_b)
    assert response.status_code == 200
    assert response.json()["total"] == 0


def test_cancel_workflow_updates_status(client):
    """HTTP-level coverage for POST /history/workflows/{id}/cancel — the
    only test exercising this endpoint was previously removed when
    cancel_workflow was refactored to use the atomic _claim_pending_workflow
    claim instead of a plain status check."""
    headers, local_course_id = _register_with_canvas(client)
    _create_pending_workflow(client, headers, local_course_id)

    history = client.get("/api/v1/history/workflows", headers=headers)
    workflow_id = history.json()["items"][0]["id"]

    response = client.post(f"/api/v1/history/workflows/{workflow_id}/cancel", headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"

    history_after = client.get("/api/v1/history/workflows", headers=headers)
    assert history_after.json()["items"][0]["status"] == "cancelled"


def test_cancel_workflow_conflict_reports_true_current_status(client):
    """Cancelling an already-executed workflow 409s with the real, current
    status — not a stale value left over from a failed atomic claim."""
    headers, local_course_id = _register_with_canvas(client)
    _create_pending_workflow(client, headers, local_course_id)

    history = client.get("/api/v1/history/workflows", headers=headers)
    workflow_id = history.json()["items"][0]["id"]

    # Cancel it once so it's no longer pending.
    first_cancel = client.post(f"/api/v1/history/workflows/{workflow_id}/cancel", headers=headers)
    assert first_cancel.status_code == 200

    # A second cancel attempt must 409 and report the true current status.
    second_cancel = client.post(f"/api/v1/history/workflows/{workflow_id}/cancel", headers=headers)
    assert second_cancel.status_code == 409
    assert "cancelled" in second_cancel.json()["detail"]
