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
    with patch(
        "app.services.feedback_validation.get_owned_course_or_404",
        new=AsyncMock(return_value=AsyncMock(id=1)),
    ), patch(
        "app.services.feedback_validation.get_students",
        new=AsyncMock(
            return_value=[
                type("Student", (), {"canvas_user_id": "77"})(),
            ]
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            await verify_canvas_student_in_course(1, 99, user, "http://localhost", db)
    assert exc.value.status_code == 403
