import uuid
from unittest.mock import AsyncMock, patch

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


def test_generate_quiz_draft_success(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"title": "Recursion Quiz", "description": "Cover base cases.", '
        '"due_at": null, "points_possible": 20, "allowed_attempts": 2, '
        '"time_limit": 30, "questions": ['
        '{"question_text": "What is a base case?", "question_type": "essay_question", '
        '"points_possible": 5, "answers": []}]}'
    )

    with patch("app.services.quiz_draft.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/canvas/courses/1/quizzes/generate-draft",
            json={"prompt": "Create a quiz on recursion with essay questions"},
            headers=headers,
        )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Recursion Quiz"
    assert data["points_possible"] == 20
    assert data["allowed_attempts"] == 2
    assert data["time_limit"] == 30
    assert len(data["questions"]) == 1
    assert data["questions"][0]["question_text"] == "What is a base case?"
