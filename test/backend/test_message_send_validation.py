"""
Integration tests for POST /api/v1/messages/drafts/{id}/send's
recipient-enrollment validation.

send_message_draft now calls validate_message_for_send (with
_validate_recipients_in_course's enrollment check) before send_course_message
— matching what the chat/dispatcher send_message path already enforced. These
tests cover the endpoint-level wiring, which previously had zero coverage.
"""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.main import app
from app.models.message_draft import MessageDraft
from app.schemas.student import StudentResponse

CANVAS_URL = "https://canvas.example.edu"
ALT_CANVAS_URL = "https://canvas.example.edu"


def _make_session():
    engine = create_async_engine(settings.DATABASE_URL)
    return engine, async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> tuple[dict, int]:
    email = f"msgsend_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Message Sender", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": CANVAS_URL},
            headers=headers,
        )

    canvas_course_id = uuid.uuid4().int % 10_000_000
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = [{
            "id": canvas_course_id,
            "name": "CPSC 310",
            "course_code": "CPSC310",
            "enrollment_term_id": 1,
            "workflow_state": "available",
        }]
        resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)

    local_course_id = resp.json()[0]["local_id"]
    return headers, local_course_id


def _register_with_canvas_url(client, canvas_url: str) -> tuple[dict, int]:
    email = f"msgsend_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Message Sender", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": canvas_url},
            headers=headers,
        )

    canvas_course_id = uuid.uuid4().int % 10_000_000
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = [{
            "id": canvas_course_id,
            "name": "Non-default Canvas",
            "course_code": "NDC101",
            "enrollment_term_id": 1,
            "workflow_state": "available",
        }]
        resp = client.get(
            f"/api/v1/canvas/courses?canvas_url={canvas_url}",
            headers=headers,
        )

    local_course_id = resp.json()[0]["local_id"]
    return headers, local_course_id


def _create_draft(client, headers, local_course_id, recipient_ids: list[str]) -> int:
    recipients = [{"id": rid, "name": f"Student {rid}"} for rid in recipient_ids]
    create = client.post(
        "/api/v1/messages/drafts",
        json={
            "course_id": local_course_id,
            "subject": "Assignment reminder",
            "body": "Please submit your work.",
            "recipients": recipients,
        },
        headers=headers,
    )
    assert create.status_code == 201, create.json()
    return create.json()["id"]


def _draft_status(draft_id: int) -> str:
    import asyncio

    async def _query():
        engine, Session = _make_session()
        try:
            async with Session() as db:
                draft = await db.get(MessageDraft, draft_id)
                return draft.status
        finally:
            await engine.dispose()

    return asyncio.run(_query())


def _student(canvas_user_id: str, course_id: int) -> StudentResponse:
    return StudentResponse(
        id=1,
        canvas_user_id=canvas_user_id,
        course_id=course_id,
        name=f"Student {canvas_user_id}",
        enrollment_state="active",
    )


# Verifies: Send rejects recipient not enrolled.
def test_send_rejects_recipient_not_enrolled(client):
    headers, local_course_id = _register_with_canvas(client)
    draft_id = _create_draft(client, headers, local_course_id, recipient_ids=["999"])

    with (
        patch(
            "app.services.message_validation.get_students",
            new_callable=AsyncMock,
            return_value=[_student("1", local_course_id)],
        ),
        patch("app.services.canvas.send_conversation", new_callable=AsyncMock) as mock_send,
    ):
        resp = client.post(
            f"/api/v1/messages/drafts/{draft_id}/send?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert resp.status_code == 422
    assert "not enrolled" in resp.json()["detail"]
    assert "999" in resp.json()["detail"]
    mock_send.assert_not_called()
    assert _draft_status(draft_id) == "draft"


# Verifies: Send succeeds when recipient enrolled.
def test_send_succeeds_when_recipient_enrolled(client):
    headers, local_course_id = _register_with_canvas(client)
    draft_id = _create_draft(client, headers, local_course_id, recipient_ids=["42"])

    with (
        patch(
            "app.services.message_validation.get_students",
            new_callable=AsyncMock,
            return_value=[_student("42", local_course_id)],
        ),
        patch("app.services.canvas.send_conversation", new_callable=AsyncMock) as mock_send,
    ):
        resp = client.post(
            f"/api/v1/messages/drafts/{draft_id}/send?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["status"] == "sent"
    assert body["delivery_mode"] == "conversation"
    mock_send.assert_awaited_once()
    assert _draft_status(draft_id) == "sent"


# Verifies: Send derives Canvas URL from the draft course when the request
# omits canvas_url, rather than falling back to settings.CANVAS_API_URL.
def test_send_without_canvas_url_uses_draft_course_canvas_url(client, monkeypatch):
    monkeypatch.setattr(
        "app.config.settings.CANVAS_API_URL",
        CANVAS_URL,
        raising=False,
    )
    headers, local_course_id = _register_with_canvas_url(client, ALT_CANVAS_URL)
    draft_id = _create_draft(client, headers, local_course_id, recipient_ids=["42"])

    with (
        patch(
            "app.services.message_validation.get_students",
            new_callable=AsyncMock,
            return_value=[_student("42", local_course_id)],
        ) as mock_validation_students,
        patch("app.services.canvas.send_conversation", new_callable=AsyncMock) as mock_send,
    ):
        resp = client.post(
            f"/api/v1/messages/drafts/{draft_id}/send",
            headers=headers,
        )

    assert resp.status_code == 200, resp.json()
    assert resp.json()["delivery_mode"] == "conversation"
    assert mock_validation_students.await_args.args[2] == ALT_CANVAS_URL
    assert mock_send.await_args.args[5] == ALT_CANVAS_URL
    assert _draft_status(draft_id) == "sent"


# Verifies: Send accepts submission backed recipient when roster is empty.
def test_send_accepts_submission_backed_recipient_when_roster_is_empty(client):
    """get_submission_derived_students (services/student.py) is the shared
    course-wide submissions scan _submission_recipient_ids now delegates to
    — also used by send_message's recipient-name resolution chain
    (services/chat.py)."""
    headers, local_course_id = _register_with_canvas(client)
    draft_id = _create_draft(client, headers, local_course_id, recipient_ids=["42"])

    with (
        patch(
            "app.services.message_validation.get_students",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "app.services.message_validation.get_submission_derived_students",
            new_callable=AsyncMock,
            return_value=[{"user_id": 42, "name": "Student 42", "email": None, "login_id": None}],
        ),
        patch("app.services.canvas.send_conversation", new_callable=AsyncMock) as mock_send,
    ):
        resp = client.post(
            f"/api/v1/messages/drafts/{draft_id}/send?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert resp.status_code == 200, resp.json()
    assert resp.json()["delivery_mode"] == "conversation"
    mock_send.assert_awaited_once()
    assert _draft_status(draft_id) == "sent"


# Verifies: Send without recipients skips enrollment check.
def test_send_without_recipients_skips_enrollment_check(client):
    """No targeted recipients means a class-wide announcement — the
    enrollment check must not run at all in this branch."""
    headers, local_course_id = _register_with_canvas(client)
    draft_id = _create_draft(client, headers, local_course_id, recipient_ids=[])

    with (
        patch("app.services.message_validation.get_students", new_callable=AsyncMock) as mock_validate_students,
        patch("app.services.canvas.create_announcement", new_callable=AsyncMock) as mock_announcement,
        patch(
            "app.services.student.get_students",
            new_callable=AsyncMock,
            return_value=[_student("1", local_course_id), _student("2", local_course_id)],
        ),
    ):
        resp = client.post(
            f"/api/v1/messages/drafts/{draft_id}/send?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert resp.status_code == 200, resp.json()
    assert resp.json()["delivery_mode"] == "announcement"
    mock_validate_students.assert_not_called()
    mock_announcement.assert_awaited_once()
    assert _draft_status(draft_id) == "sent"


# Verifies: Send rejects recipient when second of two not enrolled.
def test_send_rejects_recipient_when_second_of_two_not_enrolled(client):
    """Partial enrollment: one valid recipient plus one invalid one must
    still block the whole send, not silently drop the invalid one."""
    headers, local_course_id = _register_with_canvas(client)
    draft_id = _create_draft(client, headers, local_course_id, recipient_ids=["1", "999"])

    with (
        patch(
            "app.services.message_validation.get_students",
            new_callable=AsyncMock,
            return_value=[_student("1", local_course_id)],
        ),
        patch("app.services.canvas.send_conversation", new_callable=AsyncMock) as mock_send,
    ):
        resp = client.post(
            f"/api/v1/messages/drafts/{draft_id}/send?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert resp.status_code == 422
    assert "999" in resp.json()["detail"]
    mock_send.assert_not_called()
    assert _draft_status(draft_id) == "draft"
