"""A clarify that only wants content is the write it was avoiding.

Both envelopes below are verbatim from the messages table after the reported
session — not invented shapes. The instructor asked for an announcement about
a long weekend and was asked to supply a subject and a body, which is the
message they had just described.

FORM HANDOFF in the system prompt already told the model not to do this. The
prompt is advice; these tests cover the server-side backstop that makes it a
guarantee, which is where the rest of the write gate lives too.
"""

from unittest.mock import AsyncMock

import pytest

from app.services.chat import (
    _content_only_clarify_fields,
    _ensure_message_is_written,
    _form_handoff_action_for,
    _rewrite_content_only_clarify,
)

# messages.id 5208 — "can you please make an announcement about the upcoming
# long weekend and holidays?"
ANNOUNCEMENT_CLARIFY = {
    "action": "clarify",
    "clarify": True,
    "question": "subject, body",
    "partial_plan": {
        "course_name": "Capstone Project",
        "delivery_mode": "announcement",
    },
}

# messages.id 5210 — "actually send a message to students who submitted python
# quiz wishing them happy easter". Recipients were resolved and each directive
# already carried a body; only the top-level subject was missing.
PRIVATE_MESSAGE_CLARIFY = {
    "action": "clarify",
    "clarify": True,
    "question": "subject",
    "partial_plan": {
        "course_name": "Capstone Project",
        "recipient_directives": [
            {"student_reference": "Yerdana Maulenbay", "body": "Wishing you a happy Easter!"},
            {"student_reference": "Michael Jordan", "body": "Wishing you a happy Easter!"},
        ],
        "body": "",
    },
    "grounded": True,
}


# ------------------------------------------------------ the reported failures


def test_an_announcement_is_proposed_not_asked_about():
    rewritten = _rewrite_content_only_clarify(dict(ANNOUNCEMENT_CLARIFY))

    assert rewritten["action"] == "intent_preview"
    assert rewritten["proposed_action"]["action"] == "send_message"
    # Still a write, so it still reaches the preview/confirm gate.
    assert rewritten["proposed_action"]["delivery_mode"] == "announcement"


def test_a_private_message_with_resolved_recipients_is_proposed_too():
    rewritten = _rewrite_content_only_clarify(dict(PRIVATE_MESSAGE_CLARIFY))

    assert rewritten["action"] == "intent_preview"
    proposed = rewritten["proposed_action"]
    assert proposed["action"] == "send_message"
    # The recipients the model had already worked out survive the rewrite —
    # re-resolving them would be the round trip this is removing.
    assert len(proposed["recipient_directives"]) == 2
    assert proposed["recipient_directives"][0]["body"] == "Wishing you a happy Easter!"


def test_the_course_name_does_not_travel_alongside_the_id():
    """local_course_id is injected right after this runs. A leftover name is
    one more thing that can disagree with it."""
    rewritten = _rewrite_content_only_clarify(dict(ANNOUNCEMENT_CLARIFY))

    assert "course_name" not in rewritten["proposed_action"]


@pytest.mark.asyncio
async def test_the_announcement_turn_ends_with_a_written_message():
    """End to end through the rewrite and into the drafter: what the
    instructor sees is a real subject and body, not an empty form."""
    from app.mcp_tools.schemas import IntentPreviewAction

    rewritten = _rewrite_content_only_clarify(dict(ANNOUNCEMENT_CLARIFY))
    proposed = dict(rewritten["proposed_action"])
    proposed["local_course_id"] = 1  # _inject_course_into_envelope's job
    action = IntentPreviewAction(summary=rewritten["summary"], proposed_action=proposed)

    adapter = AsyncMock()
    adapter.generate.return_value = (
        '{"subject": "Upcoming Long Weekend", '
        '"body": "Reminder that campus is closed for the long weekend."}'
    )

    filled = await _ensure_message_is_written(
        action,
        "can you please make an announcement about the upcoming long weekend and holidays?",
        adapter,
    )

    assert filled.proposed_action["subject"] == "Upcoming Long Weekend"
    assert filled.proposed_action["body"].startswith("Reminder that campus is closed")


# ------------------------------------------- what must still be asked about


def test_recipients_are_still_asked_for():
    """The one legitimate send_message clarify. Nothing can write who a
    message goes to, and guessing sends it to the wrong people."""
    envelope = {
        "action": "clarify",
        "question": "Who should receive this message?",
        "partial_plan": {"course_name": "Capstone Project"},
    }

    assert _rewrite_content_only_clarify(dict(envelope)) == envelope


def test_a_mixed_question_still_asks():
    """Asking for a subject and the recipients is still asking for the
    recipients, so the whole question stands rather than half of it."""
    envelope = {
        "action": "clarify",
        "question": "subject, recipient_directives",
        "partial_plan": {"course_name": "Capstone Project"},
    }

    assert _rewrite_content_only_clarify(dict(envelope)) == envelope


def test_prose_is_left_alone():
    """A question we cannot read exactly is not one to rewrite a turn over."""
    assert _content_only_clarify_fields("What should the subject be?") is None


def test_an_assignment_or_quiz_cannot_be_told_apart_so_the_clarify_stands():
    """title/description belong to both create_assignment and create_quiz.
    Guessing between two different Canvas objects is worse than one more
    question, so ambiguity keeps the clarify."""
    envelope = {
        "action": "clarify",
        "question": "title, description",
        "partial_plan": {"course_name": "Capstone Project"},
    }

    assert _rewrite_content_only_clarify(dict(envelope)) == envelope


def test_a_course_clarify_is_untouched():
    """_inject_course_into_envelope emits this one when no course resolved."""
    envelope = {
        "action": "clarify",
        "question": "Which course is this about?",
        "partial_plan": {"subject": "Hello"},
    }

    assert _rewrite_content_only_clarify(dict(envelope)) == envelope


def test_a_resolver_clarify_with_candidates_is_untouched():
    envelope = {
        "action": "clarify",
        "question": "Which assignment in CPSC 310 did you mean? Options: Lab Report A, Lab Report B.",
        "partial_plan": {"local_course_id": 2721},
        "clarify_candidates": [{"id": 111, "label": "Lab Report A"}],
    }

    assert _rewrite_content_only_clarify(dict(envelope)) == envelope


# --------------------------------------------------------------- the pieces


def test_field_lists_are_read_and_prose_is_not():
    assert _content_only_clarify_fields("subject, body") == {"subject", "body"}
    assert _content_only_clarify_fields("subject") == {"subject"}
    assert _content_only_clarify_fields("Subject, Body.") == {"subject", "body"}
    assert _content_only_clarify_fields("subject, ") is None
    assert _content_only_clarify_fields("who should get this") is None


def test_identity_fields_are_never_form_owned():
    """The rewrite must never suppress a question about who or what is being
    written to — only about the words being written."""
    from app.services.chat import _FORM_OWNED_FIELDS

    for field in (
        "course_name",
        "student_reference",
        "assignment_reference",
        "recipient_directives",
        "recipient_handle",
        "broadcast_to_all_students",
    ):
        assert field not in _FORM_OWNED_FIELDS


def test_subject_and_body_identify_a_message():
    assert _form_handoff_action_for({"subject", "body"}) == "send_message"


def test_nothing_recognisable_identifies_nothing():
    assert _form_handoff_action_for({"course_name"}) is None


def test_non_clarify_envelopes_pass_straight_through():
    for envelope in (
        {"action": "respond", "message": "OK."},
        {"action": "intent_preview", "summary": "x", "proposed_action": {}},
        {"action": "out_of_scope", "message": "x"},
        {"action": "clarify", "question": "subject, body"},  # no partial_plan
        {"action": "clarify", "partial_plan": {}},  # no question
    ):
        assert _rewrite_content_only_clarify(dict(envelope)) == envelope
