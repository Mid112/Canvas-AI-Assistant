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


async def _set_role(email: str, role: str) -> None:
    async with _db() as db:
        user = await db.scalar(select(User).where(User.email == email))
        user.role = role
        await db.commit()


# ---------------------------------------------------------------------------
# get_current_user — any authenticated, active user (#600)
# ---------------------------------------------------------------------------

# Verifies: Me returns 200 for active user.
def test_me_returns_200_for_active_user(client):
    reg = _register(client)
    resp = client.get("/api/v1/auth/me", headers=reg["headers"])
    assert resp.status_code == 200


# Verifies: Me rejects token issued before account was disabled.
def test_me_rejects_token_issued_before_account_was_disabled(client):
    reg = _register(client)
    asyncio.run(_disable(reg["email"]))

    resp = client.get("/api/v1/auth/me", headers=reg["headers"])
    assert resp.status_code == 401
    assert "inactive" in resp.json()["detail"].lower()


# Verifies: Chat endpoint rejects token for disabled account.
def test_chat_endpoint_rejects_token_for_disabled_account(client):
    reg = _register(client)
    asyncio.run(_disable(reg["email"]))

    resp = client.post("/api/v1/chat/", json={"message": "hello"}, headers=reg["headers"])
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# get_instructor_user — role + active enforcement (#602, #603)
# ---------------------------------------------------------------------------

# Verifies: Canvas route accepts instructor token.
def test_canvas_route_accepts_instructor_token(client):
    # A fresh instructor has no Canvas connection yet, so the *business logic* still
    # 403s (see test_list_courses_no_canvas_token) — this test only proves the RBAC
    # guard itself let the instructor through, i.e. it's not the "Requires role" 401/403.
    reg = _register(client)
    resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=reg["headers"])
    assert resp.status_code != 401
    assert "role" not in resp.json()["detail"].lower()


# Verifies: Canvas route rejects unauthenticated.
def test_canvas_route_rejects_unauthenticated(client):
    resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}")
    assert resp.status_code == 401


# Verifies: Canvas route rejects admin token.
def test_canvas_route_rejects_admin_token(client, admin_credentials):
    login = client.post("/api/v1/auth/admin/login", json=admin_credentials)
    admin_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=admin_headers)
    assert resp.status_code == 403
    assert "instructor" in resp.json()["detail"].lower()


# Verifies: Quiz draft/preview endpoints reject admin tokens (instructor-only).
def test_quiz_draft_and_preview_reject_admin_token(client, admin_credentials):
    login = client.post("/api/v1/auth/admin/login", json=admin_credentials)
    admin_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    draft = client.post(
        "/api/v1/canvas/courses/1/quizzes/generate-draft",
        json={"prompt": "Create a quiz on recursion"},
        headers=admin_headers,
    )
    assert draft.status_code == 403
    assert "instructor" in draft.json()["detail"].lower()

    preview = client.post(
        f"/api/v1/canvas/courses/1/quizzes/preview?canvas_url={CANVAS_URL}",
        json={
            "title": "Quiz",
            "description": "Enough characters for a quiz description.",
            "due_at": "2030-09-01T23:59:00Z",
            "points_possible": 10,
            "questions": [
                {
                    "question_text": "Explain recursion.",
                    "question_type": "essay_question",
                    "points_possible": 10,
                    "answers": [],
                }
            ],
        },
        headers=admin_headers,
    )
    assert preview.status_code == 403
    assert "instructor" in preview.json()["detail"].lower()


# Verifies: Canvas route rejects disabled instructor token.
def test_canvas_route_rejects_disabled_instructor_token(client):
    reg = _register(client)
    asyncio.run(_disable(reg["email"]))

    resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=reg["headers"])
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# get_admin_user — role enforcement on admin-only routes (#599)
# ---------------------------------------------------------------------------

# Verifies: Admin route rejects instructor token.
def test_admin_route_rejects_instructor_token(client):
    reg = _register(client)
    resp = client.post(
        "/api/v1/admin/users",
        json={"name": "N", "email": f"x_{uuid.uuid4()}@example.com", "password": "p"},
        headers=reg["headers"],
    )
    assert resp.status_code == 403


# Verifies: Admin route rejects unauthenticated.
def test_admin_route_rejects_unauthenticated(client):
    resp = client.post(
        "/api/v1/admin/users",
        json={"name": "N", "email": f"x_{uuid.uuid4()}@example.com", "password": "p"},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Role changes take effect immediately — guards must not trust the token's
# stale role claim (#600, #602, #599 hardening)
# ---------------------------------------------------------------------------

# Verifies: Canvas route rejects instructor demoted after token issued.
def test_canvas_route_rejects_instructor_demoted_after_token_issued(client):
    """A token minted with role=instructor must lose Canvas access the moment
    the DB role changes, without waiting for the token to expire."""
    reg = _register(client)
    asyncio.run(_set_role(reg["email"], "admin"))

    resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=reg["headers"])
    assert resp.status_code == 403


# Verifies: Admin route rejects admin demoted after token issued.
def test_admin_route_rejects_admin_demoted_after_token_issued(client, admin_credentials):
    """A token minted via admin login must lose admin access immediately if the
    DB role changes, even though its session row is still valid."""
    bootstrap = client.post("/api/v1/auth/admin/login", json=admin_credentials)
    bootstrap_headers = {"Authorization": f"Bearer {bootstrap.json()['access_token']}"}

    email = f"demote_{uuid.uuid4()}@example.com"
    password = "DemoteMe123!"
    client.post(
        "/api/v1/admin/users",
        json={"name": "Demote Target", "email": email, "password": password},
        headers=bootstrap_headers,
    )
    login = client.post("/api/v1/auth/admin/login", json={"email": email, "password": password})
    token = login.json()["access_token"]

    asyncio.run(_set_role(email, "instructor"))

    resp = client.post(
        "/api/v1/admin/users",
        json={"name": "N", "email": f"x_{uuid.uuid4()}@example.com", "password": "p"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
