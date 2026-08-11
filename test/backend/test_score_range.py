"""Coverage for resolving "students who scored between X and Y".

The interesting part is not the filtering, it's deciding what the numbers
meant. "Between 70 and 90" is impossible as points out of 50, identical
either way out of 100, and selects two opposite groups out of 200 — so the
rule has to decide from the sets each reading selects, never from how many
students each one matched. These tests pin that specifically: the
same-count-different-people case is the one a count comparison gets wrong,
and it has its own test.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.mcp_tools.schemas import ResolveScoreRangeAction, SemanticIntentAction
from app.schemas.canvas import SubmissionStatus
from app.services.intent import normalize_semantic_intent
from app.services.resolved_set import compute_submissions_by_score_range
from app.services.score_range import (
    BasisDecision,
    describe_basis,
    detect_explicit_basis,
    format_range,
    looks_non_numeric,
    match_score_range,
    resolve_score_basis,
)


def _sub(user_id: int, score, *, status=SubmissionStatus.graded, grade=None):
    return SimpleNamespace(
        user_id=user_id, score=score, status=status,
        student_name=f"S{user_id}", grade=grade,
    )


def _rows(*user_ids):
    return [{"user_id": uid, "name": f"S{uid}"} for uid in user_ids]


# ── explicit phrasing ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("students who got between 70 and 90 percent", "percentage"),
        ("who scored 70%-90%", "percentage"),
        ("students between 70 and 90 points", "points"),
        ("anyone with 70 to 90 marks", "points"),
        ("who got 70 to 90 out of 100", "points"),
        # No unit named — the whole reason the set comparison exists.
        ("message students who got between 70 and 90", None),
        # Naming both units is not an instruction, it's a reason to fall
        # through rather than to pick whichever pattern ran first.
        ("students between 70 percent and 90 points", None),
        ("", None),
        (None, None),
    ],
)
def test_detect_explicit_basis(text, expected):
    assert detect_explicit_basis(text) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("percent", "percentage"), ("%", "percentage"), ("Percentage", "percentage"),
        ("pts", "points"), ("marks", "points"), ("POINTS", "points"),
        (None, None),
    ],
)
def test_schema_normalizes_basis_synonyms(raw, expected):
    assert ResolveScoreRangeAction(
        local_course_id=1, min_score=70, max_score=90, basis=raw
    ).basis == expected


def test_schema_rejects_an_unknown_basis():
    """Falling back to a default here would turn a malformed request into a
    confidently wrong set of students."""
    with pytest.raises(ValueError):
        ResolveScoreRangeAction(
            local_course_id=1, min_score=70, max_score=90, basis="curved"
        )


def test_schema_leaves_basis_unset_by_default():
    action = ResolveScoreRangeAction(local_course_id=1, min_score=70, max_score=90)
    assert action.basis is None


# ── matching ─────────────────────────────────────────────────────────────────


_ROSTER = {1: "S1", 2: "S2", 3: "S3", 4: "S4"}


def test_match_is_inclusive_at_both_ends():
    """Instructors draw lines on round numbers; excluding the endpoints drops
    exactly the students sitting on them."""
    subs = [_sub(1, 70), _sub(2, 90), _sub(3, 69.9), _sub(4, 90.1)]

    matched = match_score_range(
        subs, _ROSTER, low=70, high=90, basis="points", points_possible=100
    )

    assert [row["user_id"] for row in matched] == [1, 2]


def test_ungraded_and_excused_never_match():
    subs = [
        _sub(1, None, status=SubmissionStatus.unsubmitted),
        _sub(2, 80, status=SubmissionStatus.excused),
        _sub(3, 80),
    ]

    matched = match_score_range(
        subs, _ROSTER, low=70, high=90, basis="points", points_possible=100
    )

    assert [row["user_id"] for row in matched] == [3]


def test_students_off_the_active_roster_never_match():
    subs = [_sub(1, 80), _sub(99, 80)]

    matched = match_score_range(
        subs, _ROSTER, low=70, high=90, basis="points", points_possible=100
    )

    assert [row["user_id"] for row in matched] == [1]


def test_percentage_converts_against_points_possible():
    # Out of 200: 70-90% is 140-180 points.
    subs = [_sub(1, 150), _sub(2, 80), _sub(3, 190)]

    matched = match_score_range(
        subs, _ROSTER, low=70, high=90, basis="percentage", points_possible=200
    )

    assert [row["user_id"] for row in matched] == [1]


# ── the decision rule ────────────────────────────────────────────────────────


def test_explicit_basis_skips_the_heuristic_entirely():
    decision = resolve_score_basis(
        low=70, high=90, points_possible=200,
        percentage_matched=_rows(1, 2), points_matched=_rows(3),
        requested_basis="points",
    )

    assert decision.basis == "points"
    assert decision.reason == "explicit"
    assert [r["user_id"] for r in decision.matched] == [3]
    assert not decision.needs_clarification


def test_explicit_percentage_falls_back_when_there_is_no_points_value():
    decision = resolve_score_basis(
        low=70, high=90, points_possible=None,
        percentage_matched=None, points_matched=_rows(1),
        requested_basis="percentage",
    )

    assert decision.basis == "points"
    assert decision.reason == "percentage_undefined"


def test_no_points_possible_leaves_only_the_points_reading():
    decision = resolve_score_basis(
        low=70, high=90, points_possible=0,
        percentage_matched=None, points_matched=_rows(1),
    )

    assert decision.basis == "points"
    assert decision.reason == "no_points_possible"


def test_range_above_points_possible_resolves_to_percentage():
    """The user's 50-point case: 90 points is not a possible score, so the
    points reading is incoherent rather than merely empty — decided without
    consulting a single student."""
    decision = resolve_score_basis(
        low=70, high=90, points_possible=50,
        percentage_matched=_rows(1, 2), points_matched=[],
    )

    assert decision.basis == "percentage"
    assert decision.reason == "range_exceeds_points_possible"
    assert [r["user_id"] for r in decision.matched] == [1, 2]


def test_range_above_100_resolves_to_points():
    decision = resolve_score_basis(
        low=150, high=180, points_possible=200,
        percentage_matched=[], points_matched=_rows(1),
    )

    assert decision.basis == "points"
    assert decision.reason == "range_exceeds_100_percent"


def test_neither_reading_reachable_returns_empty_without_asking():
    decision = resolve_score_basis(
        low=150, high=180, points_possible=50,
        percentage_matched=[], points_matched=[],
    )

    assert decision.reason == "no_coherent_basis"
    assert decision.matched == []
    assert not decision.needs_clarification


def test_identical_sets_proceed_without_asking():
    """The out-of-100 case: both readings are the same query, so there is
    nothing to ask about."""
    decision = resolve_score_basis(
        low=70, high=90, points_possible=100,
        percentage_matched=_rows(1, 2, 3), points_matched=_rows(1, 2, 3),
    )

    assert decision.reason == "identical"
    assert not decision.needs_clarification
    assert [r["user_id"] for r in decision.matched] == [1, 2, 3]


def test_only_percentage_matches_resolves_to_percentage():
    decision = resolve_score_basis(
        low=70, high=90, points_possible=120,
        percentage_matched=_rows(1, 2, 3, 4), points_matched=[],
    )

    assert decision.basis == "percentage"
    assert decision.reason == "only_percentage_matches"


def test_only_points_matches_resolves_to_points():
    decision = resolve_score_basis(
        low=70, high=90, points_possible=120,
        percentage_matched=[], points_matched=_rows(1, 2),
    )

    assert decision.basis == "points"
    assert decision.reason == "only_points_matches"


def test_both_empty_is_a_zero_result_not_a_question():
    decision = resolve_score_basis(
        low=70, high=90, points_possible=120,
        percentage_matched=[], points_matched=[],
    )

    assert decision.reason == "both_empty"
    assert not decision.needs_clarification


def test_two_live_readings_selecting_different_students_asks():
    """The out-of-200 case: percent picks the strong students, points picks
    the weak ones."""
    decision = resolve_score_basis(
        low=70, high=90, points_possible=200,
        percentage_matched=_rows(1, 2), points_matched=_rows(3, 4),
    )

    assert decision.basis is None
    assert decision.reason == "ambiguous"
    assert decision.needs_clarification
    # Both candidate lists survive, so the question can show what each
    # reading would have selected.
    assert [r["user_id"] for r in decision.percentage_matched] == [1, 2]
    assert [r["user_id"] for r in decision.points_matched] == [3, 4]


def test_same_count_different_students_still_asks():
    """The case a count comparison gets wrong: two readings of equal size
    that share nobody. Sizes match, so a "difference of 0 students" rule
    would auto-resolve it and message the wrong group."""
    decision = resolve_score_basis(
        low=70, high=90, points_possible=200,
        percentage_matched=_rows(1, 2, 3), points_matched=_rows(4, 5, 6),
    )

    assert decision.needs_clarification
    assert decision.reason == "ambiguous"


def test_partial_overlap_still_asks():
    decision = resolve_score_basis(
        low=70, high=90, points_possible=200,
        percentage_matched=_rows(1, 2, 3), points_matched=_rows(3, 4, 5),
    )

    assert decision.needs_clarification


# ── non-numeric grading ──────────────────────────────────────────────────────


def test_complete_incomplete_grading_is_detected():
    subs = [_sub(1, 1, grade="complete"), _sub(2, 0, grade="incomplete")]

    assert looks_non_numeric(subs) is True


def test_one_hand_entered_complete_does_not_make_it_pass_fail():
    """A points assignment where a single student was marked complete is
    still a points assignment; refusing to band it would be worse than the
    problem being avoided."""
    subs = [_sub(1, 85, grade="85"), _sub(2, 1, grade="complete")]

    assert looks_non_numeric(subs) is False


def test_an_ungraded_assignment_is_not_non_numeric():
    """Nobody graded yet is an empty result, not a nonsense request."""
    assert looks_non_numeric([_sub(1, None), _sub(2, None)]) is False


# ── wording ──────────────────────────────────────────────────────────────────


def test_format_range_trims_pointless_decimals():
    assert format_range(70.0, 90.0, "percentage") == "70-90 percent"
    assert format_range(70.5, 90.0, "points") == "70.5-90 points"


def test_every_resolved_reason_explains_itself():
    """The instructor can only catch a wrong auto-pick if the pick is
    stated, so no resolved reason may fall through to a bare default."""
    reasons = [
        ("explicit", "percentage"),
        ("percentage_undefined", "points"),
        ("no_points_possible", "points"),
        ("range_exceeds_points_possible", "percentage"),
        ("range_exceeds_100_percent", "points"),
        ("identical", "percentage"),
        ("only_percentage_matches", "percentage"),
        ("only_points_matches", "points"),
        ("both_empty", "percentage"),
        ("no_coherent_basis", "percentage"),
    ]
    fallback = "Read as 70-90 percent."
    for reason, basis in reasons:
        described = describe_basis(BasisDecision(basis, reason), 70, 90, 100)
        assert described, reason
        assert described != fallback, f"{reason} fell through to the default"


def test_points_possible_explanation_names_the_assignment_scale():
    decision = resolve_score_basis(
        low=70, high=90, points_possible=50,
        percentage_matched=_rows(1), points_matched=[],
    )

    described = describe_basis(decision, 70, 90, 50)

    assert "out of 50 points" in described
    assert "70-90 points" in described


# ── end to end through the resolver ──────────────────────────────────────────


async def _compute(subs, *, points_possible, requested_basis=None, low=70, high=90):
    course = SimpleNamespace(id=7, canvas_url="https://canvas.test")
    with patch(
        "app.services.resolved_set.get_submissions", new_callable=AsyncMock
    ) as submissions:
        submissions.return_value = subs
        decision = await compute_submissions_by_score_range(
            course, 99, SimpleNamespace(id=1), None,
            low=low, high=high, points_possible=points_possible,
            requested_basis=requested_basis,
            active_names=_ROSTER,
        )
    return decision, submissions


@pytest.mark.anyio
async def test_resolver_computes_both_readings_from_one_fetch():
    """Two calls would double the Canvas cost of a single question, and could
    return sets that were never both true at the same moment — which matters
    here because the whole decision is a comparison between them."""
    decision, submissions = await _compute(
        [_sub(1, 150), _sub(2, 80)], points_possible=200
    )

    assert submissions.await_count == 1
    assert decision.needs_clarification
    assert [r["user_id"] for r in decision.percentage_matched] == [1]
    assert [r["user_id"] for r in decision.points_matched] == [2]


@pytest.mark.anyio
async def test_resolver_swaps_a_reversed_range():
    decision, _ = await _compute(
        [_sub(1, 80)], points_possible=100, low=90, high=70
    )

    assert [r["user_id"] for r in decision.matched] == [1]


@pytest.mark.anyio
async def test_resolver_reports_non_numeric_grading():
    decision, _ = await _compute(
        [_sub(1, 1, grade="complete"), _sub(2, 0, grade="incomplete")],
        points_possible=1,
    )

    assert decision.unsupported
    # Never a percent-or-points question: there is no such choice to offer.
    assert not decision.needs_clarification


@pytest.mark.anyio
async def test_resolver_resolves_the_out_of_50_case_to_percentage():
    decision, _ = await _compute([_sub(1, 40), _sub(2, 20)], points_possible=50)

    assert decision.basis == "percentage"
    assert decision.reason == "range_exceeds_points_possible"
    # 40/50 is 80% — inside 70-90. 20/50 is 40% — outside.
    assert [r["user_id"] for r in decision.matched] == [1]


@pytest.mark.anyio
async def test_resolver_resolves_the_out_of_100_case_silently():
    decision, _ = await _compute([_sub(1, 80), _sub(2, 40)], points_possible=100)

    assert decision.reason == "identical"
    assert not decision.needs_clarification
    assert [r["user_id"] for r in decision.matched] == [1]


# ── intent mapping ───────────────────────────────────────────────────────────


def test_semantic_intent_carries_the_band_through():
    result = normalize_semantic_intent(
        SemanticIntentAction(
            intent="find_score_range", assignment_reference="the midterm",
            min_score=70, max_score=90,
        ),
        local_course_id=3,
    )

    assert result["action"] == "resolve_score_range"
    assert result["min_score"] == 70
    assert result["max_score"] == 90
    assert result["assignment_reference"] == "the midterm"
    # Absent, not null-and-present: an unset basis is what lets the resolver
    # compare both readings instead of committing to a guess.
    assert "basis" not in result


def test_semantic_intent_forwards_an_explicit_basis():
    result = normalize_semantic_intent(
        SemanticIntentAction(
            intent="find_score_range", min_score=70, max_score=90, basis="percent",
        ),
        local_course_id=3,
    )

    assert result["basis"] == "percentage"


def test_semantic_intent_without_a_band_clarifies():
    """Silently widening to "all students" would be the same class of bug as
    dropping a status filter."""
    result = normalize_semantic_intent(
        SemanticIntentAction(intent="find_score_range", min_score=70),
        local_course_id=3,
    )

    assert result["action"] == "clarify"
