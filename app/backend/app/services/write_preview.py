# app/backend/app/services/write_preview.py
from datetime import datetime
from typing import Any

from app.models.course import Course


def generate_write_preview(proposed_action: dict, course: Course) -> dict:
    """Single preview generator for all write actions. Dispatches on the
    'action' field inside proposed_action to produce the right metadata
    shape for each write type. Adding a new write action means adding
    one private function below and one branch in the match block here.

    Called exclusively from case 'intent_preview': in execute_tool —
    never called from inside a specific write action's own case, since
    by the time a write case is hit, the preview has already been shown
    and the user has confirmed. This enforces SRP: intent_preview owns
    preview generation, write cases own Canvas execution."""

    action_type = proposed_action.get("action", "unknown")

    match action_type:
        case "create_assignment":
            return _preview_create_assignment(course, proposed_action)
        case "send_reminder":
            return _preview_send_reminder(course, proposed_action)
        case "update_grade":
            return _preview_update_grade(course, proposed_action)
        case _:
            # generic fallback for any future write action not yet given
            # a dedicated preview function — still useful to the user
            return _preview_generic(course, proposed_action)


# ── Private preview builders ──────────────────────────────────────────
# Each function takes the full proposed_action dict and the resolved
# Course object, and returns a structured preview dict. They share the
# same return shape so the frontend/terminal can handle them uniformly.

def _preview_create_assignment(course: Course, params: dict) -> dict:
    title = params.get("title", "Untitled")
    description = params.get("description", "")
    due_date = params.get("due_date")
    points_possible = params.get("points_possible")

    due_display = _format_due_date(due_date)
    points_display = f"{points_possible} points" if points_possible else "Ungraded"
    desc_preview = description[:200] + ("..." if len(description) > 200 else "")

    return {
        "action": "create_assignment",
        "course": course.name,
        "metadata": {
            "title": title.strip(),
            "description_preview": desc_preview,
            "due_date": due_display,
            "points_possible": points_display,
        },
        "summary": (
            f"Create assignment '{title.strip()}' in {course.name}, "
            f"due {due_display}, worth {points_display}."
        ),
    }


def _preview_send_reminder(course: Course, params: dict) -> dict:
    student_ids = params.get("target_student_ids", [])
    message_draft = params.get("message_draft", "")
    count = len(student_ids)

    return {
        "action": "send_reminder",
        "course": course.name,
        "metadata": {
            "recipient_count": count,
            "message_preview": message_draft[:200] + ("..." if len(message_draft) > 200 else ""),
        },
        "summary": (
            f"Send a reminder to {count} student{'s' if count != 1 else ''} "
            f"in {course.name}."
        ),
    }


def _preview_update_grade(course: Course, params: dict) -> dict:
    assignment_id = params.get("assignment_id", "?")
    student_id = params.get("student_id", "?")
    new_grade = params.get("new_grade", "?")

    return {
        "action": "update_grade",
        "course": course.name,
        "metadata": {
            "assignment_id": assignment_id,
            "student_id": student_id,
            "new_grade": new_grade,
        },
        "summary": (
            f"Update grade for student {student_id} on assignment "
            f"{assignment_id} to {new_grade} in {course.name}."
        ),
    }


def _preview_generic(course: Course, params: dict) -> dict:
    action_type = params.get("action", "unknown")
    return {
        "action": action_type,
        "course": course.name,
        "metadata": {k: v for k, v in params.items() if k != "action"},
        "summary": f"Perform '{action_type}' on {course.name}.",
    }


def _format_due_date(due_date: str | None) -> str:
    if not due_date:
        return "No due date set"
    try:
        return datetime.fromisoformat(due_date).strftime("%B %d, %Y at %I:%M %p")
    except ValueError:
        return due_date