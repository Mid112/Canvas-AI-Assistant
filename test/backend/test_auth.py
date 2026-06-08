import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_register(client):
    email = f"test_{uuid.uuid4()}@example.com"
    response = client.post("/api/v1/auth/register", json={"email": email, "password": "secret123"})
    assert response.status_code == 201
    assert "access_token" in response.json()
    assert response.json()["token_type"] == "bearer"


def test_login(client):
    email = f"test_{uuid.uuid4()}@example.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "secret123"})
    response = client.post("/api/v1/auth/login", json={"email": email, "password": "secret123"})
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_login_wrong_password(client):
    email = f"test_{uuid.uuid4()}@example.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "secret123"})
    response = client.post("/api/v1/auth/login", json={"email": email, "password": "wrongpass"})
    assert response.status_code == 401


def test_register_duplicate_email(client):
    email = f"test_{uuid.uuid4()}@example.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "secret123"})
    response = client.post("/api/v1/auth/register", json={"email": email, "password": "secret123"})
    assert response.status_code == 400
