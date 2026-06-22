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
    assert response.json()["canvas_connections"] == []


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
    assert len(resp.json()["canvas_connections"]) == 1

    assert client.get("/api/v1/auth/me", headers=headers).json()["has_canvas_token"] is True


def test_validate_canvas_token(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "secret123", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch(
        "app.routers.auth.check_token_status",
        new=AsyncMock(return_value="valid"),
    ):
        resp = client.post(
            "/api/v1/auth/me/canvas-token/validate",
            json={"canvas_token": "test-token"},
            headers=headers,
        )

    assert resp.status_code == 200
    assert resp.json()["status"] == "valid"


def test_validate_canvas_token_requires_auth(client):
    resp = client.post(
        "/api/v1/auth/me/canvas-token/validate",
        json={"canvas_token": "test-token"},
    )
    assert resp.status_code == 403


def test_set_canvas_token_second_school(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "secret123", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch("/api/v1/auth/me/canvas-token", json={"canvas_token": "token-ubc", "canvas_url": "https://canvas.ubc.ca"}, headers=headers)
        client.patch("/api/v1/auth/me/canvas-token", json={"canvas_token": "token-sfu", "canvas_url": "https://canvas.sfu.ca"}, headers=headers)

    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert me["has_canvas_token"] is True
    assert len(me["canvas_connections"]) == 2
    urls = {c["canvas_url"] for c in me["canvas_connections"]}
    assert urls == {"https://canvas.ubc.ca", "https://canvas.sfu.ca"}


def test_set_canvas_token_upsert_same_school(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "secret123", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch("/api/v1/auth/me/canvas-token", json={"canvas_token": "old-token"}, headers=headers)
        resp = client.patch("/api/v1/auth/me/canvas-token", json={"canvas_token": "new-token"}, headers=headers)

    assert resp.status_code == 200
    assert len(resp.json()["canvas_connections"]) == 1


def test_set_canvas_token_invalid_returns_422(client):
    from fastapi import HTTPException

    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "secret123", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch(
        "app.services.auth.validate_token",
        new=AsyncMock(side_effect=HTTPException(
            status_code=422,
            detail="Invalid Canvas API token",
        )),
    ):
        resp = client.patch("/api/v1/auth/me/canvas-token", json={"canvas_token": "bad-token"}, headers=headers)
    assert resp.status_code == 422
    assert "Invalid Canvas API token" in resp.json()["detail"]


def test_set_canvas_token_empty_string_rejected(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "secret123", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.patch("/api/v1/auth/me/canvas-token", json={"canvas_token": ""}, headers=headers)
    assert resp.status_code == 422


def test_canvas_url_must_be_https(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "secret123", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.patch("/api/v1/auth/me/canvas-token", json={"canvas_token": "tok", "canvas_url": "http://evil.com/api/v1"}, headers=headers)
    assert resp.status_code == 422


def test_delete_canvas_connection(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "secret123", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        resp = client.patch("/api/v1/auth/me/canvas-token", json={"canvas_token": "tok"}, headers=headers)
    connection_id = resp.json()["canvas_connections"][0]["id"]

    assert client.delete(f"/api/v1/auth/me/canvas-connections/{connection_id}", headers=headers).status_code == 204
    assert client.get("/api/v1/auth/me", headers=headers).json()["has_canvas_token"] is False


def test_delete_canvas_connection_not_found(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "secret123", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    assert client.delete("/api/v1/auth/me/canvas-connections/99999", headers=headers).status_code == 404


def test_delete_canvas_connection_wrong_user(client):
    email_a = f"test_{uuid.uuid4()}@example.com"
    email_b = f"test_{uuid.uuid4()}@example.com"
    reg_a = client.post("/api/v1/auth/register", json={"email": email_a, "password": "secret123", "name": "User A"})
    reg_b = client.post("/api/v1/auth/register", json={"email": email_b, "password": "secret123", "name": "User B"})
    headers_a = {"Authorization": f"Bearer {reg_a.json()['access_token']}"}
    headers_b = {"Authorization": f"Bearer {reg_b.json()['access_token']}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        resp = client.patch("/api/v1/auth/me/canvas-token", json={"canvas_token": "tok"}, headers=headers_a)
    connection_id = resp.json()["canvas_connections"][0]["id"]

    assert client.delete(f"/api/v1/auth/me/canvas-connections/{connection_id}", headers=headers_b).status_code == 404
