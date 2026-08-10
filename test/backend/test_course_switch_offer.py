"""Offering a course switch when the request can only succeed elsewhere,
then continuing the interrupted work after a plain "yes".

The failure this replaces (bugs.txt:847): an instructor asked about an
assignment that lives in another course, got a true-but-useless statement
about the course the conversation happened to be on, and every retry
produced the same sentence. Nothing offered a way out, and nothing carried
the original request across.

The two halves that matter here are that a non-answer must NOT be read as
consent (a wrong "yes" moves work into a different Canvas course), and that
a real "yes" replays what was originally asked instead of just changing the
course and forgetting the task.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services.chat import (
    COURSE_SWITCH_EXPECTATION_FIELD,
    _apply_pending_course_switch,
    _assignment_elsewhere_clarify,
)
from app.services.field_memory import read_yes_no, record_pending_expectation


# ── reading the answer ───────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("reply", "expected"),
    [
        ("yes", True), ("Yes", True), ("yep", True), ("sure", True),
        ("go ahead", True), ("do it", True), ("ok", True), ("switch", True),
        ("yes, switch to capstone", True),
        ("no", False), ("nah", False), ("nope", False), ("no thanks", False),
        ("never mind", False), ("stay here", False), ("cancel", False),
        # Not an answer — must never be read as consent.
        ("what about lab 4", None),
        ("show me the roster", None),
        ("", None),
        (None, None),
    ],
)
def test_read_yes_no(reply, expected):
    assert read_yes_no(reply) is expected


def test_no_inside_an_agreement_is_not_a_refusal():
    """A substring search for "no" would read this as declining."""
    assert read_yes_no("no problem, go ahead") is not False


# ── the offer ────────────────────────────────────────────────────────────────


def _offer(elsewhere, user_message="who submitted to testing event 2?"):
    return _assignment_elsewhere_clarify(
        SimpleNamespace(id=1, name="testing 2"),
        "testing event 2", elsewhere, user_message,
    )


def test_offer_carries_the_interrupted_request():
    """Without this a "yes" changes the course and drops the task, making the
    instructor retype everything."""
    offer = _offer([(9, "Capstone Project", "Testing Event 2")])

    assert offer["clarify_field"] == COURSE_SWITCH_EXPECTATION_FIELD
    payload = offer["clarify_payload"]
    assert payload["local_course_id"] == 9
    assert payload["user_message"] == "who submitted to testing event 2?"


def test_ambiguous_offer_carries_no_course_id():
    """With several owning courses a bare "yes" is not an answer — which one
    is still unknown, so the reply has to name it."""
    offer = _offer([(9, "Capstone Project", "Quiz 1"), (10, "CPSC 310", "Quiz 1")])

    assert offer["clarify_payload"]["local_course_id"] is None
    assert len(offer["clarify_candidates"]) == 2


# ── answering it ─────────────────────────────────────────────────────────────


def _conversation(payload, course_name="testing 2"):
    conversation = SimpleNamespace(
        field_memory={}, course_id=1, course_name=course_name
    )
    record_pending_expectation(
        conversation,
        field=COURSE_SWITCH_EXPECTATION_FIELD,
        question="Should I switch?",
        candidates=[{"id": 9, "label": "Capstone Project"}],
        payload=payload,
    )
    return conversation


_PAYLOAD = {
    "user_message": "who submitted to testing event 2?",
    "local_course_id": 9,
    "course_name": "Capstone Project",
}


async def _answer(message, payload=None, conversation=None, owner_id=1):
    from app.services import chat as chat_module

    conversation = conversation or _conversation(
        _PAYLOAD if payload is None else payload
    )
    db = AsyncMock()
    db.get = AsyncMock(
        return_value=SimpleNamespace(id=9, name="Capstone Project", instructor_id=owner_id)
    )
    routed = SimpleNamespace(id=77, course_id=9, course_name="Capstone Project",
                             field_memory={})
    with (
        patch.object(chat_module, "_stable_course_name",
                     new=AsyncMock(return_value="Capstone Project")),
        patch.object(chat_module, "_sync_course_context_envelope", new=AsyncMock()),
        patch.object(chat_module, "_find_or_fork_conversation_for_course",
                     new=AsyncMock(return_value=routed)),
    ):
        result = await chat_module._apply_pending_course_switch(
            db, SimpleNamespace(id=1), conversation, message
        )
    return result, conversation, routed


@pytest.mark.anyio
async def test_yes_switches_and_replays_the_original_request():
    result, conversation, routed = await _answer("yes")

    terminal, replay, switched = result
    # No terminal result: the turn carries on and actually does the work.
    assert terminal is None
    assert replay == "who submitted to testing event 2?"
    # Routed to the target course's OWN conversation rather than re-pointing
    # this one — the tab strip is built on the server doing exactly this.
    assert switched is routed
    assert switched.course_id == 9


@pytest.mark.anyio
async def test_a_casual_yes_works_too():
    result, conversation, routed = await _answer("go ahead")

    assert result[0] is None
    assert result[2] is routed


@pytest.mark.anyio
async def test_no_stays_put_and_does_not_switch():
    result, conversation, routed = await _answer("nah")

    terminal, _, unchanged = result
    assert terminal["action"] == "respond"
    assert unchanged is conversation
    assert conversation.course_id == 1
    assert "Staying in" in terminal["message"]


@pytest.mark.anyio
async def test_declining_clears_the_offer_so_it_is_not_asked_forever():
    _, conversation, _routed = await _answer("no")

    assert conversation.field_memory.get("pending_expectation") is None


@pytest.mark.anyio
async def test_changing_the_subject_is_not_consent():
    """The whole point of the confirmation: an unrelated message must fall
    through to the normal turn, not silently move work to another course."""
    result, conversation, routed = await _answer("actually show me the roster")

    assert result is None
    assert conversation.course_id == 1
    # And the stale offer is dropped rather than left to swallow a later reply.
    assert conversation.field_memory.get("pending_expectation") is None


@pytest.mark.anyio
async def test_naming_the_course_answers_an_ambiguous_offer():
    """With two candidates there is no id in the payload, so the reply has to
    supply it — "capstone project" is both the consent and the choice."""
    conversation = _conversation(
        {"user_message": "who submitted to quiz 1?", "local_course_id": None,
         "course_name": None}
    )
    result, conversation, routed = await _answer(
        "capstone project", conversation=conversation
    )

    assert result[0] is None
    assert result[1] == "who submitted to quiz 1?"
    assert result[2] is routed


@pytest.mark.anyio
async def test_a_course_not_owned_by_this_instructor_is_refused():
    """The id comes back out of conversation memory, so ownership is
    re-checked at use rather than trusted from when it was stored."""
    result, conversation, routed = await _answer("yes", owner_id=999)

    terminal, _, unchanged = result
    assert terminal["action"] == "respond"
    assert "no longer available" in terminal["message"]
    assert unchanged.course_id == 1


@pytest.mark.anyio
async def test_an_offer_without_the_original_request_says_so():
    result, _, _routed = await _answer(
        "yes", payload={"local_course_id": 9, "user_message": ""}
    )

    terminal, _, _unchanged = result
    assert terminal["action"] == "respond"
    assert "lost track" in terminal["message"]


@pytest.mark.anyio
async def test_no_pending_offer_leaves_the_turn_alone():
    conversation = SimpleNamespace(field_memory={}, course_id=1, course_name="testing 2")

    result, _, _routed = await _answer("yes", conversation=conversation)

    assert result is None
