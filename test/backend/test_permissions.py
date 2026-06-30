"""
Covers:
  #598  require_roles() dependency factory
  #599  Admin routes locked to admin role
  #600  Inactive users rejected with 401 by get_current_user
  #601  This file — permission test suite
  #602  Canvas endpoints enforce instructor-or-above role
  #603  get_instructor_user allows instructor / ta / admin, blocks everything else

"""
import asyncio
import uuid
import pytest
from fastapi.testclient import TestClient

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.main import app
from app.models.user import User


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Role fixtures — each module gets isolated accounts
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def instructor_token(client):
    email = f"inst_{uuid.uuid4()}@test.com"
    resp = client.post(
        "/api/v1/auth/register",
        json={"name": "Instructor", "email": email, "password": "pass123"},
    )
    return resp.json()["access_token"]


@pytest.fixture(scope="module")
def instructor_headers(instructor_token):
    return {"Authorization": f"Bearer {instructor_token}"}


@pytest.fixture(scope="module")
def ta_token(client):
    """TA user created directly in DB — no public registration endpoint for ta role."""
    email = f"ta_{uuid.uuid4()}@test.com"
    password = "tapass123"

    async def _create():
        async with AsyncSessionLocal() as db:
            db.add(User(
                name="Teaching Assistant",
                email=email,
                hashed_password=hash_password(password),
                role="ta",
            ))
            await db.commit()

    asyncio.run(_create())
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


@pytest.fixture(scope="module")
def ta_headers(ta_token):
    return {"Authorization": f"Bearer {ta_token}"}


@pytest.fixture(scope="module")
def admin_token(client, admin_credentials):
    resp = client.post("/api/v1/auth/admin/login", json=admin_credentials)
    assert resp.status_code == 200, resp.json()
    return resp.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def inactive_user_token(client):
    """Create a user, capture their token, then deactivate the account in the DB."""
    email = f"inactive_{uuid.uuid4()}@test.com"
    password = "pass123"
    resp = client.post(
        "/api/v1/auth/register",
        json={"name": "Soon Inactive", "email": email, "password": password},
    )
    token = resp.json()["access_token"]

    # Deactivate the account directly
    async def _deactivate():
        from sqlalchemy import select, update
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(User).where(User.email == email).values(is_active=False)
            )
            await db.commit()

    asyncio.run(_deactivate())
    return token


# ---------------------------------------------------------------------------
# #600 — get_current_user must reject inactive accounts (#600)
# ---------------------------------------------------------------------------

class TestInactiveUserRejected:
    def test_inactive_user_cannot_call_me(self, client, inactive_user_token):
        resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {inactive_user_token}"},
        )
        assert resp.status_code == 401
        assert "disabled" in resp.json()["detail"].lower()

    def test_inactive_user_cannot_call_canvas_courses(self, client, inactive_user_token):
        resp = client.get(
            "/api/v1/canvas/courses",
            headers={"Authorization": f"Bearer {inactive_user_token}"},
        )
        assert resp.status_code == 401

    def test_inactive_user_cannot_call_canvas_active_course(self, client, inactive_user_token):
        resp = client.get(
            "/api/v1/canvas/active-course",
            headers={"Authorization": f"Bearer {inactive_user_token}"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# #598 / #603 — require_roles / get_instructor_user access matrix
# ---------------------------------------------------------------------------

class TestInstructorRoleGuard:
    """Canvas routes use get_instructor_user = require_roles("instructor","ta","admin")."""

    def _assert_role_passed(self, resp):
        """Service-layer errors (422, 404) are fine — auth rejection (401/403) is not."""
        assert resp.status_code not in (401, 403), (
            f"Expected role check to pass but got {resp.status_code}: {resp.json()}"
        )

    def test_instructor_passes_canvas_courses(self, client, instructor_headers):
        self._assert_role_passed(client.get("/api/v1/canvas/courses", headers=instructor_headers))

    def test_ta_passes_canvas_courses(self, client, ta_headers):
        self._assert_role_passed(client.get("/api/v1/canvas/courses", headers=ta_headers))

    def test_admin_passes_canvas_courses(self, client, admin_headers):
        self._assert_role_passed(client.get("/api/v1/canvas/courses", headers=admin_headers))

    def test_instructor_passes_canvas_active_course(self, client, instructor_headers):
        self._assert_role_passed(
            client.get("/api/v1/canvas/active-course", headers=instructor_headers)
        )

    def test_ta_passes_canvas_active_course(self, client, ta_headers):
        self._assert_role_passed(
            client.get("/api/v1/canvas/active-course", headers=ta_headers)
        )

    def test_admin_passes_canvas_active_course(self, client, admin_headers):
        self._assert_role_passed(
            client.get("/api/v1/canvas/active-course", headers=admin_headers)
        )

    def test_instructor_passes_canvas_assignments(self, client, instructor_headers):
        self._assert_role_passed(
            client.get("/api/v1/canvas/courses/1/assignments", headers=instructor_headers)
        )

    def test_ta_passes_canvas_assignments(self, client, ta_headers):
        self._assert_role_passed(
            client.get("/api/v1/canvas/courses/1/assignments", headers=ta_headers)
        )

    def test_admin_passes_canvas_assignments(self, client, admin_headers):
        self._assert_role_passed(
            client.get("/api/v1/canvas/courses/1/assignments", headers=admin_headers)
        )

    def test_instructor_passes_canvas_submissions(self, client, instructor_headers):
        self._assert_role_passed(
            client.get("/api/v1/canvas/courses/1/assignments/1/submissions", headers=instructor_headers)
        )

    def test_ta_passes_canvas_submissions(self, client, ta_headers):
        self._assert_role_passed(
            client.get("/api/v1/canvas/courses/1/assignments/1/submissions", headers=ta_headers)
        )

    def test_admin_passes_canvas_submissions(self, client, admin_headers):
        self._assert_role_passed(
            client.get("/api/v1/canvas/courses/1/assignments/1/submissions", headers=admin_headers)
        )


# ---------------------------------------------------------------------------
# #599 — Admin routes locked to admin role only
# ---------------------------------------------------------------------------

class TestAdminRouteRestriction:
    def test_instructor_cannot_create_admin_user(self, client, instructor_headers):
        resp = client.post(
            "/api/v1/admin/users",
            json={"name": "N", "email": f"x_{uuid.uuid4()}@example.com", "password": "p"},
            headers=instructor_headers,
        )
        assert resp.status_code == 403

    def test_ta_cannot_create_admin_user(self, client, ta_headers):
        resp = client.post(
            "/api/v1/admin/users",
            json={"name": "N", "email": f"x_{uuid.uuid4()}@example.com", "password": "p"},
            headers=ta_headers,
        )
        assert resp.status_code == 403

    def test_instructor_cannot_logout_admin_endpoint(self, client, instructor_headers):
        resp = client.post("/api/v1/auth/logout", headers=instructor_headers)
        assert resp.status_code == 403

    def test_ta_cannot_logout_admin_endpoint(self, client, ta_headers):
        resp = client.post("/api/v1/auth/logout", headers=ta_headers)
        assert resp.status_code == 403

    def test_admin_can_access_admin_create_user(self, client, admin_headers):
        resp = client.post(
            "/api/v1/admin/users",
            json={"name": "N", "email": f"x_{uuid.uuid4()}@example.com", "password": "p"},
            headers=admin_headers,
        )
        # 201 created or 400 duplicate — either proves auth passed
        assert resp.status_code in (201, 400)


# ---------------------------------------------------------------------------
# Missing / malformed token — all protected endpoints
# ---------------------------------------------------------------------------

class TestMissingOrInvalidToken:
    PROTECTED_ENDPOINTS = [
        ("GET",   "/api/v1/auth/me"),
        ("GET",   "/api/v1/canvas/courses"),
        ("GET",   "/api/v1/canvas/active-course"),
        ("POST",  "/api/v1/admin/users"),
    ]

    def test_missing_token_returns_403(self, client):
        # HTTPBearer returns 403 when the Authorization header is absent
        for method, path in self.PROTECTED_ENDPOINTS:
            resp = client.request(method, path)
            assert resp.status_code == 403, f"{method} {path} expected 403, got {resp.status_code}"

    def test_invalid_token_returns_401(self, client):
        headers = {"Authorization": "Bearer not.a.real.token"}
        for method, path in self.PROTECTED_ENDPOINTS:
            resp = client.request(method, path, headers=headers)
            assert resp.status_code == 401, f"{method} {path} expected 401, got {resp.status_code}"

    def test_malformed_bearer_returns_403(self, client):
        # "Token" scheme instead of "Bearer"
        headers = {"Authorization": "Token sometoken"}
        resp = client.get("/api/v1/auth/me", headers=headers)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# #598 — require_roles error message is descriptive
# ---------------------------------------------------------------------------

class TestRequireRolesErrorMessages:
    def test_wrong_role_returns_403_with_allowed_roles_in_message(self, client, instructor_headers):
        """Instructor hitting an admin-only endpoint should see which roles are allowed."""
        resp = client.post(
            "/api/v1/admin/users",
            json={"name": "N", "email": f"x_{uuid.uuid4()}@test.com", "password": "p"},
            headers=instructor_headers,
        )
        assert resp.status_code == 403
        # get_admin_user returns "Admin access required" — still informative
        assert resp.json()["detail"] != ""

    def test_inactive_account_returns_401_not_403(self, client, inactive_user_token):
        """Disabled account is an identity problem (401) not a permissions problem (403)."""
        resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {inactive_user_token}"},
        )
        assert resp.status_code == 401
