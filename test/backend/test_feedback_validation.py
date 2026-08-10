import pytest
from fastapi import HTTPException
from unittest.mock import AsyncMock, MagicMock, patch

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


def test_feedback_rejects_profanity():
    with pytest.raises(HTTPException) as exc:
        _check_feedback("This is fucking inappropriate feedback")
    assert exc.value.status_code == 422
    assert "appropriate" in exc.value.detail.lower()
    assert "feedback" in exc.value.detail.lower()


def test_feedback_allows_clean_comment():
    _check_feedback("Strong work explaining the base case clearly.")


@pytest.mark.asyncio
async def test_verify_canvas_student_in_course_rejects_outside_roster():
    db = AsyncMock()
    user = AsyncMock()
    course = MagicMock(id=1, canvas_course_id="42", canvas_url="http://localhost")
    with (
        patch(
            "app.services.feedback_validation.get_owned_course",
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
    course = MagicMock(id=1, canvas_course_id="42", canvas_url="http://localhost")
    with (
        patch(
            "app.services.feedback_validation.get_owned_course",
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


@pytest.mark.asyncio
async def test_verify_assignment_in_course_rejects_missing_assignment():
    from fastapi import HTTPException

    from app.services.feedback_validation import verify_assignment_in_course

    db = AsyncMock()
    user = AsyncMock()
    with patch(
        "app.services.feedback_validation.get_assignment",
        new=AsyncMock(
            side_effect=HTTPException(status_code=404, detail="Not found")
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            await verify_assignment_in_course(1, 99, user, "http://localhost", db)
    assert exc.value.status_code == 422
    assert "assignment" in exc.value.detail.lower()


# ---------------------------------------------------------------------------
# 404s must never reach the client raw (Draft Feedback "Something went wrong
# on our end"). parseApiError in the frontend renders any 404 with that exact
# copy, so an untranslated 404 here reads as a server fault rather than
# something the instructor can act on. verify_assignment_in_course already
# translates; this path did not.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_student_check_translates_a_canvas_404_into_actionable_422():
    """fetch_student_enrollment surfaces Canvas's own 404 ("Canvas resource
    not found") when the stored canvas_course_id no longer exists -- routine
    against a rebuilt sandbox, since local Course rows outlive the container.
    """
    db = AsyncMock()
    user = AsyncMock()
    course = MagicMock(id=1, canvas_course_id="42", canvas_url="http://localhost")
    with (
        patch(
            "app.services.feedback_validation.get_owned_course",
            new=AsyncMock(return_value=course),
        ),
        patch(
            "app.services.feedback_validation.require_canvas_token",
            return_value="token",
        ),
        patch(
            "app.services.feedback_validation.fetch_student_enrollment",
            new=AsyncMock(
                side_effect=HTTPException(
                    status_code=404, detail="Canvas resource not found"
                )
            ),
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            await verify_canvas_student_in_course(1, 99, user, "http://localhost", db)

    assert exc.value.status_code == 422
    assert "Something went wrong" not in str(exc.value.detail)
    assert "course" in str(exc.value.detail).lower()


@pytest.mark.asyncio
async def test_student_check_translates_an_unowned_course_404_into_422():
    db = AsyncMock()
    user = AsyncMock()
    with patch(
        "app.services.feedback_validation.get_owned_course",
        new=AsyncMock(
            side_effect=HTTPException(
                status_code=404, detail="Course not found or does not belong to you."
            )
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            await verify_canvas_student_in_course(1, 99, user, "http://localhost", db)

    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_student_check_leaves_non_404_failures_alone():
    """A Canvas outage is a real 502 and must keep saying so -- translating
    everything to 422 would blame the instructor for an upstream failure.
    """
    db = AsyncMock()
    user = AsyncMock()
    course = MagicMock(id=1, canvas_course_id="42", canvas_url="http://localhost")
    with (
        patch(
            "app.services.feedback_validation.get_owned_course",
            new=AsyncMock(return_value=course),
        ),
        patch(
            "app.services.feedback_validation.require_canvas_token",
            return_value="token",
        ),
        patch(
            "app.services.feedback_validation.fetch_student_enrollment",
            new=AsyncMock(
                side_effect=HTTPException(
                    status_code=502, detail="Could not reach Canvas"
                )
            ),
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            await verify_canvas_student_in_course(1, 99, user, "http://localhost", db)

    assert exc.value.status_code == 502
