"""
Unit tests for app.services.message_validation (#708).
"""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.models.course import Course
from app.models.user import User
from app.schemas.student import StudentResponse
from app.services.message_validation import validate_message_for_send

COURSE = Course(
    id=7,
    canvas_course_id="70",
    canvas_url="https://canvas.ubc.ca",
    name="CPSC 310",
    instructor_id=1,
)
USER = User(id=1, name="Instructor", email="i@example.com", hashed_password="x", role="instructor")
CANVAS_URL = "https://canvas.ubc.ca"


def _student(canvas_user_id: str) -> StudentResponse:
    return StudentResponse(
        id=1,
        canvas_user_id=canvas_user_id,
        course_id=COURSE.id,
        name=f"Student {canvas_user_id}",
        enrollment_state="active",
    )


@pytest.mark.asyncio
async def test_send_rejects_empty_subject():
    with patch(
        "app.services.message_validation.get_owned_course_or_404",
        new=AsyncMock(return_value=COURSE),
    ):
        with pytest.raises(HTTPException) as exc:
            await validate_message_for_send(
                COURSE.id, USER, "  ", "Body text", AsyncMock(), canvas_url=CANVAS_URL
            )
    assert exc.value.status_code == 422
    assert "subject" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_send_rejects_empty_body():
    with patch(
        "app.services.message_validation.get_owned_course_or_404",
        new=AsyncMock(return_value=COURSE),
    ):
        with pytest.raises(HTTPException) as exc:
            await validate_message_for_send(
                COURSE.id, USER, "Subject", "", AsyncMock(), canvas_url=CANVAS_URL
            )
    assert exc.value.status_code == 422
    assert "body" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_send_without_recipients_skips_roster_lookup():
    with (
        patch(
            "app.services.message_validation.get_owned_course_or_404",
            new=AsyncMock(return_value=COURSE),
        ),
        patch(
            "app.services.message_validation.get_students",
            new_callable=AsyncMock,
        ) as mock_students,
    ):
        course = await validate_message_for_send(
            COURSE.id,
            USER,
            "Subject",
            "Body",
            AsyncMock(),
            canvas_url=CANVAS_URL,
            recipient_canvas_user_ids=None,
        )
    assert course is COURSE
    mock_students.assert_not_called()


@pytest.mark.asyncio
async def test_send_empty_recipient_list_treated_as_class_wide():
    """An empty list is falsy, so validate_message_for_send skips enrollment
    checks the same way None does (class-wide announcement path)."""
    with (
        patch(
            "app.services.message_validation.get_owned_course_or_404",
            new=AsyncMock(return_value=COURSE),
        ),
        patch(
            "app.services.message_validation.get_students",
            new_callable=AsyncMock,
        ) as mock_students,
    ):
        course = await validate_message_for_send(
            COURSE.id,
            USER,
            "Subject",
            "Body",
            AsyncMock(),
            canvas_url=CANVAS_URL,
            recipient_canvas_user_ids=[],
        )
    assert course is COURSE
    mock_students.assert_not_called()


@pytest.mark.asyncio
async def test_send_rejects_unenrolled_recipient():
    with (
        patch(
            "app.services.message_validation.get_owned_course_or_404",
            new=AsyncMock(return_value=COURSE),
        ),
        patch(
            "app.services.message_validation.get_students",
            new=AsyncMock(return_value=[_student("1")]),
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            await validate_message_for_send(
                COURSE.id,
                USER,
                "Subject",
                "Body",
                AsyncMock(),
                canvas_url=CANVAS_URL,
                recipient_canvas_user_ids=[999],
            )
    assert exc.value.status_code == 422
    assert "999" in exc.value.detail


@pytest.mark.asyncio
async def test_send_accepts_enrolled_recipient():
    with (
        patch(
            "app.services.message_validation.get_owned_course_or_404",
            new=AsyncMock(return_value=COURSE),
        ),
        patch(
            "app.services.message_validation.get_students",
            new=AsyncMock(return_value=[_student("42")]),
        ),
    ):
        course = await validate_message_for_send(
            COURSE.id,
            USER,
            "Subject",
            "Body",
            AsyncMock(),
            canvas_url=CANVAS_URL,
            recipient_canvas_user_ids=[42],
        )
    assert course is COURSE


@pytest.mark.asyncio
async def test_send_falls_back_to_submission_ids_when_roster_empty():
    with (
        patch(
            "app.services.message_validation.get_owned_course_or_404",
            new=AsyncMock(return_value=COURSE),
        ),
        patch(
            "app.services.message_validation.get_students",
            new=AsyncMock(return_value=[]),
        ),
        patch(
            "app.services.message_validation.require_canvas_token",
            return_value="tok",
        ),
        patch(
            "app.services.message_validation.fetch_assignments",
            new=AsyncMock(return_value=[{"id": 5}]),
        ),
        patch(
            "app.services.message_validation.fetch_submissions",
            new=AsyncMock(return_value=[{"user_id": 42}]),
        ),
    ):
        course = await validate_message_for_send(
            COURSE.id,
            USER,
            "Subject",
            "Body",
            AsyncMock(),
            canvas_url=CANVAS_URL,
            recipient_canvas_user_ids=[42],
        )
    assert course is COURSE
