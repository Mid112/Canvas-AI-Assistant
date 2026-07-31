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
    canvas_url="https://canvas.example.edu",
    name="CPSC 310",
    instructor_id=1,
)
USER = User(id=1, name="Instructor", email="i@example.com", hashed_password="x", role="instructor")
CANVAS_URL = "https://canvas.example.edu"


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
async def test_send_rejects_profanity_in_body():
    with patch(
        "app.services.message_validation.get_owned_course_or_404",
        new=AsyncMock(return_value=COURSE),
    ):
        with pytest.raises(HTTPException) as exc:
            await validate_message_for_send(
                COURSE.id,
                USER,
                "Subject",
                "This is fucking inappropriate",
                AsyncMock(),
                canvas_url=CANVAS_URL,
            )
    assert exc.value.status_code == 422
    assert "appropriate" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_send_rejects_plural_and_obfuscated_profanity():
    """Plurals, spaced letters, ZWSP, punctuation, and Cyrillic lookalikes."""
    payloads = [
        "Please ignore these bastards in the sample.",
        "Do not write f u c k in feedback.",
        "Hidden: f\u200bu\u200bc\u200bk",
        "Obfuscated f.u.c.k text",
        "Cyrillic fuсk",  # Cyrillic с (U+0441)
        "Accented fùck slips past ASCII \\b",
    ]
    with patch(
        "app.services.message_validation.get_owned_course_or_404",
        new=AsyncMock(return_value=COURSE),
    ):
        for body in payloads:
            with pytest.raises(HTTPException) as exc:
                await validate_message_for_send(
                    COURSE.id,
                    USER,
                    "Subject",
                    body,
                    AsyncMock(),
                    canvas_url=CANVAS_URL,
                )
            assert exc.value.status_code == 422, body
            assert "appropriate" in exc.value.detail.lower(), body


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
            "app.services.message_validation.get_submission_derived_students",
            new=AsyncMock(return_value=[{"user_id": 42, "name": None, "email": None, "login_id": None}]),
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
