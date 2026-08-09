"""Unit coverage for the language-facing semantic intent boundary."""

import json
from types import SimpleNamespace

from app.mcp_tools.dispatcher import parse_action
from app.mcp_tools.schemas import SemanticIntentAction
from app.services.chat import (
    _CHAINABLE_READ_ACTIONS,
    _explicit_announcement_request,
    _format_assignment_status_match,
    _rebase_action_to_course,
    _resolve_pending_course_correction,
)
from app.services.intent import normalize_semantic_intent


def test_semantic_read_intent_maps_to_existing_read_action():
    intent = SemanticIntentAction(
        intent="read_submissions",
        course_name="COSC 499",
        assignment_reference="this assignment",
    )

    normalized = normalize_semantic_intent(intent, local_course_id=17)

    assert normalized == {
        "action": "fetch_submissions",
        "local_course_id": 17,
        "assignment_reference": "this assignment",
    }
    parsed = parse_action(json.dumps(normalized))
    assert parsed.action == "fetch_submissions"
    assert parsed.assignment_reference == "this assignment"


def test_semantic_missing_submissions_preserves_natural_reference_and_status():
    intent = SemanticIntentAction(
        intent="find_missing_submissions",
        assignment_reference="those assignments",
        status="late",
    )

    normalized = normalize_semantic_intent(intent, local_course_id=22)

    assert normalized["action"] == "resolve_missing_submissions"
    assert normalized["assignment_reference"] == "those assignments"
    assert normalized["status"] == "late"


def test_semantic_submission_status_maps_to_explicit_assignment_filter():
    intent = SemanticIntentAction(
        intent="find_assignments_by_submission_status",
        submission_status="any_submissions",
    )

    normalized = normalize_semantic_intent(intent, local_course_id=22)

    assert normalized == {
        "action": "find_assignments_by_submission_status",
        "local_course_id": 22,
        "status": "any_submissions",
    }


def test_semantic_submission_status_without_filter_clarifies_once():
    intent = SemanticIntentAction(intent="find_assignments_by_submission_status")

    normalized = normalize_semantic_intent(intent, local_course_id=22)

    assert normalized["action"] == "clarify"
    assert "any submissions" in normalized["question"]


def test_unscoped_missing_submissions_becomes_assignment_filter():
    intent = SemanticIntentAction(intent="find_missing_submissions")

    normalized = normalize_semantic_intent(intent, local_course_id=22)

    assert normalized == {
        "action": "find_assignments_by_submission_status",
        "local_course_id": 22,
        "status": "missing_submissions",
    }


def test_unscoped_late_submissions_preserves_legacy_status_field():
    intent = SemanticIntentAction(
        intent="find_missing_submissions",
        status="late",
    )

    normalized = normalize_semantic_intent(intent, local_course_id=22)

    assert normalized == {
        "action": "find_assignments_by_submission_status",
        "local_course_id": 22,
        "status": "late_submissions",
    }


def test_semantic_write_intent_is_preview_gated_and_allows_partial_draft():
    intent = SemanticIntentAction(
        intent="create_assignment",
        fields={
            "title": "Recursion practice",
            "local_course_id": 999999,
            "canvas_assignment_id": 888888,
        },
    )

    normalized = normalize_semantic_intent(intent, local_course_id=31)

    assert normalized["action"] == "intent_preview"
    proposed = normalized["proposed_action"]
    assert proposed == {
        "action": "create_assignment",
        "local_course_id": 31,
        "title": "Recursion practice",
    }
    assert "canvas_assignment_id" not in proposed


def test_semantic_unknown_capability_degrades_to_safe_response():
    intent = SemanticIntentAction(
        intent="unsupported",
        message="Course deletion is not available.",
    )

    assert normalize_semantic_intent(intent, local_course_id=31) == {
        "action": "respond",
        "message": "Course deletion is not available.",
    }


def test_semantic_unsupported_filter_does_not_silently_broaden_read():
    intent = SemanticIntentAction(
        intent="read_assignments",
        criteria={"minimum_submission_count": 2},
    )

    normalized = normalize_semantic_intent(intent, local_course_id=31)

    assert normalized["action"] == "respond"
    assert "filter" in normalized["message"]


def test_semantic_send_message_reference_becomes_server_resolved_directive():
    intent = SemanticIntentAction(
        intent="send_message",
        student_reference="Jordan",
        fields={"body": "Please check your submission."},
    )

    normalized = normalize_semantic_intent(intent, local_course_id=31)

    assert normalized["action"] == "intent_preview"
    assert normalized["proposed_action"]["recipient_directives"] == [
        {"student_reference": "Jordan", "body": "Please check your submission."}
    ]


def test_semantic_announcement_removes_private_recipient_fields():
    intent = SemanticIntentAction(
        intent="send_message",
        delivery_mode="announcement",
        student_reference="Jordan",
        fields={
            "body": "Class update",
            "broadcast_to_all_students": True,
        },
    )

    normalized = normalize_semantic_intent(intent, local_course_id=31)

    proposed = normalized["proposed_action"]
    assert normalized["action"] == "intent_preview"
    assert proposed["action"] == "send_message"
    assert "recipient_directives" not in proposed
    assert "broadcast_to_all_students" not in proposed


def test_negated_announcement_keeps_private_delivery_language():
    assert _explicit_announcement_request("make an announcement to the class")
    assert not _explicit_announcement_request(
        "don't make this an announcement, just message Student One privately"
    )


def test_submission_status_reads_are_chainable():
    assert "find_assignments_by_submission_status" in _CHAINABLE_READ_ACTIONS


def test_assignment_status_summary_uses_filter_matching_count():
    assert _format_assignment_status_match(
        {
            "assignment_name": "Research Proposal",
            "submitted_count": 10,
            "matching_count": 3,
        }
    ) == "Research Proposal (3 matching)"


def test_course_rebase_drops_old_course_identifiers_but_keeps_references():
    preview = parse_action(
        json.dumps(
            {
                "action": "intent_preview",
                "summary": "Send a message",
                "proposed_action": {
                    "action": "send_message",
                    "local_course_id": 499,
                    "recipient_handle": "rs_old_course",
                    "recipient_canvas_user_ids": [101],
                    "recipient_directives": [
                        {"student_reference": "Student One", "body": "Hello"}
                    ],
                },
            }
        )
    )

    rebased = _rebase_action_to_course(preview, 322)

    assert rebased.proposed_action["local_course_id"] == 322
    assert "recipient_handle" not in rebased.proposed_action
    assert "recipient_canvas_user_ids" not in rebased.proposed_action
    assert rebased.proposed_action["recipient_directives"]


def test_pending_course_correction_requires_explicit_correction_language():
    course = SimpleNamespace(
        name="COSC 322",
        course=None,
        local_course_id=322,
        canvas_course_id=322,
        canvas_connection_id=1,
        workflow_state="available",
        last_seen_at=None,
        created_at=None,
    )

    assert (
        _resolve_pending_course_correction(
            [course], "No, I meant COSC 322"
        ).local_course_id
        == 322
    )
    assert _resolve_pending_course_correction(
        [course], "Change the assignment title to COSC 322 overview"
    ) is None


def test_semantic_course_required_intent_without_resolved_course_clarifies():
    intent = SemanticIntentAction(intent="read_assignments")

    normalized = normalize_semantic_intent(intent, local_course_id=None)

    assert normalized["action"] == "clarify"
    assert normalized["clarify"] is True
    assert "course" in normalized["question"].lower()


def test_legacy_action_output_remains_supported():
    parsed = parse_action(
        '{"action":"fetch_assignments","local_course_id":31}'
    )

    assert parsed.action == "fetch_assignments"


def test_submission_status_action_has_strict_enum():
    parsed = parse_action(
        '{"action":"find_assignments_by_submission_status",'
        '"local_course_id":31,"status":"any_submissions"}'
    )

    assert parsed.action == "find_assignments_by_submission_status"
    assert parsed.status == "any_submissions"
