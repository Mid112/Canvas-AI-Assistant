import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

CANVAS_URL = "https://canvas.example.edu"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def _register_with_canvas(client) -> dict:
    email = f"overview_{uuid.uuid4()}@example.com"
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Overview Instructor", "email": email, "password": "Secret123!"},
    )
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": CANVAS_URL},
            headers=headers,
        )
    return headers


def _sync_local_course(client, headers, canvas_id: int | None = None) -> int:
    cid = canvas_id if canvas_id is not None else uuid.uuid4().int % 10_000_000
    courses = [
        {
            "id": cid,
            "name": "CS 101: Introduction to Programming",
            "course_code": "CS101",
            "workflow_state": "available",
            "term": {"name": "Fall 2026"},
        }
    ]
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        response = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert response.status_code == 200
    return response.json()[0]["local_id"]



def test_course_overview_unknown_course(client):
    headers = _register_with_canvas(client)
    response = client.get(
        f"/api/v1/canvas/courses/999999/overview?canvas_url={CANVAS_URL}",
        headers=headers,
    )
    assert response.status_code == 404


# Verifies: Course overview empty state.
def test_course_overview_empty_state(client):
    headers = _register_with_canvas(client)
    local_id = _sync_local_course(client, headers)

    with (
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
    ):
        mock_enrollments.return_value = []
        mock_assignments.return_value = []
        response = client.get(
            f"/api/v1/canvas/courses/{local_id}/overview?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["local_id"] == local_id
    assert payload["name"] == "CS 101: Introduction to Programming"
    assert payload["term"] == "Fall 2026"
    assert payload["student_count"] == 0
    assert payload["assignment_count"] == 0
    assert payload["missing_submissions"] == 0
    assert payload["late_submissions"] == 0
    assert payload["average_grade"] is None
    assert payload["completion_rate"] is None
    assert payload["recent_assignments"] == []
    assert payload["recent_activity"] == []
    assert payload["is_active"] is False


# Verifies: Course overview with assignments and submissions.
def test_course_overview_with_assignments_and_submissions(client):
    headers = _register_with_canvas(client)
    local_id = _sync_local_course(client, headers)
    assignment_id_one = uuid.uuid4().int % 10_000_000
    assignment_id_two = assignment_id_one + 1

    assignments = [
        {
            "id": assignment_id_one,
            "name": "Variables Quiz",
            "description": None,
            "due_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
            "points_possible": 100.0,
            "course_id": 1,
        },
        {
            "id": assignment_id_two,
            "name": "Loops Lab",
            "description": None,
            "due_at": (datetime.now(UTC) + timedelta(days=5)).isoformat(),
            "points_possible": 50.0,
            "course_id": 1,
        },
    ]

    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = assignments
        client.get(
            f"/api/v1/canvas/courses/{local_id}/assignments?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    enrollments = [
        {
            "user_id": 1001,
            "enrollment_state": "active",
            "user": {"name": "Ada Lovelace", "sortable_name": "Lovelace, Ada"},
        },
        {
            "user_id": 1002,
            "enrollment_state": "active",
            "user": {"name": "Grace Hopper", "sortable_name": "Hopper, Grace"},
        },
    ]

    with (
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
    ):
        mock_enrollments.return_value = enrollments
        mock_assignments.return_value = assignments
        response = client.get(
            f"/api/v1/canvas/courses/{local_id}/overview?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["student_count"] == 2
    assert payload["assignment_count"] == 2
    assert payload["average_grade"] is None
    assert len(payload["recent_assignments"]) == 2
    assert payload["recent_assignments"][0]["title"] in {"Variables Quiz", "Loops Lab"}
    assert payload["recent_assignments"][0]["total_students"] == 2
    assert payload["recent_activity"] == []


# Verifies: missing/late counts, average_grade, completion_rate, and recent_activity
# are computed from real submission data (not just left at their empty defaults).
def test_course_overview_grades_completion_and_activity(client):
    headers = _register_with_canvas(client)
    local_id = _sync_local_course(client, headers)
    assignment_id = uuid.uuid4().int % 10_000_000

    assignments = [
        {
            "id": assignment_id,
            "name": "Midterm",
            "description": None,
            "due_at": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
            "points_possible": 100.0,
            "course_id": 1,
        }
    ]
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = assignments
        client.get(
            f"/api/v1/canvas/courses/{local_id}/assignments?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    enrollments = [
        {
            "user_id": 2001,
            "enrollment_state": "active",
            "user": {"name": "Ada Lovelace", "sortable_name": "Lovelace, Ada"},
        },
        {
            "user_id": 2002,
            "enrollment_state": "active",
            "user": {"name": "Grace Hopper", "sortable_name": "Hopper, Grace"},
        },
    ]
    submission_id_one = uuid.uuid4().int % 10_000_000
    submission_id_two = submission_id_one + 1
    submissions = [
        {
            "id": submission_id_one,
            "assignment_id": assignment_id,
            "user_id": 2001,
            "score": 90.0,
            "grade": "A",
            "submitted_at": "2026-01-01T12:00:00Z",
            "workflow_state": "graded",
            "user": {"name": "Ada Lovelace"},
        },
        {
            "id": submission_id_two,
            "assignment_id": assignment_id,
            "user_id": 2002,
            "score": None,
            "grade": None,
            "submitted_at": None,
            "workflow_state": "unsubmitted",
            "missing": True,
        },
    ]

    with patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock:
        mock.return_value = submissions
        submissions_resp = client.get(
            f"/api/v1/canvas/courses/{local_id}/assignments/{assignment_id}/submissions?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert submissions_resp.status_code == 200

    with (
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
    ):
        mock_enrollments.return_value = enrollments
        mock_assignments.return_value = assignments
        response = client.get(
            f"/api/v1/canvas/courses/{local_id}/overview?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["missing_submissions"] == 1
    assert payload["late_submissions"] == 0
    assert payload["average_grade"] == 90.0
    assert payload["completion_rate"] == 50.0
    assert len(payload["recent_activity"]) == 1
    assert payload["recent_activity"][0]["student_name"] == "Ada Lovelace"


def test_course_overview_average_grade_is_weighted_by_points_possible(client):
    headers = _register_with_canvas(client)
    local_id = _sync_local_course(client, headers)
    quiz_id = uuid.uuid4().int % 10_000_000
    exam_id = quiz_id + 1
    assignments = [
        {
            "id": quiz_id,
            "name": "Small Quiz",
            "description": None,
            "due_at": None,
            "points_possible": 10.0,
            "course_id": 1,
        },
        {
            "id": exam_id,
            "name": "Large Exam",
            "description": None,
            "due_at": None,
            "points_possible": 100.0,
            "course_id": 1,
        },
    ]
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = assignments
        client.get(
            f"/api/v1/canvas/courses/{local_id}/assignments?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    for assignment_id, score, grade in [(quiz_id, 10.0, "10"), (exam_id, 50.0, "50")]:
        with patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock:
            mock.return_value = [
                {
                    "id": uuid.uuid4().int % 10_000_000,
                    "assignment_id": assignment_id,
                    "user_id": 3001,
                    "score": score,
                    "grade": grade,
                    "submitted_at": "2026-01-01T12:00:00Z",
                    "workflow_state": "graded",
                    "user": {"name": "Ada Lovelace"},
                }
            ]
            client.get(
                f"/api/v1/canvas/courses/{local_id}/assignments/{assignment_id}/submissions?canvas_url={CANVAS_URL}",
                headers=headers,
            )

    with (
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
    ):
        mock_enrollments.return_value = [
            {"user_id": 3001, "enrollment_state": "active", "user": {"name": "Ada Lovelace"}},
        ]
        mock_assignments.return_value = assignments
        response = client.get(
            f"/api/v1/canvas/courses/{local_id}/overview?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert response.status_code == 200
    # 60 earned points out of 110 possible = 54.5%. A flat average of the two
    # percentages would incorrectly show 75.0%.
    assert response.json()["average_grade"] == 54.5
