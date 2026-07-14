"""
Integration: role-based access control (#714 / parent #687).

Covers the cross-role access matrix for instructor vs admin surfaces:
  - instructor blocked from admin APIs
  - admin blocked from instructor Canvas APIs
  - unauthenticated requests rejected
  - disabled instructor tokens rejected
  - role demotion takes effect without waiting for token expiry
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
from integration_helpers import CANVAS_URL, admin_login, register_instructor


@contextlib.asynccontextmanager
async def _db():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            yield session
    finally:
        await engine.dispose()


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


@pytest.fixture(scope="module")
def client():
    app.state.limiter.enabled = False
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


# Verifies: Instructor cannot access admin-only endpoints.
def test_instructor_blocked_from_admin_surfaces(client):
    instructor = register_instructor(client, prefix="rbac_inst")
    headers = instructor["headers"]

    assert client.get("/api/v1/admin/dashboard", headers=headers).status_code == 403
    assert client.get("/api/v1/admin/settings", headers=headers).status_code == 403
    assert client.get("/api/v1/admin/instructors", headers=headers).status_code == 403
    assert client.get("/api/v1/admin/audit/logs", headers=headers).status_code == 403
    assert (
        client.post(
            "/api/v1/admin/instructors",
            json={
                "name": "Nope",
                "email": f"nope_{uuid.uuid4()}@example.com",
                "password": "Pass123!",
            },
            headers=headers,
        ).status_code
        == 403
    )


# Verifies: Admin cannot access instructor Canvas endpoints.
def test_admin_blocked_from_instructor_canvas(client, admin_credentials):
    admin_headers = admin_login(client, admin_credentials)

    courses = client.get(
        f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}",
        headers=admin_headers,
    )
    assert courses.status_code == 403
    assert "instructor" in courses.json()["detail"].lower()

    dashboard = client.get("/api/v1/canvas/dashboard", headers=admin_headers)
    assert dashboard.status_code == 403

    students = client.get(
        f"/api/v1/canvas/courses/1/students?canvas_url={CANVAS_URL}",
        headers=admin_headers,
    )
    assert students.status_code == 403


# Verifies: Unauthenticated callers are rejected on both role surfaces.
def test_unauthenticated_rejected_on_role_surfaces(client):
    assert client.get("/api/v1/admin/dashboard").status_code == 401
    assert client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}").status_code == 401
    assert client.post("/api/v1/chat/", json={"message": "hello"}).status_code == 401
    assert client.get("/api/v1/history/workflows").status_code == 401


# Verifies: Disabled instructor tokens lose access immediately.
def test_disabled_instructor_token_rejected(client):
    instructor = register_instructor(client, prefix="rbac_dis")
    asyncio.run(_disable(instructor["email"]))

    me = client.get("/api/v1/auth/me", headers=instructor["headers"])
    assert me.status_code == 401

    chat = client.post(
        "/api/v1/chat/",
        json={"message": "hello"},
        headers=instructor["headers"],
    )
    assert chat.status_code == 401


# Verifies: Role demotion is enforced from the DB, not a stale JWT claim.
def test_role_demotion_takes_effect_immediately(client, admin_credentials):
    instructor = register_instructor(client, prefix="rbac_demote")
    asyncio.run(_set_role(instructor["email"], "admin"))

    # Former instructor token should no longer pass instructor Canvas guard.
    canvas = client.get(
        f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}",
        headers=instructor["headers"],
    )
    assert canvas.status_code == 403

    # Create a real admin, then demote them and prove admin APIs reject the token.
    bootstrap = admin_login(client, admin_credentials)
    email = f"rbac_admin_{uuid.uuid4()}@example.com"
    password = "DemoteMe123!"
    created = client.post(
        "/api/v1/admin/users",
        json={"name": "Temp Admin", "email": email, "password": password},
        headers=bootstrap,
    )
    assert created.status_code == 201, created.json()

    login = client.post(
        "/api/v1/auth/admin/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200
    admin_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    asyncio.run(_set_role(email, "instructor"))

    denied = client.get("/api/v1/admin/dashboard", headers=admin_headers)
    assert denied.status_code == 403
