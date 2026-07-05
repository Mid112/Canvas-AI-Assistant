import asyncio
from unittest.mock import AsyncMock, patch

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
