"""Grading or giving feedback to a group an earlier resolver computed.

Before this, recipient_handle existed only on send_message: the resolvers
could work out "everyone missing lab 4" or "everyone who scored below 50",
but that set could only be messaged, never graded or commented on. A request
like "give feedback to everyone who scored below 50" had to fall back to
student_reference — a phrase the model writes — or to the result's `sample`,
which is a truncated preview and would silently skip students.

These tests pin the handle path, the conversation scoping that makes a handle
safe to accept from model output, and the intersection against the assignment
actually being graded.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.mcp_tools.schemas import UpdateGradeAction
from app.services.intent import _FIELD_ALLOWLIST


def _action(**overrides):
    payload = {
        "action": "update_grade",
        "local_course_id": 7,
        "assignment_id": 10,
        "new_grade": "50",
    }
    payload.update(overrides)
    return UpdateGradeAction.model_validate(payload)


def test_update_grade_accepts_a_recipient_handle():
    assert _action(recipient_handle="rs_abc123").recipient_handle == "rs_abc123"


def test_recipient_handle_defaults_to_none():
    """None is what keeps every existing single-student turn on its old path."""
    assert _action(student_reference="coin").recipient_handle is None


def test_semantic_intent_may_carry_a_handle_to_update_grade():
    """The semantic path is the one the prompt actually steers the model down,
    so a handle that cannot cross it never reaches the resolver."""
    assert "recipient_handle" in _FIELD_ALLOWLIST["update_grade"]


def test_handle_is_not_confused_with_a_student_id():
    """A handle is an opaque string, never coerced into an id — the ownership
    and expiry checks in materialize_resolved_set are the only thing standing
    between untrusted model output and a real recipient list."""
    action = _action(recipient_handle="rs_abc123")

    assert action.student_id is None
    assert isinstance(action.recipient_handle, str)


# ── the chain ────────────────────────────────────────────────────────────────


_SUBMISSIONS = [
    {"user_id": 101, "student_name": "Ann", "score": 40},
    {"user_id": 102, "student_name": "Bo", "score": 45},
    {"user_id": 103, "student_name": "Cy", "score": 90},
]


async def _run(action, *, snapshot, submissions=None, expired=False):
    """Drive _resolve_grade_target past its Canvas reads."""
    from app.services import chat as chat_module

    course = SimpleNamespace(id=7, name="CPSC 310", canvas_url="https://canvas.test")
    resolved_set = None if expired else SimpleNamespace(snapshot_recipients=snapshot)

    with (
        patch.object(
            chat_module, "_resolve_course_and_assignment",
            new=AsyncMock(return_value=(course, 10)),
        ),
        patch.object(
            chat_module, "_run_tracked_read",
            new=AsyncMock(return_value={
                "submissions": _SUBMISSIONS if submissions is None else submissions
            }),
        ),
        patch.object(
            chat_module, "materialize_resolved_set",
            new=AsyncMock(return_value=resolved_set),
        ),
        patch.object(chat_module, "execute_tool", new=AsyncMock(return_value={})),
    ):
        db = AsyncMock()
        db.scalar = AsyncMock(return_value=SimpleNamespace(title="Lab 4"))
        return await chat_module._resolve_grade_target(
            db, SimpleNamespace(id=1), SimpleNamespace(id=3),
            SimpleNamespace(id=5), action, "give them feedback", AsyncMock(),
        )


@pytest.mark.anyio
async def test_handle_grades_exactly_the_resolved_group():
    result = await _run(
        _action(recipient_handle="rs_abc", feedback="Please resubmit"),
        snapshot=[{"user_id": 101}, {"user_id": 102}],
    )

    handoff = result["grade_handoff"]
    assert handoff["student_ids"] == [101, 102]
    # Cy scored 90 and was never in the resolved set — a handle must not widen
    # to the whole submission list.
    assert 103 not in handoff["student_ids"]
    assert handoff["feedback"] == "Please resubmit"


@pytest.mark.anyio
async def test_handle_wins_over_a_model_written_student_reference():
    """The handle is a set the app computed; student_reference is a phrase the
    model wrote. When both arrive the computed one has to win, or a stray
    "all students" silently widens a targeted group."""
    result = await _run(
        _action(recipient_handle="rs_abc", student_reference="all students"),
        snapshot=[{"user_id": 101}],
    )

    assert result["grade_handoff"]["student_ids"] == [101]


@pytest.mark.anyio
async def test_expired_handle_asks_instead_of_grading_everyone():
    """Falling through to the normal path here would quietly grade a different
    group than the one the instructor was looking at."""
    result = await _run(
        _action(recipient_handle="rs_gone", student_reference="all students"),
        snapshot=[], expired=True,
    )

    assert result["action"] == "clarify"
    assert "no longer available" in result["question"]


@pytest.mark.anyio
async def test_students_absent_from_this_assignment_are_dropped():
    """A set resolved against lab 4 can legitimately be reused on lab 5, so the
    ids are intersected with the assignment actually being graded rather than
    trusted blindly."""
    result = await _run(
        _action(recipient_handle="rs_abc"),
        snapshot=[{"user_id": 101}, {"user_id": 999}],
    )

    assert result["grade_handoff"]["student_ids"] == [101]


@pytest.mark.anyio
async def test_handle_matching_nobody_here_asks_rather_than_grading_nobody():
    result = await _run(
        _action(recipient_handle="rs_abc"),
        snapshot=[{"user_id": 998}, {"user_id": 999}],
    )

    assert result["action"] == "clarify"
    assert "nothing to grade" in result["question"]


@pytest.mark.anyio
async def test_relative_grade_applies_per_student_across_a_resolved_group():
    """The two features compose: resolve a group, then adjust each member from
    their own score rather than flattening them to one value."""
    result = await _run(
        _action(recipient_handle="rs_abc", new_grade="+5"),
        snapshot=[{"user_id": 101}, {"user_id": 102}],
    )

    grades = {
        row["user_id"]: row["new_grade"]
        for row in result["grade_handoff"]["student_grades"]
    }
    assert grades == {101: "45", 102: "50"}
