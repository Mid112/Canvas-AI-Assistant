import uuid
import pytest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException, status
from fastapi.testclient import TestClient
from app.main import app

MOCK_COURSES = [
    {"id": 1, "name": "CPSC 310", "course_code": "CPSC310",
        "enrollment_term_id": 1, "workflow_state": "available"}
]
MOCK_ASSIGNMENTS = [
    {"id": 10, "name": "Assignment 1", "description": None,
        "due_at": None, "points_possible": 100.0, "course_id": 1}
]
MOCK_SUBMISSIONS = [
    {"id": 100, "assignment_id": 10, "user_id": 5, "score": 85.0,
        "grade": "B", "submitted_at": None, "workflow_state": "submitted"}
]


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth_headers(client):
    email = f"test_{uuid.uuid4()}@example.com"
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "secret123"}
    )
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-canvas-token", "canvas_url": "https://canvas.ubc.ca/api/v1"},
            headers=headers,
        )
    return headers


def test_list_courses_unauthenticated(client):
    response = client.get("/api/v1/canvas/courses")
    assert response.status_code == 401


def test_list_courses(client, auth_headers):
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = MOCK_COURSES
        response = client.get("/api/v1/canvas/courses", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()[0]["name"] == "CPSC 310"


def test_list_assignments(client, auth_headers):
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = MOCK_ASSIGNMENTS
        response = client.get(
            "/api/v1/canvas/courses/1/assignments", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()[0]["name"] == "Assignment 1"


def test_list_submissions(client, auth_headers):
    with patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock:
        mock.return_value = MOCK_SUBMISSIONS
        response = client.get(
            "/api/v1/canvas/courses/1/assignments/10/submissions", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()[0]["workflow_state"] == "submitted"


def test_list_courses_invalid_canvas_token(client, auth_headers):
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.side_effect = HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid Canvas API token")
        response = client.get("/api/v1/canvas/courses", headers=auth_headers)
    assert response.status_code == 422


def test_list_courses_selects_correct_school(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "secret123", "name": "Multi User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch("/api/v1/auth/me/canvas-token", json={"canvas_token": "ubc-token", "canvas_url": "https://canvas.ubc.ca/api/v1"}, headers=headers)
        client.patch("/api/v1/auth/me/canvas-token", json={"canvas_token": "sfu-token", "canvas_url": "https://canvas.sfu.ca/api/v1"}, headers=headers)

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = MOCK_COURSES
        response = client.get("/api/v1/canvas/courses?canvas_url=https://canvas.ubc.ca/api/v1", headers=headers)
    assert response.status_code == 200

    response = client.get("/api/v1/canvas/courses?canvas_url=https://canvas.other.ca/api/v1", headers=headers)
    assert response.status_code == 403


def test_list_courses_no_canvas_token(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "secret123", "name": "No Token User"})
    token = reg.json()["access_token"]
    response = client.get("/api/v1/canvas/courses", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
