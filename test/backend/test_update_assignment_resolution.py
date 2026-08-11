"""update_assignment accepted names that were never checked against Canvas.

Four transcripts from one session, all on the same workflow:

    > update the assignment tiger
    < No fields were specified to update assignment 'Midterm 1' in Course 1.
      [a write preview, awaiting approval, for a no-op, on an assignment the
       instructor never named]

    > update the assignment Oregon
    < I have the assignment "Oregon". Which assignment in Evil Course did you
      mean? Options: The Ethics of Blenders, commit history, ...

    > update the assignment cats
    < I have the assignment "cats". What changes would you like to make to the
      assignment "cats"?

Neither "tiger", "Oregon" nor "cats" exists. "tiger" became Midterm 1 because
a course holding exactly one assignment short-circuited to it whatever the
instructor typed. The other two were never resolved at all — the model simply
repeated the name back as a thing it had, and the conversation carried on as
if it were real.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services.chat import (
    _offer_to_create_missing_assignment,
    _resolve_assignment_reference,
)


def _adapter(assignment_id=None) -> AsyncMock:
    adapter = AsyncMock()
    adapter.generate.return_value = '{"assignment_id": %s}' % (
        "null" if assignment_id is None else assignment_id
    )
    return adapter


# ------------------------------------------- the one-assignment short circuit


@pytest.mark.asyncio
async def test_a_named_reference_is_checked_even_when_the_course_has_one_assignment():
    """The precise cause of tiger -> Midterm 1. The shortcut returned the only
    assignment without ever looking at what the instructor wrote."""
    assignments = [{"id": 41, "name": "Midterm 1"}]

    resolved = await _resolve_assignment_reference(
        assignments, "tiger", "update the assignment tiger", _adapter(None)
    )

    assert resolved is None, (
        "a name that matches nothing must not resolve just because the course "
        "happens to hold a single assignment"
    )


@pytest.mark.asyncio
async def test_an_unnamed_reference_still_takes_the_only_assignment():
    """The counterpart that must keep working: with nothing named, "the
    assignment" in a one-assignment course can only mean that one, and it
    should not cost an LLM call to say so."""
    adapter = _adapter(None)

    resolved = await _resolve_assignment_reference(
        [{"id": 41, "name": "Midterm 1"}], None, "update the assignment", adapter
    )

    assert resolved == 41
    adapter.generate.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_blank_reference_counts_as_unnamed():
    resolved = await _resolve_assignment_reference(
        [{"id": 41, "name": "Midterm 1"}], "   ", "update it", _adapter(None)
    )

    assert resolved == 41


@pytest.mark.asyncio
async def test_a_real_name_still_resolves_in_a_one_assignment_course():
    """Checking the reference must not mean rejecting a correct one."""
    resolved = await _resolve_assignment_reference(
        [{"id": 41, "name": "Midterm 1"}], "midterm", "update midterm", _adapter(41)
    )

    assert resolved == 41


@pytest.mark.asyncio
async def test_the_model_still_cannot_invent_an_id():
    """Unchanged guarantee: an id outside the real list is refused."""
    resolved = await _resolve_assignment_reference(
        [{"id": 41, "name": "Midterm 1"}, {"id": 42, "name": "Final"}],
        "tiger",
        "update tiger",
        _adapter(9999),
    )

    assert resolved is None


# ------------------------------------------------ offering to create instead


class _FakeDb:
    def __init__(self, course_name: str | None = "Evil Course"):
        self._course_name = course_name

    async def scalar(self, _statement):
        return self._course_name


def _clarify(candidates=("The Ethics of Blenders", "commit history")):
    return {
        "action": "clarify",
        "clarify": True,
        "question": "Which assignment in Evil Course did you mean? Options: ...",
        "partial_plan": {"local_course_id": 946},
        "clarify_field": "assignment_reference",
        "clarify_candidates": [{"id": i, "label": n} for i, n in enumerate(candidates)],
    }


@pytest.mark.asyncio
async def test_a_missing_assignment_is_named_as_missing_and_offered_for_creation():
    offer = await _offer_to_create_missing_assignment(_FakeDb(), _clarify(), "Oregon")

    assert "couldn't find an assignment called \"Oregon\" in Evil Course" in offer["question"]
    assert "create \"Oregon\" instead?" in offer["question"]
    # The real alternatives still come from the app, never from the model.
    assert "The Ethics of Blenders" in offer["question"]


@pytest.mark.asyncio
async def test_an_empty_course_offers_creation_without_a_list_of_options():
    offer = await _offer_to_create_missing_assignment(
        _FakeDb(), _clarify(candidates=()), "Oregon"
    )

    assert "Would you like me to create \"Oregon\" instead?" in offer["question"]
    assert "Did you mean one of these" not in offer["question"]


@pytest.mark.asyncio
async def test_a_clarify_about_something_else_is_passed_through_untouched():
    """Read paths share the resolver; only the update chain calls this."""
    course_clarify = {"action": "clarify", "clarify": True, "question": "Which course?"}

    assert (
        await _offer_to_create_missing_assignment(_FakeDb(), course_clarify, "Oregon")
        is course_clarify
    )


@pytest.mark.asyncio
async def test_no_offer_is_made_when_the_instructor_named_nothing():
    """"update an assignment" with no name is a genuine "which one?", not a
    missing assignment — offering to create something unnamed is nonsense."""
    clarify = _clarify()

    assert await _offer_to_create_missing_assignment(_FakeDb(), clarify, None) is clarify
    assert await _offer_to_create_missing_assignment(_FakeDb(), clarify, "  ") is clarify


@pytest.mark.asyncio
async def test_the_offer_survives_an_unknown_course_name():
    offer = await _offer_to_create_missing_assignment(_FakeDb(None), _clarify(), "Oregon")

    assert "couldn't find an assignment called \"Oregon\"." in offer["question"]


# ------------------------------------------ a rename is keyed on the transition


def test_renaming_back_and_forth_is_not_deduplicated_into_a_no_op():
    """"banana bread" -> "cherry mango pie" -> back -> forward again.

    An assignment is referenced by its Canvas id, and fetch_assignments
    re-syncs titles on every turn, so the rename itself resolves fine
    afterwards. The hazard is the write: a key built only from the destination
    makes the third rename identical to the first, and it replays the cached
    Canvas response instead of issuing the call.
    """
    from app.services.canvas_idempotency import build_idempotency_key

    def key(previous_name, new_name):
        return build_idempotency_key(
            "update_assignment", 1, 2, 41, previous_name, None, None, 100.0,
            {"name": new_name, "points_possible": 100.0},
        )

    # Same rename attempted twice from the same starting title: still deduped.
    assert key("banana bread", "cherry mango pie") == key("banana bread", "cherry mango pie")
    # Renaming back to a title it held before is a new write, and must run.
    assert key("banana bread", "cherry mango pie") != key("cherry mango pie", "banana bread")
