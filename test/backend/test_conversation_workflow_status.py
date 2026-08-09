"""Tests for GET /chat/conversations/{id}'s workflow_statuses map (see
WorkflowStatus in app/backend/app/schemas/chat.py) — the authoritative
per-preview lifecycle state the frontend now renders from on reload,
instead of reconstructing it from transcript marker text in FIFO order."""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.canvas import AssignmentResponse

CANVAS_URL = "https://canvas.example.edu"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> tuple[dict, int]:
    email = f"wfstatus_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Workflow Status Instructor", "email": email, "password": "Secret123!"},
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


def _chat(client, headers, message, llm_output, conversation_id=None) -> dict:
    mock_adapter = AsyncMock()
    if isinstance(llm_output, list):
        mock_adapter.generate.side_effect = llm_output
    else:
        mock_adapter.generate.return_value = llm_output
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": message, "conversation_id": conversation_id},
            headers=headers,
        )
    return response.json()


def _get_conversation(client, headers, conversation_id: int) -> dict:
    resp = client.get(f"/api/v1/chat/conversations/{conversation_id}", headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _create_assignment_preview(client, headers, local_course_id: int) -> dict:
    llm_output = (
        '{"action": "intent_preview", "course_name": "CPSC 310", "summary": "Create Quiz", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "Quiz", '
        '"description": "A short quiz on course topics.", "due_date": "2030-01-01T00:00:00", '
        '"points_possible": 10}}'
    )
    return _chat(client, headers, "create a quiz", llm_output)


# Verifies: a freshly staged preview shows status "pending" with no
# result_message_id yet.
def test_pending_preview_reflected_in_workflow_statuses(client):
    headers, local_course_id = _register_with_canvas(client)
    first = _create_assignment_preview(client, headers, local_course_id)
    conversation_id = first["conversation_id"]
    pending_message_id = first["reply"]["pending_message_id"]

    conversation = _get_conversation(client, headers, conversation_id)
    entry = conversation["workflow_statuses"][str(pending_message_id)]
    assert entry["status"] == "pending"
    assert entry["action_name"] == "create_assignment"
    assert entry["result_message_id"] is None


# Verifies: the exact bug reported — after confirming, a reload shows the
# preview as executed/confirmed, not still pending.
def test_confirmed_preview_reflected_in_workflow_statuses(client):
    headers, local_course_id = _register_with_canvas(client)
    first = _create_assignment_preview(client, headers, local_course_id)
    conversation_id = first["conversation_id"]
    pending_message_id = first["reply"]["pending_message_id"]

    with patch(
        "app.mcp_tools.dispatcher.create_course_assignment",
        new=AsyncMock(return_value=AssignmentResponse(
            id=1, course_id=local_course_id, name="Quiz", description="A short quiz on course topics.",
            due_at="2030-01-01T00:00:00", points_possible=10,
        )),
    ):
        confirm_resp = client.post(
            "/api/v1/chat/confirm",
            json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
            headers=headers,
        )
    assert confirm_resp.status_code == 200, confirm_resp.text

    conversation = _get_conversation(client, headers, conversation_id)
    entry = conversation["workflow_statuses"][str(pending_message_id)]
    assert entry["status"] == "executed"
    assert entry["result_message_id"] is not None


# Verifies: a cancelled preview shows status "cancelled" on reload.
def test_cancelled_preview_reflected_in_workflow_statuses(client):
    headers, local_course_id = _register_with_canvas(client)
    first = _create_assignment_preview(client, headers, local_course_id)
    conversation_id = first["conversation_id"]
    pending_message_id = first["reply"]["pending_message_id"]

    cancel_resp = client.post(
        "/api/v1/chat/cancel",
        json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
        headers=headers,
    )
    assert cancel_resp.status_code == 200, cancel_resp.text

    conversation = _get_conversation(client, headers, conversation_id)
    entry = conversation["workflow_statuses"][str(pending_message_id)]
    assert entry["status"] == "cancelled"


# Verifies: two create_assignment previews resolved OUT OF ORDER (the
# second confirmed before the first is cancelled) each keep their own
# correct status — the old frontend FIFO-from-transcript reconstruction
# this backend field replaces would have mislabeled these.
def test_multiple_previews_out_of_order_keep_correct_individual_statuses(client):
    headers, local_course_id = _register_with_canvas(client)

    first = _create_assignment_preview(client, headers, local_course_id)
    assert first["is_error"] is False, first
    conversation_id = first["conversation_id"]
    first_pending_id = first["reply"]["pending_message_id"]

    second_llm = (
        '{"switched_to": null}',
        '{"action": "intent_preview", "course_name": "CPSC 310", "summary": "Create Homework", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "Homework", '
        '"description": "A short homework on course topics.", "due_date": "2030-02-01T00:00:00", '
        '"points_possible": 20}}'
    )
    second = _chat(
        client, headers, "also create a homework", list(second_llm), conversation_id=conversation_id,
    )
    assert second["is_error"] is False, second
    second_pending_id = second["reply"]["pending_message_id"]
    assert second_pending_id != first_pending_id

    # Resolve the SECOND (later-created) preview first, confirming it;
    # then cancel the FIRST one — the reverse of creation order.
    with patch(
        "app.mcp_tools.dispatcher.create_course_assignment",
        new=AsyncMock(return_value=AssignmentResponse(
            id=2, course_id=local_course_id, name="Homework",
            description="A short homework on course topics.",
            due_at="2030-02-01T00:00:00", points_possible=20,
        )),
    ):
        confirm_resp = client.post(
            "/api/v1/chat/confirm",
            json={"conversation_id": conversation_id, "pending_message_id": second_pending_id},
            headers=headers,
        )
    assert confirm_resp.status_code == 200, confirm_resp.text

    cancel_resp = client.post(
        "/api/v1/chat/cancel",
        json={"conversation_id": conversation_id, "pending_message_id": first_pending_id},
        headers=headers,
    )
    assert cancel_resp.status_code == 200, cancel_resp.text

    conversation = _get_conversation(client, headers, conversation_id)
    assert conversation["workflow_statuses"][str(first_pending_id)]["status"] == "cancelled"
    assert conversation["workflow_statuses"][str(second_pending_id)]["status"] == "executed"
