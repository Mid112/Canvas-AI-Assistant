"""
Integration: instructor workflows (#711 / parent #687).

Covers the instructor happy-path API sequence end-to-end:
  register → connect Canvas → dashboard/courses → chat preview → confirm → history
plus messaging draft creation and cross-instructor isolation.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from integration_helpers import (
    CANVAS_URL,
    chat_turn,
    create_assignment_preview_llm,
    fake_assignment,
    propose_create_assignment,
    register_instructor,
    register_with_canvas,
)


@pytest.fixture(scope="module")
def client():
    app.state.limiter.enabled = False
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


# Verifies: Instructor onboarding through Canvas sync and dashboard.
def test_instructor_onboarding_courses_and_dashboard(client):
    headers, local_course_id = register_with_canvas(client, prefix="onboard")

    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["role"] == "instructor"
    assert me.json()["has_canvas_token"] is True

    dashboard = client.get("/api/v1/canvas/dashboard", headers=headers)
    assert dashboard.status_code == 200
    payload = dashboard.json()
    assert payload["course_count"] >= 1
    assert any(c.get("local_id") == local_course_id for c in payload["courses"])


# Verifies: Instructor chat preview → confirm → workflow history sequence.
def test_instructor_chat_confirm_appears_in_workflow_history(client):
    headers, local_course_id = register_with_canvas(client, prefix="flow")
    conversation_id, pending_message_id = propose_create_assignment(
        client, headers, local_course_id, title="Integration Quiz"
    )

    pending_history = client.get("/api/v1/history/workflows", headers=headers)
    assert pending_history.status_code == 200
    assert pending_history.json()["total"] >= 1

    with patch(
        "app.mcp_tools.dispatcher.create_course_assignment",
        new=AsyncMock(return_value=fake_assignment("Integration Quiz")),
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

    history = client.get("/api/v1/history/workflows", headers=headers)
    assert history.status_code == 200
    actions = {item.get("action_name") for item in history.json()["items"]}
    assert "create_assignment" in actions


# Verifies: Instructor can create and fetch a message draft.
def test_instructor_message_draft_workflow(client):
    headers, local_course_id = register_with_canvas(client, prefix="msg")

    create = client.post(
        "/api/v1/messages/drafts",
        json={
            "course_id": local_course_id,
            "subject": "Reminder",
            "body": "Please submit your assignment.",
            "recipients": [{"id": "101", "name": "Student 101"}],
        },
        headers=headers,
    )
    assert create.status_code == 201, create.json()
    draft_id = create.json()["id"]

    fetched = client.get(f"/api/v1/messages/drafts/{draft_id}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["subject"] == "Reminder"


# Verifies: Instructors cannot see each other's workflow history.
def test_instructor_workflow_history_is_isolated(client):
    headers_a, course_a = register_with_canvas(client, prefix="iso_a")
    headers_b, _ = register_with_canvas(client, prefix="iso_b")

    chat_turn(
        client,
        headers_a,
        "create midterm",
        create_assignment_preview_llm(course_a, "Isolated Midterm"),
    )

    history_b = client.get("/api/v1/history/workflows", headers=headers_b)
    assert history_b.status_code == 200
    assert history_b.json()["total"] == 0

    history_a = client.get("/api/v1/history/workflows", headers=headers_a)
    assert history_a.status_code == 200
    assert history_a.json()["total"] >= 1


# Verifies: Instructor without Canvas cannot list courses successfully as connected.
def test_instructor_without_canvas_is_blocked_from_courses(client):
    instructor = register_instructor(client, prefix="nocanvas")
    resp = client.get(
        f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}",
        headers=instructor["headers"],
    )
    assert resp.status_code == 403
