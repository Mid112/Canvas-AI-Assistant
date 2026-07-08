import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def _register(client) -> dict:
    email = f"dash_{uuid.uuid4()}@example.com"
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Dashboard Instructor", "email": email, "password": "secret123"},
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


# Verifies: Instructor dashboard unauthenticated.
def test_instructor_dashboard_unauthenticated(client):
    response = client.get("/api/v1/canvas/dashboard")
    assert response.status_code == 401


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
    canvas_url = "https://canvas.ubc.ca"
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

    response = client.get("/api/v1/canvas/dashboard", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["course_count"] == 1
    assert len(payload["courses"]) == 1
    assert payload["courses"][0]["name"] == "COSC 499"
