import asyncio
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import HTTPException

from app.integrations.canvas import _raise_for_canvas_error, send_conversation
from app.models.course import Course
from app.models.user import User
from app.services.canvas import send_course_message


def test_send_course_message_uses_conversation_for_recipients():
    course = Course(
        id=1,
        canvas_course_id="42",
        canvas_url="http://localhost:3000",
        name="COSC 499",
        instructor_id=1,
    )
    user = User(id=1, name="Instructor", email="inst@example.com", hashed_password="x", role="instructor")

    with (
        patch("app.services.canvas.require_canvas_token", return_value="token"),
        patch("app.services.canvas.get_owned_course", new_callable=AsyncMock, return_value=course),
        patch("app.services.canvas.send_conversation", new_callable=AsyncMock) as mock_conversation,
        patch("app.services.canvas.create_announcement", new_callable=AsyncMock) as mock_announcement,
        patch("app.services.student.get_students", new_callable=AsyncMock) as mock_students,
    ):
        result = asyncio.run(
            send_course_message(
                1,
                "Reminder",
                "Please submit",
                user,
                course.canvas_url,
                AsyncMock(),
                recipient_canvas_user_ids=[101, 102],
            )
        )

    mock_conversation.assert_awaited_once()
    mock_announcement.assert_not_called()
    mock_students.assert_not_called()
    assert result.delivery_mode == "conversation"
    assert result.audience_size == 2
    assert result.recipient_canvas_user_ids == [101, 102]


def test_send_course_message_uses_announcement_without_recipients():
    course = Course(
        id=1,
        canvas_course_id="42",
        canvas_url="http://localhost:3000",
        name="COSC 499",
        instructor_id=1,
    )
    user = User(id=1, name="Instructor", email="inst@example.com", hashed_password="x", role="instructor")

    with (
        patch("app.services.canvas.require_canvas_token", return_value="token"),
        patch("app.services.canvas.get_owned_course", new_callable=AsyncMock, return_value=course),
        patch("app.services.canvas.send_conversation", new_callable=AsyncMock) as mock_conversation,
        patch("app.services.canvas.create_announcement", new_callable=AsyncMock) as mock_announcement,
        patch("app.services.student.get_students", new_callable=AsyncMock, return_value=[1, 2, 3]),
    ):
        result = asyncio.run(
            send_course_message(
                1,
                "Announcement",
                "Class update",
                user,
                course.canvas_url,
                AsyncMock(),
            )
        )

    mock_announcement.assert_awaited_once()
    mock_conversation.assert_not_called()
    assert result.delivery_mode == "announcement"
    assert result.audience_size == 3


def test_canvas_error_includes_response_detail():
    response = httpx.Response(
        400,
        json={"errors": [{"message": "recipient is not a valid conversation user"}]},
    )

    with pytest.raises(HTTPException) as exc_info:
        _raise_for_canvas_error(response)

    assert exc_info.value.status_code == 502
    assert "Canvas API error: 400" in exc_info.value.detail
    assert "recipient is not a valid conversation user" in exc_info.value.detail
    assert "{'message':" not in exc_info.value.detail


def test_send_conversation_posts_repeated_recipient_fields():
    response = httpx.Response(200, json={"id": 123})

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=response) as mock_post:
        result = asyncio.run(
            send_conversation(
                42,
                [101, 102],
                "Reminder",
                "Please submit",
                "token",
                "http://localhost:3000",
            )
        )

    assert result == {"id": 123}
    request_headers = mock_post.await_args.kwargs["headers"]
    request_content = mock_post.await_args.kwargs["content"]
    assert request_headers["Content-Type"] == "application/x-www-form-urlencoded"
    assert "context_code=course_42" in request_content
    assert "group_conversation=false" in request_content
    assert "recipients%5B%5D=101" in request_content
    assert "recipients%5B%5D=102" in request_content
