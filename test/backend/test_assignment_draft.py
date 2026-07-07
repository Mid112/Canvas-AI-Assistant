import uuid
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register(client) -> dict:
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _rate_limit_error() -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    response = httpx.Response(429, request=request)
    return httpx.HTTPStatusError("rate limited", request=request, response=response)


def _server_error() -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    response = httpx.Response(500, request=request)
    return httpx.HTTPStatusError("server error", request=request, response=response)


def test_generate_draft_success(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '<think>reasoning about the quiz</think>\n'
        '{"title": "Recursion Quiz", "description": "Cover base cases.", '
        '"due_at": null, "points_possible": 20}'
    )

    with patch("app.services.assignment_draft.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/canvas/courses/1/assignments/generate-draft",
            json={"prompt": "Create a quiz on recursion"},
            headers=headers,
        )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Recursion Quiz"
    assert data["points_possible"] == 20


def test_generate_draft_unparseable_response(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = "<think>never finished thinking"

    with patch("app.services.assignment_draft.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/canvas/courses/1/assignments/generate-draft",
            json={"prompt": "Create a quiz on recursion"},
            headers=headers,
        )

    assert response.status_code == 502
    assert response.json()["detail"] == "Could not generate assignment draft"


def test_generate_draft_rate_limited(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = _rate_limit_error()

    with patch("app.services.assignment_draft.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/canvas/courses/1/assignments/generate-draft",
            json={"prompt": "Create a quiz on recursion"},
            headers=headers,
        )

    assert response.status_code == 429
    assert "rate-limited" in response.json()["detail"]


def test_generate_draft_llm_service_error(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = _server_error()

    with patch("app.services.assignment_draft.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/canvas/courses/1/assignments/generate-draft",
            json={"prompt": "Create a quiz on recursion"},
            headers=headers,
        )

    assert response.status_code == 502
    assert "temporarily unavailable" in response.json()["detail"]
