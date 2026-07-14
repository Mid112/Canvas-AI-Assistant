"""
Integration: instructor workflows (#711 / parent #687).

Covers the instructor happy-path API sequence end-to-end:
  register → connect Canvas → dashboard/courses → chat preview → confirm → history
  messaging draft + send, non-chat assignment create/update, missing/late analysis,
  and cross-instructor isolation.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.student import StudentResponse
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


# Verifies: Instructor can send a targeted message draft once recipients are enrolled.
def test_instructor_message_send_workflow(client):
    headers, local_course_id = register_with_canvas(client, prefix="msgsend")
    create = client.post(
        "/api/v1/messages/drafts",
        json={
            "course_id": local_course_id,
            "subject": "Due soon",
            "body": "Please submit before Friday.",
            "recipients": [{"id": "42", "name": "Student 42"}],
        },
        headers=headers,
    )
    assert create.status_code == 201, create.json()
    draft_id = create.json()["id"]

    enrolled = StudentResponse(
        id=1,
        canvas_user_id="42",
        course_id=local_course_id,
        name="Student 42",
        enrollment_state="active",
    )
    with (
        patch(
            "app.services.message_validation.get_students",
            new_callable=AsyncMock,
            return_value=[enrolled],
        ),
        patch("app.services.canvas.send_conversation", new_callable=AsyncMock) as mock_send,
    ):
        sent = client.post(
            f"/api/v1/messages/drafts/{draft_id}/send?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert sent.status_code == 200, sent.json()
    assert sent.json()["status"] == "sent"
    assert sent.json()["delivery_mode"] == "conversation"
    mock_send.assert_awaited_once()


# Verifies: Non-chat assignment create → update round-trip against Canvas mocks.
def test_instructor_assignment_create_and_update(client):
    headers, local_course_id = register_with_canvas(client, prefix="asn")
    create_payload = {
        "name": "Integration Lab",
        "description": "Lab writeup",
        "due_at": "2030-06-01T23:59:00Z",
        "points_possible": 25,
    }
    created_remote = {
        "id": 501,
        "name": "Integration Lab",
        "description": "Lab writeup",
        "due_at": "2030-06-01T23:59:00Z",
        "points_possible": 25.0,
        "course_id": 9999,
    }

    with patch("app.services.canvas.create_assignment", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = created_remote
        created = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/assignments?canvas_url={CANVAS_URL}",
            json=create_payload,
            headers=headers,
        )
    assert created.status_code == 200, created.json()
    assert created.json()["id"] == 501
    mock_create.assert_awaited_once()

    update_payload = {
        "name": "Integration Lab (Updated)",
        "description": "Updated writeup",
        "due_at": "2030-06-08T23:59:00Z",
        "points_possible": 30,
    }
    updated_remote = {**created_remote, **update_payload}
    with patch("app.services.canvas.update_assignment", new_callable=AsyncMock) as mock_update:
        mock_update.return_value = updated_remote
        updated = client.patch(
            f"/api/v1/canvas/courses/{local_course_id}/assignments/501?canvas_url={CANVAS_URL}",
            json=update_payload,
            headers=headers,
        )
    assert updated.status_code == 200, updated.json()
    assert updated.json()["name"] == "Integration Lab (Updated)"
    mock_update.assert_awaited_once()


# Verifies: Missing and late submission analysis endpoints for an owned course.
def test_instructor_submission_analysis_workflows(client):
    headers, local_course_id = register_with_canvas(client, prefix="analyze")
    assignment_id = 10
    enrollments = [
        {
            "id": 10_000_001,
            "course_id": 1,
            "user_id": 1,
            "type": "StudentEnrollment",
            "enrollment_state": "active",
            "user": {
                "id": 1,
                "name": "Alice Smith",
                "sortable_name": "Smith, Alice",
                "login_id": "alice@example.com",
            },
        },
        {
            "id": 10_000_002,
            "course_id": 1,
            "user_id": 2,
            "type": "StudentEnrollment",
            "enrollment_state": "active",
            "user": {
                "id": 2,
                "name": "Bob Jones",
                "sortable_name": "Jones, Bob",
                "login_id": "bob@example.com",
            },
        },
    ]
    missing_submissions = [
        {
            "id": 20_000_001,
            "assignment_id": assignment_id,
            "user_id": 1,
            "workflow_state": "submitted",
            "submitted_at": "2026-06-01T08:00:00Z",
            "missing": False,
            "late": False,
            "excused": False,
            "score": None,
            "grade": None,
            "graded_at": None,
        },
        {
            "id": 20_000_002,
            "assignment_id": assignment_id,
            "user_id": 2,
            "workflow_state": "unsubmitted",
            "submitted_at": None,
            "missing": True,
            "late": False,
            "excused": False,
            "score": None,
            "grade": None,
            "graded_at": None,
        },
    ]
    late_submissions = [
        {
            "id": 20_000_001,
            "assignment_id": assignment_id,
            "user_id": 1,
            "workflow_state": "submitted",
            "submitted_at": "2026-06-02T08:00:00Z",
            "missing": False,
            "late": True,
            "excused": False,
            "seconds_late": 86_400,
            "score": None,
            "grade": None,
            "graded_at": None,
        },
        {
            "id": 20_000_002,
            "assignment_id": assignment_id,
            "user_id": 2,
            "workflow_state": "submitted",
            "submitted_at": "2026-06-01T08:00:00Z",
            "missing": False,
            "late": False,
            "excused": False,
            "score": None,
            "grade": None,
            "graded_at": None,
        },
    ]

    with (
        patch("app.services.analysis.fetch_enrollments", new_callable=AsyncMock) as mock_enroll,
        patch("app.services.analysis.fetch_submissions", new_callable=AsyncMock) as mock_subs,
    ):
        mock_enroll.return_value = enrollments
        mock_subs.return_value = missing_submissions
        missing = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/assignments/{assignment_id}"
            f"/missing-submissions?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert missing.status_code == 200, missing.json()
    assert missing.json()["summary"]["missing_count"] == 1
    assert missing.json()["missing_students"][0]["canvas_user_id"] == "2"

    with (
        patch("app.services.analysis.fetch_enrollments", new_callable=AsyncMock) as mock_enroll,
        patch("app.services.analysis.fetch_submissions", new_callable=AsyncMock) as mock_subs,
    ):
        mock_enroll.return_value = enrollments
        mock_subs.return_value = late_submissions
        late = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/assignments/{assignment_id}"
            f"/late-submissions?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert late.status_code == 200, late.json()
    assert late.json()["summary"]["late_count"] == 1
    assert late.json()["late_students"][0]["canvas_user_id"] == "1"
