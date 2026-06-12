import uuid
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_register(client):
    email = f"test_{uuid.uuid4()}@example.com"
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "secret123"}
    )
    assert response.status_code == 201
    assert "access_token" in response.json()
    assert response.json()["token_type"] == "bearer"


def test_login(client):
    email = f"test_{uuid.uuid4()}@example.com"
    client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "secret123"}
    )
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "secret123"}
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_login_wrong_password(client):
    email = f"test_{uuid.uuid4()}@example.com"
    client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "secret123"}
    )
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "wrongpass"}
    )
    assert response.status_code == 401


def test_register_duplicate_email(client):
    email = f"test_{uuid.uuid4()}@example.com"
    client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "secret123"}
    )
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "secret123"}
    )
    assert response.status_code == 400


def test_get_current_user(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "secret123"}
    )
    token = reg.json()["access_token"]
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json()["email"] == email
    assert response.json()["name"] == "Test User"
    assert response.json()["is_active"] is True
    assert response.json()["role"] == "instructor"
    assert response.json()["has_canvas_token"] is False


def test_get_current_user_invalid_token(client):
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalidtoken"}
    )
    assert response.status_code == 401


def test_set_canvas_token(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "secret123", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    assert client.get("/api/v1/auth/me", headers=headers).json()["has_canvas_token"] is False

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        resp = client.patch("/api/v1/auth/me/canvas-token", json={"canvas_token": "fake-token"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["has_canvas_token"] is True

    assert client.get("/api/v1/auth/me", headers=headers).json()["has_canvas_token"] is True
