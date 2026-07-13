"""
Integration: administrator workflows (#712 / parent #687).

Covers the admin operational sequence end-to-end:
  login → dashboard → settings → create instructor → list → disable →
  verify instructor lockout → audit logs → re-enable.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from integration_helpers import admin_login, auth, register_instructor

INSTRUCTORS = "/api/v1/admin/instructors"


@pytest.fixture(scope="module")
def client():
    app.state.limiter.enabled = False
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


@pytest.fixture(scope="module")
def admin_headers(client, admin_credentials):
    return admin_login(client, admin_credentials)


# Verifies: Admin can load dashboard and settings.
def test_admin_dashboard_and_settings(client, admin_headers):
    dashboard = client.get("/api/v1/admin/dashboard", headers=admin_headers)
    assert dashboard.status_code == 200
    assert "instructor_count" in dashboard.json()

    settings = client.get("/api/v1/admin/settings", headers=admin_headers)
    assert settings.status_code == 200
    assert "settings" in settings.json()
    assert "allow_instructor_self_registration" in settings.json()["settings"]


# Verifies: Admin user-management lifecycle and instructor lockout.
def test_admin_instructor_lifecycle_disable_blocks_access(client, admin_headers):
    email = f"adminflow_{uuid.uuid4()}@example.com"
    password = "Secure123!"

    created = client.post(
        INSTRUCTORS,
        json={"name": "Managed Instructor", "email": email, "password": password},
        headers=admin_headers,
    )
    assert created.status_code == 201, created.json()
    instructor_id = created.json()["id"]
    assert created.json()["is_active"] is True

    listed = client.get(INSTRUCTORS, headers=admin_headers)
    assert listed.status_code == 200
    assert any(item["id"] == instructor_id for item in listed.json())

    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200
    instructor_headers = auth(login.json()["access_token"])

    me = client.get("/api/v1/auth/me", headers=instructor_headers)
    assert me.status_code == 200

    disabled = client.post(
        f"{INSTRUCTORS}/{instructor_id}/disable",
        headers=admin_headers,
    )
    assert disabled.status_code == 200
    assert disabled.json()["is_active"] is False

    blocked = client.get("/api/v1/auth/me", headers=instructor_headers)
    assert blocked.status_code == 401

    enabled = client.post(
        f"{INSTRUCTORS}/{instructor_id}/enable",
        headers=admin_headers,
    )
    assert enabled.status_code == 200
    assert enabled.json()["is_active"] is True


# Verifies: Admin can read institution audit logs.
def test_admin_can_read_audit_logs(client, admin_headers):
    instructor = register_instructor(client, prefix="auditsubject")
    # Touch an authenticated instructor endpoint so session/user activity exists.
    client.get("/api/v1/auth/me", headers=instructor["headers"])

    resp = client.get("/api/v1/admin/audit/logs", headers=admin_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


# Verifies: Admin can update organization settings.
def test_admin_settings_round_trip(client, admin_headers):
    original = client.get("/api/v1/admin/settings", headers=admin_headers)
    assert original.status_code == 200
    org_name = original.json()["settings"]["organization_name"]

    patched = client.patch(
        "/api/v1/admin/settings",
        json={"settings": {"organization_name": "Integration U"}},
        headers=admin_headers,
    )
    assert patched.status_code == 200
    assert patched.json()["settings"]["organization_name"] == "Integration U"

    restore = client.patch(
        "/api/v1/admin/settings",
        json={"settings": {"organization_name": org_name}},
        headers=admin_headers,
    )
    assert restore.status_code == 200
    assert restore.json()["settings"]["organization_name"] == org_name
