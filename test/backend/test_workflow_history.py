"""Tests for workflow history retrieval (#622)."""

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


def _register(client) -> dict:
    email = f"history_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "History User", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


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

    return headers, resp.json()[0]["local_id"]


def test_workflow_history_empty(client):
    headers = _register(client)
    resp = client.get("/api/v1/history/workflows", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["items"] == []


def test_workflow_history_returns_previewed_action(client):
    headers, local_course_id = _register_with_canvas(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "intent_preview", "summary": "Create Midterm Exam", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "Midterm Exam", '
        '"description": "Covers chapters 1-5", "due_date": "2030-01-01T00:00:00", '
        '"points_possible": 100}}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        chat = client.post(
            "/api/v1/chat/",
            json={"message": "create a midterm exam"},
            headers=headers,
        )
    assert chat.status_code == 200

    resp = client.get("/api/v1/history/workflows", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["action_name"] == "create_assignment"
    assert item["user_prompt"] == "create a midterm exam"
    assert item["status"] == "pending"
    assert item["user_name"] == "History Instructor"
    assert item["proposed_action"]["title"] == "Midterm Exam"


def test_cancel_workflow_updates_status(client):
    headers, local_course_id = _register_with_canvas(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "intent_preview", "summary": "Create Quiz", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "Quiz 1", '
        '"description": "Weekly quiz", "due_date": "2030-01-01T00:00:00", '
        '"points_possible": 10}}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        client.post(
            "/api/v1/chat/",
            json={"message": "create quiz 1"},
            headers=headers,
        )

    history = client.get("/api/v1/history/workflows", headers=headers)
    workflow_id = history.json()["items"][0]["id"]

    cancel = client.post(f"/api/v1/history/workflows/{workflow_id}/cancel", headers=headers)
    assert cancel.status_code == 200
    assert cancel.json()["status"] == "cancelled"
