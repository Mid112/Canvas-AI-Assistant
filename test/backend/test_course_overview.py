import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

CANVAS_URL = "https://canvas.ubc.ca"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def _register_with_canvas(client) -> dict:
    email = f"overview_{uuid.uuid4()}@example.com"
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Overview Instructor", "email": email, "password": "secret123"},
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


def test_course_overview_unauthenticated(client):
    response = client.get("/api/v1/canvas/courses/1/overview")
    assert response.status_code == 401


def test_course_overview_unknown_course(client):
    headers = _register_with_canvas(client)
    response = client.get(
        f"/api/v1/canvas/courses/999999/overview?canvas_url={CANVAS_URL}",
        headers=headers,
    )
    assert response.status_code == 404


def test_course_overview_empty_state(client):
    headers = _register_with_canvas(client)
    local_id = _sync_local_course(client, headers)

    with patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock:
        mock.return_value = []
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

    with patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock:
        mock.return_value = enrollments
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
