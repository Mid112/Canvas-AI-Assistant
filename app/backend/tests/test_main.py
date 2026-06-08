import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert "message" in response.json()


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_auth_ping():
    response = client.get("/api/v1/auth/ping")
    assert response.status_code == 200


def test_canvas_ping():
    response = client.get("/api/v1/canvas/ping")
    assert response.status_code == 200
