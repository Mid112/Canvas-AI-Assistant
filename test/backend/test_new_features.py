"""Tests for newly added backend features."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register(client) -> dict:
    email = f"feat_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Feature User", "email": email, "password": "secret123"},
    )
    assert reg.status_code == 201
    token = reg.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# Verifies: Logout.
def test_logout(client):
    headers = _register(client)
    logout = client.post("/api/v1/auth/logout", headers=headers)
    assert logout.status_code == 204
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 401


# Verifies: Profile update.
def test_profile_update(client):
    headers = _register(client)
    resp = client.patch(
        "/api/v1/auth/me",
        json={"name": "Updated Name"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"


# Verifies: Notification settings.
def test_notification_settings(client):
    headers = _register(client)
    settings = {"workflow-approvals": True, "grade-updates": False}
    resp = client.patch(
        "/api/v1/auth/me/notifications",
        json={"settings": settings},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["workflow-approvals"] is True


# Verifies: Password reset flow.
def test_password_reset_flow(client):
    email = f"reset_{uuid.uuid4()}@example.com"
    client.post(
        "/api/v1/auth/register",
        json={"name": "Reset User", "email": email, "password": "secret123"},
    )
    request = client.post("/api/v1/auth/password-reset/request", json={"email": email})
    assert request.status_code == 204


# Verifies: Security status.
def test_security_status(client):
    headers = _register(client)
    resp = client.get("/api/v1/auth/me/security", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["active_session_count"] >= 1


# Verifies: Message draft crud.
def test_message_draft_crud(client):
    headers = _register(client)
    create = client.post(
        "/api/v1/messages/drafts",
        json={
            "subject": "Hello",
            "body": "Test body",
            "recipients": [{"id": "1", "name": "Alex", "email": "a@x.com"}],
        },
        headers=headers,
    )
    assert create.status_code == 201
    draft_id = create.json()["id"]

    get = client.get(f"/api/v1/messages/drafts/{draft_id}", headers=headers)
    assert get.status_code == 200
    assert get.json()["subject"] == "Hello"


# Verifies: Workflow history empty.
def test_workflow_history_empty(client):
    headers = _register(client)
    resp = client.get("/api/v1/history/workflows", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 0
