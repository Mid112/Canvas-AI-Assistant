from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException

from app.services.quiz_validation import (
    _check_allowed_attempts,
    _check_description,
    _check_points_possible,
    _check_questions,
    _check_title,
)


def test_quiz_title_required():
    with pytest.raises(HTTPException) as exc:
        _check_title("   ")
    assert exc.value.status_code == 422


def test_quiz_description_requires_minimum_length():
    with pytest.raises(HTTPException) as exc:
        _check_description("quiz")
    assert exc.value.status_code == 422
    assert "at least 20" in exc.value.detail
    _check_description("Check understanding of recursive functions.")


def test_quiz_rejects_profanity_in_title_and_questions():
    with pytest.raises(HTTPException) as exc:
        _check_title("Fucking midterm quiz")
    assert exc.value.status_code == 422
    assert "appropriate" in exc.value.detail.lower()

    with pytest.raises(HTTPException) as exc:
        _check_description("This quiz covers shitty edge cases in recursion.")
    assert exc.value.status_code == 422
    assert "appropriate" in exc.value.detail.lower()

    with pytest.raises(HTTPException) as exc:
        _check_questions(
            [
                {
                    "question_text": "Explain this bitch of a proof.",
                    "question_type": "essay_question",
                    "points_possible": 2,
                }
            ]
        )
    assert exc.value.status_code == 422
    assert "appropriate" in exc.value.detail.lower()


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
        [
            {
                "question_text": "What is recursion?",
                "question_type": "essay_question",
                "points_possible": 2,
            }
        ]
    )


def test_quiz_rejects_invalid_question_type():
    with pytest.raises(HTTPException) as exc:
        _check_questions(
            [
                {
                    "question_text": "What is recursion?",
                    "question_type": "invalid_type",
                    "points_possible": 1,
                }
            ]
        )
    assert exc.value.status_code == 422
    assert "unsupported question_type" in exc.value.detail


def test_true_false_requires_exactly_one_correct_answer():
    with pytest.raises(HTTPException) as exc:
        _check_questions(
            [
                {
                    "question_text": "Recursion needs a base case?",
                    "question_type": "true_false_question",
                    "points_possible": 1,
                    "answers": [
                        {"text": "True", "weight": 0},
                        {"text": "False", "weight": 0},
                    ],
                }
            ]
        )
    assert exc.value.status_code == 422
    assert "exactly one correct answer" in exc.value.detail


def test_true_false_rejects_wrong_answer_count():
    with pytest.raises(HTTPException) as exc:
        _check_questions(
            [
                {
                    "question_text": "Recursion needs a base case?",
                    "question_type": "true_false_question",
                    "points_possible": 1,
                    "answers": [{"text": "True", "weight": 100}],
                }
            ]
        )
    assert exc.value.status_code == 422
    assert "exactly 2 answers" in exc.value.detail


def test_multiple_choice_requires_valid_weights():
    with pytest.raises(HTTPException) as exc:
        _check_questions(
            [
                {
                    "question_text": "Which is a base case?",
                    "question_type": "multiple_choice_question",
                    "points_possible": 1,
                    "answers": [
                        {"text": "zero", "weight": 50},
                        {"text": "infinity", "weight": 50},
                    ],
                }
            ]
        )
    assert exc.value.status_code == 422
    assert "0 or 100" in exc.value.detail

    _check_questions(
        [
            {
                "question_text": "Which is a base case?",
                "question_type": "multiple_choice_question",
                "points_possible": 1,
                "answers": [
                    {"text": "zero", "weight": 100},
                    {"text": "infinity", "weight": 0},
                ],
            }
        ]
    )


def test_quiz_rejects_empty_content():
    with pytest.raises(HTTPException) as exc:
        from app.services.quiz_validation import _check_has_scorable_content

        _check_has_scorable_content([], [])
    assert exc.value.status_code == 422
    assert "at least one question" in exc.value.detail


def test_quiz_rejects_mismatched_points_total():
    with pytest.raises(HTTPException) as exc:
        from app.services.quiz_validation import _check_points_consistency

        _check_points_consistency(
            100,
            [
                {
                    "question_text": "What is recursion?",
                    "question_type": "essay_question",
                    "points_possible": 5,
                }
            ],
            None,
        )
    assert exc.value.status_code == 422
    assert "must equal" in exc.value.detail


def test_future_due_date_helper_still_accepts_iso():
    # Smoke: validation helpers import cleanly and accept a future ISO date
    # through the same path the create endpoint uses.
    from app.services.quiz_validation import _check_due_date

    future = (datetime.now(UTC) + timedelta(days=3)).replace(microsecond=0).isoformat()
    _check_due_date(future)
