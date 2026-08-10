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

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

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


_COURSE_NAMES = {9: "Capstone Project", 10: "CPSC 310"}

_ONE_CANDIDATE = [{"id": 9, "label": "Capstone Project"}]
_TWO_CANDIDATES = [{"id": 9, "label": "Capstone Project"}, {"id": 10, "label": "CPSC 310"}]


def _conversation(payload, course_name="testing 2", candidates=None):
    conversation = SimpleNamespace(
        id=5, field_memory={}, course_id=1, course_name=course_name
    )
    record_pending_expectation(
        conversation,
        field=COURSE_SWITCH_EXPECTATION_FIELD,
        question="Should I switch?",
        candidates=_ONE_CANDIDATE if candidates is None else candidates,
        payload=payload,
    )
    return conversation


_PAYLOAD = {
    "user_message": "who submitted to testing event 2?",
    "assignment_reference": "Testing Event 2",
    "local_course_id": 9,
    "course_name": "Capstone Project",
}


def _adapter(answer="unrelated", *, course_id=None, raises=None, raw=None):
    """An LLM stub for the confirmation resolver.

    Defaults to "unrelated" — the safe answer — so a test that does not care
    about the resolver cannot pass because the stub happened to consent.
    """
    adapter = SimpleNamespace()
    if raises is not None:
        adapter.generate = AsyncMock(side_effect=raises)
    else:
        adapter.generate = AsyncMock(
            return_value=raw
            if raw is not None
            else json.dumps({"answer": answer, "course_id": course_id})
        )
    return adapter


# The db mock from the most recent _answer, so a test can read what the switch
# wrote into the transcript without every caller having to unpack it.
_LAST_DB: list = []


def _logged_messages() -> list:
    return [call.args[0] for call in _LAST_DB[-1].add.call_args_list]


async def _answer(
    message, payload=None, conversation=None, owner_id=1, adapter=None,
):
    from app.services import chat as chat_module

    conversation = conversation or _conversation(
        _PAYLOAD if payload is None else payload
    )
    db = AsyncMock()
    db.get = AsyncMock(
        side_effect=lambda _model, course_id: SimpleNamespace(
            id=course_id,
            name=_COURSE_NAMES.get(course_id, "Unknown"),
            instructor_id=owner_id,
        )
    )
    # Session.add is synchronous; an AsyncMock here returns an un-awaited
    # coroutine and buries the real assertions in warnings.
    db.add = MagicMock()
    _LAST_DB.append(db)
    # Built from the course actually routed to, so the returned conversation
    # is evidence of WHICH course was chosen, not just that one was.
    forked: list[SimpleNamespace] = []

    def _fork(_db, _user, course_id, course_name):
        forked.append(
            SimpleNamespace(id=77, course_id=course_id, course_name=course_name,
                            field_memory={})
        )
        return forked[-1]

    with (
        patch.object(chat_module, "_stable_course_name",
                     new=AsyncMock(return_value="Capstone Project")),
        patch.object(chat_module, "_sync_course_context_envelope", new=AsyncMock()),
        patch.object(chat_module, "_find_or_fork_conversation_for_course",
                     new=AsyncMock(side_effect=_fork)),
    ):
        result = await chat_module._apply_pending_course_switch(
            db, SimpleNamespace(id=1), conversation, message,
            _adapter() if adapter is None else adapter,
        )
    return result, conversation, (forked[-1] if forked else None)


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


# ── what each transcript is left holding ─────────────────────────────────────


@pytest.mark.anyio
async def test_the_course_being_left_records_where_the_work_went():
    """Its own turn ended on a bare "yes", which reads as a question this
    course never answered — the same dead end the offer exists to remove."""
    await _answer("yes")

    logged = _logged_messages()
    assert len(logged) == 1
    note = logged[0]
    # Written into the course being LEFT, not the one being entered.
    assert note.conversation_id == 5
    assert note.role == "assistant"

    said = json.loads(note.content)["message"]
    assert "Testing Event 2" in said       # what wasn't here
    assert "testing 2" in said             # where it wasn't
    assert "Capstone Project" in said      # where the work went


@pytest.mark.anyio
async def test_declining_writes_no_note():
    """Nothing moved, so there is nothing to explain — and a "switched to..."
    line in a course that was never left would be a plain lie in the record."""
    await _answer("nah")

    assert _logged_messages() == []


@pytest.mark.anyio
async def test_a_non_answer_writes_no_note():
    await _answer("actually show me the roster")

    assert _logged_messages() == []


# ── answering it in words the list doesn't have ──────────────────────────────
#
# read_yes_no is a fixed vocabulary: "yeah let's do that" matches nothing in
# it. A dedicated resolver reads those, and runs ONLY when an offer is
# outstanding and both free checks came back with nothing.


@pytest.mark.anyio
async def test_an_agreement_outside_the_word_list_still_switches():
    result, _conv, routed = await _answer(
        "yeah let's do that", adapter=_adapter("yes", course_id=9)
    )

    assert result[0] is None
    assert result[1] == "who submitted to testing event 2?"
    assert routed.course_id == 9


@pytest.mark.anyio
async def test_a_refusal_outside_the_word_list_stays_put():
    result, conversation, routed = await _answer(
        "I'd rather keep looking here", adapter=_adapter("no")
    )

    assert result[0]["action"] == "respond"
    assert "Staying in" in result[0]["message"]
    assert routed is None
    assert conversation.course_id == 1


@pytest.mark.anyio
async def test_unrelated_is_not_consent():
    """The reason this resolver is allowed to exist: it must be able to say
    "that wasn't an answer" as confidently as it says yes."""
    result, conversation, routed = await _answer(
        "which one has more students?", adapter=_adapter("unrelated")
    )

    assert result is None
    assert routed is None
    assert conversation.field_memory.get("pending_expectation") is None


@pytest.mark.anyio
async def test_a_literal_yes_never_pays_for_a_call():
    adapter = _adapter("unrelated")

    result, _conv, routed = await _answer("yes", adapter=adapter)

    adapter.generate.assert_not_awaited()
    assert result[0] is None
    assert routed.course_id == 9


@pytest.mark.anyio
async def test_a_named_course_never_pays_for_a_call():
    adapter = _adapter("unrelated")

    result, _conv, routed = await _answer(
        "capstone project",
        conversation=_conversation(
            {"user_message": "who submitted to quiz 1?", "local_course_id": None,
             "course_name": None}
        ),
        adapter=adapter,
    )

    adapter.generate.assert_not_awaited()
    assert result[0] is None
    assert routed.course_id == 9


@pytest.mark.anyio
async def test_without_an_adapter_only_the_deterministic_reads_run():
    """Passing None is what a caller with no working provider does, and it has
    to degrade to the old behaviour rather than to a silent switch."""
    from app.services import chat as chat_module

    conversation = _conversation(_PAYLOAD)
    result = await chat_module._apply_pending_course_switch(
        AsyncMock(), SimpleNamespace(id=1), conversation, "yeah let's do that", None,
    )

    assert result is None
    assert conversation.course_id == 1


@pytest.mark.anyio
async def test_the_resolver_picks_among_several_offered_courses():
    result, _conv, routed = await _answer(
        "the 310 one please",
        conversation=_conversation(
            {"user_message": "who submitted to quiz 1?", "local_course_id": None,
             "course_name": None},
            candidates=_TWO_CANDIDATES,
        ),
        adapter=_adapter("yes", course_id=10),
    )

    assert result[0] is None
    assert routed.course_id == 10
    assert routed.course_name == "CPSC 310"


@pytest.mark.anyio
async def test_an_unpinned_yes_to_several_courses_answers_nothing():
    """Same rule the deterministic path applies to a bare "yes": agreeing to a
    list does not say which one, and picking for them would move work into a
    course they never named."""
    result, _conv, routed = await _answer(
        "sounds right",
        conversation=_conversation(
            {"user_message": "who submitted to quiz 1?", "local_course_id": None,
             "course_name": None},
            candidates=_TWO_CANDIDATES,
        ),
        adapter=_adapter("yes", course_id=None),
    )

    assert result is None
    assert routed is None


# ── the resolver on its own ──────────────────────────────────────────────────


async def _resolve(reply, candidates=_ONE_CANDIDATE, **adapter_kwargs):
    from app.services import chat as chat_module

    return await chat_module._resolve_switch_confirmation(
        "Should I switch?", candidates, reply, _adapter(**adapter_kwargs)
    )


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("answer", "expected"),
    [("yes", (True, 9)), ("no", (False, None))],
)
async def test_resolver_returns_the_answer(answer, expected):
    assert await _resolve("whatever", answer=answer, course_id=9) == expected


@pytest.mark.anyio
async def test_resolver_cannot_invent_a_course():
    """The id is validated against what was actually offered — a hallucinated
    course would otherwise be switched into on the model's say-so."""
    assert await _resolve(
        "sure", candidates=_TWO_CANDIDATES, answer="yes", course_id=404
    ) is None


@pytest.mark.anyio
async def test_resolver_falls_back_to_the_only_course_offered():
    assert await _resolve("sure", answer="yes", course_id=None) == (True, 9)


@pytest.mark.anyio
@pytest.mark.parametrize(
    "raw",
    [
        '{"answer": "maybe", "course_id": 9}',   # a label this resolver never defined
        '{"answer": null}',
        "not json at all",
        '["yes"]',
        "",
    ],
)
async def test_resolver_treats_anything_it_cannot_read_as_not_an_answer(raw):
    """Every unreadable response has to land on "no answer", never on consent:
    a malformed reply must not be able to move a course."""
    assert await _resolve("yeah", raw=raw) is None


@pytest.mark.anyio
async def test_resolver_survives_a_provider_failure():
    """A dead provider must not 500 a turn whose entire content is "yeah"."""
    assert await _resolve("yeah", raises=RuntimeError("provider down")) is None


@pytest.mark.anyio
async def test_resolver_survives_a_timeout():
    import asyncio

    assert await _resolve("yeah", raises=asyncio.TimeoutError()) is None


@pytest.mark.anyio
async def test_resolver_is_told_the_real_candidate_list():
    """It can only pick from what it is shown, so the listing is the whole
    safety boundary — an empty or wrong listing silently disables the id check."""
    from app.services import chat as chat_module

    adapter = _adapter("yes", course_id=10)
    await chat_module._resolve_switch_confirmation(
        "Should I switch?", _TWO_CANDIDATES, "the 310 one", adapter
    )

    prompt = adapter.generate.await_args.args[1]
    assert "id=9" in prompt and "Capstone Project" in prompt
    assert "id=10" in prompt and "CPSC 310" in prompt
    assert "the 310 one" in prompt
