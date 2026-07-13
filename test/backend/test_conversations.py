"""Integration tests for GET /messages/conversations and
GET /messages/conversations/{conversation_id} — Feature A (view a full
message thread). Read-through against Canvas, no local persistence."""
import asyncio
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import decode_access_token
from app.main import app
from app.models.canvas_connection import CanvasConnection

CANVAS_URL = "https://canvas.ubc.ca"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> dict:
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
            json={"canvas_token": "test-token", "canvas_url": CANVAS_URL},
            headers=headers,
        )
    return headers


def _sync_local_course(client, headers) -> int:
    canvas_id = uuid.uuid4().int % 10_000_000
    course = {
        "id": canvas_id,
        "name": "CPSC 310",
        "course_code": "CPSC310",
        "enrollment_term_id": 1,
        "workflow_state": "available",
    }
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = [course]
        response = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert response.status_code == 200
    return response.json()[0]["local_id"]


MOCK_CONVERSATIONS = [
    {
        "id": 501,
        "subject": "Question about Assignment 1",
        "workflow_state": "read",
        "last_message": "Thanks for clarifying!",
        "last_message_at": "2026-06-01T12:00:00Z",
        "message_count": 3,
        "participants": [{"id": 1, "name": "Dr. Jane Doe"}, {"id": 2, "name": "Student One"}],
    }
]

MOCK_THREAD = {
    "id": 501,
    "subject": "Question about Assignment 1",
    "workflow_state": "read",
    "participants": [{"id": 1, "name": "Dr. Jane Doe"}, {"id": 2, "name": "Student One"}],
    "messages": [
        {"id": 1, "author_id": 2, "body": "Can you clarify the due date?", "created_at": "2026-06-01T10:00:00Z"},
        {"id": 2, "author_id": 1, "body": "It's due Friday.", "created_at": "2026-06-01T11:00:00Z"},
        {"id": 3, "author_id": 2, "body": "Thanks for clarifying!", "created_at": "2026-06-01T12:00:00Z"},
    ],
}


# ---------------------------------------------------------------------------
# GET /messages/conversations
# ---------------------------------------------------------------------------

# Verifies: List conversations requires auth.
def test_list_conversations_requires_auth(client):
    response = client.get("/api/v1/messages/conversations?local_course_id=1")
    assert response.status_code == 401


# Verifies: List conversations happy path returns mapped Canvas data.
def test_list_conversations_happy_path(client):
    headers = _register_with_canvas(client)
    local_course_id = _sync_local_course(client, headers)

    with patch("app.services.canvas.fetch_conversations", new_callable=AsyncMock) as mock:
        mock.return_value = MOCK_CONVERSATIONS
        response = client.get(
            f"/api/v1/messages/conversations?local_course_id={local_course_id}",
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == 501
    assert body[0]["subject"] == "Question about Assignment 1"
    assert body[0]["message_count"] == 3
    assert body[0]["participants"][0]["name"] == "Dr. Jane Doe"


# Verifies: List conversations 404s for a course the user doesn't own.
def test_list_conversations_course_not_owned(client):
    headers = _register_with_canvas(client)
    response = client.get(
        "/api/v1/messages/conversations?local_course_id=999999",
        headers=headers,
    )
    assert response.status_code == 404


# Verifies: List conversations requires a connected Canvas token — a course
# that was synced while connected, whose connection was since removed, must
# 403 with the actionable Canvas-token error rather than a raw 500.
def test_list_conversations_without_canvas_token(client):
    headers = _register_with_canvas(client)
    local_course_id = _sync_local_course(client, headers)
    user_id = int(decode_access_token(headers["Authorization"].removeprefix("Bearer "))[0])

    async def _remove_canvas_connection(uid: int):
        engine = create_async_engine(settings.DATABASE_URL)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with Session() as db:
                await db.execute(delete(CanvasConnection).where(CanvasConnection.user_id == uid))
                await db.commit()
        finally:
            await engine.dispose()

    asyncio.run(_remove_canvas_connection(user_id))

    response = client.get(
        f"/api/v1/messages/conversations?local_course_id={local_course_id}",
        headers=headers,
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# GET /messages/conversations/{conversation_id}
# ---------------------------------------------------------------------------

# Verifies: Get conversation thread happy path returns all messages.
def test_get_conversation_thread_happy_path(client):
    headers = _register_with_canvas(client)
    local_course_id = _sync_local_course(client, headers)

    with patch("app.services.canvas.fetch_conversation_detail", new_callable=AsyncMock) as mock:
        mock.return_value = MOCK_THREAD
        response = client.get(
            f"/api/v1/messages/conversations/501?local_course_id={local_course_id}",
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == 501
    assert len(body["messages"]) == 3
    assert body["messages"][0]["body"] == "Can you clarify the due date?"
    assert body["messages"][-1]["author_id"] == 2


# Verifies: Get conversation thread propagates a Canvas 404 for an unknown conversation.
def test_get_conversation_thread_propagates_canvas_404(client):
    headers = _register_with_canvas(client)
    local_course_id = _sync_local_course(client, headers)

    with patch(
        "app.services.canvas.fetch_conversation_detail",
        new=AsyncMock(
            side_effect=HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Canvas resource not found",
            )
        ),
    ):
        response = client.get(
            f"/api/v1/messages/conversations/999999?local_course_id={local_course_id}",
            headers=headers,
        )

    assert response.status_code == 404


# Verifies: Get conversation thread 404s for a course the user doesn't own.
def test_get_conversation_thread_course_not_owned(client):
    headers = _register_with_canvas(client)
    response = client.get(
        "/api/v1/messages/conversations/501?local_course_id=999999",
        headers=headers,
    )
    assert response.status_code == 404
