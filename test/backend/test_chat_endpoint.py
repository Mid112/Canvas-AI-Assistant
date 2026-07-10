import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException, status
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


def test_no_auth(client):
    response = client.post("/api/v1/chat/", json={"message": "hello"})
    assert response.status_code == 401


def test_llm_error(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = Exception("connection refused")

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "List my courses"},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is True
    assert "error" in body["reply"]


def test_invalid_json(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = "this is not json"

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "List my courses"},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is True


def test_user_log(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "fetch_courses"}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter), \
         patch("app.mcp_tools.dispatcher.get_courses", new=AsyncMock(return_value=[])):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "List my courses"},
            headers=headers,
        )

    assert response.status_code == 200
    conversation_id = response.json()["conversation_id"]

    history = client.get(f"/api/v1/chat/conversations/{conversation_id}", headers=headers)
    assert history.status_code == 200
    roles = [m["role"] for m in history.json()["messages"]]
    assert "user" in roles


def test_list_conversations_requires_auth(client):
    response = client.get("/api/v1/chat/conversations")
    assert response.status_code == 401


def test_list_conversations(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "respond", "message": "Hello from history."}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "Can you help?"},
            headers=headers,
        )

    assert response.status_code == 200
    conversation_id = response.json()["conversation_id"]

    history = client.get("/api/v1/chat/conversations?limit=10", headers=headers)

    assert history.status_code == 200
    body = history.json()
    assert body["total"] >= 1
    assert body["items"][0]["id"] == conversation_id
    assert body["items"][0]["message_count"] == 2
    assert body["items"][0]["preview"] is not None


def test_conversation_history_is_scoped_to_current_user(client):
    owner_headers = _register(client)
    other_headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "respond", "message": "Private transcript."}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "remember this"},
            headers=owner_headers,
        )

    assert response.status_code == 200
    conversation_id = response.json()["conversation_id"]

    other_list = client.get("/api/v1/chat/conversations", headers=other_headers)
    assert other_list.status_code == 200
    assert conversation_id not in [item["id"] for item in other_list.json()["items"]]

    other_detail = client.get(
        f"/api/v1/chat/conversations/{conversation_id}",
        headers=other_headers,
    )
    assert other_detail.status_code == 404


def test_conversation_detail_includes_pending_action_status(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "intent_preview", "summary": "List your courses", '
        '"proposed_action": {"action": "fetch_courses"}}'
    )

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "what courses do I have?"},
            headers=headers,
        )

    assert response.status_code == 200
    conversation_id = response.json()["conversation_id"]
    pending_message_id = response.json()["reply"]["pending_message_id"]

    history = client.get(f"/api/v1/chat/conversations/{conversation_id}", headers=headers)
    assert history.status_code == 200
    pending_message = next(
        message
        for message in history.json()["messages"]
        if message["id"] == pending_message_id
    )
    assert pending_message["pending_action_status"] == "pending"


def test_canvas_failure_returns_chat_error(client):
    """Canvas API failures during read actions return a user-friendly chat error."""
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": "https://canvas.ubc.ca"},
            headers=headers,
        )

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "fetch_courses"}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter), \
         patch(
             "app.mcp_tools.dispatcher.get_courses",
             new=AsyncMock(
                 side_effect=HTTPException(
                     status_code=status.HTTP_502_BAD_GATEWAY,
                     detail="Canvas server error: 503",
                 )
             ),
         ):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "List my courses"},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is True
    assert body["reply"]["error"] == "Canvas server error: 503"
