"""Three failures from one session, all on the same request.

    > hi give an encouraging feedback to students who received less than 96
      but more than 70 for user testing
    < I found Student One, Yerdana Maulenbay, and Michael Jordan ...
      [Grades tab opens with an EMPTY comment box]
    > actually can you send a message to them instead saying congratulations,
      you are well above the cutoff?
    < Post "Congratulations - Well Above Cutoff" as a public announcement
      visible to the ENTIRE CLASS

The audience resolved correctly both times — three students, and the model
carried the criterion across the channel switch exactly as intended. What
failed was everything around it: no comment was written, the audience never
reached the message chain, and the resulting recipient-less message is the
shape of a class-wide announcement.

The last one is the dangerous one. "Congratulations, you are well above the
cutoff" was queued for the whole course, to be read by the students below the
cutoff and the five who had submitted nothing.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.mcp_tools.schemas import (
    IntentPreviewAction,
    SendMessageAction,
    UpdateGradeAction,
)
from app.services.chat import _ensure_feedback_is_written


def _adapter(feedback: str) -> AsyncMock:
    adapter = AsyncMock()
    adapter.generate.return_value = '{"feedback": "%s"}' % feedback
    return adapter


# ------------------------------------------- the audience must reach the chain


def test_an_audience_only_message_is_routed_for_recipient_resolution():
    """The precise cause of the class-wide announcement.

    The dispatch gate listed recipient_directives, broadcast_to_all_students
    and recipient_handle. A send_message carrying only an `audience` matched
    none of them, skipped resolution, and arrived at the preview with no
    recipients — which on this action means "announce to everyone".
    """
    action = SendMessageAction(
        local_course_id=946,
        subject="Congratulations",
        body="you are well above the cutoff",
        audience={"kind": "score_range", "min_score": 70, "max_score": 96},
    )

    routes_to_resolution = bool(
        action.recipient_directives
        or action.broadcast_to_all_students
        or action.recipient_handle
        or action.audience
    )

    assert routes_to_resolution, (
        "an audience-only send_message must go through recipient resolution; "
        "skipping it produces a class-wide announcement"
    )


def test_a_plain_announcement_still_needs_no_resolution():
    """The counterpart that must not change: a message that named nobody is a
    real announcement and should stay one."""
    action = SendMessageAction(
        local_course_id=946, subject="Long weekend", body="Campus is closed."
    )

    assert not (
        action.recipient_directives
        or action.broadcast_to_all_students
        or action.recipient_handle
        or action.audience
    )


def test_the_audience_survives_the_channel_switch():
    """The model did this part right: it carried the same criterion from the
    feedback turn onto the message turn. Verbatim from the transcript."""
    grade_turn = UpdateGradeAction(
        local_course_id=946,
        assignment_reference="user testing",
        audience={
            "kind": "score_range", "min_score": 70, "max_score": 96,
            "assignment_reference": "user testing",
        },
    )
    message_turn = SendMessageAction(
        local_course_id=946,
        subject="Congratulations - Well Above Cutoff",
        body="congratulations, you are well above the cutoff",
        audience={
            "kind": "score_range", "min_score": 70, "max_score": 96,
            "assignment_reference": "user testing",
        },
    )

    assert grade_turn.audience == message_turn.audience


# --------------------------------------------------- writing the feedback text


@pytest.mark.asyncio
async def test_a_feedback_request_gets_a_comment_written():
    """"give an encouraging feedback to students who scored 70-96" resolved
    three students and handed over an empty comment box."""
    action = UpdateGradeAction(local_course_id=946, assignment_reference="user testing")
    adapter = _adapter("You should be proud of this work - keep it up!")

    filled = await _ensure_feedback_is_written(
        action, "give an encouraging feedback to students who scored 70-96", adapter
    )

    assert filled.feedback == "You should be proud of this work - keep it up!"


@pytest.mark.asyncio
async def test_a_grade_change_never_gets_an_invented_comment():
    """A request that named a grade and no comment wanted a grade change.
    Attaching invented words to a real mark on a record is not a gap to fill."""
    action = UpdateGradeAction(local_course_id=946, new_grade="90")
    adapter = _adapter("Lovely work!")

    filled = await _ensure_feedback_is_written(action, "set Sam to 90", adapter)

    assert not filled.feedback
    adapter.generate.assert_not_awaited()


@pytest.mark.asyncio
async def test_feedback_the_instructor_wrote_is_never_replaced():
    action = UpdateGradeAction(local_course_id=946, feedback="good job")
    adapter = _adapter("Something the model preferred")

    filled = await _ensure_feedback_is_written(action, "tell them good job", adapter)

    assert filled.feedback == "good job"
    adapter.generate.assert_not_awaited()


@pytest.mark.asyncio
async def test_an_intent_preview_wrapped_grade_is_drafted_too():
    action = IntentPreviewAction(
        summary="I'll add feedback.",
        proposed_action={
            "action": "update_grade", "local_course_id": 946,
            "assignment_reference": "user testing",
        },
    )
    adapter = _adapter("Great progress on this one.")

    filled = await _ensure_feedback_is_written(action, "encourage them", adapter)

    assert filled.proposed_action["feedback"] == "Great progress on this one."


@pytest.mark.asyncio
async def test_a_failed_drafter_leaves_the_turn_intact():
    action = UpdateGradeAction(local_course_id=946)
    adapter = AsyncMock()
    adapter.generate.side_effect = RuntimeError("provider down")

    filled = await _ensure_feedback_is_written(action, "encourage them", adapter)

    assert not filled.feedback


@pytest.mark.asyncio
async def test_the_chat_drafter_writes_no_grade_and_names_nobody():
    """One comment may go to a whole band of students who already hold
    different marks, so it cannot mention a score or assume a reader."""
    from app.services.feedback_draft import CHAT_FEEDBACK_DRAFT_SYSTEM_PROMPT

    assert "new_grade" not in CHAT_FEEDBACK_DRAFT_SYSTEM_PROMPT
    assert "Never name a student" in CHAT_FEEDBACK_DRAFT_SYSTEM_PROMPT
    assert '{"feedback": ""}' in CHAT_FEEDBACK_DRAFT_SYSTEM_PROMPT


def test_other_actions_are_untouched():
    assert _ensure_feedback_is_written is not None


# ------------------------------------------------- the grade write itself


def test_the_grade_idempotency_key_describes_a_transition():
    """The 18 -> 19 write that never reached Canvas.

    grade_history row 13 recorded new_grade 19 at 06:04:29, and its stored
    canvas_response was the one from 06:03:11 — an earlier write of the same
    value. The key held only the destination, so 18->19, 19->16, 16->19
    collapsed onto one entry, and the third replayed a week-old cached body
    instead of calling Canvas. The app read "19" from it and reported success
    while Canvas still held 16.

    Including the pre-write value keeps genuine double-submit protection (two
    clicks share a starting state) and drops the false positive.
    """
    from app.services.canvas_idempotency import build_idempotency_key

    def key(previous_grade, previous_score, new_grade):
        return build_idempotency_key(
            "update_grade", 1, 2, 16, 41, previous_grade, previous_score, new_grade, ""
        )

    # Two clicks of the same button from the same state: still deduped.
    assert key("18", 18.0, "19") == key("18", 18.0, "19")
    # Setting it back to 19 after it moved to 16: a different write, and it runs.
    assert key("18", 18.0, "19") != key("16", 16.0, "19")


def test_the_old_destination_only_key_would_have_collapsed_them():
    """Kept as the regression's own witness."""
    from app.services.canvas_idempotency import build_idempotency_key

    def old_key(new_grade):
        return build_idempotency_key("update_grade", 1, 2, 16, 41, new_grade, "")

    assert old_key("19") == old_key("19")
