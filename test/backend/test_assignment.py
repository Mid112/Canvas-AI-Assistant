import uuid
import pytest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException, status
from fastapi.testclient import TestClient
from app.main import app

CANVAS_URL = "https://canvas.example.edu"


def _mock_assignment(canvas_id: int | None = None) -> dict:
    cid = canvas_id if canvas_id is not None else uuid.uuid4().int % 1_000_000
    return {
        "id": cid,
        "name": "Midterm Exam",
        "description": "<p>Submit via Canvas.</p>",
        "due_at": "2025-10-15T23:59:00Z",
        "points_possible": 100.0,
        "course_id": 9999,
    }


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> tuple[dict, int]:
    """Register a fresh instructor, connect Canvas, seed one course. Returns (headers, local_course_id)."""
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
    return headers, local_course_id


# ---------------------------------------------------------------------------
# GET /canvas/courses/{course_id}/assignments
# ---------------------------------------------------------------------------

# Verifies: List assignments unauthenticated.
def test_list_assignments_unauthenticated(client):
    response = client.get("/api/v1/canvas/courses/1/assignments")
    assert response.status_code == 401


# Verifies: List assignments no canvas token.
def test_list_assignments_no_canvas_token(client):
    """A user with no Canvas token has no courses in DB — course lookup returns 404."""
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "No Token", "email": email, "password": "Secret123!"},
    )
    token = reg.json()["access_token"]
    response = client.get(
        "/api/v1/canvas/courses/1/assignments",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 404


# Verifies: List assignments course not found.
def test_list_assignments_course_not_found(client):
    """Local course ID not in instructor's DB returns 404 without calling Canvas."""
    headers, _ = _register_with_canvas(client)
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        response = client.get(
            "/api/v1/canvas/courses/999999/assignments",
            headers=headers,
        )
    assert response.status_code == 404
    mock.assert_not_called()


# Verifies: List assignments success.
def test_list_assignments_success(client):
    headers, local_course_id = _register_with_canvas(client)
    assignments = [_mock_assignment()]
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = assignments
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/assignments",
            headers=headers,
        )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Midterm Exam"
    assert data[0]["points_possible"] == 100.0


# Verifies: List assignments response shape.
def test_list_assignments_response_shape(client):
    """Response must include id (Canvas), local_id, name, description, due_at, points_possible."""
    headers, local_course_id = _register_with_canvas(client)
    assignments = [_mock_assignment()]
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = assignments
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/assignments",
            headers=headers,
        )
    item = response.json()[0]
    assert "id" in item
    assert "local_id" in item
    assert item["local_id"] is not None
    assert item["description"] == "<p>Submit via Canvas.</p>"
    assert item["due_at"] is not None


# Verifies: List assignments upsert is idempotent.
def test_list_assignments_upsert_is_idempotent(client):
    """Fetching the same assignments twice must not duplicate DB rows (same local_id)."""
    headers, local_course_id = _register_with_canvas(client)
    cid = uuid.uuid4().int % 1_000_000
    assignments = [_mock_assignment(canvas_id=cid)]
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = assignments
        r1 = client.get(f"/api/v1/canvas/courses/{local_course_id}/assignments", headers=headers)
        r2 = client.get(f"/api/v1/canvas/courses/{local_course_id}/assignments", headers=headers)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()[0]["local_id"] == r2.json()[0]["local_id"]


# Verifies: List assignments empty.
def test_list_assignments_empty(client):
    headers, local_course_id = _register_with_canvas(client)
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = []
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/assignments",
            headers=headers,
        )
    assert response.status_code == 200
    assert response.json() == []


# Verifies: List assignments cross instructor isolation.
def test_list_assignments_cross_instructor_isolation(client):
    """Instructor B cannot fetch assignments for a course owned by instructor A."""
    headers_a, local_course_id = _register_with_canvas(client)
    headers_b, _ = _register_with_canvas(client)

    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock):
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/assignments",
            headers=headers_b,
        )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Issue #544 — API failure handling
# ---------------------------------------------------------------------------

# Verifies: List assignments invalid canvas token.
def test_list_assignments_invalid_canvas_token(client):
    headers, local_course_id = _register_with_canvas(client)
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.side_effect = HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid Canvas API token",
        )
        response = client.get(f"/api/v1/canvas/courses/{local_course_id}/assignments", headers=headers)
    assert response.status_code == 422


# Verifies: List assignments canvas permission denied.
def test_list_assignments_canvas_permission_denied(client):
    headers, local_course_id = _register_with_canvas(client)
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.side_effect = HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Canvas token lacks permission for this resource",
        )
        response = client.get(f"/api/v1/canvas/courses/{local_course_id}/assignments", headers=headers)
    assert response.status_code == 403


# Verifies: List assignments canvas unavailable.
def test_list_assignments_canvas_unavailable(client):
    headers, local_course_id = _register_with_canvas(client)
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.side_effect = HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Canvas",
        )
        response = client.get(f"/api/v1/canvas/courses/{local_course_id}/assignments", headers=headers)
    assert response.status_code == 502


# Verifies: List assignments canvas timeout.
def test_list_assignments_canvas_timeout(client):
    headers, local_course_id = _register_with_canvas(client)
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.side_effect = HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Canvas API timed out",
        )
        response = client.get(f"/api/v1/canvas/courses/{local_course_id}/assignments", headers=headers)
    assert response.status_code == 504
