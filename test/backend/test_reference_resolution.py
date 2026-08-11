"""Resolving a reference against every course, not just the one you are in.

The failure this replaces: an instructor sitting in Capstone Project asked for
the due date of "homework 1 limits" — an assignment in Math 101. Capstone had
a "Homework 1", which was close enough to win by default, because in-course
resolution was only ever *first*, never *compared*. The same shape hides a
person: "milliken" means Joshua Parker-Milliken in Math 101, and a Capstone
roster holding a Joshua Parker must not absorb it.

The scoring rules are the whole safety story here — a score that is too
generous moves an instructor's work into a Canvas course they never named —
so they are pinned directly rather than through a resolver.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services.reference_resolution import (
    CROSS_COURSE_MARGIN,
    MIN_CROSS_COURSE_CONFIDENCE,
    ReferenceCandidates,
    ReferenceMatch,
    normalize_reference,
    score_reference,
)


# ── scoring ──────────────────────────────────────────────────────────────────


def test_an_exact_match_scores_one():
    assert score_reference("homework 1 limits", "homework 1 limits") == 1.0
    # Case and punctuation are formatting, not meaning.
    assert score_reference("testing event 2", "Testing Event 2") == 1.0
    assert score_reference("joshua parker-milliken", "Joshua Parker Milliken") == 1.0


def test_a_word_the_instructor_said_that_is_missing_costs_more_than_extra_words():
    """The asymmetry the whole module turns on.

    An unmatched word in the REFERENCE is a contradiction — "limits" is
    precisely what makes these two different assignments. An unmatched word in
    the LABEL is just an abbreviation: nobody types a student's full name.
    """
    missing_a_word_they_said = score_reference("homework 1 limits", "Homework 1")
    extra_words_in_the_label = score_reference("milliken", "Joshua Parker-Milliken")

    assert missing_a_word_they_said < extra_words_in_the_label


def test_the_real_case_prefers_the_other_course():
    """Capstone's "Homework 1" must not beat Math 101's exact title."""
    assert score_reference("homework 1 limits", "homework 1 limits") > score_reference(
        "homework 1 limits", "Homework 1"
    ) + CROSS_COURSE_MARGIN


def test_a_surname_finds_the_hyphenated_student_and_not_the_other_one():
    assert score_reference("milliken", "Joshua Parker-Milliken") >= MIN_CROSS_COURSE_CONFIDENCE
    # No shared token at all — a substring search would have matched neither,
    # but a *prefix* search on "Parker" would wrongly match this one.
    assert score_reference("milliken", "Joshua Parker") == 0.0


def test_a_shared_generic_word_is_not_a_match():
    """"homework 1" vs "homework 4" share a word and nothing else. Scoring
    these as a match is how a confident answer lands on the wrong row."""
    assert score_reference("homework 1", "Homework 4") < MIN_CROSS_COURSE_CONFIDENCE
    assert score_reference("quiz 1", "Quiz 23") < MIN_CROSS_COURSE_CONFIDENCE


def test_nothing_in_common_scores_zero():
    assert score_reference("testing event 2", "Final banana bread") == 0.0
    assert score_reference("", "Homework 1") == 0.0
    assert score_reference("Homework 1", "") == 0.0


def test_normalization_keeps_word_boundaries():
    """A separator-stripping normalizer would turn this into one long token,
    and "milliken" would then only match by substring — which also matches
    "arker" and "kermi"."""
    assert normalize_reference("Joshua Parker-Milliken") == "joshua parker milliken"
    assert normalize_reference("  HOMEWORK   1: limits!  ") == "homework 1 limits"


# ── choosing between here and elsewhere ──────────────────────────────────────


def _match(course_id, label, score, course_name="Some Course"):
    return ReferenceMatch(
        local_course_id=course_id,
        course_name=course_name,
        entity_id=str(course_id * 100),
        label=label,
        score=score,
    )


def _candidates(here, elsewhere):
    return ReferenceCandidates(reference="x", here=here, elsewhere=elsewhere)


def test_a_clearly_better_match_elsewhere_wins():
    candidates = _candidates(
        here=[_match(1, "Homework 1", 0.66)],
        elsewhere=[_match(2, "homework 1 limits", 1.0, "Math 101")],
    )

    assert candidates.elsewhere_is_better
    assert candidates.best_elsewhere.course_name == "Math 101"


def test_a_tie_leaves_the_instructor_where_they_are():
    """Two courses with an assignment of the same name is not evidence the
    conversation is on the wrong one — and staying is the recoverable
    direction, while switching does work somewhere they never named."""
    candidates = _candidates(
        here=[_match(1, "Quiz 1", 1.0)],
        elsewhere=[_match(2, "Quiz 1", 1.0)],
    )

    assert not candidates.elsewhere_is_better


def test_a_marginally_better_match_elsewhere_is_not_enough():
    candidates = _candidates(
        here=[_match(1, "Lab Report", 0.80)],
        elsewhere=[_match(2, "Lab Reports", 0.90)],
    )

    assert not candidates.elsewhere_is_better


def test_a_weak_match_elsewhere_is_never_raised_even_with_nothing_here():
    """Otherwise every unrecognised phrase turns into "did you mean another
    course?", which is noise on the common case of a simple typo."""
    candidates = _candidates(here=[], elsewhere=[_match(2, "Homework 4", 0.40)])

    assert not candidates.elsewhere_is_better


def test_a_good_match_elsewhere_wins_when_nothing_here_matched():
    candidates = _candidates(here=[], elsewhere=[_match(2, "Testing Event 2", 1.0)])

    assert candidates.elsewhere_is_better


def test_only_comparably_good_courses_are_offered():
    """With "Quiz 1" in three courses, a 0.95 and a 0.60 are not the same
    question — listing both invites picking the wrong one."""
    candidates = _candidates(
        here=[],
        elsewhere=[
            _match(2, "Quiz 1", 0.95, "Math 101"),
            _match(3, "Quiz 1", 0.90, "CPSC 310"),
            _match(4, "Quiz 1 draft", 0.60, "Baking 101"),
        ],
    )

    assert [m.course_name for m in candidates.switch_targets] == ["Math 101", "CPSC 310"]


# ── the local index ──────────────────────────────────────────────────────────


def _course(course_id, name):
    return SimpleNamespace(
        id=course_id, name=name, canvas_url="https://canvas.test", instructor_id=1
    )


async def _find(kind, reference, current_course_id, courses, rows):
    from app.services import reference_resolution as module

    db = AsyncMock()
    db.scalars = AsyncMock(return_value=courses)
    db.execute = AsyncMock(return_value=rows)
    return await module.find_reference(
        db,
        SimpleNamespace(id=1),
        kind=kind,
        reference=reference,
        current_course_id=current_course_id,
    )


@pytest.mark.anyio
async def test_the_reported_case_end_to_end():
    candidates = await _find(
        "assignment",
        "homework 1 limits",
        current_course_id=1,
        courses=[_course(1, "Capstone Project"), _course(2, "Math 101")],
        rows=[(1, "900", "Homework 1"), (2, "901", "homework 1 limits")],
    )

    assert candidates.elsewhere_is_better
    assert candidates.best_elsewhere.course_name == "Math 101"
    assert candidates.best_elsewhere.entity_id == "901"
    # Capstone's near-miss is still reported, just outranked — the caller
    # needs it to explain the choice rather than assert a bare "not here".
    assert candidates.best_here.label == "Homework 1"


@pytest.mark.anyio
async def test_the_student_case_end_to_end():
    candidates = await _find(
        "student",
        "milliken",
        current_course_id=1,
        courses=[_course(1, "Capstone Project"), _course(2, "Math 101")],
        rows=[(1, "50", "Joshua Parker"), (2, "51", "Joshua Parker-Milliken")],
    )

    assert candidates.here == []
    assert candidates.best_elsewhere.entity_id == "51"


@pytest.mark.anyio
async def test_a_reference_too_short_to_mean_anything_matches_nothing():
    """A 1-3 character reference hits a token in half of any real course, and
    a confident wrong answer here moves work into another Canvas course."""
    candidates = await _find(
        "assignment", "q1", current_course_id=1,
        courses=[_course(1, "Capstone Project")],
        rows=[(1, "900", "Quiz 1")],
    )

    assert candidates.here == []
    assert candidates.elsewhere == []


@pytest.mark.anyio
async def test_matches_are_ordered_best_first():
    candidates = await _find(
        "assignment",
        "instance segmentation with transformers",
        current_course_id=99,
        courses=[_course(1, "Capstone Project")],
        rows=[
            (1, "900", "Instance Segmentation: CNNs and Transformers"),
            (1, "901", "Instance Segmentation with CNNs and Transformers"),
            (1, "902", "Object Segmentation"),
        ],
    )

    scores = [match.score for match in candidates.elsewhere]
    assert scores == sorted(scores, reverse=True)
    assert candidates.best_elsewhere.entity_id == "901"


# ── warming the index ────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_a_course_that_was_never_opened_is_indexed_on_demand():
    """The bug this closes: the index is written only by get_assignments, so a
    course the instructor has never browsed has zero rows — and "not there"
    was indistinguishable from "never looked". That is what made a real
    assignment come back as "which of your courses contains this?"."""
    from app.services import reference_resolution as module

    db = AsyncMock()
    db.scalars = AsyncMock(return_value=[_course(1, "Capstone Project"), _course(2, "Math 101")])
    # Math 101 has no rows at all until it is fetched.
    db.execute = AsyncMock(return_value=[(1, "900", "Homework 1")])

    fetched: list[int] = []

    async def _fetch(course_id, _user, _url, _db):
        fetched.append(course_id)
        db.execute = AsyncMock(
            return_value=[(1, "900", "Homework 1"), (2, "901", "homework 1 limits")]
        )
        return []

    with patch("app.services.canvas.get_assignments", new=_fetch):
        candidates = await module.find_reference_across_courses(
            db, SimpleNamespace(id=1),
            kind="assignment", reference="homework 1 limits", current_course_id=1,
        )

    assert fetched == [2]
    assert candidates.best_elsewhere.course_name == "Math 101"


@pytest.mark.anyio
async def test_the_index_is_not_warmed_when_the_local_pass_already_answered():
    """Warming costs a Canvas call per course on a latency-sensitive path, so
    it only runs when the alternative is "I couldn't find it anywhere"."""
    from app.services import reference_resolution as module

    db = AsyncMock()
    db.scalars = AsyncMock(return_value=[_course(1, "Capstone"), _course(2, "Math 101")])
    db.execute = AsyncMock(return_value=[(2, "901", "homework 1 limits")])

    with patch("app.services.canvas.get_assignments", new=AsyncMock()) as fetch:
        await module.find_reference_across_courses(
            db, SimpleNamespace(id=1),
            kind="assignment", reference="homework 1 limits", current_course_id=1,
        )

    fetch.assert_not_called()


@pytest.mark.anyio
async def test_an_exact_local_match_never_goes_to_canvas():
    """The common case, and the one that decides whether every assignment
    question pays a Canvas round trip. Nothing an unindexed course holds could
    beat an exact hit by the margin, so looking is latency for a foregone
    conclusion."""
    from app.services import reference_resolution as module

    db = AsyncMock()
    db.scalars = AsyncMock(return_value=[_course(1, "Capstone"), _course(2, "Math 101")])
    # Math 101 is unindexed; Capstone has the exact title.
    db.execute = AsyncMock(return_value=[(1, "900", "Homework 1")])

    with patch("app.services.canvas.get_assignments", new=AsyncMock()) as fetch:
        candidates = await module.find_reference_across_courses(
            db, SimpleNamespace(id=1),
            kind="assignment", reference="Homework 1", current_course_id=1,
        )

    fetch.assert_not_called()
    assert candidates.best_here.score == 1.0
    assert not candidates.elsewhere_is_better


@pytest.mark.anyio
async def test_a_canvas_failure_degrades_to_the_local_answer():
    """A chat turn about an assignment must not fail because an unrelated
    course's token expired."""
    from app.services import reference_resolution as module

    db = AsyncMock()
    db.scalars = AsyncMock(return_value=[_course(1, "Capstone"), _course(2, "Math 101")])
    db.execute = AsyncMock(return_value=[(1, "900", "Homework 1")])

    with patch(
        "app.services.canvas.get_assignments",
        new=AsyncMock(side_effect=RuntimeError("token expired")),
    ):
        candidates = await module.find_reference_across_courses(
            db, SimpleNamespace(id=1),
            kind="assignment", reference="homework 1 limits", current_course_id=1,
        )

    assert not candidates.elsewhere_is_better
    assert candidates.best_here.label == "Homework 1"


@pytest.mark.anyio
async def test_indexing_is_capped_so_one_question_cannot_walk_every_course():
    from app.services import reference_resolution as module

    courses = [_course(i, f"Course {i}") for i in range(1, 12)]
    db = AsyncMock()
    db.scalars = AsyncMock(return_value=courses)
    db.execute = AsyncMock(return_value=[])

    with patch("app.services.canvas.get_assignments", new=AsyncMock()) as fetch:
        await module.ensure_courses_indexed(
            db, SimpleNamespace(id=1), kind="assignment", exclude_course_id=1
        )

    assert fetch.await_count == module.MAX_COURSES_TO_INDEX
