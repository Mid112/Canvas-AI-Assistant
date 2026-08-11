"""The "testing 2 course has no assignments yet" loop (bugs.txt:847).

An instructor asked about the assignment "testing event 2" while the
conversation was set to a course called "testing 2". The reply — "testing 2
course has no assignments yet" — was true, useless, and byte-identical on
every following turn, including one that named a completely different course.

The name similarity made it look like fuzzy matching had turned "testing
event 2" into "testing 2". It had not: the course was never resolved from
the message at all, it was the already-set active course, and nothing in the
turn ever asked whether that course was the wrong one. These tests pin the
missing signal — a named assignment that exists in another course is
evidence about the COURSE — and the deterministic backstop for when the
LLM switch resolver returns nothing.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services.chat import (
    _assignment_elsewhere_clarify,
    _match_course_name,
    _normalize_course_text,
    _prescan_course_reference,
)


def _course_name_row(name, local_course_id, code=None):
    return SimpleNamespace(
        name=name,
        local_course_id=local_course_id,
        course=SimpleNamespace(name=name, course_code=code, id=local_course_id),
    )


# ── the misdiagnosis this bug invites ────────────────────────────────────────


def test_assignment_name_does_not_fuzzy_match_the_similar_course():
    """"testing 2" is not a substring of "testing event 2" once normalized, so
    the matcher never produced this pairing. Pinned so the fix is not later
    "corrected" by loosening the matcher, which would create the exact
    false-positive everyone assumed was already happening."""
    assert _normalize_course_text("testing 2") == "testing2"
    assert _normalize_course_text("testing event 2") == "testingevent2"
    assert "testing2" not in "testingevent2"

    courses = [_course_name_row("testing 2", 1)]
    assert _match_course_name(courses, "testing event 2") is None
    assert _prescan_course_reference(
        courses, "send message to all students who submitted to testing event 2"
    ) is None


# ── the actual signal ────────────────────────────────────────────────────────


def test_clarify_names_the_course_that_actually_has_the_assignment():
    course = SimpleNamespace(id=1, name="testing 2")

    result = _assignment_elsewhere_clarify(
        course, "testing event 2", [(9, "Baking 101", "Testing Event 2")]
    )

    assert result["action"] == "clarify"
    # Names the assumption ("this conversation is set to that course"), which
    # the old wording never surfaced.
    assert "testing 2" in result["question"]
    assert "Baking 101" in result["question"]
    assert "Should I switch" in result["question"]


def test_clarify_records_candidates_so_a_one_word_reply_lands():
    """The old clarify recorded nothing, so the next turn had nothing to
    anchor to and resolved the same wrong way — which is what made the reply
    repeat verbatim."""
    course = SimpleNamespace(id=1, name="testing 2")

    result = _assignment_elsewhere_clarify(
        course, "testing event 2", [(9, "Baking 101", "Testing Event 2")]
    )

    # Its own field, not a generic course-name clarify: this one is a yes/no
    # offer whose answer switches the conversation and resumes the
    # interrupted request, which no other clarify does.
    assert result["clarify_field"] == "course_switch"
    assert result["clarify_candidates"] == [{"id": 9, "label": "Baking 101"}]


def test_several_owning_courses_are_all_offered():
    course = SimpleNamespace(id=1, name="testing 2")

    result = _assignment_elsewhere_clarify(
        course, "quiz 1", [(9, "Baking 101", "Quiz 1"), (10, "CPSC 310", "Quiz 1")]
    )

    assert "Baking 101" in result["question"]
    assert "CPSC 310" in result["question"]
    assert len(result["clarify_candidates"]) == 2


def test_assignment_reference_is_preserved_for_the_next_turn():
    """Losing it would make the switch answer useless — the instructor would
    have to retype what they were asking about."""
    course = SimpleNamespace(id=1, name="testing 2")

    result = _assignment_elsewhere_clarify(
        course, "testing event 2", [(9, "Baking 101", "Testing Event 2")]
    )

    assert result["partial_plan"]["assignment_reference"] == "testing event 2"


# ── the cross-course lookup ──────────────────────────────────────────────────


async def _find(reference, rows, exclude=1):
    from app.services import chat as chat_module

    db = AsyncMock()
    db.execute = AsyncMock(return_value=rows)
    return await chat_module._find_assignment_in_other_courses(
        db, SimpleNamespace(id=1), exclude, reference
    )


@pytest.mark.anyio
async def test_lookup_matches_across_punctuation_and_case():
    found = await _find("testing event 2", [(9, "Baking 101", "Testing Event 2")])

    assert found == [(9, "Baking 101", "Testing Event 2")]


@pytest.mark.anyio
async def test_lookup_ignores_unrelated_assignments():
    found = await _find("testing event 2", [(9, "Baking 101", "Midterm")])

    assert found == []


@pytest.mark.anyio
async def test_lookup_skips_a_reference_too_short_to_be_meaningful():
    """A 1-2 character reference would substring-match almost every title and
    turn a helpful hint into a wrong one."""
    found = await _find("q1", [(9, "Baking 101", "Quiz 1")])

    assert found == []


@pytest.mark.anyio
async def test_lookup_needs_no_reference_to_stay_silent():
    assert await _find(None, [(9, "Baking 101", "Quiz 1")]) == []
