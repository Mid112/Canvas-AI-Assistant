"""
Integration tests for admin authentication flow.

Covers:
  - POST /api/v1/auth/admin/login  (#595)
  - POST /api/v1/auth/logout       (#596)
  - get_admin_user session validation (#597)
  - Audit log entries for login/logout
  - Session record lifecycle

All tests use a real PostgreSQL DB (same as test_auth.py).
The `admin_credentials` fixture is defined in conftest.py.
"""
import asyncio
import contextlib
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import decode_access_token, hash_password, hash_token
from app.main import app
from app.models.audit_log_session import AuditLogSession
from app.models.session import Session
from app.models.user import User


@contextlib.asynccontextmanager
async def _db():
    """Isolated DB session for asyncio.run() helpers — never shares the global engine."""
    _engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with async_sessionmaker(_engine, expire_on_commit=False)() as session:
            yield session
    finally:
        await _engine.dispose()


@pytest.fixture(scope="module")
def client():
    app.state.limiter.enabled = False
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


# One shared admin login per module — used by tests that only READ admin state.
# Tests that logout must create their own token to avoid invalidating this one.
@pytest.fixture(scope="module")
def admin_token(client, admin_credentials):
    resp = client.post("/api/v1/auth/admin/login", json=admin_credentials)
    assert resp.status_code == 200, resp.json()
    return resp.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_audit_logs(user_id: int, action: str) -> list:
    async with _db() as db:
        result = await db.scalars(
            select(AuditLogSession).where(
                AuditLogSession.user_id == user_id,
                AuditLogSession.action == action,
            )
        )
        return list(result)


async def _get_session_by_token(token: str):
    async with _db() as db:
        return await db.scalar(
            select(Session).where(Session.token_hash == hash_token(token))
        )


async def _get_user_by_email(email: str):
    async with _db() as db:
        return await db.scalar(select(User).where(User.email == email))


# ---------------------------------------------------------------------------
# Admin login — happy path
# ---------------------------------------------------------------------------

def test_admin_login_returns_200_and_token(client, admin_credentials):
    resp = client.post("/api/v1/auth/admin/login", json=admin_credentials)
    assert resp.status_code == 200
    assert "access_token" in resp.json()
    assert resp.json()["token_type"] == "bearer"


def test_admin_login_token_contains_admin_role(client, admin_credentials):
    resp = client.post("/api/v1/auth/admin/login", json=admin_credentials)
    token = resp.json()["access_token"]
    _, role = decode_access_token(token)
    assert role == "admin"


def test_admin_login_creates_session_record_in_db(client, admin_credentials):
    resp = client.post("/api/v1/auth/admin/login", json=admin_credentials)
    token = resp.json()["access_token"]
    session = asyncio.run(_get_session_by_token(token))
    assert session is not None
    assert session.expires_at is not None


def test_admin_login_writes_audit_log(client, admin_credentials):
    resp = client.post("/api/v1/auth/admin/login", json=admin_credentials)
    token = resp.json()["access_token"]
    user_id, _ = decode_access_token(token)
    logs = asyncio.run(_get_audit_logs(int(user_id), "admin_login"))
    assert len(logs) >= 1
    assert logs[-1].details["email"] == admin_credentials["email"]


# ---------------------------------------------------------------------------
# Admin login — failure cases
# ---------------------------------------------------------------------------

def test_admin_login_wrong_password_returns_401(client, admin_credentials):
    resp = client.post(
        "/api/v1/auth/admin/login",
        json={"email": admin_credentials["email"], "password": "wrongpassword"},
    )
    assert resp.status_code == 401


def test_admin_login_unknown_email_returns_401(client):
    resp = client.post(
        "/api/v1/auth/admin/login",
        json={"email": f"nobody_{uuid.uuid4()}@example.com", "password": "password"},
    )
    assert resp.status_code == 401


def test_admin_login_with_instructor_account_returns_403(client):
    email = f"instructor_{uuid.uuid4()}@example.com"
    client.post("/api/v1/auth/register", json={"name": "Inst", "email": email, "password": "pass"})
    resp = client.post("/api/v1/auth/admin/login", json={"email": email, "password": "pass"})
    assert resp.status_code == 403
    assert "Admin access required" in resp.json()["detail"]


def test_admin_login_disabled_account_returns_403(client):
    email = f"disabled_admin_{uuid.uuid4()}@example.com"

    async def _create_disabled():
        async with _db() as db:
            db.add(User(
                name="Disabled Admin",
                email=email,
                hashed_password=hash_password("pass123"),
                role="admin",
                is_active=False,
            ))
            await db.commit()

    asyncio.run(_create_disabled())
    resp = client.post(
        "/api/v1/auth/admin/login",
        json={"email": email, "password": "pass123"},
    )
    assert resp.status_code == 403
    assert "disabled" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Admin logout
# ---------------------------------------------------------------------------

def test_admin_logout_returns_204(client, admin_credentials):
    # Fresh token so we don't invalidate the shared module-level one
    token = client.post("/api/v1/auth/admin/login", json=admin_credentials).json()["access_token"]
    resp = client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 204


def test_admin_logout_invalidates_session(client, admin_credentials):
    token = client.post("/api/v1/auth/admin/login", json=admin_credentials).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    client.post("/api/v1/auth/logout", headers=headers)

    # Using the same token again must now fail
    resp = client.post("/api/v1/auth/logout", headers=headers)
    assert resp.status_code == 401


def test_admin_logout_removes_session_from_db(client, admin_credentials):
    token = client.post("/api/v1/auth/admin/login", json=admin_credentials).json()["access_token"]
    assert asyncio.run(_get_session_by_token(token)) is not None

    client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})

    assert asyncio.run(_get_session_by_token(token)) is None


def test_admin_logout_writes_audit_log(client, admin_credentials):
    token = client.post("/api/v1/auth/admin/login", json=admin_credentials).json()["access_token"]
    user_id, _ = decode_access_token(token)
    before_count = len(asyncio.run(_get_audit_logs(int(user_id), "admin_logout")))

    client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})

    after_logs = asyncio.run(_get_audit_logs(int(user_id), "admin_logout"))
    assert len(after_logs) == before_count + 1


def test_admin_logout_requires_auth(client):
    resp = client.post("/api/v1/auth/logout")
    assert resp.status_code == 401  # HTTPBearer returns 401 in FastAPI 0.136+


def test_instructor_logout_succeeds(client):
    """Instructors share /auth/logout with admins (#592)."""
    email = f"inst_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"name": "I", "email": email, "password": "pass"})
    token = reg.json()["access_token"]
    resp = client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# Session validation via get_admin_user
# ---------------------------------------------------------------------------

def test_admin_endpoint_accepts_valid_admin_token(client, admin_headers):
    # POST /admin/users is guarded by get_admin_user — use it as a probe
    resp = client.post(
        "/api/v1/admin/users",
        json={"name": "N", "email": f"probe_{uuid.uuid4()}@example.com", "password": "p"},
        headers=admin_headers,
    )
    # 201 or 400 (dup email) both prove the dependency passed; 401/403 would mean auth failed
    assert resp.status_code in (201, 400)


def test_admin_endpoint_rejects_invalid_token(client):
    resp = client.post(
        "/api/v1/admin/users",
        json={"name": "N", "email": f"x_{uuid.uuid4()}@example.com", "password": "p"},
        headers={"Authorization": "Bearer not.a.valid.token"},
    )
    assert resp.status_code == 401


def test_admin_endpoint_rejects_instructor_token(client):
    email = f"inst_{uuid.uuid4()}@example.com"
    token = client.post(
        "/api/v1/auth/register",
        json={"name": "I", "email": email, "password": "pass"},
    ).json()["access_token"]
    resp = client.post(
        "/api/v1/admin/users",
        json={"name": "N", "email": f"x_{uuid.uuid4()}@example.com", "password": "p"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


def test_admin_endpoint_rejects_demoted_admin(client):
    # A JWT's "admin" role claim and a live session are not enough on their own —
    # get_admin_user must also re-check the user's current role in the DB, so a
    # demoted admin loses access immediately instead of at token/session expiry.
    email = f"demoted_{uuid.uuid4()}@example.com"
    password = "pass123"

    async def _create_admin():
        async with _db() as db:
            db.add(User(
                name="Soon Demoted",
                email=email,
                hashed_password=hash_password(password),
                role="admin",
            ))
            await db.commit()

    asyncio.run(_create_admin())
    token = client.post(
        "/api/v1/auth/admin/login", json={"email": email, "password": password}
    ).json()["access_token"]

    async def _demote():
        async with _db() as db:
            user = await db.scalar(select(User).where(User.email == email))
            user.role = "instructor"
            await db.commit()

    asyncio.run(_demote())

    # Session is still valid and the JWT still claims role=admin, but the DB
    # now says instructor — access must be rejected.
    resp = client.post(
        "/api/v1/admin/users",
        json={"name": "N", "email": f"x_{uuid.uuid4()}@example.com", "password": "p"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
    assert "Admin access required" in resp.json()["detail"]
