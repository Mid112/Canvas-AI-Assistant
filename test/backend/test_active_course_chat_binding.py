"""Active course preference binds to chat when local_course_id is omitted."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

CANVAS_URL = "https://canvas.ubc.ca"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_chat_uses_persisted_active_course_when_local_course_id_omitted(client):
    email = f"active_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Active Course Instructor", "email": email, "password": "secret123"},
    )
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": CANVAS_URL},
            headers=headers,
        )

    canvas_course_id = uuid.uuid4().int % 10_000_000
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = [{
            "id": canvas_course_id,
            "name": "COSC 111",
            "course_code": "COSC111",
            "enrollment_term_id": 1,
            "workflow_state": "available",
        }]
        courses = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
        local_course_id = courses.json()[0]["local_id"]
        client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_course_id},
            headers=headers,
        )

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action":"respond","message":"Using your active course."}'
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "Summarize this course"},
            headers=headers,
        )

    assert response.status_code == 200, response.text
    conversation_id = response.json()["conversation_id"]
    conversation = client.get(
        f"/api/v1/chat/conversations/{conversation_id}",
        headers=headers,
    )
    assert conversation.status_code == 200
    assert conversation.json()["course_id"] == local_course_id
