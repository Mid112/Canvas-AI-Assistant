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
        json={"name": "Feature User", "email": email, "password": "Secret123!"},
    )
    assert reg.status_code == 201
    token = reg.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_password_reset_request_unknown_email_returns_null_token(client):
    request = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": f"missing_{uuid.uuid4()}@example.com"},
    )
    assert request.status_code == 200
    body = request.json()
    assert "If an account exists" in body["message"]
    assert body["reset_token"] is None


def test_password_reset_request_hides_token_when_debug_disabled(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "DEBUG", False)
    email = f"reset_prod_{uuid.uuid4()}@example.com"
    client.post(
        "/api/v1/auth/register",
        json={"name": "Reset User", "email": email, "password": "Secret123!"},
    )
    request = client.post("/api/v1/auth/password-reset/request", json={"email": email})
    assert request.status_code == 200
    body = request.json()
    assert "If an account exists" in body["message"]
    assert body["reset_token"] is None


def test_security_status(client):
    headers = _register(client)
    resp = client.get("/api/v1/auth/me/security", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["active_session_count"] >= 1
