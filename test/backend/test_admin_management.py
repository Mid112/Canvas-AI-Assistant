"""
Integration tests for admin user management and the startup seeder.

Covers:
  - POST /api/v1/admin/users       (Part B of admin account gap fix)
  - seed_admin()                   (Part A — startup seeder)
  - Audit log entries for admin_created / admin_seeded
"""
import asyncio
import contextlib
import uuid
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import decode_access_token
from app.core.seeder import seed_admin
from app.main import app
from app.models.audit_log_session import AuditLogSession
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
    async with _db() as db:
        return await db.scalar(select(User).where(User.email == email))


async def _get_audit_logs(user_id: int, action: str) -> list:
    async with _db() as db:
        result = await db.scalars(
            select(AuditLogSession).where(
                AuditLogSession.user_id == user_id,
                AuditLogSession.action == action,
            )
        )
        return list(result)


async def _count_admins() -> int:
    async with _db() as db:
        result = await db.scalars(select(User).where(User.role == "admin"))
        return len(list(result))


# ---------------------------------------------------------------------------
# POST /admin/users — happy path
# ---------------------------------------------------------------------------

def test_create_admin_returns_201(client, admin_headers):
    resp = client.post(
        "/api/v1/admin/users",
        json={"name": "New Admin", "email": f"newadmin_{uuid.uuid4()}@example.com", "password": "pass"},
        headers=admin_headers,
    )
    assert resp.status_code == 201


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

def test_create_admin_requires_auth(client):
    resp = client.post(
        "/api/v1/admin/users",
        json={"name": "N", "email": f"x_{uuid.uuid4()}@example.com", "password": "p"},
    )
    assert resp.status_code == 401  # HTTPBearer returns 401 in FastAPI 0.136+


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

def test_seeder_skips_when_email_not_set():
    admin_count_before = asyncio.run(_count_admins())
    with patch.object(settings, "ADMIN_EMAIL", None), \
         patch.object(settings, "ADMIN_PASSWORD", "somepass"):
        async def _run():
            async with _db() as db:
                await seed_admin(db)
        asyncio.run(_run())
    assert asyncio.run(_count_admins()) == admin_count_before


def test_seeder_skips_when_password_not_set():
    admin_count_before = asyncio.run(_count_admins())
    with patch.object(settings, "ADMIN_EMAIL", f"seed_{uuid.uuid4()}@example.com"), \
         patch.object(settings, "ADMIN_PASSWORD", None):
        async def _run():
            async with _db() as db:
                await seed_admin(db)
        asyncio.run(_run())
    assert asyncio.run(_count_admins()) == admin_count_before


def test_seeder_creates_admin_when_no_admin_exists():
    seed_email = f"seed_{uuid.uuid4()}@example.com"
    seed_password = "SeedPass123!"

    async def _admin_exists_already():
        async with _db() as db:
            return await db.scalar(select(User).where(User.role == "admin")) is not None

    if asyncio.run(_admin_exists_already()):
        pytest.skip("An admin already exists; seeder creation path cannot be triggered safely")

    with patch.object(settings, "ADMIN_EMAIL", seed_email), \
         patch.object(settings, "ADMIN_PASSWORD", seed_password):
        async def _run():
            async with _db() as db:
                await seed_admin(db)
        asyncio.run(_run())

    user = asyncio.run(_get_user_by_email(seed_email))
    assert user is not None
    assert user.role == "admin"
    logs = asyncio.run(_get_audit_logs(user.id, "admin_seeded"))
    assert len(logs) == 1


def test_seeder_is_idempotent(client, admin_credentials):
    """Running the seeder a second time must not create a duplicate admin."""
    admin_count_before = asyncio.run(_count_admins())

    with patch.object(settings, "ADMIN_EMAIL", admin_credentials["email"]), \
         patch.object(settings, "ADMIN_PASSWORD", admin_credentials["password"]):
        async def _run():
            async with _db() as db:
                await seed_admin(db)
        asyncio.run(_run())

    assert asyncio.run(_count_admins()) == admin_count_before
