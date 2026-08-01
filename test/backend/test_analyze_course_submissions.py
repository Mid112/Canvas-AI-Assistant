"""Tests for analyze_course_submissions — the course-wide submission
overview behind the dashboard's "Analyse Missing Submissions" button.

Bug 12: that button used to send an open-ended "grade and submission
performance analysis" prompt that no tool could serve, so the model
answered from nothing and invented submission rates that contradicted the
instructor's actual course. These tests pin that the question now resolves
to a real server-side read, and that "missing"/"late" keep exactly the
definitions in app/backend/app/services/resolved_set.py.
"""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.canvas import SubmissionResponse, SubmissionStatus
from app.schemas.student import StudentResponse

CANVAS_URL = "https://canvas.ubc.ca"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client, *, set_active: bool = True) -> tuple[dict, int]:
    email = f"analyzesubs_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Analysis Instructor", "email": email, "password": "secret123"},
    )
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

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
        if set_active:
            client.patch(
                "/api/v1/canvas/active-course",
                json={"local_course_id": local_course_id},
                headers=headers,
            )

    return headers, local_course_id


def _chat(client, headers, message, llm_output) -> dict:
    mock_adapter = AsyncMock()
    if isinstance(llm_output, list):
        mock_adapter.generate.side_effect = llm_output
    else:
        mock_adapter.generate.return_value = llm_output
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/", json={"message": message}, headers=headers
        )
    return response.json()


def _two_assignments() -> list[dict]:
    return [
        {
            "id": 111, "name": "Assignment 1", "description": None,
            "due_at": "2026-01-01T00:00:00+00:00", "points_possible": 10.0,
            "course_id": 1,
        },
        {
            "id": 222, "name": "Assignment 4", "description": None,
            "due_at": "2026-06-01T00:00:00+00:00", "points_possible": 100.0,
            "course_id": 1,
        },
    ]


def _student(canvas_user_id: str, course_id: int, name: str, enrollment_state: str = "active") -> StudentResponse:
    return StudentResponse(
        id=1, canvas_user_id=canvas_user_id, course_id=course_id,
        name=name, enrollment_state=enrollment_state,
    )


def _submission(user_id: int, status: SubmissionStatus, name: str | None = None) -> SubmissionResponse:
    return SubmissionResponse(
        id=user_id, assignment_id=222, user_id=user_id, student_name=name,
        workflow_state="unsubmitted", status=status,
    )


_ANALYZE = '{"action": "analyze_course_submissions", "course_name": "CPSC 310", "status": "missing"}'


# Verifies: the course-wide question resolves without naming an assignment.
# resolve_missing_submissions would have asked "which assignment?" here,
# which is the wrong answer to "analyse missing submissions" (#12).
def test_analyze_course_submissions_reports_every_assignment(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [
        _student("501", local_course_id, "Alice"),
        _student("502", local_course_id, "Bob"),
    ]
    submissions = [
        _submission(501, SubmissionStatus.missing, "Alice"),
        _submission(502, SubmissionStatus.submitted, "Bob"),
    ]

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        body = _chat(client, headers, "analyse missing submissions", _ANALYZE)

    assert body["is_error"] is False, body
    reply = body["reply"]
    assert reply["action"] == "analyze_course_submissions"
    assert reply["course"] == "CPSC 310"
    # Both assignments walked, one missing student on each.
    assert [entry["assignment_name"] for entry in reply["assignments"]] == [
        "Assignment 1",
        "Assignment 4",
    ]
    assert reply["total"] == 2
    assert all(entry["students"] == ["Alice"] for entry in reply["assignments"])
    # The names the instructor asked for are actually in the summary.
    assert "Alice" in reply["summary"]
    assert "Bob" not in reply["summary"]


# Verifies: a clean course reports zero rather than staying silent, so the
# instructor can tell "nothing missing" apart from "the tool didn't run".
def test_analyze_course_submissions_reports_a_clean_course(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice")]
    submissions = [_submission(501, SubmissionStatus.submitted, "Alice")]

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        body = _chat(client, headers, "analyse missing submissions", _ANALYZE)

    reply = body["reply"]
    assert reply["total"] == 0
    assert "No missing submissions" in reply["summary"]


# Verifies: "late" stays the mutually exclusive category resolved_set.py
# defines — a late submission was submitted, so it is never also missing.
def test_analyze_course_submissions_late_is_a_separate_category(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [
        _student("501", local_course_id, "Alice"),
        _student("502", local_course_id, "Bob"),
    ]
    submissions = [
        _submission(501, SubmissionStatus.missing, "Alice"),
        _submission(502, SubmissionStatus.late, "Bob"),
    ]
    late_action = (
        '{"action": "analyze_course_submissions", "course_name": "CPSC 310", '
        '"status": "late"}'
    )

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        body = _chat(client, headers, "who submitted late?", late_action)

    reply = body["reply"]
    assert reply["status"] == "late"
    assert "Bob" in reply["summary"]
    assert "Alice" not in reply["summary"]


# Verifies: inactive enrollments never appear, matching
# compute_submissions_by_status's active-roster cross-reference.
def test_analyze_course_submissions_excludes_inactive_students(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [
        _student("501", local_course_id, "Alice"),
        _student("502", local_course_id, "Dropped Student", enrollment_state="inactive"),
    ]
    submissions = [
        _submission(501, SubmissionStatus.missing, "Alice"),
        _submission(502, SubmissionStatus.missing, "Dropped Student"),
    ]

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        body = _chat(client, headers, "analyse missing submissions", _ANALYZE)

    reply = body["reply"]
    assert "Dropped Student" not in reply["summary"]
    assert reply["total"] == 2  # Alice, on both assignments


# Verifies: an empty course says so instead of returning a bare zero that
# reads like "everyone submitted".
def test_analyze_course_submissions_handles_a_course_with_no_assignments(client):
    headers, _local_course_id = _register_with_canvas(client)

    with patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=[])):
        body = _chat(client, headers, "analyse missing submissions", _ANALYZE)

    reply = body["reply"]
    assert reply["total"] == 0
    assert "no assignments yet" in reply["summary"]


# Verifies: with no active course and none named, the assistant states
# plainly that it cannot run — not a clarify round-trip that implies the
# request is still in flight.
def test_analyze_course_submissions_errors_without_a_course(client):
    headers, _local_course_id = _register_with_canvas(client, set_active=False)

    body = _chat(
        client,
        headers,
        "analyse missing submissions",
        '{"action": "analyze_course_submissions", "status": "missing"}',
    )

    reply = body["reply"]
    assert reply["action"] == "respond"
    assert "without knowing which course" in reply["message"]
    assert reply.get("question") is None
