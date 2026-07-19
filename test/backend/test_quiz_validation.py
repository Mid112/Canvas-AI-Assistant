from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException

from app.services.quiz_validation import (
    _check_allowed_attempts,
    _check_points_possible,
    _check_questions,
    _check_title,
)


def test_quiz_title_required():
    with pytest.raises(HTTPException) as exc:
        _check_title("   ")
    assert exc.value.status_code == 422


def test_quiz_points_must_be_positive():
    with pytest.raises(HTTPException) as exc:
        _check_points_possible(0)
    assert exc.value.status_code == 422


def test_quiz_allowed_attempts_minimum():
    with pytest.raises(HTTPException) as exc:
        _check_allowed_attempts(0)
    assert exc.value.status_code == 422
    _check_allowed_attempts(1)
    _check_allowed_attempts(None)


def test_quiz_questions_require_text():
    with pytest.raises(HTTPException) as exc:
        _check_questions([{"question_text": "  ", "points_possible": 1}])
    assert exc.value.status_code == 422
    _check_questions(
        [{"question_text": "What is recursion?", "points_possible": 2}]
    )


def test_future_due_date_helper_still_accepts_iso():
    # Smoke: validation helpers import cleanly and accept a future ISO date
    # through the same path the create endpoint uses.
    from app.services.quiz_validation import _check_due_date

    future = (datetime.now(UTC) + timedelta(days=3)).replace(microsecond=0).isoformat()
    _check_due_date(future)
