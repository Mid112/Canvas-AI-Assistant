"""
Integration tests for the RBAC guards in app.dependencies.

Covers:
  - require_roles() factory: role enforcement + inactive-account rejection (#598, #600, #602)
  - get_current_user rejects tokens for disabled accounts (#600)
  - get_instructor_user rejects non-instructor tokens and disabled instructors (#603)
  - get_admin_user rejects non-admin tokens (#599)

Complements test_admin_auth.py (admin session/audit lifecycle) and test_canvas.py
(Canvas business logic) rather than duplicating them — this file is only concerned
with who is let through the guard, not what the endpoint does once they're in.
"""
import asyncio
import contextlib
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import settings
from app.main import app
from app.models.user import User

# Same fixed Canvas URL used by test_canvas.py — avoids depending on env config.
CANVAS_URL = "https://canvas.ubc.ca"


@contextlib.asynccontextmanager
async def _db():
    """Isolated DB session — never shares the global engine/event loop."""
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

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


def _register(client) -> dict:
    """Register a fresh instructor user. Returns email/token/headers."""
    email = f"perm_{uuid.uuid4()}@example.com"
    resp = client.post(
        "/api/v1/auth/register",
        json={"name": "Perm Test", "email": email, "password": "secret123"},
    )
    assert resp.status_code == 201, resp.json()
    token = resp.json()["access_token"]
    return {"email": email, "token": token, "headers": {"Authorization": f"Bearer {token}"}}


async def _disable(email: str) -> None:
    async with _db() as db:
        user = await db.scalar(select(User).where(User.email == email))
        user.is_active = False
        await db.commit()


# ---------------------------------------------------------------------------
# get_current_user — any authenticated, active user (#600)
# ---------------------------------------------------------------------------

def test_me_returns_200_for_active_user(client):
    reg = _register(client)
    resp = client.get("/api/v1/auth/me", headers=reg["headers"])
    assert resp.status_code == 200


def test_me_rejects_token_issued_before_account_was_disabled(client):
    reg = _register(client)
    asyncio.run(_disable(reg["email"]))

    resp = client.get("/api/v1/auth/me", headers=reg["headers"])
    assert resp.status_code == 401
    assert "inactive" in resp.json()["detail"].lower()


def test_chat_endpoint_rejects_token_for_disabled_account(client):
    reg = _register(client)
    asyncio.run(_disable(reg["email"]))

    resp = client.post("/api/v1/chat/", json={"message": "hello"}, headers=reg["headers"])
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# get_instructor_user — role + active enforcement (#602, #603)
# ---------------------------------------------------------------------------

def test_canvas_route_accepts_instructor_token(client):
    # A fresh instructor has no Canvas connection yet, so the *business logic* still
    # 403s (see test_list_courses_no_canvas_token) — this test only proves the RBAC
    # guard itself let the instructor through, i.e. it's not the "Requires role" 401/403.
    reg = _register(client)
    resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=reg["headers"])
    assert resp.status_code != 401
    assert "role" not in resp.json()["detail"].lower()


def test_canvas_route_rejects_unauthenticated(client):
    resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}")
    assert resp.status_code == 401


def test_canvas_route_rejects_admin_token(client, admin_credentials):
    login = client.post("/api/v1/auth/admin/login", json=admin_credentials)
    admin_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=admin_headers)
    assert resp.status_code == 403
    assert "instructor" in resp.json()["detail"].lower()


def test_canvas_route_rejects_disabled_instructor_token(client):
    reg = _register(client)
    asyncio.run(_disable(reg["email"]))

    resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=reg["headers"])
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# get_admin_user — role enforcement on admin-only routes (#599)
# ---------------------------------------------------------------------------

def test_admin_route_rejects_instructor_token(client):
    reg = _register(client)
    resp = client.post(
        "/api/v1/admin/users",
        json={"name": "N", "email": f"x_{uuid.uuid4()}@example.com", "password": "p"},
        headers=reg["headers"],
    )
    assert resp.status_code == 403


def test_admin_route_rejects_unauthenticated(client):
    resp = client.post(
        "/api/v1/admin/users",
        json={"name": "N", "email": f"x_{uuid.uuid4()}@example.com", "password": "p"},
    )
    assert resp.status_code == 401
