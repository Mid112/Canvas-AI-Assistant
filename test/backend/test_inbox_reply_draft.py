import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.models.course import Course
from app.models.user import User
from app.schemas.inbox import InboxReplyDraftRequest, InboxReplyPreviewRequest
from app.services.inbox_reply_draft import (
    generate_inbox_reply_draft,
    preview_inbox_reply,
)


def _instructor() -> User:
    return User(
        id=1,
        canvas_user_id="500",
        name="Prof",
        email="prof@example.com",
        hashed_password="x",
        role="instructor",
    )


def _thread_detail():
    from app.schemas.inbox import InboxMessage, InboxParticipant, InboxThreadDetail
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    return InboxThreadDetail(
        id="9",
        course_id=7,
        course_name="COSC 499",
        subject="Question about HW3",
        preview="Can I get an extension?",
        participants=[
            InboxParticipant(id="500", name="Prof", role="instructor"),
            InboxParticipant(id="101", name="Alice", role="student"),
        ],
        unread_count=1,
        updated_at=now,
        messages=[
            InboxMessage(
                id="19",
                author=InboxParticipant(id="101", name="Alice", role="student"),
                body="Can I get an extension?",
                sent_at=now,
            )
        ],
    )


def test_generate_inbox_reply_draft_success():
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"body": "Thanks for reaching out. Extensions are case-by-case."}'

    with (
        patch(
            "app.services.inbox_reply_draft.get_inbox_thread",
            new_callable=AsyncMock,
            return_value=_thread_detail(),
        ),
        patch(
            "app.services.inbox_reply_draft.get_llm_adapter",
            return_value=mock_adapter,
        ),
    ):
        result = asyncio.run(
            generate_inbox_reply_draft(
                9,
                InboxReplyDraftRequest(prompt="Be supportive but clear."),
                _instructor(),
                "http://localhost:3000",
                AsyncMock(),
            )
        )

    assert "extension" in result.body.lower()
    prompt = mock_adapter.generate.await_args.args[1]
    assert "Alice" not in prompt
    assert "Student:" in prompt


def test_generate_inbox_reply_draft_parses_fenced_llm_json():
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        "<think>drafting</think>\n"
        "```json\n"
        '{"body": "Happy to discuss options during office hours."}\n'
        "```"
    )

    with (
        patch(
            "app.services.inbox_reply_draft.get_inbox_thread",
            new_callable=AsyncMock,
            return_value=_thread_detail(),
        ),
        patch(
            "app.services.inbox_reply_draft.get_llm_adapter",
            return_value=mock_adapter,
        ),
    ):
        result = asyncio.run(
            generate_inbox_reply_draft(
                9,
                InboxReplyDraftRequest(),
                _instructor(),
                "http://localhost:3000",
                AsyncMock(),
            )
        )

    assert "office hours" in result.body.lower()


def test_preview_inbox_reply_rejects_profanity():
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            preview_inbox_reply(
                9,
                InboxReplyPreviewRequest(body="This is fucking unacceptable."),
                _instructor(),
                "http://localhost:3000",
                AsyncMock(),
            )
        )

    assert exc_info.value.status_code == 422
    assert "appropriate" in exc_info.value.detail.lower()


def test_generate_inbox_reply_draft_empty_thread_rejected():
    empty = _thread_detail()
    empty.messages = []

    with patch(
        "app.services.inbox_reply_draft.get_inbox_thread",
        new_callable=AsyncMock,
        return_value=empty,
    ):
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                generate_inbox_reply_draft(
                    9,
                    InboxReplyDraftRequest(),
                    _instructor(),
                    "http://localhost:3000",
                    AsyncMock(),
                )
            )

    assert exc_info.value.status_code == 422


def test_preview_inbox_reply_returns_summary():
    with patch(
        "app.services.inbox_reply_draft.get_inbox_thread",
        new_callable=AsyncMock,
        return_value=_thread_detail(),
    ):
        result = asyncio.run(
            preview_inbox_reply(
                9,
                InboxReplyPreviewRequest(body="Sure, let's discuss options."),
                _instructor(),
                "http://localhost:3000",
                AsyncMock(),
            )
        )

    assert result.recipient_count == 1
    assert "Question about HW3" in result.summary
    assert "Sure" in result.body_preview
