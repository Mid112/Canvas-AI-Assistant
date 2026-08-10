"""Unit coverage for the language-facing semantic intent boundary."""

import json

import pytest

from app.mcp_tools.dispatcher import parse_action
from app.mcp_tools.schemas import SemanticIntentAction
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


# Verifies the unscoped late request is not silently answered as a missing one.
#
# find_missing_submissions covers both categories and `status` is the only
# thing separating them. When no assignment is named the intent is rerouted to
# the course-wide assignment filter, and that reroute used to hardcode
# "missing_submissions" — so "which assignments have late submissions?" came
# back listing assignments with missing work. Wrong answer, no error, and
# nothing in the reply to suggest the question had been changed.
@pytest.mark.requirement("FR2.8")
def test_unscoped_late_request_routes_to_the_late_assignment_filter():
    intent = SemanticIntentAction(intent="find_missing_submissions", status="late")

    normalized = normalize_semantic_intent(intent, local_course_id=22)

    assert normalized["action"] == "find_assignments_by_submission_status"
    assert normalized["status"] == "late_submissions"


# Verifies the missing default still holds when no status is given, so the
# reroute above cannot flip the ordinary case.
@pytest.mark.requirement("FR2.8")
def test_unscoped_request_without_a_status_still_means_missing():
    intent = SemanticIntentAction(intent="find_missing_submissions")

    normalized = normalize_semantic_intent(intent, local_course_id=22)

    assert normalized["action"] == "find_assignments_by_submission_status"
    assert normalized["status"] == "missing_submissions"


# Verifies the course-wide analysis carries the category too. Its schema
# defaults to "missing", so an omitted status was not a missing field — it was
# a confidently wrong answer.
@pytest.mark.requirement("FR2.8")
def test_semantic_analyze_submissions_carries_the_late_category():
    intent = SemanticIntentAction(intent="analyze_submissions", status="late")

    normalized = normalize_semantic_intent(intent, local_course_id=22)

    assert normalized["action"] == "analyze_course_submissions"
    assert normalized["status"] == "late"
    parsed = parse_action(json.dumps(normalized))
    assert parsed.status == "late"


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
