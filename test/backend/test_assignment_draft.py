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


# ---------------------------------------------------------------------------
# Instructor-saved LLM credentials
#
# The generator used to build adapter settings straight from
# get_active_llm_config -- the deployment's provider, with no key attached at
# all. An instructor who had connected their own OpenAI key in Settings never
# got it: the draft ran on whatever the admin had selected, and if that
# provider had no server key the call simply failed.
# ---------------------------------------------------------------------------


def _connect_provider(client, headers, provider: str, api_key: str, model: str):
    """Saves an instructor's own key, as the Settings > AI Models tab does."""
    with patch(
        "app.services.llm.llm_connections.validate_api_key",
        new=AsyncMock(return_value=(True, None)),
    ):
        saved = client.put(
            f"/api/v1/llm/connections/{provider}",
            json={"api_key": api_key, "model": model},
            headers=headers,
        )
    assert saved.status_code == 200, saved.text


def test_generate_draft_uses_the_instructors_own_key_and_model(client):
    headers = _register(client)
    _connect_provider(client, headers, "openai", "sk-instructor-key", "gpt-4o-mini")

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"title": "Recursion Quiz", "description": "Cover base cases.", '
        '"due_at": null, "points_possible": 20}'
    )

    with (
        patch(
            "app.services.assignment_draft.get_llm_adapter", return_value=mock_adapter
        ) as adapter_factory,
        patch(
            "app.services.llm.llm_connections.validate_api_key",
            new=AsyncMock(return_value=(True, None)),
        ),
    ):
        response = client.post(
            "/api/v1/canvas/courses/1/assignments/generate-draft",
            json={
                "prompt": "Create a quiz on recursion",
                "model_settings": {"provider": "openai"},
            },
            headers=headers,
        )

    assert response.status_code == 200, response.text
    settings_used = adapter_factory.call_args.args[0]
    assert settings_used["provider"] == "openai"
    assert settings_used["api_key"] == "sk-instructor-key"
    # Their saved model, not the deployment default -- the request named a
    # provider without a model, so the connection is what supplies it.
    assert settings_used["model"] == "gpt-4o-mini"


def test_generate_draft_rejects_a_provider_the_instructor_has_not_connected(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    with patch(
        "app.services.assignment_draft.get_llm_adapter", return_value=mock_adapter
    ):
        response = client.post(
            "/api/v1/canvas/courses/1/assignments/generate-draft",
            json={
                "prompt": "Create a quiz on recursion",
                "model_settings": {"provider": "anthropic"},
            },
            headers=headers,
        )

    # 400, not 502: nothing is wrong with the generator. The instructor picked
    # a provider they have no key for, and the message says so.
    assert response.status_code == 400, response.text
    assert "not connected" in response.json()["detail"]
    mock_adapter.generate.assert_not_awaited()


def test_generate_draft_never_accepts_a_client_supplied_key(client):
    """The same boundary chat enforces: keys come from storage, not the wire."""
    headers = _register(client)

    response = client.post(
        "/api/v1/canvas/courses/1/assignments/generate-draft",
        json={
            "prompt": "Create a quiz on recursion",
            "model_settings": {"provider": "openai", "api_key": "sk-from-the-browser"},
        },
        headers=headers,
    )

    assert response.status_code == 422, response.text
