"""Test note: covers the test inbox behavior so future changes can preserve the expected Canvas workflow contract."""

import asyncio
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import HTTPException

from app.integrations.canvas import add_conversation_message, fetch_conversations
from app.models.course import Course
from app.models.user import User
from app.services.inbox import (
    get_inbox_thread,
    list_inbox_threads,
    reply_to_inbox_thread,
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


def _course() -> Course:
    return Course(
        id=7,
        canvas_course_id="42",
        canvas_url="http://localhost:3000",
        name="COSC 499",
        instructor_id=1,
    )


# Verifies: Inbox list maps Canvas summaries, detects roles, and sorts newest-first.
def test_list_inbox_maps_and_sorts():
    raw = [
        {
            "id": 1,
            "subject": "Older",
            "last_message": "first",
            "last_message_at": "2026-01-01T00:00:00Z",
            "workflow_state": "read",
            "participants": [{"id": 500, "name": "Prof"}, {"id": 101, "name": "Alice"}],
        },
        {
            "id": 2,
            "subject": "Newer",
            "last_message": "second",
            "last_message_at": "2026-02-01T00:00:00Z",
            "workflow_state": "unread",
            "participants": [{"id": 500, "name": "Prof"}, {"id": 102, "name": "Bob"}],
        },
    ]

    with (
        patch("app.services.inbox.require_canvas_token", return_value="token"),
        patch("app.services.inbox.fetch_self", new_callable=AsyncMock, return_value={"id": 500}),
        patch("app.services.inbox.fetch_conversations", new_callable=AsyncMock, return_value=raw),
    ):
        result = asyncio.run(
            list_inbox_threads(_instructor(), "http://localhost:3000", AsyncMock())
        )

    assert [t.id for t in result.threads] == ["2", "1"]
    newer = result.threads[0]
    assert newer.subject == "Newer"
    assert newer.unread_count == 1
    roles = {p.id: p.role for p in newer.participants}
    assert roles == {"500": "instructor", "102": "student"}


# Verifies: Course-scoped inbox filters Canvas by course context and tags the local course.
def test_list_inbox_course_scope_filters():
    with (
        patch("app.services.inbox.require_canvas_token", return_value="token"),
        patch("app.services.inbox.fetch_self", new_callable=AsyncMock, return_value={"id": 500}),
        patch("app.services.inbox.get_owned_course", new_callable=AsyncMock, return_value=_course()),
        patch("app.services.inbox.fetch_conversations", new_callable=AsyncMock, return_value=[]) as mock_fetch,
    ):
        result = asyncio.run(
            list_inbox_threads(
                _instructor(),
                "http://localhost:3000",
                AsyncMock(),
                local_course_id=7,
            )
        )

    mock_fetch.assert_awaited_once()
    assert mock_fetch.await_args.kwargs["course_context_code"] == "course_42"
    assert result.threads == []


# Verifies: Thread detail maps messages chronologically with author roles.
def test_get_inbox_thread_maps_messages():
    detail = {
        "id": 9,
        "subject": "Question",
        "last_message_at": "2026-03-02T00:00:00Z",
        "workflow_state": "read",
        "participants": [{"id": 500, "name": "Prof"}, {"id": 101, "name": "Alice"}],
        "messages": [
            {"id": 20, "author_id": 500, "body": "reply", "created_at": "2026-03-02T00:00:00Z"},
            {"id": 19, "author_id": 101, "body": "question", "created_at": "2026-03-01T00:00:00Z"},
        ],
    }

    with (
        patch("app.services.inbox.require_canvas_token", return_value="token"),
        patch("app.services.inbox.fetch_self", new_callable=AsyncMock, return_value={"id": 500}),
        patch("app.services.inbox.fetch_conversation", new_callable=AsyncMock, return_value=detail),
    ):
        result = asyncio.run(
            get_inbox_thread(9, _instructor(), "http://localhost:3000", AsyncMock())
        )

    assert [m.id for m in result.messages] == ["19", "20"]
    assert result.messages[0].author.role == "student"
    assert result.messages[1].author.role == "instructor"


# Verifies: Instructor is labeled from the Canvas token owner even when the
# local user.canvas_user_id is unset (regression: prof shown as "student").
def test_role_uses_token_owner_when_local_canvas_id_missing():
    user = _instructor()
    user.canvas_user_id = None  # mirrors real rows where this is never populated
    detail = {
        "id": 9,
        "subject": "Question",
        "last_message_at": "2026-03-02T00:00:00Z",
        "participants": [{"id": 500, "name": "Prof"}, {"id": 101, "name": "Alice"}],
        "messages": [
            {"id": 20, "author_id": 500, "body": "reply", "created_at": "2026-03-02T00:00:00Z"},
            {"id": 19, "author_id": 101, "body": "question", "created_at": "2026-03-01T00:00:00Z"},
        ],
    }

    with (
        patch("app.services.inbox.require_canvas_token", return_value="token"),
        patch("app.services.inbox.fetch_self", new_callable=AsyncMock, return_value={"id": 500}),
        patch("app.services.inbox.fetch_conversation", new_callable=AsyncMock, return_value=detail),
    ):
        result = asyncio.run(
            get_inbox_thread(9, user, "http://localhost:3000", AsyncMock())
        )

    roles = {m.author.id: m.author.role for m in result.messages}
    assert roles == {"500": "instructor", "101": "student"}


# Verifies: Empty reply body is rejected before hitting Canvas.
def test_reply_empty_body_rejected():
    with patch("app.services.inbox.require_canvas_token", return_value="token"):
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                reply_to_inbox_thread(
                    9, "   ", _instructor(), "http://localhost:3000", AsyncMock()
                )
            )
    assert exc_info.value.status_code == 422


# Verifies: Profanity in inbox replies is rejected before hitting Canvas.
def test_reply_profanity_rejected():
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            reply_to_inbox_thread(
                9,
                "This is fucking rude.",
                _instructor(),
                "http://localhost:3000",
                AsyncMock(),
            )
        )
    assert exc_info.value.status_code == 422
    assert "appropriate" in exc_info.value.detail.lower()


# Verifies: Reply posts to Canvas with participants (minus self) and returns updated thread.
def test_reply_posts_and_returns_updated():
    before = {
        "id": 9,
        "subject": "Question",
        "participants": [
            {"id": 500, "name": "Prof"},
            {"id": 101, "name": "Alice"},
            {"id": 102, "name": "Bob"},
        ],
        "messages": [{"id": 19, "author_id": 101, "body": "question", "created_at": "2026-03-01T00:00:00Z"}],
    }
    after = {
        **before,
        "last_message_at": "2026-03-02T00:00:00Z",
        "messages": [
            *before["messages"],
            {"id": 20, "author_id": 500, "body": "here you go", "created_at": "2026-03-02T00:00:00Z"},
        ],
    }

    with (
        patch("app.services.inbox.require_canvas_token", return_value="token"),
        patch("app.services.inbox.fetch_self", new_callable=AsyncMock, return_value={"id": 500}),
        patch(
            "app.services.inbox.fetch_conversation",
            new_callable=AsyncMock,
            side_effect=[before, after],
        ),
        patch("app.services.inbox.add_conversation_message", new_callable=AsyncMock) as mock_add,
    ):
        result = asyncio.run(
            reply_to_inbox_thread(
                9, "here you go", _instructor(), "http://localhost:3000", AsyncMock()
            )
        )

    mock_add.assert_awaited_once()
    posted_recipients = mock_add.await_args.args[2]
    assert posted_recipients == [101, 102]
    assert [m.id for m in result.messages] == ["19", "20"]
    assert result.messages[-1].author.role == "instructor"


# Verifies: Reply refuses to send when the instructor's own Canvas id cannot be
# confirmed (Canvas /users/self fails AND local canvas_user_id is unset), so the
# instructor is never added as a recipient of their own reply.
def test_reply_refuses_when_self_identity_unresolved():
    user = _instructor()
    user.canvas_user_id = None  # local fallback also unavailable

    with (
        patch("app.services.inbox.require_canvas_token", return_value="token"),
        patch(
            "app.services.inbox.fetch_self",
            new_callable=AsyncMock,
            side_effect=httpx.RequestError("canvas down"),
        ),
        patch(
            "app.services.inbox.fetch_conversation", new_callable=AsyncMock
        ) as mock_fetch,
        patch(
            "app.services.inbox.add_conversation_message", new_callable=AsyncMock
        ) as mock_add,
    ):
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                reply_to_inbox_thread(
                    9, "hi how are you", user, "http://localhost:3000", AsyncMock()
                )
            )

    assert exc_info.value.status_code == 502
    # Bailed before reading participants or posting anything to Canvas.
    mock_fetch.assert_not_awaited()
    mock_add.assert_not_awaited()


# Verifies: add_conversation_message posts body + repeated recipient fields as form data.
def test_add_conversation_message_posts_form_fields():
    response = httpx.Response(200, json={"id": 9})

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=response) as mock_post:
        result = asyncio.run(
            add_conversation_message(9, "hello", [101, 102], "token", "http://localhost:3000")
        )

    assert result == {"id": 9}
    content = mock_post.await_args.kwargs["content"]
    assert "body=hello" in content
    assert "recipients%5B%5D=101" in content
    assert "recipients%5B%5D=102" in content


# Verifies: fetch_conversations adds course filter params when scoped to a context.
def test_fetch_conversations_uses_course_filter():
    response = httpx.Response(200, json=[], headers={})

    with patch("app.integrations.canvas._get_with_retry", new_callable=AsyncMock, return_value=response) as mock_get:
        asyncio.run(
            fetch_conversations("token", "http://localhost:3000", course_context_code="course_42")
        )

    params = mock_get.await_args.kwargs["params"]
    assert params["filter[]"] == "course_42"
    assert params["filter_mode"] == "and"
