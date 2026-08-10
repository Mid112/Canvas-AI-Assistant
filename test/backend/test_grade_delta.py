"""Coverage for relative grade adjustments ("add 5 marks to everyone").

new_grade is a single absolute value, which has no correct answer for a
relative request: each student's target depends on the score they already
have. Emitting one value would set the whole class to 5. These tests pin the
parse, the per-student arithmetic, and the two cases where the honest answer
is to leave students out rather than invent a grade for them.
"""

import pytest

from app.services.chat import apply_grade_delta, parse_grade_delta


def _sub(user_id, score, name=None):
    return {"user_id": user_id, "score": score, "student_name": name or f"S{user_id}"}


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("+5", 5.0),
        ("-3", -3.0),
        ("+ 5", 5.0),
        ("+2.5", 2.5),
        ("  +5  ", 5.0),
        # Absolute grades must stay absolute — 85 is a legitimate grade, not
        # an instruction to add 85 to everyone.
        ("85", None),
        ("0", None),
        # Non-numeric grading is left entirely alone for the existing path.
        ("A", None),
        ("complete", None),
        ("85%", None),
        ("", None),
    ],
)
def test_parse_grade_delta(value, expected):
    assert parse_grade_delta(value) == expected


def test_delta_is_applied_per_student_against_current_scores():
    adjusted, skipped = apply_grade_delta(
        [_sub(1, 80), _sub(2, 55), _sub(3, 90)], 5
    )

    assert [(row["user_id"], row["new_grade"]) for row in adjusted] == [
        (1, "85"),
        (2, "60"),
        (3, "95"),
    ]
    assert skipped == []


def test_ungraded_students_are_skipped_not_zeroed():
    """"Add 5" to someone never graded would invent a 5 out of nothing and
    mark unmarked work as graded."""
    adjusted, skipped = apply_grade_delta([_sub(1, 80), _sub(2, None)], 5)

    assert [row["user_id"] for row in adjusted] == [1]
    assert [row["user_id"] for row in skipped] == [2]


def test_negative_results_clamp_at_zero():
    """Canvas rejects a negative score, and submitting one would fail the
    batch partway through rather than at the boundary."""
    adjusted, _ = apply_grade_delta([_sub(1, 2)], -5)

    assert adjusted[0]["new_grade"] == "0"


def test_subtraction_uses_the_signed_delta():
    adjusted, _ = apply_grade_delta([_sub(1, 80)], -3)

    assert adjusted[0]["new_grade"] == "77"


def test_fractional_results_keep_their_decimal():
    adjusted, _ = apply_grade_delta([_sub(1, 80)], 2.5)

    assert adjusted[0]["new_grade"] == "82.5"


def test_current_score_is_reported_alongside_the_target():
    """The Grades tab shows what each student is moving from, so a wrong
    delta is visible before approval rather than after submission."""
    adjusted, _ = apply_grade_delta([_sub(1, 80, "Ann")], 5)

    assert adjusted[0]["current_score"] == 80.0
    assert adjusted[0]["name"] == "Ann"


def test_rows_without_a_user_id_are_dropped():
    adjusted, skipped = apply_grade_delta(
        [{"score": 80}, _sub(2, 70)], 5
    )

    assert [row["user_id"] for row in adjusted] == [2]
    assert skipped == []
