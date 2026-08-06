import asyncio
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.dashboard import _MAX_CONCURRENT_COURSE_REFRESHES


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def _register(client) -> dict:
    email = f"dash_{uuid.uuid4()}@example.com"
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Dashboard Instructor", "email": email, "password": "Secret123!"},
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


# Verifies: Instructor dashboard unauthenticated.

# Verifies: Instructor dashboard empty state.
def test_instructor_dashboard_empty_state(client):
    headers = _register(client)
    response = client.get("/api/v1/canvas/dashboard", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["course_count"] == 0
    assert payload["student_count"] == 0
    assert payload["assignment_count"] == 0
    assert payload["missing_submissions"] == 0
    assert payload["late_submissions"] == 0
    assert payload["pending_workflows"] == 0
    assert payload["active_course"] is None
    assert payload["courses"] == []
    assert payload["recent_workflows"] == []


# Verifies: Instructor dashboard with seeded course.
def test_instructor_dashboard_with_seeded_course(client):
    headers = _register(client)
    canvas_url = "https://canvas.example.edu"
    canvas_course_id = uuid.uuid4().int % 10_000_000
    course_payload = [
        {
            "id": canvas_course_id,
            "name": "COSC 499",
            "course_code": "COSC499",
            "workflow_state": "available",
            "total_students": 24,
        }
    ]

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": canvas_url},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = course_payload
        client.get(f"/api/v1/canvas/courses?canvas_url={canvas_url}", headers=headers)

    with (
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
    ):
        mock_assignments.return_value = []
        mock_enrollments.return_value = []
        response = client.get("/api/v1/canvas/dashboard", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["course_count"] == 1
    assert len(payload["courses"]) == 1
    assert payload["courses"][0]["name"] == "COSC 499"


# Verifies: One course's Canvas refresh failing does not fail the whole dashboard.
def test_instructor_dashboard_tolerates_one_course_refresh_failure(client):
    headers = _register(client)
    canvas_url = "https://canvas.example.edu"
    canvas_course_id = uuid.uuid4().int % 10_000_000
    course_payload = [
        {
            "id": canvas_course_id,
            "name": "COSC 499",
            "course_code": "COSC499",
            "workflow_state": "available",
            "total_students": 24,
        }
    ]

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": canvas_url},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = course_payload
        client.get(f"/api/v1/canvas/courses?canvas_url={canvas_url}", headers=headers)

    with (
        patch(
            "app.services.canvas.fetch_assignments",
            new_callable=AsyncMock,
            side_effect=RuntimeError("Canvas timed out"),
        ),
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
    ):
        mock_enrollments.return_value = []
        response = client.get("/api/v1/canvas/dashboard", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["course_count"] == 1
    assert len(payload["courses"]) == 1
    assert payload["courses"][0]["name"] == "COSC 499"


# Verifies: Dashboard never runs more than _MAX_CONCURRENT_COURSE_REFRESHES
# course refreshes at once, even when the instructor owns many more courses.
def test_instructor_dashboard_bounded_concurrency(client):
    headers = _register(client)
    canvas_url = "https://canvas.example.edu"
    course_count = _MAX_CONCURRENT_COURSE_REFRESHES + 3
    course_payload = [
        {
            "id": uuid.uuid4().int % 10_000_000,
            "name": f"Course {i}",
            "course_code": f"C{i}",
            "workflow_state": "available",
            "total_students": 1,
        }
        for i in range(course_count)
    ]

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": canvas_url},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = course_payload
        client.get(f"/api/v1/canvas/courses?canvas_url={canvas_url}", headers=headers)

    in_flight = 0
    max_in_flight = 0
    lock = asyncio.Lock()

    async def _tracked_fetch_assignments(*_args, **_kwargs):
        nonlocal in_flight, max_in_flight
        async with lock:
            in_flight += 1
            max_in_flight = max(max_in_flight, in_flight)
        await asyncio.sleep(0.05)
        async with lock:
            in_flight -= 1
        return []

    with (
        patch(
            "app.services.canvas.fetch_assignments",
            side_effect=_tracked_fetch_assignments,
        ),
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
    ):
        mock_enrollments.return_value = []
        response = client.get("/api/v1/canvas/dashboard", headers=headers)

    assert response.status_code == 200
    assert response.json()["course_count"] == course_count
    assert max_in_flight <= _MAX_CONCURRENT_COURSE_REFRESHES


# Verifies: An assignment Canvas no longer returns is no longer counted after refresh.
def test_dashboard_assignment_count_reflects_canvas_deletion(client):
    headers = _register(client)
    canvas_url = "https://canvas.example.edu"
    canvas_course_id = uuid.uuid4().int % 10_000_000
    course_payload = [
        {
            "id": canvas_course_id,
            "name": "COSC 499",
            "course_code": "COSC499",
            "workflow_state": "available",
            "total_students": 1,
        }
    ]

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": canvas_url},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = course_payload
        client.get(f"/api/v1/canvas/courses?canvas_url={canvas_url}", headers=headers)

    two_assignments = [
        {"id": 1, "name": "A1", "description": None, "due_at": None, "points_possible": 10.0},
        {"id": 2, "name": "A2", "description": None, "due_at": None, "points_possible": 10.0},
    ]
    with (
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
    ):
        mock_assignments.return_value = two_assignments
        mock_enrollments.return_value = []
        response = client.get("/api/v1/canvas/dashboard", headers=headers)
    assert response.json()["assignment_count"] == 2

    with (
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
    ):
        mock_assignments.return_value = [two_assignments[0]]
        mock_enrollments.return_value = []
        response = client.get("/api/v1/canvas/dashboard", headers=headers)
    assert response.json()["assignment_count"] == 1


# Verifies: A student Canvas no longer returns (unenrolled) is no longer counted after refresh.
def test_dashboard_student_count_reflects_canvas_unenrollment(client):
    headers = _register(client)
    canvas_url = "https://canvas.example.edu"
    canvas_course_id = uuid.uuid4().int % 10_000_000
    course_payload = [
        {
            "id": canvas_course_id,
            "name": "COSC 499",
            "course_code": "COSC499",
            "workflow_state": "available",
            "total_students": 2,
        }
    ]

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": canvas_url},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = course_payload
        client.get(f"/api/v1/canvas/courses?canvas_url={canvas_url}", headers=headers)

    two_students = [
        {"user_id": 1, "enrollment_state": "active", "user": {"name": "Ada"}},
        {"user_id": 2, "enrollment_state": "active", "user": {"name": "Grace"}},
    ]
    with (
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
    ):
        mock_assignments.return_value = []
        mock_enrollments.return_value = two_students
        response = client.get("/api/v1/canvas/dashboard", headers=headers)
    assert response.json()["student_count"] == 2

    with (
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
    ):
        mock_assignments.return_value = []
        mock_enrollments.return_value = [two_students[0]]
        response = client.get("/api/v1/canvas/dashboard", headers=headers)
    assert response.json()["student_count"] == 1


# Verifies: Dashboard's missing/late totals and per-course summary reflect real
# submission data, not just the empty defaults.
def test_dashboard_missing_and_late_counts_from_real_submissions(client):
    headers = _register(client)
    canvas_url = "https://canvas.example.edu"
    canvas_course_id = uuid.uuid4().int % 10_000_000
    assignment_id = uuid.uuid4().int % 10_000_000
    course_payload = [
        {
            "id": canvas_course_id,
            "name": "COSC 499",
            "course_code": "COSC499",
            "workflow_state": "available",
            "total_students": 2,
        }
    ]

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": canvas_url},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = course_payload
        fetch_resp = client.get(f"/api/v1/canvas/courses?canvas_url={canvas_url}", headers=headers)
    local_id = fetch_resp.json()[0]["local_id"]

    assignment_payload = [
        {
            "id": assignment_id,
            "name": "A1",
            "description": None,
            "due_at": None,
            "points_possible": 10.0,
            "course_id": canvas_course_id,
        }
    ]
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments:
        mock_assignments.return_value = assignment_payload
        client.get(
            f"/api/v1/canvas/courses/{local_id}/assignments?canvas_url={canvas_url}",
            headers=headers,
        )

    submission_id_one = uuid.uuid4().int % 10_000_000
    submission_id_two = submission_id_one + 1
    submissions_payload = [
        {
            "id": submission_id_one,
            "assignment_id": assignment_id,
            "user_id": 1,
            "score": None,
            "grade": None,
            "submitted_at": None,
            "workflow_state": "unsubmitted",
            "missing": True,
        },
        {
            "id": submission_id_two,
            "assignment_id": assignment_id,
            "user_id": 2,
            "score": 70.0,
            "grade": "C",
            "submitted_at": "2026-01-05T00:00:00Z",
            "workflow_state": "submitted",
            "late": True,
        },
    ]
    with patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock_submissions:
        mock_submissions.return_value = submissions_payload
        client.get(
            f"/api/v1/canvas/courses/{local_id}/assignments/{assignment_id}/submissions?canvas_url={canvas_url}",
            headers=headers,
        )

    with (
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
    ):
        mock_assignments.return_value = assignment_payload
        mock_enrollments.return_value = []
        response = client.get("/api/v1/canvas/dashboard", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["missing_submissions"] == 1
    assert payload["late_submissions"] == 1
    assert payload["courses"][0]["missing_submissions"] == 1
    assert payload["courses"][0]["late_submissions"] == 1


# Verifies: A course Canvas no longer returns (reconciled to workflow_state
# "deleted") drops out of course_count, the course summaries, and totals —
# rather than lingering in dashboard aggregates indefinitely.
def test_dashboard_excludes_deleted_course_from_aggregates(client):
    headers = _register(client)
    canvas_url = "https://canvas.example.edu"
    canvas_course_id = uuid.uuid4().int % 10_000_000
    course_payload = [
        {
            "id": canvas_course_id,
            "name": "COSC 499",
            "course_code": "COSC499",
            "workflow_state": "available",
            "total_students": 1,
        }
    ]

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": canvas_url},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = course_payload
        client.get(f"/api/v1/canvas/courses?canvas_url={canvas_url}", headers=headers)

    with (
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
    ):
        mock_assignments.return_value = []
        mock_enrollments.return_value = []
        response = client.get("/api/v1/canvas/dashboard", headers=headers)
    assert response.json()["course_count"] == 1

    # Canvas stops returning the course entirely — get_courses() reconciles it
    # to workflow_state="deleted".
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = []
        client.get(f"/api/v1/canvas/courses?canvas_url={canvas_url}", headers=headers)

    response = client.get("/api/v1/canvas/dashboard", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["course_count"] == 0
    assert payload["courses"] == []
