import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# Verifies: Root.
def test_root(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "message" in response.json()


# Verifies: Health.
def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
