"""Direct unit tests for services/messages.py (message drafts)."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import HTTPException

from app.schemas.messages import MessageDraftCreate, MessageDraftUpdate, MessageRecipient
from app.services.messages import (
    _generate_draft_content,
    create_message_draft,
    get_message_draft,
    send_message_draft,
    update_message_draft,
)


def _db_assigning_ids() -> AsyncMock:
    db = AsyncMock()
    created: list = []
    db.add = Mock(side_effect=created.append)

    async def _refresh(obj):
        if getattr(obj, "id", None) is None:
            obj.id = 1

    db.refresh = AsyncMock(side_effect=_refresh)
    return db


# ---------------------------------------------------------------------------
# _generate_draft_content
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_generate_draft_content_parses_well_formed_json():
    adapter = AsyncMock()
    adapter.generate = AsyncMock(
        return_value='{"subject": "Reminder", "body": "Please submit your work."}'
    )
    with patch("app.services.messages.get_llm_adapter", return_value=adapter):
        subject, body = await _generate_draft_content("remind students", "reminder")

    assert subject == "Reminder"
    assert body == "Please submit your work."


@pytest.mark.asyncio
async def test_generate_draft_content_falls_back_on_malformed_json():
    adapter = AsyncMock()
    adapter.generate = AsyncMock(return_value="not json at all")
    with patch("app.services.messages.get_llm_adapter", return_value=adapter):
        subject, body = await _generate_draft_content("remind students", None)

    assert subject == "Course Announcement"
    assert body == "remind students"


# ---------------------------------------------------------------------------
# create_message_draft
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_message_draft_uses_explicit_subject_and_body():
    db = _db_assigning_ids()
    user = SimpleNamespace(id=1)
    body = MessageDraftCreate(course_id=5, subject="Hi", body="Hello class")

    draft = await create_message_draft(db, user, body)

    assert draft.subject == "Hi"
    assert draft.body == "Hello class"
    assert draft.status == "draft"
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_message_draft_generates_content_from_prompt():
    db = _db_assigning_ids()
    user = SimpleNamespace(id=1)
    body = MessageDraftCreate(course_id=5, prompt="remind about the midterm", template_name="reminder")

    generated = AsyncMock(return_value=("Midterm Reminder", "Don't forget the midterm."))
    with (
        patch("app.services.messages._generate_draft_content", generated),
        patch(
            "app.services.messages.get_active_llm_config",
            new=AsyncMock(return_value=SimpleNamespace(provider="test-provider")),
        ),
    ):
        draft = await create_message_draft(db, user, body)

    assert draft.subject == "Midterm Reminder"
    assert draft.body == "Don't forget the midterm."


@pytest.mark.asyncio
async def test_create_message_draft_falls_back_when_generation_raises():
    """A generation failure (LLM timeout, bad response, etc.) must not lose
    the user's prompt — it becomes the draft body verbatim instead."""
    db = _db_assigning_ids()
    user = SimpleNamespace(id=1)
    body = MessageDraftCreate(course_id=5, prompt="remind about the midterm", template_name="reminder")

    failing = AsyncMock(side_effect=RuntimeError("LLM unavailable"))
    with (
        patch("app.services.messages._generate_draft_content", failing),
        patch(
            "app.services.messages.get_active_llm_config",
            new=AsyncMock(return_value=SimpleNamespace(provider="test-provider")),
        ),
    ):
        draft = await create_message_draft(db, user, body)

    assert draft.subject == "reminder Announcement"
    assert draft.body == "remind about the midterm"


# ---------------------------------------------------------------------------
# get_message_draft / update_message_draft
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_message_draft_not_found_raises_404():
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    user = SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as exc_info:
        await get_message_draft(db, user, 99)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_message_draft_owned_by_another_user_raises_404():
    db = AsyncMock()
    db.get = AsyncMock(return_value=SimpleNamespace(id=99, user_id=2))
    user = SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as exc_info:
        await get_message_draft(db, user, 99)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_update_message_draft_rejects_already_sent():
    db = AsyncMock()
    draft = SimpleNamespace(id=1, user_id=1, status="sent")
    db.get = AsyncMock(return_value=draft)
    user = SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as exc_info:
        await update_message_draft(db, user, 1, MessageDraftUpdate(subject="New"))

    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_update_message_draft_applies_partial_fields_only():
    db = AsyncMock()
    draft = SimpleNamespace(
        id=1, user_id=1, status="draft", subject="Old", body="Old body", recipients=[],
    )
    db.get = AsyncMock(return_value=draft)
    db.refresh = AsyncMock()
    user = SimpleNamespace(id=1)

    await update_message_draft(db, user, 1, MessageDraftUpdate(subject="New subject"))

    assert draft.subject == "New subject"
    assert draft.body == "Old body"  # untouched — body was omitted from the update
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_message_draft_updates_body_and_recipients():
    db = AsyncMock()
    draft = SimpleNamespace(
        id=1, user_id=1, status="draft", subject="Old", body="Old body", recipients=[],
    )
    db.get = AsyncMock(return_value=draft)
    db.refresh = AsyncMock()
    user = SimpleNamespace(id=1)

    await update_message_draft(
        db,
        user,
        1,
        MessageDraftUpdate(
            body="New body",
            recipients=[MessageRecipient(id="7", name="Bob", email="bob@example.com")],
        ),
    )

    assert draft.body == "New body"
    assert draft.recipients == [{"id": "7", "name": "Bob", "email": "bob@example.com"}]


# ---------------------------------------------------------------------------
# send_message_draft
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_send_message_draft_rejects_already_sent():
    db = AsyncMock()
    draft = SimpleNamespace(id=1, user_id=1, status="sent")
    db.get = AsyncMock(return_value=draft)
    user = SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as exc_info:
        await send_message_draft(db, user, 1, "https://canvas.ubc.ca")

    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_send_message_draft_rejects_no_course():
    db = AsyncMock()
    draft = SimpleNamespace(id=1, user_id=1, status="draft", course_id=None)
    db.get = AsyncMock(return_value=draft)
    user = SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as exc_info:
        await send_message_draft(db, user, 1, "https://canvas.ubc.ca")

    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_send_message_draft_rejects_malformed_recipient_ids():
    db = AsyncMock()
    draft = SimpleNamespace(
        id=1, user_id=1, status="draft", course_id=5,
        recipients=[{"id": "not-a-number", "name": "Alice"}],
    )
    db.get = AsyncMock(return_value=draft)
    user = SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as exc_info:
        await send_message_draft(db, user, 1, "https://canvas.ubc.ca")

    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_send_message_draft_success_marks_sent_and_records_delivery():
    db = AsyncMock()
    draft = SimpleNamespace(
        id=1, user_id=1, status="draft", course_id=5,
        subject="Hi", body="Hello", recipients=[{"id": "42", "name": "Alice"}],
    )
    db.get = AsyncMock(return_value=draft)
    db.refresh = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    db.flush = AsyncMock()
    db.add = Mock()
    user = SimpleNamespace(id=1)

    result = SimpleNamespace(delivery_mode="conversation", audience_size=1)

    with (
        patch("app.services.messages.validate_message_for_send", new=AsyncMock()),
        patch("app.services.canvas.send_course_message", new=AsyncMock(return_value=result)),
    ):
        updated = await send_message_draft(db, user, 1, "https://canvas.ubc.ca")

    assert updated.status == "sent"
    assert updated.sent_at is not None
    assert updated.delivery_mode == "conversation"
    assert updated.recipient_count == 1
    assert db.add.call_count >= 2
    db.flush.assert_awaited()
    db.commit.assert_awaited_once()
