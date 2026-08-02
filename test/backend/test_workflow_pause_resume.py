"""Workflow pause/resume/rename transitions for multi-preview management (#1237)."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

CANVAS_URL = "https://canvas.example.edu"


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


def _create_pending_preview(client, headers, local_course_id) -> tuple[int, int]:
    preview_output = (
        '{"action":"intent_preview","summary":"Create HW2","proposed_action":'
        f'{{"action":"create_assignment","local_course_id":{local_course_id},'
        '"title":"HW2","description":"Do problems","due_date":"2026-12-01",'
        '"points_possible":10}}}'
    )
    chat = _chat(client, headers, "Create HW2", preview_output)
    return chat["conversation_id"], chat["reply"]["pending_message_id"]


def test_pause_and_resume_workflow_by_pending_message_id(client):
    headers, local_course_id = _register_with_canvas(client)
    conversation_id, pending_message_id = _create_pending_preview(
        client, headers, local_course_id
    )

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
    assert pause.json()["display_name"] is None

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
    assert rename.json()["display_name"] == "HW2 draft"

    conversation = client.get(
        f"/api/v1/chat/conversations/{conversation_id}",
        headers=headers,
    )
    assert conversation.status_code == 200, conversation.text
    statuses = conversation.json()["workflow_statuses"]
    assert str(pending_message_id) in statuses or pending_message_id in statuses
    # FastAPI/JSON object keys are always strings.
    entry = statuses[str(pending_message_id)]
    assert entry["status"] == "pending"
    assert entry["display_name"] == "HW2 draft"


def test_confirm_edit_cancel_blocked_while_paused(client):
    headers, local_course_id = _register_with_canvas(client)
    conversation_id, pending_message_id = _create_pending_preview(
        client, headers, local_course_id
    )

    pause = client.post(
        "/api/v1/chat/pause",
        json={
            "conversation_id": conversation_id,
            "pending_message_id": pending_message_id,
        },
        headers=headers,
    )
    assert pause.status_code == 200, pause.text

    confirm = client.post(
        "/api/v1/chat/confirm",
        json={
            "conversation_id": conversation_id,
            "pending_message_id": pending_message_id,
        },
        headers=headers,
    )
    assert confirm.status_code == 409, confirm.text

    edit = client.patch(
        "/api/v1/chat/preview",
        json={
            "conversation_id": conversation_id,
            "pending_message_id": pending_message_id,
            "changes": {"title": "HW2 renamed"},
        },
        headers=headers,
    )
    assert edit.status_code == 409, edit.text

    cancel = client.post(
        "/api/v1/chat/cancel",
        json={
            "conversation_id": conversation_id,
            "pending_message_id": pending_message_id,
        },
        headers=headers,
    )
    assert cancel.status_code == 409, cancel.text

    # Paused state still exposed after reload.
    conversation = client.get(
        f"/api/v1/chat/conversations/{conversation_id}",
        headers=headers,
    )
    assert conversation.status_code == 200, conversation.text
    entry = conversation.json()["workflow_statuses"][str(pending_message_id)]
    assert entry["status"] == "paused"


def test_resume_non_paused_returns_409(client):
    headers, local_course_id = _register_with_canvas(client)
    conversation_id, pending_message_id = _create_pending_preview(
        client, headers, local_course_id
    )

    resume = client.post(
        "/api/v1/chat/resume",
        json={
            "conversation_id": conversation_id,
            "pending_message_id": pending_message_id,
        },
        headers=headers,
    )
    assert resume.status_code == 409, resume.text


def test_pause_executed_returns_409(client):
    from app.schemas.canvas import AssignmentResponse

    headers, local_course_id = _register_with_canvas(client)
    conversation_id, pending_message_id = _create_pending_preview(
        client, headers, local_course_id
    )

    fake_assignment = AssignmentResponse(
        id=99,
        name="HW2",
        description="Do problems",
        due_at="2026-12-01T00:00:00",
        points_possible=10.0,
        course_id=9999,
    )
    with patch(
        "app.mcp_tools.dispatcher.create_course_assignment",
        new=AsyncMock(return_value=fake_assignment),
    ):
        confirm = client.post(
            "/api/v1/chat/confirm",
            json={
                "conversation_id": conversation_id,
                "pending_message_id": pending_message_id,
            },
            headers=headers,
        )
    assert confirm.status_code == 200, confirm.text
    assert confirm.json()["reply"]["success"] is True

    pause = client.post(
        "/api/v1/chat/pause",
        json={
            "conversation_id": conversation_id,
            "pending_message_id": pending_message_id,
        },
        headers=headers,
    )
    assert pause.status_code == 409, pause.text


def test_rename_empty_and_overlong_return_422(client):
    headers, local_course_id = _register_with_canvas(client)
    conversation_id, pending_message_id = _create_pending_preview(
        client, headers, local_course_id
    )

    empty = client.post(
        "/api/v1/chat/rename",
        json={
            "conversation_id": conversation_id,
            "pending_message_id": pending_message_id,
            "display_name": "   ",
        },
        headers=headers,
    )
    assert empty.status_code == 422, empty.text

    overlong = client.post(
        "/api/v1/chat/rename",
        json={
            "conversation_id": conversation_id,
            "pending_message_id": pending_message_id,
            "display_name": "x" * 121,
        },
        headers=headers,
    )
    assert overlong.status_code == 422, overlong.text


def test_cross_user_pause_returns_404(client):
    owner_headers, local_course_id = _register_with_canvas(client)
    conversation_id, pending_message_id = _create_pending_preview(
        client, owner_headers, local_course_id
    )
    other_headers, _ = _register_with_canvas(client)

    pause = client.post(
        "/api/v1/chat/pause",
        json={
            "conversation_id": conversation_id,
            "pending_message_id": pending_message_id,
        },
        headers=other_headers,
    )
    assert pause.status_code == 404, pause.text
