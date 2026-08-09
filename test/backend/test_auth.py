import uuid
import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import hash_token
from app.main import app
from app.models.session import Session

CANVAS_URL = "https://canvas.example.edu"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# Verifies: Register.
def test_register(client):
    email = f"test_{uuid.uuid4()}@example.com"
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "Secret123!"}
    )
    assert response.status_code == 201
    assert "access_token" in response.json()
    assert response.json()["token_type"] == "bearer"


# Verifies: Login.
def test_login(client):
    email = f"test_{uuid.uuid4()}@example.com"
    client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "Secret123!"}
    )
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Secret123!"}
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


# Verifies: Login wrong password.
def test_login_wrong_password(client):
    email = f"test_{uuid.uuid4()}@example.com"
    client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "Secret123!"}
    )
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "wrongpass"}
    )
    assert response.status_code == 401


# Verifies: Expired session rejected.
def test_expired_session_rejected(client):
    """#590 — expired DB sessions are rejected even when the JWT is still valid."""
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "Secret123!"},
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    async def _expire_session():
        engine = create_async_engine(settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                session = await db.scalar(
                    select(Session).where(Session.token_hash == hash_token(token))
                )
                assert session is not None
                session.expires_at = datetime.now(UTC) - timedelta(minutes=5)
                await db.commit()
        finally:
            await engine.dispose()

    asyncio.run(_expire_session())

    response = client.get("/api/v1/auth/me", headers=headers)
    assert response.status_code == 401
    assert response.json()["detail"] == "Session expired or invalid"


# Verifies: Register duplicate email.
def test_register_duplicate_email(client):
    email = f"test_{uuid.uuid4()}@example.com"
    client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "Secret123!"}
    )
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "Secret123!"}
    )
    assert response.status_code == 400


# Verifies: Get current user.
def test_get_current_user(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "Secret123!"}
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


# Verifies: Get current user invalid token.
def test_get_current_user_invalid_token(client):
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalidtoken"}
    )
    assert response.status_code == 401


# Verifies: Update current user.
def test_update_current_user(client):
    email = f"test_{uuid.uuid4()}@example.com"
    new_email = f"updated_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "Secret123!"}
    )
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    response = client.patch(
        "/api/v1/auth/me",
        json={"name": "Updated User", "email": new_email},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Updated User"
    assert response.json()["email"] == new_email


# Verifies: Update current user duplicate email.
def test_update_current_user_duplicate_email(client):
    email_a = f"test_{uuid.uuid4()}@example.com"
    email_b = f"test_{uuid.uuid4()}@example.com"
    client.post(
        "/api/v1/auth/register",
        json={"name": "User A", "email": email_a, "password": "Secret123!"}
    )
    reg_b = client.post(
        "/api/v1/auth/register",
        json={"name": "User B", "email": email_b, "password": "Secret123!"}
    )
    headers_b = {"Authorization": f"Bearer {reg_b.json()['access_token']}"}

    response = client.patch(
        "/api/v1/auth/me",
        json={"email": email_a},
        headers=headers_b,
    )

    assert response.status_code == 400


# Verifies: Delete current user.
def test_delete_current_user(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Delete Me", "email": email, "password": "Secret123!"}
    )
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    missing_password = client.delete("/api/v1/auth/me", headers=headers)
    assert missing_password.status_code == 422

    response = client.request(
        "DELETE",
        "/api/v1/auth/me",
        json={"password": "Secret123!"},
        headers=headers,
    )

    assert response.status_code == 204
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401


# Verifies: Set canvas token.
def test_set_canvas_token(client):
    email = f"test_{uuid.uuid4()}@example.com"
    canvas_token = f"fake-token-{uuid.uuid4()}"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "Secret123!", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    assert client.get("/api/v1/auth/me", headers=headers).json()["has_canvas_token"] is False

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        resp = client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": canvas_token, "canvas_url": CANVAS_URL},
            headers=headers,
        )
    assert resp.status_code == 200
    assert resp.json()["has_canvas_token"] is True
    assert len(resp.json()["canvas_connections"]) == 1

    assert client.get("/api/v1/auth/me", headers=headers).json()["has_canvas_token"] is True


# Verifies: The same Canvas token cannot be connected to another instructor,
# even when the second instructor uses a different Canvas URL.
def test_set_canvas_token_rejects_token_already_used_by_another_instructor(client):
    first_email = f"test_{uuid.uuid4()}@example.com"
    second_email = f"test_{uuid.uuid4()}@example.com"
    first = client.post(
        "/api/v1/auth/register",
        json={"email": first_email, "password": "Secret123!", "name": "First User"},
    )
    second = client.post(
        "/api/v1/auth/register",
        json={"email": second_email, "password": "Secret123!", "name": "Second User"},
    )
    first_headers = {"Authorization": f"Bearer {first.json()['access_token']}"}
    second_headers = {"Authorization": f"Bearer {second.json()['access_token']}"}
    shared_token = f"shared-canvas-token-{uuid.uuid4()}"

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        first_response = client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": shared_token, "canvas_url": CANVAS_URL},
            headers=first_headers,
        )
        second_response = client.patch(
            "/api/v1/auth/me/canvas-token",
            json={
                "canvas_token": shared_token,
                "canvas_url": "https://canvas.other.example.edu",
            },
            headers=second_headers,
        )

    assert first_response.status_code == 200
    assert second_response.status_code == 409
    assert second_response.json()["detail"] == "This Canvas token is already in use."


# Verifies: Validate canvas token.
def test_validate_canvas_token(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "Secret123!", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch(
        "app.routers.auth.check_token_status",
        new=AsyncMock(return_value="valid"),
    ):
        resp = client.post(
            "/api/v1/auth/me/canvas-token/validate",
            json={"canvas_token": "test-token", "canvas_url": CANVAS_URL},
            headers=headers,
        )

    assert resp.status_code == 200
    assert resp.json()["status"] == "valid"


# Verifies: Validate canvas token requires auth.
def test_validate_canvas_token_requires_auth(client):
    resp = client.post(
        "/api/v1/auth/me/canvas-token/validate",
        json={"canvas_token": "test-token", "canvas_url": CANVAS_URL},
    )
    assert resp.status_code == 401


# Verifies: Canvas token save requires a Canvas URL.
def test_set_canvas_token_requires_canvas_url(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "Secret123!", "name": "Test User"})
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    resp = client.patch(
        "/api/v1/auth/me/canvas-token",
        json={"canvas_token": "fake-token"},
        headers=headers,
    )

    assert resp.status_code == 422


# Verifies: Canvas token validation requires a Canvas URL.
def test_validate_canvas_token_requires_canvas_url(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "Secret123!", "name": "Test User"})
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    resp = client.post(
        "/api/v1/auth/me/canvas-token/validate",
        json={"canvas_token": "test-token"},
        headers=headers,
    )

    assert resp.status_code == 422


# Verifies: Set canvas token second school.
def test_set_canvas_token_second_school(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "Secret123!", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    first_canvas_token = f"token-example-{uuid.uuid4()}"
    second_canvas_token = f"token-sfu-{uuid.uuid4()}"

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch("/api/v1/auth/me/canvas-token", json={"canvas_token": first_canvas_token, "canvas_url": CANVAS_URL}, headers=headers)
        client.patch("/api/v1/auth/me/canvas-token", json={"canvas_token": second_canvas_token, "canvas_url": "https://canvas.sfu.ca"}, headers=headers)

    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert me["has_canvas_token"] is True
    assert len(me["canvas_connections"]) == 2
    urls = {c["canvas_url"] for c in me["canvas_connections"]}
    assert urls == {CANVAS_URL, "https://canvas.sfu.ca"}


# Verifies: Set canvas token upsert same school.
def test_set_canvas_token_upsert_same_school(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "Secret123!", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    old_canvas_token = f"old-token-{uuid.uuid4()}"
    new_canvas_token = f"new-token-{uuid.uuid4()}"

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": old_canvas_token, "canvas_url": CANVAS_URL},
            headers=headers,
        )
        resp = client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": new_canvas_token, "canvas_url": CANVAS_URL},
            headers=headers,
        )

    assert resp.status_code == 200
    assert len(resp.json()["canvas_connections"]) == 1


# Verifies: Set canvas token invalid returns 422.
def test_set_canvas_token_invalid_returns_422(client):
    from fastapi import HTTPException

    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "Secret123!", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch(
        "app.services.auth.validate_token",
        new=AsyncMock(side_effect=HTTPException(
            status_code=422,
            detail="Invalid Canvas API token",
        )),
    ):
        resp = client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "bad-token", "canvas_url": CANVAS_URL},
            headers=headers,
        )
    assert resp.status_code == 422
    assert "Invalid Canvas API token" in resp.json()["detail"]


# Verifies: Set canvas token empty string rejected.
def test_set_canvas_token_empty_string_rejected(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "Secret123!", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.patch(
        "/api/v1/auth/me/canvas-token",
        json={"canvas_token": "", "canvas_url": CANVAS_URL},
        headers=headers,
    )
    assert resp.status_code == 422


# Verifies: Canvas url must be https.
def test_canvas_url_must_be_https(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "Secret123!", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.patch("/api/v1/auth/me/canvas-token", json={"canvas_token": "tok", "canvas_url": "http://evil.com/api/v1"}, headers=headers)
    assert resp.status_code == 422


# Verifies: Debug allows canvas lms http url.
def test_debug_allows_canvas_lms_http_url(client, monkeypatch):
    monkeypatch.setattr(settings, "DEBUG", True)
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "Secret123!", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    canvas_token = f"tok-{uuid.uuid4()}"

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        resp = client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": canvas_token, "canvas_url": "http://canvas_lms:3000"},
            headers=headers,
        )

    assert resp.status_code == 200


# Verifies: Debug rejects untrusted http url.
def test_debug_rejects_untrusted_http_url(client, monkeypatch):
    monkeypatch.setattr(settings, "DEBUG", True)
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "Secret123!", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.patch("/api/v1/auth/me/canvas-token", json={"canvas_token": "tok", "canvas_url": "http://evil.com"}, headers=headers)
    assert resp.status_code == 422


# Verifies: Local Docker/dev hosts may use http even when DEBUG is off —
# they are not reachable from the public internet (see CanvasTokenRequest).
def test_non_debug_allows_localhost_http_url(client, monkeypatch):
    monkeypatch.setattr(settings, "DEBUG", False)
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "Secret123!", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    canvas_token = f"tok-{uuid.uuid4()}"

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        resp = client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": canvas_token, "canvas_url": "http://localhost:3000"},
            headers=headers,
        )
    assert resp.status_code == 200


# Verifies: Delete canvas connection.
def test_delete_canvas_connection(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "Secret123!", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    canvas_token = f"tok-{uuid.uuid4()}"

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        resp = client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": canvas_token, "canvas_url": CANVAS_URL},
            headers=headers,
        )
    connection_id = resp.json()["canvas_connections"][0]["id"]

    assert client.delete(f"/api/v1/auth/me/canvas-connections/{connection_id}", headers=headers).status_code == 204
    assert client.get("/api/v1/auth/me", headers=headers).json()["has_canvas_token"] is False


# Verifies: Delete canvas connection not found.
def test_delete_canvas_connection_not_found(client):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post("/api/v1/auth/register", json={"email": email, "password": "Secret123!", "name": "Test User"})
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    assert client.delete("/api/v1/auth/me/canvas-connections/99999", headers=headers).status_code == 404


# Verifies: Delete canvas connection wrong user.
def test_delete_canvas_connection_wrong_user(client):
    email_a = f"test_{uuid.uuid4()}@example.com"
    email_b = f"test_{uuid.uuid4()}@example.com"
    reg_a = client.post("/api/v1/auth/register", json={"email": email_a, "password": "Secret123!", "name": "User A"})
    reg_b = client.post("/api/v1/auth/register", json={"email": email_b, "password": "Secret123!", "name": "User B"})
    headers_a = {"Authorization": f"Bearer {reg_a.json()['access_token']}"}
    headers_b = {"Authorization": f"Bearer {reg_b.json()['access_token']}"}
    canvas_token = f"tok-{uuid.uuid4()}"

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        resp = client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": canvas_token, "canvas_url": CANVAS_URL},
            headers=headers_a,
        )
    connection_id = resp.json()["canvas_connections"][0]["id"]

    assert client.delete(f"/api/v1/auth/me/canvas-connections/{connection_id}", headers=headers_b).status_code == 404
