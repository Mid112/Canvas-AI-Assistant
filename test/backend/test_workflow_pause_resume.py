"""Workflow pause/resume transitions for multi-preview management (#1237)."""

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
    email = f"pause_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Pause Resume Instructor", "email": email, "password": "secret123"},
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
        client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_course_id},
            headers=headers,
        )

    return headers, local_course_id


def _chat(client, headers, message, llm_output, conversation_id=None) -> dict:
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = llm_output
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": message, "conversation_id": conversation_id},
            headers=headers,
        )
    assert response.status_code == 200, response.text
    return response.json()


def test_pause_and_resume_workflow_by_pending_message_id(client):
    headers, local_course_id = _register_with_canvas(client)
    preview_output = (
        '{"action":"intent_preview","summary":"Create HW2","proposed_action":'
        f'{{"action":"create_assignment","local_course_id":{local_course_id},'
        '"title":"HW2","description":"Do problems","due_date":"2026-12-01",'
        '"points_possible":10}}}'
    )
    chat = _chat(client, headers, "Create HW2", preview_output)
    pending_message_id = chat["reply"]["pending_message_id"]
    conversation_id = chat["conversation_id"]

    pause = client.post(
        "/api/v1/chat/pause",
        json={
            "conversation_id": conversation_id,
            "pending_message_id": pending_message_id,
        },
        headers=headers,
    )
    assert pause.status_code == 200, pause.text
    assert pause.json()["status"] == "paused"

    resume = client.post(
        "/api/v1/chat/resume",
        json={
            "conversation_id": conversation_id,
            "pending_message_id": pending_message_id,
        },
        headers=headers,
    )
    assert resume.status_code == 200, resume.text
    assert resume.json()["status"] == "pending"

    rename = client.post(
        "/api/v1/chat/rename",
        json={
            "conversation_id": conversation_id,
            "pending_message_id": pending_message_id,
            "display_name": "HW2 draft",
        },
        headers=headers,
    )
    assert rename.status_code == 200, rename.text
    assert rename.json()["status"] == "pending"
