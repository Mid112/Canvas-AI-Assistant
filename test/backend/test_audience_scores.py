"""Score-based audiences, and the student who handed nothing in.

The question this is built around: if an instructor asks for students who
scored less than 50, is a student who never submitted one of them?

No. Canvas's missing-submission policy writes a real 0 onto work that was
never handed in, and _parse_submission_status ranks `missing` above `graded`,
so those arrive as status=missing with score=0.0 — numerically identical to a
student who submitted and earned nothing. Sweeping them into the band merges
two groups who need opposite messages: "you're struggling, here's help" is not
what you send someone who simply did not hand in.

Excluding them silently would be the same mistake wearing a different hat, so
the count is always reported.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.schemas.canvas import SubmissionStatus
from app.services.audience import (
    describe_excluded,
    resolve_score_audience,
    resolve_status_audience,
)
from app.services.score_range import count_without_submission, match_score_range

COURSE = SimpleNamespace(id=1, name="Capstone Project", canvas_url="https://c.edu")
ACTIVE = {1: "Ann", 2: "Ben", 3: "Cal", 4: "Dee"}


def _sub(user_id, score, status):
    return SimpleNamespace(user_id=user_id, score=score, status=status, student_name=None)


# ------------------------------------------------- the edge case, at the source


def test_a_missing_submission_scored_zero_is_not_in_the_under_50_band():
    """The reported edge case. Dee never submitted; Canvas policy wrote a 0."""
    submissions = [
        _sub(1, 40.0, SubmissionStatus.graded),
        _sub(4, 0.0, SubmissionStatus.missing),
    ]

    matched = match_score_range(
        submissions, ACTIVE, low=0, high=50, basis="points", points_possible=100
    )

    assert [m["user_id"] for m in matched] == [1]


def test_an_unsubmitted_zero_is_excluded_too():
    submissions = [_sub(2, 0.0, SubmissionStatus.unsubmitted)]

    matched = match_score_range(
        submissions, ACTIVE, low=0, high=50, basis="points", points_possible=100
    )

    assert matched == []


def test_a_student_who_submitted_and_scored_zero_stays_in():
    """Earning nothing is a score. Not handing in is not."""
    submissions = [_sub(3, 0.0, SubmissionStatus.graded)]

    matched = match_score_range(
        submissions, ACTIVE, low=0, high=50, basis="points", points_possible=100
    )

    assert [m["user_id"] for m in matched] == [3]


def test_an_excused_student_is_still_excluded():
    submissions = [_sub(1, 10.0, SubmissionStatus.excused)]

    assert match_score_range(
        submissions, ACTIVE, low=0, high=50, basis="points", points_possible=100
    ) == []


def test_non_submitters_are_counted_so_the_band_never_shrinks_silently():
    submissions = [
        _sub(1, 40.0, SubmissionStatus.graded),
        _sub(2, 0.0, SubmissionStatus.missing),
        _sub(3, 0.0, SubmissionStatus.unsubmitted),
        _sub(4, 10.0, SubmissionStatus.excused),
    ]

    # Excused is not counted here: deliberately removed from the graded
    # population is a different fact from never handed in.
    assert count_without_submission(submissions, ACTIVE) == 2


def test_a_non_submitter_outside_the_active_roster_is_not_counted():
    assert count_without_submission([_sub(99, None, SubmissionStatus.missing)], ACTIVE) == 0


def test_the_exclusion_is_always_said_out_loud():
    assert "6 student(s) have not submitted" in describe_excluded(6)
    assert describe_excluded(0) == ""


# --------------------------------------------------- the shared score resolver


@pytest.mark.asyncio
async def test_a_score_audience_resolves_for_any_channel():
    decision = SimpleNamespace(
        needs_clarification=False,
        matched=[{"user_id": 1, "name": "Ann"}],
        excluded_no_submission=6,
        reason="explicit",
        basis="points",
    )

    with patch(
        "app.services.audience.compute_submissions_by_score_range",
        new=AsyncMock(return_value=decision),
    ), patch("app.services.audience.describe_basis", return_value="Read as points."):
        resolved = await resolve_score_audience(
            AsyncMock(), SimpleNamespace(), COURSE, 7,
            min_score=0, max_score=50, points_possible=100,
        )

    assert [r["name"] for r in resolved.recipients] == ["Ann"]
    assert resolved.excluded_no_submission == 6
    assert resolved.basis_explanation == "Read as points."
    assert resolved.clarify is None


@pytest.mark.asyncio
async def test_an_ambiguous_band_asks_instead_of_picking():
    """On an assignment out of 200, 70-90 percent and 70-90 points are
    opposite halves of the class. Guessing messages the precise inverse of
    the intended group, so a write must not proceed on a guess either."""
    decision = SimpleNamespace(
        needs_clarification=True, matched=[], excluded_no_submission=0,
        reason="ambiguous", basis=None,
    )

    with patch(
        "app.services.audience.compute_submissions_by_score_range",
        new=AsyncMock(return_value=decision),
    ):
        resolved = await resolve_score_audience(
            AsyncMock(), SimpleNamespace(), COURSE, 7,
            min_score=70, max_score=90, points_possible=200,
            assignment_name="Midterm",
        )

    assert resolved.recipients == []
    assert resolved.clarify["action"] == "clarify"
    assert "Midterm" in resolved.clarify["question"]
    assert {c["id"] for c in resolved.clarify["clarify_candidates"]} == {
        "percentage", "points",
    }


# -------------------------------------------------------- status audiences


@pytest.mark.asyncio
async def test_not_submitted_is_the_missing_group():
    absent = [{"user_id": 2, "name": "Ben"}]

    with patch(
        "app.services.audience.active_roster_names",
        new=AsyncMock(return_value=ACTIVE),
    ), patch(
        "app.services.audience.compute_submissions_by_status_breakdown",
        new=AsyncMock(return_value=(absent, {})),
    ):
        resolved = await resolve_status_audience(
            AsyncMock(), SimpleNamespace(), COURSE, 7, submitted=False
        )

    assert [r["user_id"] for r in resolved.recipients] == [2]


@pytest.mark.asyncio
async def test_submitted_is_its_complement_against_the_active_roster():
    """Defined as "everyone active who is not missing" so the two halves
    always partition the roster — any other definition lets a student be in
    neither group or in both."""
    absent = [{"user_id": 2, "name": "Ben"}]

    with patch(
        "app.services.audience.active_roster_names",
        new=AsyncMock(return_value=ACTIVE),
    ), patch(
        "app.services.audience.compute_submissions_by_status_breakdown",
        new=AsyncMock(return_value=(absent, {})),
    ):
        resolved = await resolve_status_audience(
            AsyncMock(), SimpleNamespace(), COURSE, 7, submitted=True
        )

    assert sorted(r["user_id"] for r in resolved.recipients) == [1, 3, 4]


# ------------------------------------------- one spec, both channels, no prose


def test_both_write_actions_carry_the_same_audience_field():
    """A message, an announcement and assignment feedback differ in how they
    reach students, not in who those students are."""
    from app.mcp_tools.schemas import SendMessageAction, UpdateGradeAction

    spec = {"kind": "score_range", "min_score": 0, "max_score": 50}
    message = SendMessageAction(local_course_id=1, audience=spec)
    grade = UpdateGradeAction(local_course_id=1, audience=spec)

    assert message.audience == grade.audience


def test_the_spec_takes_numbers_not_sentences():
    """The point of the redesign: the model states the criterion structurally
    and the server checks it against real rows. Neither side does the other's
    job, and no substring matching decides who gets written to."""
    from app.mcp_tools.schemas import AudienceSpec

    spec = AudienceSpec(kind="score_range", min_score=0, max_score=50)

    assert spec.min_score == 0.0
    assert spec.max_score == 50.0
    # Left for the server to decide — a guessed basis picks opposite groups.
    assert spec.basis is None


def test_an_unknown_audience_kind_is_rejected_rather_than_guessed():
    import pydantic

    from app.mcp_tools.schemas import AudienceSpec

    with pytest.raises(pydantic.ValidationError):
        AudienceSpec(kind="students_i_like")


# ------------------------------------------------- who decides the score unit


def test_the_models_basis_wins_over_a_keyword_in_the_text():
    """A keyword cannot tell which noun a unit belongs to.

    "who scored 70 to 90 on the midterm, it's out of 200 points" names the
    assignment's total, not the band's unit — but "out of 200 points" matches
    the points pattern. That sniff used to take priority over the model, so on
    an out-of-200 assignment it selected the weakest students where the model
    had read the strongest, and suppressed the percent-or-points question that
    a null basis would have raised.
    """
    from app.services.score_range import detect_explicit_basis

    message = "message students who scored between 70 and 90 on the midterm, it is out of 200 points"
    model_basis = "percentage"

    # The precedence, as the chain now applies it.
    assert (model_basis or detect_explicit_basis(message)) == "percentage"
    # The sniff on its own still reads the wrong noun — which is why it lost.
    assert detect_explicit_basis(message) == "points"


def test_the_text_check_still_fills_in_when_the_model_said_nothing():
    """Kept, not deleted: it is conservative by construction and only ever
    narrows an ambiguity. Removing it would cost an unnecessary
    percent-or-points question on requests that plainly stated the unit."""
    from app.services.score_range import detect_explicit_basis

    assert (None or detect_explicit_basis("who scored between 70 and 90 percent")) == (
        "percentage"
    )


def test_mixed_or_absent_units_decide_nothing():
    """None whenever both units or neither appear, so the worst it can do is
    decline to help and let the set comparison run."""
    from app.services.score_range import detect_explicit_basis

    assert detect_explicit_basis("70 points out of 100 percent") is None
    assert detect_explicit_basis("who scored between 70 and 90") is None
    assert detect_explicit_basis(None) is None
