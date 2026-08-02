import uuid
import pytest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException, status
from fastapi.testclient import TestClient
from app.main import app

CANVAS_URL = "https://canvas.example.edu"


def _mock_enrollment(user_id: int | None = None) -> dict:
    uid = user_id if user_id is not None else uuid.uuid4().int % 1_000_000
    return {
        "id": uid + 10_000_000,
        "course_id": 1,
        "user_id": uid,
        "type": "StudentEnrollment",
        "enrollment_state": "active",
        "user": {
            "id": uid,
            "name": "Alice Smith",
            "sortable_name": "Smith, Alice",
            "login_id": "alice@example.com",
        },
    }


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> tuple[dict, int]:
    """Register a fresh user, connect Canvas, seed one course. Returns (headers, local_course_id)."""
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Instructor", "email": email, "password": "secret123"},
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
    course_payload = [
        {
            "id": canvas_course_id,
            "name": "CPSC 310",
            "course_code": "CPSC310",
            "enrollment_term_id": 1,
            "workflow_state": "available",
        }
    ]
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = course_payload
        resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)

    local_course_id = resp.json()[0]["local_id"]
    return headers, local_course_id


# ---------------------------------------------------------------------------
# GET /canvas/courses/{course_id}/students
# ---------------------------------------------------------------------------

# Verifies: List students unauthenticated.
def test_list_students_unauthenticated(client):
    response = client.get("/api/v1/canvas/courses/1/students")
    assert response.status_code == 401


# Verifies: List students no canvas token.
def test_list_students_no_canvas_token(client, create_local_course_for_user_email):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "No Token", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    local_course_id = create_local_course_for_user_email(email, canvas_url=CANVAS_URL)
    response = client.get(
        f"/api/v1/canvas/courses/{local_course_id}/students?canvas_url={CANVAS_URL}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


# Verifies: List students course not found.
def test_list_students_course_not_found(client):
    """Course not in instructor's DB returns 404 without ever calling Canvas."""
    headers, _ = _register_with_canvas(client)
    with patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock:
        response = client.get(
            f"/api/v1/canvas/courses/999999/students?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert response.status_code == 404
    mock.assert_not_called()


# Verifies: List students success.
def test_list_students_success(client):
    headers, local_course_id = _register_with_canvas(client)
    enrollments = [_mock_enrollment()]
    with patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock:
        mock.return_value = enrollments
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/students?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Alice Smith"
    assert data[0]["enrollment_state"] == "active"


# Verifies: List students response shape.
def test_list_students_response_shape(client):
    """Response must include id, canvas_user_id, course_id, name, sortable_name, login_id."""
    headers, local_course_id = _register_with_canvas(client)
    enrollments = [_mock_enrollment()]
    with patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock:
        mock.return_value = enrollments
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/students?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    student = response.json()[0]
    assert "id" in student
    assert "canvas_user_id" in student
    assert "course_id" in student
    assert student["sortable_name"] == "Smith, Alice"
    assert student["login_id"] == "alice@example.com"


# Verifies: List students upsert is idempotent.
def test_list_students_upsert_is_idempotent(client):
    """Fetching the same roster twice must not duplicate DB rows (same id returned)."""
    headers, local_course_id = _register_with_canvas(client)
    uid = uuid.uuid4().int % 1_000_000
    enrollments = [_mock_enrollment(user_id=uid)]
    with patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock:
        mock.return_value = enrollments
        r1 = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/students?canvas_url={CANVAS_URL}",
            headers=headers,
        )
        r2 = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/students?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()[0]["id"] == r2.json()[0]["id"]


# Verifies: List students empty roster.
def test_list_students_empty_roster(client):
    headers, local_course_id = _register_with_canvas(client)
    with patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock:
        mock.return_value = []
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/students?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert response.status_code == 200
    assert response.json() == []


# Verifies: List students cross instructor isolation.
def test_list_students_cross_instructor_isolation(client):
    """Instructor B cannot fetch students for a course owned by instructor A — returns 404."""
    headers_a, local_course_id = _register_with_canvas(client)
    headers_b, _ = _register_with_canvas(client)

    with patch("app.services.student.fetch_enrollments", new_callable=AsyncMock):
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/students?canvas_url={CANVAS_URL}",
            headers=headers_b,
        )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Issue #542 — API failure handling
# ---------------------------------------------------------------------------

# Verifies: List students invalid canvas token.
def test_list_students_invalid_canvas_token(client):
    headers, local_course_id = _register_with_canvas(client)
    with patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock:
        mock.side_effect = HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid Canvas API token",
        )
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/students?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert response.status_code == 422


# Verifies: List students canvas permission denied.
def test_list_students_canvas_permission_denied(client):
    headers, local_course_id = _register_with_canvas(client)
    with patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock:
        mock.side_effect = HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Canvas token lacks permission for this resource",
        )
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/students?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert response.status_code == 403


# Verifies: List students canvas unavailable.
def test_list_students_canvas_unavailable(client):
    headers, local_course_id = _register_with_canvas(client)
    with patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock:
        mock.side_effect = HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Canvas",
        )
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/students?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert response.status_code == 502


# Verifies: List students canvas timeout.
def test_list_students_canvas_timeout(client):
    headers, local_course_id = _register_with_canvas(client)
    with patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock:
        mock.side_effect = HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Canvas API timed out",
        )
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/students?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert response.status_code == 504


# ---------------------------------------------------------------------------
# Issue #541 — student data formatting (include[]=user)
# ---------------------------------------------------------------------------

# Verifies: Fetch enrollments includes user.
@pytest.mark.asyncio
async def test_fetch_enrollments_includes_user():
    """Canvas enrollment fetch must request nested user objects for name/login_id."""
    with patch("app.integrations.canvas._fetch_all_pages", new_callable=AsyncMock) as mock_pages:
        mock_pages.return_value = []
        from app.integrations.canvas import fetch_enrollments

        await fetch_enrollments(123, "test-token", "https://canvas.test")

    params = mock_pages.call_args.kwargs["params"]
    assert params["include[]"] == "user"
