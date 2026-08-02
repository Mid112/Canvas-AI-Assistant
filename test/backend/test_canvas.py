import uuid
import asyncio
import pytest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException, status
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.config import settings
from app.main import app
from app.models.course import Course
from app.models.user import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Explicit Canvas URL used by all tests — avoids depending on whatever CANVAS_API_URL
# is set to in .env (which may point to the mock Docker server for manual testing)
CANVAS_URL = "https://canvas.example.edu"
OTHER_CANVAS_URL = "https://canvas.other.edu"


def _unique_course(canvas_id: int | None = None) -> dict:
    """Return a minimal Canvas-shaped course dict with a unique id."""
    cid = canvas_id if canvas_id is not None else uuid.uuid4().int % 10_000_000
    return {
        "id": cid,
        "name": "CPSC 310",
        "course_code": "CPSC310",
        "enrollment_term_id": 1,
        "workflow_state": "available",
    }


MOCK_ASSIGNMENTS = [
    {
        "id": 10,
        "name": "Assignment 1",
        "description": None,
        "due_at": None,
        "points_possible": 100.0,
        "course_id": 1,
    }
]
MOCK_ASSIGNMENT = MOCK_ASSIGNMENTS[0]
MOCK_SUBMISSIONS = [
    {
        "id": 100,
        "assignment_id": 10,
        "user_id": 5,
        "score": 85.0,
        "grade": "B",
        "submitted_at": None,
        "workflow_state": "submitted",
    }
]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth_headers(client):
    """A single registered user with a Canvas token connected."""
    email = f"test_{uuid.uuid4()}@example.com"
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "secret123"},
    )
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-canvas-token", "canvas_url": CANVAS_URL},
            headers=headers,
        )
    return headers


@pytest.fixture(scope="module")
def synced_course_id(client, auth_headers):
    """One Canvas course synced into the DB for the auth_headers user.
    Module-scoped so all submission tests share the same local course row."""
    return _sync_local_course(client, auth_headers)


def _register_with_canvas(client) -> dict:
    """Register a fresh user + connect a Canvas token. Returns auth headers."""
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": CANVAS_URL},
            headers=headers,
        )
    return headers


def _sync_local_course(
    client, headers, canvas_id: int = 12345, canvas_url: str = CANVAS_URL
) -> int:
    courses = [_unique_course(canvas_id)]
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        response = client.get(
            f"/api/v1/canvas/courses?canvas_url={canvas_url}",
            headers=headers,
        )

    assert response.status_code == 200
    return response.json()[0]["local_id"]


def _create_local_course_for_user_email(email: str, canvas_id: int | None = None) -> int:
    async def _insert() -> int:
        engine = create_async_engine(settings.DATABASE_URL)
        try:
            Session = async_sessionmaker(engine, expire_on_commit=False)
            async with Session() as db:
                user = await db.scalar(select(User).where(User.email == email))
                assert user is not None
                course = Course(
                    canvas_course_id=str(canvas_id or uuid.uuid4().int % 10_000_000),
                    canvas_url=CANVAS_URL,
                    name="No Token Course",
                    course_code="NTC101",
                    workflow_state="available",
                    instructor_id=user.id,
                )
                db.add(course)
                await db.commit()
                await db.refresh(course)
                return course.id
        finally:
            await engine.dispose()

    return asyncio.run(_insert())


# Verifies: institution-level course sync uses the sole saved connection URL
# when the request omits canvas_url.
def test_list_courses_without_canvas_url_uses_sole_connection(client):
    headers = _register_with_canvas(client)
    courses = [_unique_course()]
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        response = client.get("/api/v1/canvas/courses", headers=headers)

    assert response.status_code == 200, response.json()
    mock.assert_awaited_once()
    assert mock.await_args.args[1] == CANVAS_URL


# Verifies: institution-level course sync refuses to guess when multiple
# saved Canvas connections exist and the request omits canvas_url.
def test_list_courses_without_canvas_url_rejects_multiple_connections(client):
    headers = _register_with_canvas(client)
    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "other-token", "canvas_url": OTHER_CANVAS_URL},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        response = client.get("/api/v1/canvas/courses", headers=headers)

    assert response.status_code == 422
    assert "Select a Canvas institution" in response.json()["detail"]
    mock.assert_not_called()


# ---------------------------------------------------------------------------
# GET /canvas/courses
# ---------------------------------------------------------------------------


# Verifies: List courses unauthenticated.
def test_list_courses_unauthenticated(client):
    response = client.get("/api/v1/canvas/courses")
    assert response.status_code == 401


# Verifies: List courses.
def test_list_courses(client, auth_headers):
    courses = [_unique_course()]
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        response = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=auth_headers
        )
    assert response.status_code == 200
    assert response.json()[0]["name"] == "CPSC 310"


# Verifies: List courses response shape.
def test_list_courses_response_shape(client, auth_headers):
    """Response must use canvas_id (not id) and include local_id after DB upsert."""
    courses = [_unique_course()]
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        response = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=auth_headers
        )
    data = response.json()[0]
    assert "canvas_id" in data
    assert "local_id" in data
    assert data["local_id"] is not None
    assert "id" not in data  # old field name must not leak through


# Verifies: List courses upsert is idempotent.
def test_list_courses_upsert_is_idempotent(client, auth_headers):
    """Fetching the same Canvas course twice must not create duplicate DB rows."""
    courses = [_unique_course()]
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        r1 = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=auth_headers
        )
        r2 = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=auth_headers
        )
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()[0]["local_id"] == r2.json()[0]["local_id"]


# Verifies: Ticket 34 — same canvas_course_id under two canvas_urls for one
# instructor must create two local course rows (unique constraint includes
# canvas_url), without overwriting the other institution's row.
def test_sync_same_canvas_course_id_across_institutions(client):
    headers = _register_with_canvas(client)
    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "other-token", "canvas_url": OTHER_CANVAS_URL},
            headers=headers,
        )

    colliding_id = 34_001
    local_a = _sync_local_course(
        client, headers, canvas_id=colliding_id, canvas_url=CANVAS_URL
    )
    local_b = _sync_local_course(
        client, headers, canvas_id=colliding_id, canvas_url=OTHER_CANVAS_URL
    )

    assert local_a != local_b

    # Re-sync institution A: still the same row, and B remains distinct.
    local_a_again = _sync_local_course(
        client, headers, canvas_id=colliding_id, canvas_url=CANVAS_URL
    )
    assert local_a_again == local_a
    assert local_a_again != local_b


# Verifies: List courses term name populated.
def test_list_courses_term_name_populated(client, auth_headers):
    """term_name is extracted from the nested Canvas term object."""
    courses = [_unique_course() | {"term": {"id": 5, "name": "Summer 2025"}}]
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        response = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=auth_headers
        )
    assert response.json()[0]["term_name"] == "Summer 2025"


# Verifies: List courses empty canvas returns empty list.
def test_list_courses_empty_canvas_returns_empty_list(client, auth_headers):
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = []
        response = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=auth_headers
        )
    assert response.status_code == 200
    assert response.json() == []


# ---------------------------------------------------------------------------
# POST /canvas/courses
# ---------------------------------------------------------------------------


# Verifies: Create course via Canvas and return upserted local course (#1285).
def test_create_course(client, auth_headers):
    created = {
        "id": 777,
        "name": "New Capstone",
        "course_code": "CAPSTONE",
        "workflow_state": "available",
        "total_students": 0,
    }
    with (
        patch(
            "app.services.canvas.fetch_accounts",
            new_callable=AsyncMock,
            return_value=[{"id": 1, "parent_account_id": None}],
        ),
        patch(
            "app.services.canvas.create_course",
            new_callable=AsyncMock,
            return_value=created,
        ) as mock_create,
    ):
        response = client.post(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}",
            json={"name": "New Capstone", "course_code": "CAPSTONE", "publish": True},
            headers=auth_headers,
        )

    assert response.status_code == 201
    body = response.json()
    assert body["canvas_id"] == 777
    assert body["local_id"] is not None
    assert body["name"] == "New Capstone"
    mock_create.assert_awaited_once()
    assert mock_create.await_args.kwargs["offer"] is True


# Verifies: Ticket 34 — creating a course on a second institution with the
# same Canvas course id as an existing local row must insert, not fail unique.
def test_create_course_same_canvas_id_across_institutions(client):
    headers = _register_with_canvas(client)
    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "other-token", "canvas_url": OTHER_CANVAS_URL},
            headers=headers,
        )

    colliding_id = 34_002
    local_a = _sync_local_course(
        client, headers, canvas_id=colliding_id, canvas_url=CANVAS_URL
    )
    created = {
        "id": colliding_id,
        "name": "Other Host Course",
        "course_code": "OHC",
        "workflow_state": "unpublished",
        "total_students": 0,
    }
    with (
        patch(
            "app.services.canvas.fetch_accounts",
            new_callable=AsyncMock,
            return_value=[{"id": 1, "parent_account_id": None}],
        ),
        patch(
            "app.services.canvas.create_course",
            new_callable=AsyncMock,
            return_value=created,
        ),
    ):
        response = client.post(
            f"/api/v1/canvas/courses?canvas_url={OTHER_CANVAS_URL}",
            json={"name": "Other Host Course", "course_code": "OHC"},
            headers=headers,
        )

    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["canvas_id"] == colliding_id
    assert body["local_id"] is not None
    assert body["local_id"] != local_a
    assert body["name"] == "Other Host Course"


# Verifies: Create course rejects empty name.
def test_create_course_requires_name(client, auth_headers):
    response = client.post(
        f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}",
        json={"name": ""},
        headers=auth_headers,
    )
    assert response.status_code == 422


# Verifies: Publish course via Canvas event=offer.
def test_publish_course(client, auth_headers):
    from types import SimpleNamespace

    local_id = _sync_local_course(client, auth_headers, canvas_id=888)
    with (
        patch(
            "app.services.canvas.get_owned_course",
            new_callable=AsyncMock,
            return_value=SimpleNamespace(
                id=local_id,
                canvas_course_id="888",
                canvas_url=CANVAS_URL,
                name="CPSC 310",
                course_code="CPSC310",
                workflow_state="unpublished",
                term=None,
                total_students=0,
                synced_at=None,
            ),
        ),
        patch(
            "app.services.canvas.update_course",
            new_callable=AsyncMock,
            return_value={
                "id": 888,
                "name": "CPSC 310",
                "course_code": "CPSC310",
                "workflow_state": "available",
                "total_students": 0,
            },
        ) as mock_update,
    ):
        response = client.patch(
            f"/api/v1/canvas/courses/{local_id}/publish?canvas_url={CANVAS_URL}",
            json={"published": True},
            headers=auth_headers,
        )

    assert response.status_code == 200
    assert response.json()["workflow_state"] == "available"
    mock_update.assert_awaited_once()
    assert mock_update.await_args.args[1] == {"event": "offer"}


# Verifies: List courses invalid canvas token.
def test_list_courses_invalid_canvas_token(client, auth_headers):
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.side_effect = HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid Canvas API token",
        )
        response = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=auth_headers
        )
    assert response.status_code == 422


# Verifies: List courses canvas permission denied.
def test_list_courses_canvas_permission_denied(client, auth_headers):
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.side_effect = HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Canvas token lacks permission for this resource",
        )
        response = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=auth_headers
        )
    assert response.status_code == 403


# Verifies: List courses canvas unavailable.
def test_list_courses_canvas_unavailable(client, auth_headers):
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.side_effect = HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Canvas",
        )
        response = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=auth_headers
        )
    assert response.status_code == 502


# Verifies: List courses no canvas token.
def test_list_courses_no_canvas_token(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "No Token User", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    response = client.get(
        f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


# Verifies: List courses selects correct school.
def test_list_courses_selects_correct_school(client):
    headers = _register_with_canvas(client)
    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "sfu-token", "canvas_url": "https://canvas.sfu.ca"},
            headers=headers,
        )

    courses = [_unique_course()]
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        # CANVAS_URL token is stored — this should succeed
        response = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert response.status_code == 200

    # A Canvas URL with no stored token must be rejected
    response = client.get(
        "/api/v1/canvas/courses?canvas_url=https://canvas.other.ca",
        headers=headers,
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# GET /canvas/courses/cached
# ---------------------------------------------------------------------------


# Verifies: List cached courses unauthenticated.
def test_list_cached_courses_unauthenticated(client):
    response = client.get("/api/v1/canvas/courses/cached")
    assert response.status_code == 401


# Verifies: List cached courses before any sync returns empty list.
def test_list_cached_courses_empty_before_any_sync(client):
    headers = _register_with_canvas(client)
    response = client.get(
        f"/api/v1/canvas/courses/cached?canvas_url={CANVAS_URL}", headers=headers
    )
    assert response.status_code == 200
    assert response.json() == []


# Verifies: List cached courses returns a previously-synced course without calling Canvas.
def test_list_cached_courses_returns_previously_synced_course(client):
    headers = _register_with_canvas(client)
    courses = [_unique_course()]
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.side_effect = AssertionError("get_cached_courses must not call Canvas")
        response = client.get(
            f"/api/v1/canvas/courses/cached?canvas_url={CANVAS_URL}", headers=headers
        )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "CPSC 310"
    assert data[0]["course_code"] == "CPSC310"
    assert data[0]["local_id"] is not None


# Verifies: List cached courses excludes a course Canvas no longer returns (reconciled to deleted).
def test_list_cached_courses_excludes_deleted_course(client):
    headers = _register_with_canvas(client)
    canvas_id = _unique_course()["id"]
    courses = [_unique_course(canvas_id)]
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)

    # Next live sync no longer returns this course — get_courses() reconciles it to "deleted".
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = []
        client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)

    response = client.get(
        f"/api/v1/canvas/courses/cached?canvas_url={CANVAS_URL}", headers=headers
    )
    assert response.status_code == 200
    assert response.json() == []


# ---------------------------------------------------------------------------
# GET /canvas/courses/{id}/assignments
# ---------------------------------------------------------------------------

# Verifies: List assignments.
def test_list_assignments(client):
    """Assignments endpoint uses local course ID — seed a course first to get one."""
    headers = _register_with_canvas(client)
    courses = [_unique_course()]
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        fetch_resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
    local_id = fetch_resp.json()[0]["local_id"]
    canvas_course_id = courses[0]["id"]

    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = MOCK_ASSIGNMENTS
        response = client.get(f"/api/v1/canvas/courses/{local_id}/assignments", headers=headers)
    assert response.status_code == 200
    assert response.json()[0]["name"] == "Assignment 1"
    # token is "test-token" (set in _register_with_canvas); canvas_course_id is dynamic
    mock.assert_awaited_once_with(canvas_course_id, "test-token", CANVAS_URL)


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
        json={"name": "No Token", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    response = client.get(
        "/api/v1/canvas/courses/1/assignments",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 404


# Verifies: List assignments unknown local course.
def test_list_assignments_unknown_local_course(client, auth_headers):
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        response = client.get(
            f"/api/v1/canvas/courses/999999/assignments?canvas_url={CANVAS_URL}",
            headers=auth_headers,
        )

    assert response.status_code == 404
    mock.assert_not_called()


# Verifies: List assignments local url alias.
def test_list_assignments_local_url_alias(client, monkeypatch):
    """Assignments work when the stored course URL differs from the request URL (docker vs browser)."""
    monkeypatch.setattr("app.config.settings.DEBUG", True)
    local_canvas = "http://localhost:3000"
    docker_canvas = "http://canvas_lms:3000"

    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Local Canvas User", "email": email, "password": "secret123"},
    )
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": local_canvas},
            headers=headers,
        )

    courses = [_unique_course()]
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        fetch_resp = client.get(
            f"/api/v1/canvas/courses?canvas_url={docker_canvas}",
            headers=headers,
        )
    assert fetch_resp.status_code == 200
    local_id = fetch_resp.json()[0]["local_id"]
    canvas_course_id = courses[0]["id"]

    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = MOCK_ASSIGNMENTS
        response = client.get(
            f"/api/v1/canvas/courses/{local_id}/assignments?canvas_url={local_canvas}",
            headers=headers,
        )

    assert response.status_code == 200
    assert response.json()[0]["name"] == "Assignment 1"
    mock.assert_awaited_once_with(canvas_course_id, "test-token", local_canvas)


# Verifies: Get assignment.
def test_get_assignment(client, auth_headers):
    local_course_id = _sync_local_course(client, auth_headers)
    with patch("app.services.canvas.fetch_assignment", new_callable=AsyncMock) as mock:
        mock.return_value = MOCK_ASSIGNMENT
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/assignments/10?canvas_url={CANVAS_URL}",
            headers=auth_headers,
        )

    assert response.status_code == 200
    assert response.json()["name"] == "Assignment 1"
    mock.assert_awaited_once_with(12345, 10, "test-canvas-token", CANVAS_URL)


# Verifies: Create assignment.
def test_create_assignment(client, auth_headers):
    local_course_id = _sync_local_course(client, auth_headers)
    payload = {
        "name": "New Assignment",
        "description": "Read chapter 1",
        "due_at": "2026-12-15T23:59:00Z",
    }
    created = MOCK_ASSIGNMENT | {"id": 11, "name": "New Assignment"}

    with patch("app.services.canvas.create_assignment", new_callable=AsyncMock) as mock:
        mock.return_value = created
        response = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/assignments?canvas_url={CANVAS_URL}",
            json=payload,
            headers=auth_headers,
        )

    assert response.status_code == 200
    assert response.json()["id"] == 11
    mock.assert_awaited_once()
    # payload passes through AssignmentCreate, which fills in points_possible=None
    # for any field the client didn't send
    assert mock.await_args.args[:2] == (12345, payload | {"points_possible": None})


# Verifies: Update assignment.
def test_update_assignment(client, auth_headers):
    local_course_id = _sync_local_course(client, auth_headers)
    payload = {
        "name": "Updated Assignment",
        "description": None,
        "due_at": None,
    }
    updated = MOCK_ASSIGNMENT | {"name": "Updated Assignment"}

    with patch("app.services.canvas.update_assignment", new_callable=AsyncMock) as mock:
        mock.return_value = updated
        response = client.patch(
            f"/api/v1/canvas/courses/{local_course_id}/assignments/10?canvas_url={CANVAS_URL}",
            json=payload,
            headers=auth_headers,
        )

    assert response.status_code == 200
    assert response.json()["name"] == "Updated Assignment"
    # payload passes through AssignmentUpdate, which fills in points_possible=None
    # for any field the client didn't send
    mock.assert_awaited_once_with(
        12345, 10, payload | {"points_possible": None}, "test-canvas-token", CANVAS_URL
    )


# ---------------------------------------------------------------------------
# GET /canvas/courses/{id}/assignments/{id}/submissions
# ---------------------------------------------------------------------------


# Verifies: List submissions.
def test_list_submissions(client, auth_headers):
    local_course_id = _sync_local_course(client, auth_headers)
    with patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock:
        mock.return_value = MOCK_SUBMISSIONS
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/assignments/10/submissions?canvas_url={CANVAS_URL}",
            headers=auth_headers,
        )
    assert response.status_code == 200
    data = response.json()[0]
    assert data["workflow_state"] == "submitted"
    assert data["status"] == "submitted"


# Verifies: List submissions student name.
def test_list_submissions_student_name(client, auth_headers, synced_course_id):
    raw = {
        "id": 101, "assignment_id": 10, "user_id": 6,
        "score": None, "grade": None, "graded_at": None,
        "submitted_at": None, "workflow_state": "submitted",
        "missing": False, "late": False, "excused": False,
        "user": {
            "name": "Alice Example",
            "email": "alice@example.edu",
            "login_id": "alice@example.edu",
        },
    }
    with patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock:
        mock.return_value = [raw]
        response = client.get(
            f"/api/v1/canvas/courses/{synced_course_id}/assignments/10/submissions?canvas_url={CANVAS_URL}",
            headers=auth_headers,
        )
    assert response.status_code == 200
    assert response.json()[0]["student_name"] == "Alice Example"
    assert response.json()[0]["student_email"] == "alice@example.edu"
    assert response.json()[0]["student_login_id"] == "alice@example.edu"


# Verifies: List submissions enriches email from user profile.
def test_list_submissions_enriches_email_from_user_profile(client, auth_headers, synced_course_id):
    raw = {
        "id": 103, "assignment_id": 10, "user_id": 8,
        "score": None, "grade": None, "graded_at": None,
        "submitted_at": None, "workflow_state": "submitted",
        "missing": False, "late": False, "excused": False,
        "user": {"name": "Mina Name"},
    }
    with (
        patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock_submissions,
        patch("app.services.canvas.fetch_user_profile", new_callable=AsyncMock) as mock_profile,
    ):
        mock_submissions.return_value = [raw]
        mock_profile.return_value = {
            "primary_email": "mina@example.edu",
            "login_id": "mina_login@example.edu",
        }
        response = client.get(
            f"/api/v1/canvas/courses/{synced_course_id}/assignments/10/submissions?canvas_url={CANVAS_URL}",
            headers=auth_headers,
        )

    assert response.status_code == 200
    assert response.json()[0]["student_email"] == "mina@example.edu"
    assert response.json()[0]["student_login_id"] == "mina_login@example.edu"


# Verifies: List submissions student name absent when no user.
def test_list_submissions_student_name_absent_when_no_user(client, auth_headers, synced_course_id):
    raw = {
        "id": 102, "assignment_id": 10, "user_id": 7,
        "score": None, "grade": None, "graded_at": None,
        "submitted_at": None, "workflow_state": "unsubmitted",
        "missing": False, "late": False, "excused": False,
    }
    with patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock:
        mock.return_value = [raw]
        response = client.get(
            f"/api/v1/canvas/courses/{synced_course_id}/assignments/10/submissions?canvas_url={CANVAS_URL}",
            headers=auth_headers,
        )
    assert response.status_code == 200
    assert response.json()[0]["student_name"] is None



# Verifies: List submissions unauthenticated.
def test_list_submissions_unauthenticated(client):
    response = client.get("/api/v1/canvas/courses/1/assignments/10/submissions")
    assert response.status_code == 401


# Verifies: List submissions no canvas token.
def test_list_submissions_no_canvas_token(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "No Token", "email": email, "password": "secret123"}
    )
    token = reg.json()["access_token"]
    local_course_id = _create_local_course_for_user_email(email)
    response = client.get(
        f"/api/v1/canvas/courses/{local_course_id}/assignments/10/submissions?canvas_url={CANVAS_URL}",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403


# Verifies: #872 — An instructor cannot read another instructor's submission data.
def test_list_submissions_rejects_course_owned_by_another_instructor(client, auth_headers):
    local_course_id = _sync_local_course(client, auth_headers, canvas_id=90125)
    other_headers = _register_with_canvas(client)

    with patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock:
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/assignments/10/submissions?canvas_url={CANVAS_URL}",
            headers=other_headers,
        )

    assert response.status_code == 404
    assert response.json()["detail"] == "Course not found or does not belong to you."
    mock.assert_not_awaited()


# Verifies: #872 — Grade preview cannot expose another instructor's submission data.
def test_grade_preview_rejects_course_owned_by_another_instructor(client, auth_headers):
    local_course_id = _sync_local_course(client, auth_headers, canvas_id=90126)
    other_headers = _register_with_canvas(client)

    with patch("app.services.grade_management.fetch_submissions", new_callable=AsyncMock) as mock:
        response = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/grades/preview?canvas_url={CANVAS_URL}",
            json={"assignment_id": 10, "user_id": 5, "posted_grade": "95"},
            headers=other_headers,
        )

    assert response.status_code == 404
    assert response.json()["detail"] == "Course not found or does not belong to you."
    mock.assert_not_awaited()


# Verifies: #872 — Grade submit cannot mutate another instructor's course.
def test_grade_submit_rejects_course_owned_by_another_instructor(client, auth_headers):
    local_course_id = _sync_local_course(client, auth_headers, canvas_id=90127)
    other_headers = _register_with_canvas(client)

    with (
        patch("app.services.grade_management.fetch_submissions", new_callable=AsyncMock) as mock_submissions,
        patch("app.services.grade_management.update_submission_grade", new_callable=AsyncMock) as mock_update,
    ):
        response = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/grades/submit?canvas_url={CANVAS_URL}",
            json={"assignment_id": 10, "user_id": 5, "posted_grade": "95"},
            headers=other_headers,
        )

    assert response.status_code == 404
    assert response.json()["detail"] == "Course not found or does not belong to you."
    mock_submissions.assert_not_awaited()
    mock_update.assert_not_awaited()


# ---------------------------------------------------------------------------
# #547 — Submission status parsing
# ---------------------------------------------------------------------------

def _submission(**overrides) -> dict:
    """Return a minimal Canvas submission dict with optional field overrides."""
    base = {
        "id": 100,
        "assignment_id": 10,
        "user_id": 5,
        "score": None,
        "grade": None,
        "graded_at": None,
        "submitted_at": None,
        "workflow_state": "unsubmitted",
        "missing": False,
        "late": False,
        "excused": False,
    }
    return {**base, **overrides}


@pytest.mark.parametrize("raw,expected_status", [
    (
        _submission(workflow_state="graded", score=85.0, grade="B"),
        "graded",
    ),
    (
        _submission(workflow_state="submitted", submitted_at="2026-01-01T12:00:00Z"),
        "submitted",
    ),
    (
        _submission(workflow_state="submitted", late=True, submitted_at="2026-01-01T12:00:00Z"),
        "late",
    ),
    (
        _submission(workflow_state="unsubmitted", missing=True),
        "missing",
    ),
    (
        _submission(workflow_state="unsubmitted"),
        "unsubmitted",
    ),
    (
        _submission(workflow_state="graded", excused=True),
        "excused",
    ),
])
# Verifies: Submission status parsing.
def test_submission_status_parsing(client, auth_headers, synced_course_id, raw, expected_status):
    with patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock:
        mock.return_value = [raw]
        response = client.get(
            f"/api/v1/canvas/courses/{synced_course_id}/assignments/10/submissions?canvas_url={CANVAS_URL}",
            headers=auth_headers,
        )
    assert response.status_code == 200
    assert response.json()[0]["status"] == expected_status


# ---------------------------------------------------------------------------
# #548 — Grading information parsing
# ---------------------------------------------------------------------------

# Verifies: Submission grading fields populated.
def test_submission_grading_fields_populated(client, auth_headers, synced_course_id):
    raw = _submission(
        workflow_state="graded",
        score=92.5,
        grade="A",
        graded_at="2026-06-01T08:00:00Z",
    )
    with patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock:
        mock.return_value = [raw]
        response = client.get(
            f"/api/v1/canvas/courses/{synced_course_id}/assignments/10/submissions?canvas_url={CANVAS_URL}",
            headers=auth_headers,
        )
    data = response.json()[0]
    assert data["score"] == 92.5
    assert data["grade"] == "A"
    assert data["graded_at"] is not None


# Verifies: Submission grading fields null when ungraded.
def test_submission_grading_fields_null_when_ungraded(client, auth_headers, synced_course_id):
    raw = _submission(workflow_state="submitted", submitted_at="2026-06-01T08:00:00Z")
    with patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock:
        mock.return_value = [raw]
        response = client.get(
            f"/api/v1/canvas/courses/{synced_course_id}/assignments/10/submissions?canvas_url={CANVAS_URL}",
            headers=auth_headers,
        )
    data = response.json()[0]
    assert data["score"] is None
    assert data["grade"] is None
    assert data["graded_at"] is None


# ---------------------------------------------------------------------------
# #549 — API failure handling
# ---------------------------------------------------------------------------

# Verifies: List submissions invalid canvas token.
def test_list_submissions_invalid_canvas_token(client, auth_headers, synced_course_id):
    with patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock:
        mock.side_effect = HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid Canvas API token",
        )
        response = client.get(
            f"/api/v1/canvas/courses/{synced_course_id}/assignments/10/submissions?canvas_url={CANVAS_URL}",
            headers=auth_headers,
        )
    assert response.status_code == 422


# Verifies: List submissions canvas permission denied.
def test_list_submissions_canvas_permission_denied(client, auth_headers, synced_course_id):
    with patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock:
        mock.side_effect = HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Canvas token lacks permission for this resource",
        )
        response = client.get(
            f"/api/v1/canvas/courses/{synced_course_id}/assignments/10/submissions?canvas_url={CANVAS_URL}",
            headers=auth_headers,
        )
    assert response.status_code == 403


# Verifies: List submissions canvas unavailable.
def test_list_submissions_canvas_unavailable(client, auth_headers, synced_course_id):
    with patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock:
        mock.side_effect = HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Canvas",
        )
        response = client.get(
            f"/api/v1/canvas/courses/{synced_course_id}/assignments/10/submissions?canvas_url={CANVAS_URL}",
            headers=auth_headers,
        )
    assert response.status_code == 502


# Verifies: List submissions canvas timeout.
def test_list_submissions_canvas_timeout(client, auth_headers, synced_course_id):
    with patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock:
        mock.side_effect = HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Canvas API timed out",
        )
        response = client.get(
            f"/api/v1/canvas/courses/{synced_course_id}/assignments/10/submissions?canvas_url={CANVAS_URL}",
            headers=auth_headers,
        )
    assert response.status_code == 504


# ---------------------------------------------------------------------------
# GET /canvas/active-course
# ---------------------------------------------------------------------------


# Verifies: Get active course unauthenticated.
def test_get_active_course_unauthenticated(client):
    response = client.get("/api/v1/canvas/active-course")
    assert response.status_code == 401


# Verifies: Get active course no preference.
def test_get_active_course_no_preference(client):
    """A freshly registered user with no preference set returns null."""
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Fresh User", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    response = client.get(
        "/api/v1/canvas/active-course", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json() is None


# ---------------------------------------------------------------------------
# PATCH /canvas/active-course
# ---------------------------------------------------------------------------


# Verifies: Set active course unauthenticated.
def test_set_active_course_unauthenticated(client):
    response = client.patch("/api/v1/canvas/active-course", json={"local_course_id": 1})
    assert response.status_code == 401


# Verifies: Set active course nonexistent course.
def test_set_active_course_nonexistent_course(client, auth_headers):
    """Setting a course ID that does not exist returns 404."""
    response = client.patch(
        "/api/v1/canvas/active-course",
        json={"local_course_id": 999_999},
        headers=auth_headers,
    )
    assert response.status_code == 404


# Verifies: Set and get active course.
def test_set_and_get_active_course(client):
    """Full round-trip: fetch courses → set active → get active returns same course."""
    headers = _register_with_canvas(client)

    courses = [_unique_course()]
    # set_active_course now also calls sync_courses_if_stale (keeps
    # canvas_course_names fresh for the chat pipeline), which makes its
    # own real fetch_courses call — mock stays active for the whole
    # round-trip, not just the initial fetch.
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        fetch_resp = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers
        )
        assert fetch_resp.status_code == 200

        local_id = fetch_resp.json()[0]["local_id"]
        canvas_id = fetch_resp.json()[0]["canvas_id"]

        set_resp = client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_id},
            headers=headers,
        )
    assert set_resp.status_code == 200
    assert set_resp.json()["local_id"] == local_id
    assert set_resp.json()["canvas_course_id"] == str(canvas_id)
    assert "name" in set_resp.json()
    assert "canvas_url" in set_resp.json()

    get_resp = client.get("/api/v1/canvas/active-course", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["local_id"] == local_id
    assert get_resp.json()["canvas_url"] == set_resp.json()["canvas_url"]


# Verifies: Set active course updates preference.
def test_set_active_course_updates_preference(client):
    """Setting a second course overwrites the first (upsert, not append)."""
    headers = _register_with_canvas(client)

    course_a = [_unique_course()]
    course_b = [_unique_course()]

    # set_active_course now also calls sync_courses_if_stale, which makes
    # its own real fetch_courses call — mock stays active for both PATCHes.
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = course_a + course_b
        fetch_resp = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers
        )
        assert fetch_resp.status_code == 200

        local_id_a = fetch_resp.json()[0]["local_id"]
        local_id_b = fetch_resp.json()[1]["local_id"]

        client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_id_a},
            headers=headers,
        )
        client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_id_b},
            headers=headers,
        )

    get_resp = client.get("/api/v1/canvas/active-course", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["local_id"] == local_id_b


# Verifies: Set active course wrong user.
def test_set_active_course_wrong_user(client):
    """A course owned by another instructor cannot be set as active — returns 404."""
    # User A fetches and owns a course
    headers_a = _register_with_canvas(client)
    courses = [_unique_course()]
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        fetch_resp = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers_a
        )
    local_id = fetch_resp.json()[0]["local_id"]

    # User B tries to set user A's course as their active course
    headers_b = _register_with_canvas(client)
    response = client.patch(
        "/api/v1/canvas/active-course",
        json={"local_course_id": local_id},
        headers=headers_b,
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# sync_courses_if_stale / canvas_course_names (chat course-name resolution)
# ---------------------------------------------------------------------------


# Verifies: sync_courses_if_stale respects its cooldown.
def test_sync_courses_if_stale_respects_cooldown(client):
    """Two 'set active course' switches on the same connection, close
    together, must only hit Canvas once for the course list — the second
    is a cooldown no-op, not a fresh fetch."""
    headers = _register_with_canvas(client)
    courses = [_unique_course(), _unique_course()]

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        fetch_resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
        assert fetch_resp.status_code == 200
        local_id_a = fetch_resp.json()[0]["local_id"]
        local_id_b = fetch_resp.json()[1]["local_id"]
        assert mock.call_count == 1  # the GET /courses call itself

        set_resp_a = client.patch(
            "/api/v1/canvas/active-course", json={"local_course_id": local_id_a}, headers=headers
        )
        assert set_resp_a.status_code == 200
        # Connection was just created (courses_synced_at is None) —
        # cooldown allows a real sync here.
        assert mock.call_count == 2

        set_resp_b = client.patch(
            "/api/v1/canvas/active-course", json={"local_course_id": local_id_b}, headers=headers
        )
        assert set_resp_b.status_code == 200
        # Same connection, well within the cooldown window — must not
        # trigger another real Canvas call.
        assert mock.call_count == 2


# Verifies: canvas_course_names is never overwritten once synced.
def test_canvas_course_names_never_overwritten_once_synced(client):
    """canvas_course_names is insert-once (ON CONFLICT DO NOTHING) — a
    rename on Canvas between syncs must not retroactively change what an
    in-progress chat conversation has already been calling a course, even
    though Course.name (the dashboard's view) does pick up the rename."""
    from app.config import settings as app_settings

    headers = _register_with_canvas(client)
    canvas_id = uuid.uuid4().int % 10_000_000

    with (
        patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock,
        patch.object(app_settings, "CANVAS_COURSE_SYNC_COOLDOWN_SECONDS", 0),
    ):
        mock.return_value = [_unique_course(canvas_id) | {"name": "Original Name"}]
        fetch_resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
        local_id = fetch_resp.json()[0]["local_id"]

        set_resp_1 = client.patch(
            "/api/v1/canvas/active-course", json={"local_course_id": local_id}, headers=headers
        )
        assert set_resp_1.status_code == 200
        assert set_resp_1.json()["name"] == "Original Name"

        # Renamed on Canvas; cooldown forced to 0 above so this PATCH
        # triggers a real second sync, not a no-op.
        mock.return_value = [_unique_course(canvas_id) | {"name": "Renamed"}]
        set_resp_2 = client.patch(
            "/api/v1/canvas/active-course", json={"local_course_id": local_id}, headers=headers
        )
        assert set_resp_2.status_code == 200
        # Course.name picks up the rename...
        assert set_resp_2.json()["name"] == "Renamed"

    # ...but canvas_course_names — what the chat pipeline shows the LLM —
    # keeps the name it first saw.
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "respond", "message": "OK."}'
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        client.post("/api/v1/chat/", json={"message": "hi"}, headers=headers)

    sent_message = mock_adapter.generate.call_args.args[1]
    assert "Original Name" in sent_message
    assert "Renamed" not in sent_message


# ---------------------------------------------------------------------------
# POST /canvas/courses — new-account token URL resolution (#1425)
# ---------------------------------------------------------------------------


# Verifies: Newly connected accounts can create a first course without an
# explicit canvas_url query param — uses the saved connection instead of the
# global CANVAS_API_URL (which caused "No Canvas token for https://canvas.ubc.ca").
def test_create_course_uses_saved_connection_when_canvas_url_omitted(client, monkeypatch):
    connection_url = "http://localhost:3000"
    monkeypatch.setattr(
        "app.config.settings.CANVAS_API_URL",
        "https://canvas.ubc.ca",
        raising=False,
    )

    email = f"new_acct_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "New Instructor", "email": email, "password": "secret123"},
    )
    assert reg.status_code == 201
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        saved = client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "new-account-token", "canvas_url": connection_url},
            headers=headers,
        )
    assert saved.status_code == 200

    created = {
        "id": 9001,
        "name": "Capstone Project",
        "course_code": "COSC499",
        "workflow_state": "unpublished",
        "total_students": 0,
    }

    with (
        patch(
            "app.services.canvas.fetch_accounts",
            new=AsyncMock(return_value=[{"id": 1, "parent_account_id": None}]),
        ),
        patch(
            "app.services.canvas.create_course",
            new=AsyncMock(return_value=created),
        ) as mock_create,
        patch("app.services.canvas.decrypt_canvas_token", return_value="new-account-token"),
    ):
        response = client.post(
            "/api/v1/canvas/courses",
            json={"name": "Capstone Project", "course_code": "COSC499", "publish": False},
            headers=headers,
        )

    assert response.status_code == 201, response.text
    assert response.json()["name"] == "Capstone Project"
    mock_create.assert_awaited_once()
    assert mock_create.await_args.args[3] == connection_url


# Verifies: Missing Canvas token on create returns reconnect guidance, not a raw PATCH path.
def test_create_course_missing_token_returns_reconnect_guidance(client, monkeypatch):
    monkeypatch.setattr(
        "app.config.settings.CANVAS_API_URL",
        "https://canvas.ubc.ca",
        raising=False,
    )

    email = f"no_token_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "No Token", "email": email, "password": "secret123"},
    )
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    response = client.post(
        "/api/v1/canvas/courses?canvas_url=https://canvas.ubc.ca",
        json={"name": "Should Fail", "publish": False},
        headers=headers,
    )

    assert response.status_code == 403
    detail = response.json()["detail"]
    assert "No Canvas token" in detail
    assert "Reconnect Canvas" in detail
    assert "PATCH" not in detail
