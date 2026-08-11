"""One "are we in the right course?" check, reached by every workflow.

The complaint this answers: one workflow worked and a near-identical one
didn't, because the switch offer had been written into the read chains and
nowhere else. send_message had none of it, so when the assignment lived in
another course the server said nothing and the model improvised its own
"should I switch?" — a question with no candidates and no payload, which made
"yes please" a brand-new request rather than an answer. The reply came back as
a submissions report with the message body gone.

These tests are less about any one workflow than about the wiring: the same
function decides it, the offers it produces are interchangeable, and a
workflow that forgets to call it fails visibly here rather than in use.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services.chat import (
    COURSE_SWITCH_EXPECTATION_FIELD,
    build_switch_offer,
    cross_course_switch_offer,
)
from app.services.reference_resolution import ReferenceCandidates, ReferenceMatch

_COURSE = SimpleNamespace(id=1, name="Capstone Project")


def _match(course_id, course_name, label, score):
    return ReferenceMatch(
        local_course_id=course_id, course_name=course_name,
        entity_id=str(course_id), label=label, score=score,
    )


def _candidates(here=(), elsewhere=()):
    return ReferenceCandidates(reference="x", here=list(here), elsewhere=list(elsewhere))


async def _offer(kind, reference, candidates, user_message="do the thing"):
    with patch(
        "app.services.chat.find_reference_across_courses",
        new=AsyncMock(return_value=candidates),
    ):
        return await cross_course_switch_offer(
            AsyncMock(), SimpleNamespace(id=1),
            kind=kind, reference=reference, course=_COURSE, user_message=user_message,
        )


# ── the offer shape is one shape ─────────────────────────────────────────────


def test_every_offer_carries_what_the_next_turn_needs_to_answer_it():
    """The three things that make a "yes" work. An offer missing any one of
    them looks fine on screen and silently does nothing when answered — which
    is precisely what the model's improvised question did."""
    offer = build_switch_offer(
        question="Should I switch?",
        targets=[(9, "Math 101")],
        reference="homework 1 limits",
        user_message="what is the due date of homework 1 limits?",
    )

    # 1. the field _apply_pending_course_switch matches on
    assert offer["clarify_field"] == COURSE_SWITCH_EXPECTATION_FIELD
    # 2. candidates, so a named course is also an answer
    assert offer["clarify_candidates"] == [{"id": 9, "label": "Math 101"}]
    # 3. the interrupted request, so "yes" continues it
    assert offer["clarify_payload"]["user_message"].startswith("what is the due date")
    assert offer["clarify_payload"]["local_course_id"] == 9


def test_several_courses_leave_the_id_unset_so_a_bare_yes_cannot_pick_one():
    offer = build_switch_offer(
        question="Which?", targets=[(9, "Math 101"), (10, "CPSC 310")],
        reference="quiz 1", user_message="...",
    )

    assert offer["clarify_payload"]["local_course_id"] is None
    assert len(offer["clarify_candidates"]) == 2


def test_no_target_means_no_offer():
    """Callers rely on None to keep their own "genuinely not found" wording."""
    assert build_switch_offer(
        question="?", targets=[], reference="x", user_message="y"
    ) is None


def test_one_course_named_twice_is_offered_once():
    """Two assignments with the same name in one course is not a choice
    between courses, and rendering it as one gives two identical buttons."""
    from app.services.chat import _dedupe_targets

    assert _dedupe_targets(
        [(9, "Math 101", "Quiz 1"), (9, "Math 101", "Quiz 1 (copy)")]
    ) == [(9, "Math 101")]


# ── when it fires ────────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_a_plainly_better_match_elsewhere_is_offered():
    offer = await _offer(
        "assignment", "homework 1 limits",
        _candidates(
            here=[_match(1, "Capstone Project", "Homework 1", 0.67)],
            elsewhere=[_match(9, "Math 101", "homework 1 limits", 1.0)],
        ),
    )

    assert offer is not None
    assert offer["clarify_payload"]["local_course_id"] == 9
    # The near-miss here is named. Without it the offer reads as "that does
    # not exist in this course", which is false and looks like a bug to
    # someone looking at a list that plainly contains something similar.
    assert "Homework 1" in offer["question"]
    assert "Math 101" in offer["question"]


@pytest.mark.anyio
async def test_a_tie_is_not_offered():
    offer = await _offer(
        "assignment", "quiz 1",
        _candidates(
            here=[_match(1, "Capstone Project", "Quiz 1", 1.0)],
            elsewhere=[_match(9, "Math 101", "Quiz 1", 1.0)],
        ),
    )

    assert offer is None


@pytest.mark.anyio
async def test_a_student_reference_uses_the_same_machinery():
    """Not a second implementation for people — the same function, so a fix
    to one cannot leave the other behind."""
    offer = await _offer(
        "student", "milliken",
        _candidates(elsewhere=[_match(9, "Math 101", "Joshua Parker-Milliken", 0.73)]),
    )

    assert offer is not None
    assert "student" in offer["question"]
    assert "Joshua Parker-Milliken" in offer["question"]
    assert offer["clarify_field"] == COURSE_SWITCH_EXPECTATION_FIELD


@pytest.mark.anyio
async def test_no_reference_means_no_lookup():
    """Every workflow calls this unconditionally, so the common case — no
    reference at all — must cost nothing."""
    with patch(
        "app.services.chat.find_reference_across_courses", new=AsyncMock()
    ) as lookup:
        assert await cross_course_switch_offer(
            AsyncMock(), SimpleNamespace(id=1),
            kind="assignment", reference=None, course=_COURSE, user_message="hi",
        ) is None

    lookup.assert_not_called()


# ── the workflows actually reach it ──────────────────────────────────────────


@pytest.mark.anyio
async def test_send_message_consults_it_for_a_named_recipient():
    """The reported gap. Before this, _run_send_message_chain resolved the
    course and never asked whether it was the right one."""
    from app.mcp_tools.schemas import SendMessageAction
    from app.services import chat as chat_module

    action = SendMessageAction.model_validate({
        "action": "send_message", "local_course_id": 1,
        "recipient_directives": [
            {"student_reference": "milliken", "body": "they did well"}
        ],
    })
    offer = build_switch_offer(
        question="Switch?", targets=[(9, "Math 101")],
        reference="milliken", user_message="msg milliken",
    )

    with (
        patch.object(chat_module, "resolve_course", new=AsyncMock(return_value=_COURSE)),
        patch.object(
            chat_module, "cross_course_switch_offer",
            new=AsyncMock(return_value=offer),
        ) as guard,
    ):
        result = await chat_module._run_send_message_chain(
            AsyncMock(), SimpleNamespace(id=1), SimpleNamespace(id=3),
            SimpleNamespace(id=5), action, "msg milliken", None, AsyncMock(),
        )

    assert result["clarify_field"] == COURSE_SWITCH_EXPECTATION_FIELD
    assert guard.await_args.kwargs["reference"] == "milliken"
    assert guard.await_args.kwargs["kind"] == "student"


@pytest.mark.anyio
async def test_the_assignment_path_consults_it_before_resolving_in_course():
    """Ordering is the fix, not the call itself: asked after the in-course
    resolver, a weak local match would already have won."""
    from app.services import chat as chat_module

    calls: list[str] = []

    async def _guard(*_args, **_kwargs):
        calls.append("cross_course")
        return None

    async def _in_course(*_args, **_kwargs):
        calls.append("in_course")
        return 900

    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    with (
        patch.object(chat_module, "resolve_course", new=AsyncMock(return_value=_COURSE)),
        patch.object(
            chat_module, "_run_tracked_read",
            new=AsyncMock(return_value={"assignments": [{"id": 900, "name": "Homework 1"}]}),
        ),
        patch.object(chat_module, "cross_course_switch_offer", new=_guard),
        patch.object(chat_module, "_resolve_assignment_reference", new=_in_course),
        patch.object(chat_module, "execute_tool", new=AsyncMock(return_value={})),
    ):
        await chat_module._resolve_course_and_assignment(
            db, SimpleNamespace(id=1), SimpleNamespace(id=3), SimpleNamespace(id=5),
            1, None, "homework 1 limits", "due date?", AsyncMock(),
        )

    assert calls == ["cross_course", "in_course"]
