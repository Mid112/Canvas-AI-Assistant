import pytest
from fastapi import HTTPException
from unittest.mock import AsyncMock, patch

from app.services.feedback_validation import (
    _check_feedback,
    _check_grade,
    verify_canvas_student_in_course,
)


def test_feedback_grade_required():
    with pytest.raises(HTTPException) as exc:
        _check_grade("  ")
    assert exc.value.status_code == 422


def test_feedback_text_cannot_be_blank():
    with pytest.raises(HTTPException) as exc:
        _check_feedback("   ")
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_verify_canvas_student_in_course_rejects_outside_roster():
    db = AsyncMock()
    user = AsyncMock()
    course = AsyncMock(id=1, canvas_course_id="42")
    with (
        patch(
            "app.services.feedback_validation.get_owned_course_or_404",
            new=AsyncMock(return_value=course),
        ),
        patch(
            "app.services.feedback_validation.require_canvas_token",
            return_value="token",
        ),
        patch(
            "app.services.feedback_validation.fetch_student_enrollment",
            new=AsyncMock(return_value=[]),
        ) as mock_fetch,
    ):
        with pytest.raises(HTTPException) as exc:
            await verify_canvas_student_in_course(1, 99, user, "http://localhost", db)
    assert exc.value.status_code == 403
    mock_fetch.assert_awaited_once_with(42, 99, "token", "http://localhost")


@pytest.mark.asyncio
async def test_verify_canvas_student_in_course_accepts_single_enrollment():
    db = AsyncMock()
    user = AsyncMock()
    course = AsyncMock(id=1, canvas_course_id="42")
    with (
        patch(
            "app.services.feedback_validation.get_owned_course_or_404",
            new=AsyncMock(return_value=course),
        ),
        patch(
            "app.services.feedback_validation.require_canvas_token",
            return_value="token",
        ),
        patch(
            "app.services.feedback_validation.fetch_student_enrollment",
            new=AsyncMock(return_value=[{"id": 1, "user_id": 77}]),
        ),
    ):
        result = await verify_canvas_student_in_course(
            1, 77, user, "http://localhost", db
        )
    assert result is course
