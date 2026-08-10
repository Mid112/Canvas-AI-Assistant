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
    infer_delivery_mode,
    list_message_drafts,
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
            "app.services.messages.resolve_generation_adapter_settings",
            new=AsyncMock(return_value=("test-provider", {"provider": "test-provider"})),
        ),
    ):
        draft = await create_message_draft(db, user, body)

    assert draft.subject == "Midterm Reminder"
    assert draft.body == "Don't forget the midterm."
    # The resolved settings reach the generator: that is the whole point of
    # resolving them here, since they carry the instructor's decrypted key.
    assert generated.await_args.args[2] == {"provider": "test-provider"}


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
            "app.services.messages.resolve_generation_adapter_settings",
            new=AsyncMock(return_value=("test-provider", {"provider": "test-provider"})),
        ),
    ):
        draft = await create_message_draft(db, user, body)

    assert draft.subject == "reminder Announcement"
    assert draft.body == "remind about the midterm"


# An instructor whose provider is not connected -- or whose saved key the
# provider has since rejected -- must not lose what they typed. Resolution now
# happens before the call, so its failure is a separate branch from the call
# failing, and it degrades the same way.
@pytest.mark.asyncio
async def test_create_message_draft_keeps_the_prompt_when_no_provider_resolves():
    db = _db_assigning_ids()
    user = SimpleNamespace(id=1)
    body = MessageDraftCreate(course_id=5, prompt="remind about the midterm", template_name="reminder")

    unresolvable = AsyncMock(side_effect=ValueError("OpenAI is not connected"))
    adapter = AsyncMock()
    with (
        patch("app.services.messages.resolve_generation_adapter_settings", unresolvable),
        patch("app.services.messages.get_llm_adapter", return_value=adapter),
    ):
        draft = await create_message_draft(db, user, body)

    assert draft.subject == "reminder Announcement"
    assert draft.body == "remind about the midterm"
    # No model was reached, so nothing should have been generated against one.
    adapter.generate.assert_not_awaited()


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
        await send_message_draft(db, user, 1, "https://canvas.example.edu")

    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_send_message_draft_rejects_no_course():
    db = AsyncMock()
    draft = SimpleNamespace(id=1, user_id=1, status="draft", course_id=None)
    db.get = AsyncMock(return_value=draft)
    user = SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as exc_info:
        await send_message_draft(db, user, 1, "https://canvas.example.edu")

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
        await send_message_draft(db, user, 1, "https://canvas.example.edu")

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
    course = SimpleNamespace(id=5, canvas_url="https://canvas.example.edu")
    db.scalar = AsyncMock(return_value=course)
    db.flush = AsyncMock()
    db.add = Mock()
    user = SimpleNamespace(id=1)

    result = SimpleNamespace(delivery_mode="conversation", audience_size=1)
    mock_validate = AsyncMock()
    mock_send = AsyncMock(return_value=result)

    with (
        patch("app.services.messages.validate_message_for_send", new=mock_validate),
        patch("app.services.canvas.send_course_message", new=mock_send),
    ):
        updated = await send_message_draft(db, user, 1, "https://stale.example.edu")

    assert updated.status == "sent"
    assert updated.sent_at is not None
    assert updated.delivery_mode == "conversation"
    assert updated.recipient_count == 1
    assert mock_validate.await_args.kwargs["canvas_url"] == "https://canvas.example.edu"
    assert mock_send.await_args.args[4] == "https://canvas.example.edu"
    assert db.add.call_count >= 2
    db.flush.assert_awaited()
    db.commit.assert_awaited_once()


# ---------------------------------------------------------------------------
# infer_delivery_mode / list_message_drafts (#1510)
# ---------------------------------------------------------------------------

def test_infer_delivery_mode_announcement_when_sent_without_recipients():
    draft = SimpleNamespace(status="sent", recipients=[], delivery_mode=None)
    assert infer_delivery_mode(draft) == "announcement"


def test_infer_delivery_mode_conversation_when_sent_with_recipients():
    draft = SimpleNamespace(
        status="sent",
        recipients=[{"id": "1", "name": "Ada"}],
        delivery_mode=None,
    )
    assert infer_delivery_mode(draft) == "conversation"


def test_infer_delivery_mode_prefers_ephemeral_attr():
    draft = SimpleNamespace(
        status="sent",
        recipients=[],
        delivery_mode="conversation",
    )
    assert infer_delivery_mode(draft) == "conversation"


def test_infer_delivery_mode_none_for_unsent_draft():
    draft = SimpleNamespace(status="draft", recipients=[], delivery_mode=None)
    assert infer_delivery_mode(draft) is None


@pytest.mark.asyncio
async def test_list_message_drafts_filters_status_and_course():
    db = AsyncMock()
    user = SimpleNamespace(id=9)
    expected = [SimpleNamespace(id=1), SimpleNamespace(id=2)]
    result = Mock()
    result.all = Mock(return_value=expected)
    db.scalars = AsyncMock(return_value=result)

    drafts = await list_message_drafts(
        db, user, status_filter="sent", course_id=10
    )

    assert drafts == expected
    db.scalars.assert_awaited_once()

