"""
Integration tests for admin user management and the startup seeder.

Covers:
  - POST /api/v1/admin/users
  - seed_admin()
  - Audit log entries for admin_created / admin_seeded
"""
import asyncio
import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import decode_access_token
from app.core.seeder import seed_admin
from app.main import app
from app.models.audit_log_session import AuditLogSession
from app.models.user import User


def _make_session():
    """Return a fresh (engine, session-maker) pair for use inside asyncio.run().

    The global engine's asyncpg pool is bound to the TestClient's event loop.
    asyncio.run() creates a new loop, so we must not reuse the global engine.
    """
    engine = create_async_engine(settings.DATABASE_URL)
    return engine, async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


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

async def _get_user_by_email(email: str):
    engine, Session = _make_session()
    try:
        async with Session() as db:
            return await db.scalar(select(User).where(User.email == email))
    finally:
        await engine.dispose()


async def _get_audit_logs(user_id: int, action: str) -> list:
    engine, Session = _make_session()
    try:
        async with Session() as db:
            result = await db.scalars(
                select(AuditLogSession).where(
                    AuditLogSession.user_id == user_id,
                    AuditLogSession.action == action,
                )
            )
            return list(result)
    finally:
        await engine.dispose()


async def _count_admins() -> int:
    engine, Session = _make_session()
    try:
        async with Session() as db:
            result = await db.scalars(select(User).where(User.role == "admin"))
            return len(list(result))
    finally:
        await engine.dispose()


async def _run_seeder():
    """Run seed_admin() with a fresh engine so asyncio.run() doesn't conflict with the global pool."""
    engine, Session = _make_session()
    try:
        async with Session() as db:
            await seed_admin(db)
    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# POST /admin/users — happy path
# ---------------------------------------------------------------------------

# Verifies: Create admin returns 201.
def test_create_admin_returns_201(client, admin_headers):
    resp = client.post(
        "/api/v1/admin/users",
        json={"name": "New Admin", "email": f"newadmin_{uuid.uuid4()}@example.com", "password": "pass"},
        headers=admin_headers,
    )
    assert resp.status_code == 201


# Verifies: Create admin response shape.
def test_create_admin_response_shape(client, admin_headers):
    resp = client.post(
        "/api/v1/admin/users",
        json={"name": "New Admin", "email": f"newadmin_{uuid.uuid4()}@example.com", "password": "pass"},
        headers=admin_headers,
    )
    body = resp.json()
    assert body["role"] == "admin"
    assert body["is_active"] is True
    assert "id" in body
    assert "created_at" in body
    assert "password" not in body
    assert "hashed_password" not in body


# Verifies: Create admin user exists in db.
def test_create_admin_user_exists_in_db(client, admin_headers):
    email = f"newadmin_{uuid.uuid4()}@example.com"
    client.post(
        "/api/v1/admin/users",
        json={"name": "DB Admin", "email": email, "password": "pass"},
        headers=admin_headers,
    )
    user = asyncio.run(_get_user_by_email(email))
    assert user is not None
    assert user.role == "admin"


# Verifies: Create admin writes audit log.
def test_create_admin_writes_audit_log(client, admin_headers, admin_token):
    creator_id = int(decode_access_token(admin_token)[0])
    before_count = len(asyncio.run(_get_audit_logs(creator_id, "admin_created")))

    client.post(
        "/api/v1/admin/users",
        json={"name": "Audited Admin", "email": f"audit_{uuid.uuid4()}@example.com", "password": "pass"},
        headers=admin_headers,
    )

    after_logs = asyncio.run(_get_audit_logs(creator_id, "admin_created"))
    assert len(after_logs) == before_count + 1


# Verifies: Create admin new account can login.
def test_create_admin_new_account_can_login(client, admin_headers):
    email = f"newadmin_{uuid.uuid4()}@example.com"
    password = "loginable_pass"
    client.post(
        "/api/v1/admin/users",
        json={"name": "Loginable Admin", "email": email, "password": password},
        headers=admin_headers,
    )
    resp = client.post("/api/v1/auth/admin/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


# ---------------------------------------------------------------------------
# POST /admin/users — failure cases
# ---------------------------------------------------------------------------

# Verifies: Create admin requires auth.
def test_create_admin_requires_auth(client):
    resp = client.post(
        "/api/v1/admin/users",
        json={"name": "N", "email": f"x_{uuid.uuid4()}@example.com", "password": "p"},
    )
    assert resp.status_code == 401


# Verifies: Create admin rejects instructor token.
def test_create_admin_rejects_instructor_token(client):
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


# Verifies: Create admin duplicate email returns 400.
def test_create_admin_duplicate_email_returns_400(client, admin_headers):
    email = f"dup_{uuid.uuid4()}@example.com"
    client.post(
        "/api/v1/admin/users",
        json={"name": "First", "email": email, "password": "pass"},
        headers=admin_headers,
    )
    resp = client.post(
        "/api/v1/admin/users",
        json={"name": "Second", "email": email, "password": "pass"},
        headers=admin_headers,
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# seed_admin — unit tests (no HTTP client needed)
# ---------------------------------------------------------------------------

# Verifies: Seeder skips when email not set.
def test_seeder_skips_when_email_not_set():
    admin_count_before = asyncio.run(_count_admins())
    with patch.object(settings, "ADMIN_EMAIL", None), \
         patch.object(settings, "ADMIN_PASSWORD", "somepass"):
        asyncio.run(_run_seeder())
    assert asyncio.run(_count_admins()) == admin_count_before


# Verifies: Seeder skips when password not set.
def test_seeder_skips_when_password_not_set():
    admin_count_before = asyncio.run(_count_admins())
    with patch.object(settings, "ADMIN_EMAIL", f"seed_{uuid.uuid4()}@example.com"), \
         patch.object(settings, "ADMIN_PASSWORD", None):
        asyncio.run(_run_seeder())
    assert asyncio.run(_count_admins()) == admin_count_before


# Verifies: Seeder creates admin when no admin exists.
def test_seeder_creates_admin_when_no_admin_exists():
    # Use a unique email so the seeder sees no existing admin with this identity.
    # However, the seeder checks for ANY admin, so we need a clean slate scenario.
    # We test this by checking the seeder's audit trail instead.
    seed_email = f"seed_{uuid.uuid4()}@example.com"
    seed_password = "SeedPass123!"

    # Temporarily clear all admins is too destructive; instead verify the seeder
    # writes the correct audit log action when it does create a user.
    async def _admin_exists_already():
        engine, Session = _make_session()
        try:
            async with Session() as db:
                return await db.scalar(select(User).where(User.role == "admin")) is not None
        finally:
            await engine.dispose()

    if asyncio.run(_admin_exists_already()):
        pytest.skip("An admin already exists; seeder creation path cannot be triggered safely")

    with patch.object(settings, "ADMIN_EMAIL", seed_email), \
         patch.object(settings, "ADMIN_PASSWORD", seed_password):
        asyncio.run(_run_seeder())

    user = asyncio.run(_get_user_by_email(seed_email))
    assert user is not None
    assert user.role == "admin"
    logs = asyncio.run(_get_audit_logs(user.id, "admin_seeded"))
    assert len(logs) == 1


# Verifies: Seeder is idempotent.
def test_seeder_is_idempotent(client, admin_credentials):
    """Running the seeder a second time must not create a duplicate admin."""
    admin_count_before = asyncio.run(_count_admins())

    with patch.object(settings, "ADMIN_EMAIL", admin_credentials["email"]), \
         patch.object(settings, "ADMIN_PASSWORD", admin_credentials["password"]):
        asyncio.run(_run_seeder())

    assert asyncio.run(_count_admins()) == admin_count_before
