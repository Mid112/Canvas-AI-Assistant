"""Test note: covers the test feedback draft behavior so future changes can preserve the expected Canvas workflow contract."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def _register(client) -> dict:
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "Secret123!"},
    )
    token = reg.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_generate_feedback_draft_success(client):
    headers = _register(client)
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"new_grade": "85", "feedback": "Strong work on the base case explanation."}'
    )

    with (
        patch(
            "app.services.feedback_draft.verify_assignment_in_course",
            new=AsyncMock(),
        ),
        patch(
            "app.services.feedback_draft.verify_canvas_student_in_course",
            new=AsyncMock(),
        ),
        patch(
            "app.services.feedback_draft.get_llm_adapter",
            return_value=mock_adapter,
        ),
    ):
        response = client.post(
            "/api/v1/canvas/courses/1/feedback/generate-draft",
            json={
                "prompt": "Draft encouraging feedback about recursion clarity.",
                "assignment_id": 44,
                "student_id": 77,
                "assignment_name": "Recursion Homework",
                "student_name": "Alex Chen",
            },
            headers=headers,
        )

    assert response.status_code == 200, response.json()
    data = response.json()
    assert data["new_grade"] == "85"
    assert "base case" in data["feedback"]
    # UI still gets the student name, but the LLM prompt must not (#908).
    assert data["student_name"] == "Alex Chen"
    llm_prompt = mock_adapter.generate.await_args.args[1]
    assert "Alex Chen" not in llm_prompt
    assert "selected enrolled student" in llm_prompt
