"""
Integration tests for instructor account management endpoints (#604-#610).

All tests run against a real PostgreSQL database. Admin credentials are created
once per session via the shared conftest fixture; instructor accounts are created
through the API under test.
"""
import asyncio
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.main import app
from app.models.audit_log_session import AuditLogSession


def _make_session():
    """Fresh engine+session-maker for asyncio.run() calls (avoids pool/loop conflicts)."""
    engine = create_async_engine(settings.DATABASE_URL)
    return engine, async_sessionmaker(engine, expire_on_commit=False)

BASE = "/api/v1/admin/instructors"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def admin_token(client, admin_credentials):
    resp = client.post(
        "/api/v1/auth/admin/login",
        json={"email": admin_credentials["email"], "password": admin_credentials["password"]},
    )
    assert resp.status_code == 200, f"Admin login failed: {resp.json()}"
    return resp.json()["access_token"]


@pytest.fixture(scope="module")
def instructor_token(client):
    """A regular instructor token — used to verify 403 on admin endpoints."""
    email = f"instructor_{uuid.uuid4()}@test.com"
    resp = client.post(
        "/api/v1/auth/register",
        json={"name": "Reg Instructor", "email": email, "password": "Pass123!"},
    )
    assert resp.status_code == 201
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _new_email() -> str:
    return f"inst_{uuid.uuid4()}@test.com"


# ── #604 Create instructor account ────────────────────────────────────────────

class TestCreateInstructor:
    # Verifies: Admin can create instructor.
    def test_admin_can_create_instructor(self, client, admin_token):
        resp = client.post(BASE, json={
            "name": "Jane Smith",
            "email": _new_email(),
            "password": "Secure123!",
        }, headers=_auth(admin_token))
        assert resp.status_code == 201
        data = resp.json()
        assert data["role"] == "instructor"
        assert data["is_active"] is True
        assert "id" in data
        assert "password" not in data
        assert "hashed_password" not in data

    # Verifies: Duplicate email rejected.
    def test_duplicate_email_rejected(self, client, admin_token):
        email = _new_email()
        client.post(BASE, json={"name": "A", "email": email, "password": "Pass123!"}, headers=_auth(admin_token))
        resp = client.post(BASE, json={"name": "B", "email": email, "password": "Pass123!"}, headers=_auth(admin_token))
        assert resp.status_code == 400

    # Verifies: Instructor cannot create instructor.
    def test_instructor_cannot_create_instructor(self, client, instructor_token):
        resp = client.post(BASE, json={
            "name": "X", "email": _new_email(), "password": "Pass123!",
        }, headers=_auth(instructor_token))
        assert resp.status_code == 403

    # Verifies: No token rejected.
    def test_no_token_rejected(self, client):
        resp = client.post(BASE, json={"name": "X", "email": _new_email(), "password": "Pass123!"})
        assert resp.status_code == 401


# ── List instructor accounts ───────────────────────────────────────────────────

class TestListInstructors:
    # Verifies: Admin can list instructors.
    def test_admin_can_list_instructors(self, client, admin_token):
        email = _new_email()
        create_resp = client.post(BASE, json={
            "name": "Listed Instructor",
            "email": email,
            "password": "Pass123!",
        }, headers=_auth(admin_token))
        created_id = create_resp.json()["id"]

        resp = client.get(BASE, headers=_auth(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert any(item["id"] == created_id for item in data)
        assert all(item["role"] == "instructor" for item in data)

    # Verifies: Instructor cannot list.
    def test_instructor_cannot_list(self, client, instructor_token):
        resp = client.get(BASE, headers=_auth(instructor_token))
        assert resp.status_code == 403

    # Verifies: No token rejected.
    def test_no_token_rejected(self, client):
        resp = client.get(BASE)
        assert resp.status_code == 401


# ── #606 Update instructor account ────────────────────────────────────────────

class TestUpdateInstructor:
    @pytest.fixture()
    def instructor_id(self, client, admin_token):
        resp = client.post(BASE, json={
            "name": "Before Update",
            "email": _new_email(),
            "password": "Pass123!",
        }, headers=_auth(admin_token))
        return resp.json()["id"]

    # Verifies: Admin can update name.
    def test_admin_can_update_name(self, client, admin_token, instructor_id):
        resp = client.patch(f"{BASE}/{instructor_id}", json={"name": "After Update"}, headers=_auth(admin_token))
        assert resp.status_code == 200
        assert resp.json()["name"] == "After Update"

    # Verifies: Admin can update email.
    def test_admin_can_update_email(self, client, admin_token, instructor_id):
        new_email = _new_email()
        resp = client.patch(f"{BASE}/{instructor_id}", json={"email": new_email}, headers=_auth(admin_token))
        assert resp.status_code == 200
        assert resp.json()["email"] == new_email

    # Verifies: Email conflict rejected.
    def test_email_conflict_rejected(self, client, admin_token, instructor_id):
        taken_email = _new_email()
        client.post(BASE, json={"name": "Other", "email": taken_email, "password": "Pass123!"}, headers=_auth(admin_token))
        resp = client.patch(f"{BASE}/{instructor_id}", json={"email": taken_email}, headers=_auth(admin_token))
        assert resp.status_code == 400

    # Verifies: Update unknown instructor.
    def test_update_unknown_instructor(self, client, admin_token):
        resp = client.patch(f"{BASE}/999999", json={"name": "Ghost"}, headers=_auth(admin_token))
        assert resp.status_code == 404

    # Verifies: Instructor cannot update.
    def test_instructor_cannot_update(self, client, instructor_token, instructor_id):
        resp = client.patch(f"{BASE}/{instructor_id}", json={"name": "Hacked"}, headers=_auth(instructor_token))
        assert resp.status_code == 403


# ── #605 Enable instructor account ────────────────────────────────────────────

class TestEnableInstructor:
    @pytest.fixture()
    def disabled_instructor_id(self, client, admin_token):
        resp = client.post(BASE, json={
            "name": "Disabled One",
            "email": _new_email(),
            "password": "Pass123!",
        }, headers=_auth(admin_token))
        iid = resp.json()["id"]
        client.post(f"{BASE}/{iid}/disable", headers=_auth(admin_token))
        return iid

    # Verifies: Admin can enable.
    def test_admin_can_enable(self, client, admin_token, disabled_instructor_id):
        resp = client.post(f"{BASE}/{disabled_instructor_id}/enable", headers=_auth(admin_token))
        assert resp.status_code == 200
        assert resp.json()["is_active"] is True

    # Verifies: Enable unknown instructor.
    def test_enable_unknown_instructor(self, client, admin_token):
        resp = client.post(f"{BASE}/999999/enable", headers=_auth(admin_token))
        assert resp.status_code == 404

    # Verifies: Instructor cannot enable.
    def test_instructor_cannot_enable(self, client, instructor_token, disabled_instructor_id):
        resp = client.post(f"{BASE}/{disabled_instructor_id}/enable", headers=_auth(instructor_token))
        assert resp.status_code == 403


# ── #608 Disable instructor account ───────────────────────────────────────────

class TestDisableInstructor:
    @pytest.fixture()
    def active_instructor_id(self, client, admin_token):
        resp = client.post(BASE, json={
            "name": "Active One",
            "email": _new_email(),
            "password": "Pass123!",
        }, headers=_auth(admin_token))
        return resp.json()["id"]

    # Verifies: Admin can disable.
    def test_admin_can_disable(self, client, admin_token, active_instructor_id):
        resp = client.post(f"{BASE}/{active_instructor_id}/disable", headers=_auth(admin_token))
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    # Verifies: Disable unknown instructor.
    def test_disable_unknown_instructor(self, client, admin_token):
        resp = client.post(f"{BASE}/999999/disable", headers=_auth(admin_token))
        assert resp.status_code == 404

    # Verifies: Instructor cannot disable.
    def test_instructor_cannot_disable(self, client, instructor_token, active_instructor_id):
        resp = client.post(f"{BASE}/{active_instructor_id}/disable", headers=_auth(instructor_token))
        assert resp.status_code == 403


# ── #607 Revoke instructor Canvas access ──────────────────────────────────────

class TestRevokeAccess:
    @pytest.fixture()
    def instructor_id(self, client, admin_token):
        resp = client.post(BASE, json={
            "name": "Canvas User",
            "email": _new_email(),
            "password": "Pass123!",
        }, headers=_auth(admin_token))
        return resp.json()["id"]

    # Verifies: Admin can revoke access.
    def test_admin_can_revoke_access(self, client, admin_token, instructor_id):
        resp = client.delete(f"{BASE}/{instructor_id}/access", headers=_auth(admin_token))
        assert resp.status_code == 204

    # Verifies: Revoke unknown instructor.
    def test_revoke_unknown_instructor(self, client, admin_token):
        resp = client.delete(f"{BASE}/999999/access", headers=_auth(admin_token))
        assert resp.status_code == 404

    # Verifies: Instructor cannot revoke.
    def test_instructor_cannot_revoke(self, client, instructor_token, instructor_id):
        resp = client.delete(f"{BASE}/{instructor_id}/access", headers=_auth(instructor_token))
        assert resp.status_code == 403

    # Verifies: Revoke idempotent.
    def test_revoke_idempotent(self, client, admin_token, instructor_id):
        client.delete(f"{BASE}/{instructor_id}/access", headers=_auth(admin_token))
        resp = client.delete(f"{BASE}/{instructor_id}/access", headers=_auth(admin_token))
        assert resp.status_code == 204


# ── #609 Audit log written for every action ───────────────────────────────────

class TestAuditLog:
    """Verify audit rows are created by checking the DB directly."""

    # Verifies: Create writes audit log.
    def test_create_writes_audit_log(self, client, admin_token):
        email = _new_email()
        resp = client.post(BASE, json={"name": "Audit Test", "email": email, "password": "Pass123!"},
                           headers=_auth(admin_token))
        assert resp.status_code == 201
        iid = resp.json()["id"]

        async def _check():
            engine, Session = _make_session()
            try:
                async with Session() as db:
                    return await db.scalar(
                        select(AuditLogSession).where(
                            AuditLogSession.action == "instructor_account_created",
                            AuditLogSession.details["instructor_id"].as_integer() == iid,
                        )
                    )
            finally:
                await engine.dispose()

        log = asyncio.run(_check())
        assert log is not None

    # Verifies: Disable writes audit log.
    def test_disable_writes_audit_log(self, client, admin_token):
        resp = client.post(BASE, json={"name": "Disable Audit", "email": _new_email(), "password": "Pass123!"},
                           headers=_auth(admin_token))
        iid = resp.json()["id"]
        client.post(f"{BASE}/{iid}/disable", headers=_auth(admin_token))

        async def _check():
            engine, Session = _make_session()
            try:
                async with Session() as db:
                    return await db.scalar(
                        select(AuditLogSession).where(
                            AuditLogSession.action == "instructor_account_disabled",
                            AuditLogSession.details["instructor_id"].as_integer() == iid,
                        )
                    )
            finally:
                await engine.dispose()

        log = asyncio.run(_check())
        assert log is not None

    # Verifies: Update writes audit log.
    def test_update_writes_audit_log(self, client, admin_token):
        resp = client.post(
            BASE,
            json={"name": "Update Audit", "email": _new_email(), "password": "Pass123!"},
            headers=_auth(admin_token),
        )
        iid = resp.json()["id"]
        client.patch(
            f"{BASE}/{iid}",
            json={"name": "Updated Name"},
            headers=_auth(admin_token),
        )

        async def _check():
            engine, Session = _make_session()
            try:
                async with Session() as db:
                    return await db.scalar(
                        select(AuditLogSession).where(
                            AuditLogSession.action == "instructor_account_updated",
                            AuditLogSession.details["instructor_id"].as_integer() == iid,
                        )
                    )
            finally:
                await engine.dispose()

        log = asyncio.run(_check())
        assert log is not None

    # Verifies: Enable writes audit log.
    def test_enable_writes_audit_log(self, client, admin_token):
        resp = client.post(
            BASE,
            json={"name": "Enable Audit", "email": _new_email(), "password": "Pass123!"},
            headers=_auth(admin_token),
        )
        iid = resp.json()["id"]
        client.post(f"{BASE}/{iid}/disable", headers=_auth(admin_token))
        client.post(f"{BASE}/{iid}/enable", headers=_auth(admin_token))

        async def _check():
            engine, Session = _make_session()
            try:
                async with Session() as db:
                    return await db.scalar(
                        select(AuditLogSession).where(
                            AuditLogSession.action == "instructor_account_enabled",
                            AuditLogSession.details["instructor_id"].as_integer() == iid,
                        )
                    )
            finally:
                await engine.dispose()

        log = asyncio.run(_check())
        assert log is not None

    # Verifies: Revoke writes audit log.
    def test_revoke_writes_audit_log(self, client, admin_token):
        resp = client.post(
            BASE,
            json={"name": "Revoke Audit", "email": _new_email(), "password": "Pass123!"},
            headers=_auth(admin_token),
        )
        iid = resp.json()["id"]
        client.delete(f"{BASE}/{iid}/access", headers=_auth(admin_token))

        async def _check():
            engine, Session = _make_session()
            try:
                async with Session() as db:
                    return await db.scalar(
                        select(AuditLogSession).where(
                            AuditLogSession.action == "instructor_access_revoked",
                            AuditLogSession.details["instructor_id"].as_integer() == iid,
                        )
                    )
            finally:
                await engine.dispose()

        log = asyncio.run(_check())
        assert log is not None
