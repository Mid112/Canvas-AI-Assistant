"""Normalize language-facing intents into trusted Canvas actions.

The chat model is good at understanding informal requests, but executable
actions intentionally remain strict.  This module is the narrow boundary
between those two concerns: it accepts only ``SemanticIntentAction`` and
copies a small, explicit field allowlist into the existing action envelope.
It never resolves or accepts Canvas/local IDs.
"""

from __future__ import annotations

import re
from typing import Any

from app.mcp_tools.schemas import SemanticIntentAction

_FIELD_ALLOWLIST: dict[str, frozenset[str]] = {
    "create_assignment": frozenset(
        {"title", "description", "due_date", "points_possible"}
    ),
    "create_quiz": frozenset(
        {
            "title",
            "description",
            "due_date",
            "points_possible",
            "allowed_attempts",
            "time_limit",
            "quiz_engine",
            "questions",
            "question_bank_groups",
        }
    ),
    "update_assignment": frozenset(
        {"title", "description", "due_date", "points_possible"}
    ),
    "update_grade": frozenset({"new_grade", "feedback", "reason"}),
    "send_message": frozenset(
        {
            "subject",
            "body",
            "recipient_directives",
            "recipient_handle",
            "broadcast_to_all_students",
            "also_announce_to_class",
        }
    ),
}

_READ_INTENTS = {
    "read_courses": "fetch_courses",
    "read_assignments": "fetch_assignments",
    "read_submissions": "fetch_submissions",
    "read_students": "fetch_students",
    "read_quizzes": "fetch_quizzes",
    "analyze_submissions": "analyze_course_submissions",
    "find_missing_submissions": "resolve_missing_submissions",
    "find_score_range": "resolve_score_range",
    "find_assignments_by_submission_status": "find_assignments_by_submission_status",
    "find_assignment_by_rate": "find_assignment_by_submission_rate",
}

_COURSE_REQUIRED_READS = {
    "fetch_assignments",
    "fetch_submissions",
    "fetch_students",
    "fetch_quizzes",
    "analyze_course_submissions",
    "resolve_missing_submissions",
    "resolve_score_range",
    "find_assignments_by_submission_status",
    "find_assignment_by_submission_rate",
}


def _clean_fields(intent: SemanticIntentAction, action_name: str) -> dict[str, Any]:
    """Copy only fields understood by the target action.

    Semantic output is untrusted. In particular, a model must not smuggle a
    local/Canvas ID through ``fields`` and turn a language envelope into an
    arbitrary action payload.
    """

    allowed = _FIELD_ALLOWLIST.get(action_name, frozenset())
    cleaned: dict[str, Any] = {}
    for key in allowed:
        value = intent.fields.get(key)
        if value is not None:
            cleaned[key] = value
    return cleaned


def _missing_course_clarification() -> dict[str, Any]:
    return {
        "action": "clarify",
        "clarify": True,
        "question": "Which course should I use for this request?",
        "partial_plan": {},
    }


def _unsupported_criteria(intent: SemanticIntentAction) -> dict[str, Any]:
    """Avoid silently broadening a filtered request into an unfiltered read."""
    return {
        "action": "respond",
        "message": (
            "I understand the request, but that filter is not available in "
            "the current Canvas actions yet. I can still show the underlying "
            "records if you want."
        ),
    }


def normalize_semantic_intent(
    intent: SemanticIntentAction,
    *,
    local_course_id: int | None,
) -> dict[str, Any]:
    """Convert a semantic envelope into an existing action-shaped dict.

    ``local_course_id`` is supplied by the server only after the normal chat
    course-resolution path has matched a user-owned course. A missing course
    therefore becomes a normal clarification, never a model-provided ID.
    """

    if intent.intent == "respond":
        return {
            "action": "respond",
            "message": intent.message or "I can help with your Canvas request.",
        }

    if intent.intent == "unsupported":
        return {
            "action": "respond",
            "message": intent.message
            or "I understand the request, but that Canvas capability is not available yet.",
        }

    if intent.intent == "clarify":
        return {
            "action": "clarify",
            "clarify": True,
            "question": intent.question or "Could you clarify what you would like me to do?",
            "partial_plan": intent.partial_plan,
        }

    action_name = _READ_INTENTS.get(intent.intent, intent.intent)
    # “Which assignments have missing submissions?” is a course-wide
    # assignment filter, not the single-assignment recipient lookup represented
    # by resolve_missing_submissions. Preserve the older intent for requests
    # that name a specific assignment, but route an unscoped request to the
    # explicit assignment-status action.
    assignment_reference = (intent.assignment_reference or "").strip().lower()
    broad_assignment_reference = bool(
        re.search(r"\b(?:assignments|those|these|all|any)\b", assignment_reference)
    )
    if intent.intent == "find_missing_submissions" and (
        not assignment_reference or broad_assignment_reference
    ):
        action_name = "find_assignments_by_submission_status"
    needs_course = action_name in _COURSE_REQUIRED_READS or action_name in _FIELD_ALLOWLIST
    if needs_course and local_course_id is None:
        return _missing_course_clarification()

    if action_name == "fetch_courses":
        return {"action": action_name}

    if action_name in _READ_INTENTS.values():
        # ``criteria`` is deliberately not free-form query execution. Until a
        # strict action exists for a particular filter, declining is safer than
        # silently returning a broader result than the user asked for (for
        # example, treating “assignments with two submissions” as “all
        # assignments”).
        if intent.criteria:
            return _unsupported_criteria(intent)
        result: dict[str, Any] = {"action": action_name}
        if local_course_id is not None:
            result["local_course_id"] = local_course_id

        if action_name in {
            "fetch_submissions", "resolve_missing_submissions", "resolve_score_range"
        }:
            if intent.assignment_reference:
                result["assignment_reference"] = intent.assignment_reference
        if action_name == "resolve_score_range":
            if intent.min_score is None or intent.max_score is None:
                return {
                    "action": "clarify",
                    "clarify": True,
                    "question": "What score range should I use?",
                    "partial_plan": {"local_course_id": local_course_id},
                }
            result["min_score"] = intent.min_score
            result["max_score"] = intent.max_score
            # Deliberately only forwarded when the model set it. A null basis
            # is the signal that the instructor did not name a unit, which is
            # what lets the resolver compare both readings instead of
            # committing to a guess.
            if intent.basis is not None:
                result["basis"] = intent.basis
        if action_name in {"resolve_missing_submissions", "analyze_course_submissions"}:
            # Both actions take the same missing/late categories. Leaving it
            # off analyze_course_submissions let its schema default
            # ("missing") answer a question about late work with missing work
            # — the wrong students, presented as the right ones.
            # Carried as a list: the intent may name both categories, and the
            # action schema resolves that to their union.
            result["status"] = list(intent.status) if intent.status else ["missing"]
        if action_name == "find_assignment_by_submission_rate":
            if intent.comparator is None or intent.threshold_percent is None:
                return {
                    "action": "clarify",
                    "clarify": True,
                    "question": "What submission-rate threshold should I use?",
                    "partial_plan": {"local_course_id": local_course_id},
                }
            result["comparator"] = intent.comparator
            result["threshold_percent"] = intent.threshold_percent
        if action_name == "find_assignments_by_submission_status":
            submission_status = intent.submission_status
            if intent.intent == "find_missing_submissions" and submission_status is None:
                # find_missing_submissions covers both categories — status is
                # what separates them. Defaulting straight to missing threw
                # that away, so an unscoped "which assignments have late
                # submissions?" came back listing missing ones instead.
                #
                # Membership, not equality: status is a tuple of categories
                # now, so "late" only wins when it was asked for on its own.
                # This action's enum has no combined option — a request naming
                # both is a student-level union, which is
                # resolve_missing_submissions' job, not this assignment-level
                # search's.
                requested = intent.status or ()
                submission_status = (
                    "late_submissions"
                    if tuple(requested) == ("late",)
                    else "missing_submissions"
                )
            if submission_status is None:
                return {
                    "action": "clarify",
                    "clarify": True,
                    "question": (
                        "Should I find assignments with any submissions, no submissions, "
                        "missing submissions, or late submissions?"
                    ),
                    "partial_plan": {"local_course_id": local_course_id},
                }
            result["status"] = submission_status
        return result

    if action_name in _FIELD_ALLOWLIST:
        # Writes remain preview-gated by the existing chat/dispatcher path.
        # This envelope only supplies natural-language fields; it cannot
        # replace server-resolved IDs or confirmation state.
        proposed: dict[str, Any] = {
            "action": action_name,
            "local_course_id": local_course_id,
            **_clean_fields(intent, action_name),
        }
        if action_name == "send_message" and intent.delivery_mode == "announcement":
            # An announcement is represented by an empty recipient set in the
            # existing message handoff. Remove any incidental recipient data
            # so an informal announcement request cannot become private.
            for key in (
                "recipient_directives",
                "recipient_handle",
                "recipient_canvas_user_ids",
                "broadcast_to_all_students",
                "also_announce_to_class",
            ):
                proposed.pop(key, None)
        elif action_name == "send_message" and intent.delivery_mode == "private_message":
            proposed["delivery_mode"] = "private_message"
        if intent.assignment_reference and action_name in {
            "update_assignment",
            "update_grade",
        }:
            proposed["assignment_reference"] = intent.assignment_reference
        if (
            intent.student_reference
            and action_name in {"update_grade", "send_message"}
            and not (
                action_name == "send_message"
                and intent.delivery_mode == "announcement"
            )
        ):
            if action_name == "update_grade":
                proposed["student_reference"] = intent.student_reference
            elif not proposed.get("recipient_directives"):
                proposed["recipient_directives"] = [
                    {
                        "student_reference": intent.student_reference,
                        "body": proposed.get("body", ""),
                    }
                ]

        # The existing dispatcher validates incomplete create drafts and
        # produces the guarded preview/clarification flow. Keep that safety
        # behavior intact while allowing the language layer to omit fields.
        return {
            "action": "intent_preview",
            "summary": f"Prepare {action_name.replace('_', ' ')} for review.",
            "proposed_action": proposed,
        }

    return {
        "action": "respond",
        "message": "I understand the request, but I could not map it to a supported Canvas operation.",
    }
