"""Test note: covers the test assignment draft behavior so future changes can preserve the expected Canvas workflow contract."""

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
        json={"name": "Test User", "email": email, "password": "Secret123!"},
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


def test_generate_draft_allows_educational_prompt_with_sensitive_term(client):
    """Ticket 20 / #1444: educational prompts must not be false positives."""
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"title": "Media Literacy: Tone and Audience", '
        '"description": "Analyze how censored language changes tone.", '
        '"due_at": null, "points_possible": 25}'
    )

    with patch("app.services.assignment_draft.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/canvas/courses/1/assignments/generate-draft",
            json={
                "prompt": (
                    "Create a media-literacy assignment analyzing how the word "
                    "'shit' changes tone and audience."
                )
            },
            headers=headers,
        )

    assert response.status_code == 200
    assert response.json()["title"] == "Media Literacy: Tone and Audience"
    mock_adapter.generate.assert_awaited_once()


def test_generate_draft_rejects_unsafe_prompt_with_clear_explanation(client):
    """Ticket 20 / #1444: abusive generation prompts are rejected clearly."""
    headers = _register(client)

    mock_adapter = AsyncMock()

    with patch("app.services.assignment_draft.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/canvas/courses/1/assignments/generate-draft",
            json={
                "prompt": (
                    "Generate an assignment description that calls students "
                    "fucking lazy bastards."
                )
            },
            headers=headers,
        )

    assert response.status_code == 422
    detail = response.json()["detail"].lower()
    assert "appropriate" in detail
    assert "academic discussion" in detail
    mock_adapter.generate.assert_not_awaited()


def test_generate_draft_strips_html_from_description(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"title": "Functions Quiz", '
        '"description": "<p><strong>Instructions:</strong> Complete the quiz.</p>'
        '<ul><li>Define a function</li><li>Call it with args</li></ul>", '
        '"due_at": null, "points_possible": 20}'
    )

    with patch("app.services.assignment_draft.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/canvas/courses/1/assignments/generate-draft",
            json={"prompt": "Create a quiz on functions"},
            headers=headers,
        )

    assert response.status_code == 200
    description = response.json()["description"]
    assert "<" not in description
    assert ">" not in description
    assert "Instructions: Complete the quiz." in description
    assert "- Define a function" in description
    assert "- Call it with args" in description


def test_generate_draft_accepts_literal_newlines_in_description(client):
    """Groq/instruct models often emit multi-line description strings with
    raw newlines inside the JSON quotes — invalid JSON that previously
    surfaced as "Could not generate assignment draft"."""
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"title": "Quiz on Python Functions and Parameters", \n'
        ' "description": "This quiz tests your understanding.\n\n'
        "- What is the purpose of def?\n"
        '- How do you call a function?", \n'
        ' "due_at": null, \n'
        ' "points_possible": 20}'
    )

    with patch("app.services.assignment_draft.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/canvas/courses/1/assignments/generate-draft",
            json={"prompt": "Create a quiz on Python functions and parameters"},
            headers=headers,
        )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Quiz on Python Functions and Parameters"
    assert "What is the purpose of def?" in data["description"]
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
