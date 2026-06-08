from fastapi.testclient import TestClient
from app.backend.app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_root(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "message" in response.json()


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_canvas_ping(client):
    response = client.get("/api/v1/canvas/ping")
    assert response.status_code == 200
