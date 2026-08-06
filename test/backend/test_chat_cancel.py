"""Test note: covers the test chat cancel behavior so future changes can preserve the expected Canvas workflow contract."""

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
    """Register a fresh instructor, connect Canvas, seed one course, and
    set it active — the active-course PATCH also seeds canvas_course_names
    (see set_active_course's sync_courses_if_stale call), which is what
    lets a chat turn with no explicit local_course_id and no course_name
    in the mocked LLM reply still resolve a course via the
    UserPreference.active_course_id fallback in get_or_create_conversation.
    Returns (headers, local_course_id)."""
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Instructor", "email": email, "password": "Secret123!"},
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
        active_resp = client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_course_id},
            headers=headers,
        )
        assert active_resp.status_code == 200, active_resp.text

    return headers, local_course_id


def _chat(client, headers, message, conversation_id=None, pending_message_id=None, llm_output=""):
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = llm_output
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={
                "message": message,
                "conversation_id": conversation_id,
                "pending_message_id": pending_message_id,
            },
            headers=headers,
        )
    return response.json()


def _create_assignment_preview_output(local_course_id: int, title: str = "Midterm Exam") -> str:
    return (
        f'{{"action": "intent_preview", "summary": "Create {title}", '
        f'"proposed_action": {{"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "{title}", '
        '"description": "Covers chapters 1 through 5", "due_date": "2030-01-01T00:00:00", '
        '"points_possible": 100}}'
    )


# Verifies: Cancel blocks execution and later confirm.
def test_cancel_blocks_execution_and_later_confirm(client):
    headers, local_course_id = _register_with_canvas(client)
    body = _chat(
        client, headers, "create a midterm exam", None, None,
        _create_assignment_preview_output(local_course_id),
    )
    conversation_id = body["conversation_id"]
    pending_message_id = body["reply"]["pending_message_id"]

    with patch(
        "app.mcp_tools.dispatcher.create_course_assignment", new_callable=AsyncMock
    ) as mock_create:
        cancel = client.post(
            "/api/v1/chat/cancel",
            json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
            headers=headers,
        )
        assert cancel.status_code == 200
        reply = cancel.json()["reply"]
        assert reply["cancelled"] is True
        assert "create a midterm exam" in reply["original_request"]
        mock_create.assert_not_called()

        # a later confirm on the same id must not execute the write either
        confirm = client.post(
            "/api/v1/chat/confirm",
            json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
            headers=headers,
        )
        assert confirm.status_code == 409
        mock_create.assert_not_called()


# Verifies: Double cancel is rejected.
def test_double_cancel_is_rejected(client):
    headers, local_course_id = _register_with_canvas(client)
    body = _chat(
        client, headers, "create a midterm exam", None, None,
        _create_assignment_preview_output(local_course_id),
    )
    conversation_id = body["conversation_id"]
    pending_message_id = body["reply"]["pending_message_id"]

    first = client.post(
        "/api/v1/chat/cancel",
        json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
        headers=headers,
    )
    assert first.status_code == 200

    second = client.post(
        "/api/v1/chat/cancel",
        json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
        headers=headers,
    )
    assert second.status_code == 409


# Verifies: Cancel unknown pending message id 404s.
def test_cancel_unknown_pending_message_id_404s(client):
    headers, local_course_id = _register_with_canvas(client)
    body = _chat(
        client, headers, "create a midterm exam", None, None,
        _create_assignment_preview_output(local_course_id),
    )
    conversation_id = body["conversation_id"]

    response = client.post(
        "/api/v1/chat/cancel",
        json={"conversation_id": conversation_id, "pending_message_id": 999999999},
        headers=headers,
    )
    assert response.status_code == 404


# Read actions (fetch_courses, fetch_assignments, fetch_students,
# fetch_submissions, get_active_course) no longer go through intent_preview
# at all — they execute directly on the normal turn (see READ_ACTIONS in
# services/chat.py's handle_chat_message), so there is nothing for them to
# cancel or confirm any more. Coverage for that direct-execution behavior
# lives in test_read_actions.py instead of here.


# Verifies: Cancel after modify recovers original first request.
def test_cancel_after_modify_recovers_original_first_request(client):
    """original_request must stay pinned to the very first turn that
    started the preview chain, not the most recent "modify" revision —
    this is what workflow.source_user_message_id guarantees."""
    headers, local_course_id = _register_with_canvas(client)

    first = _chat(
        client, headers, "create a midterm exam", None, None,
        _create_assignment_preview_output(local_course_id, title="Midterm Exam"),
    )
    conversation_id = first["conversation_id"]
    pending_message_id = first["reply"]["pending_message_id"]

    # modify turn — same pending_message_id, different proposed content
    modified = _chat(
        client, headers, "actually call it Final Exam", conversation_id, pending_message_id,
        _create_assignment_preview_output(local_course_id, title="Final Exam"),
    )
    assert modified["reply"]["pending_message_id"] == pending_message_id

    cancel = client.post(
        "/api/v1/chat/cancel",
        json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
        headers=headers,
    )
    assert cancel.status_code == 200
    original_request = cancel.json()["reply"]["original_request"]
    assert "create a midterm exam" in original_request
    assert "Final Exam" not in original_request
