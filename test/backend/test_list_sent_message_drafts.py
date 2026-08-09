"""API tests for GET /api/v1/messages/drafts (Sent tab / #1510)."""
import asyncio
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.main import app
from app.models.message_draft import MessageDraft

CANVAS_URL = "https://canvas.example.edu"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register(client) -> tuple[dict, int]:
    email = f"msgsent_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Sent Lister", "email": email, "password": "Secret123!"},
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        me = client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": f"test-token-{uuid.uuid4()}", "canvas_url": CANVAS_URL},
            headers=headers,
        )
    user_id = me.json()["id"]
    return headers, user_id


def _insert_draft(
    *,
    user_id: int,
    status: str,
    subject: str,
    recipients: list,
    course_id: int | None = None,
    sent_at: datetime | None = None,
) -> int:
    async def _run() -> int:
        engine = create_async_engine(settings.DATABASE_URL)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory() as db:
            draft = MessageDraft(
                user_id=user_id,
                course_id=course_id,
                subject=subject,
                body=f"Body for {subject}",
                recipients=recipients,
                status=status,
                sent_at=sent_at,
            )
            db.add(draft)
            await db.commit()
            await db.refresh(draft)
            draft_id = draft.id
        await engine.dispose()
        return draft_id

    return asyncio.run(_run())


# Verifies: Unauthenticated callers cannot list drafts.
def test_list_drafts_requires_auth(client):
    response = client.get("/api/v1/messages/drafts?status=sent")
    assert response.status_code == 401


# Verifies: Empty Sent list returns [] for a user with no sent drafts.
def test_list_sent_drafts_empty(client):
    headers, _user_id = _register(client)
    response = client.get("/api/v1/messages/drafts?status=sent", headers=headers)
    assert response.status_code == 200
    assert response.json() == []


# Verifies: Sent list returns conversation + announcement (inferred) rows only.
def test_list_sent_drafts_infers_delivery_mode_and_filters_status(client):
    headers, user_id = _register(client)
    now = datetime.now(UTC)

    _insert_draft(
        user_id=user_id,
        status="draft",
        subject="Still drafting",
        recipients=[{"id": "1", "name": "Ada"}],
        course_id=10,
    )
    _insert_draft(
        user_id=user_id,
        status="sent",
        subject="Direct note",
        recipients=[{"id": "1", "name": "Ada", "email": "ada@example.com"}],
        course_id=10,
        sent_at=now,
    )
    _insert_draft(
        user_id=user_id,
        status="sent",
        subject="Class-wide update",
        recipients=[],
        course_id=10,
        sent_at=now,
    )

    response = client.get("/api/v1/messages/drafts?status=sent", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    subjects = {row["subject"] for row in payload}
    assert "Still drafting" not in subjects
    assert subjects == {"Direct note", "Class-wide update"}

    by_subject = {row["subject"]: row for row in payload}
    assert by_subject["Direct note"]["delivery_mode"] == "conversation"
    assert by_subject["Class-wide update"]["delivery_mode"] == "announcement"


# Verifies: course_id query scopes Sent results to that course.
def test_list_sent_drafts_filters_by_course(client):
    headers, user_id = _register(client)
    now = datetime.now(UTC)

    _insert_draft(
        user_id=user_id,
        status="sent",
        subject="Course 10 sent",
        recipients=[],
        course_id=10,
        sent_at=now,
    )
    _insert_draft(
        user_id=user_id,
        status="sent",
        subject="Course 20 sent",
        recipients=[{"id": "2", "name": "Grace"}],
        course_id=20,
        sent_at=now,
    )

    response = client.get(
        "/api/v1/messages/drafts?status=sent&course_id=10",
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["subject"] == "Course 10 sent"
    assert payload[0]["course_id"] == 10
    assert payload[0]["delivery_mode"] == "announcement"
