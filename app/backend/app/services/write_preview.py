# app/backend/app/services/write_preview.py
from datetime import datetime

from app.mcp_tools.schemas import is_reversible
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
        case "update_assignment":
            return _preview_update_assignment(course, proposed_action)
        case "send_message":
            return _preview_send_message(course, proposed_action)
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

def _reversibility_fields(action_type: str) -> dict:
    """Shared #581 metadata every write preview carries — single source
    of truth is is_reversible(), never hand-duplicated per builder."""
    reversible = is_reversible(action_type)
    fields = {"reversible": reversible}
    if not reversible:
        fields["reversibility_note"] = "This action cannot be undone once submitted."
    return fields


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
        "affected_resources": [
            {"type": "course", "id": course.id, "name": course.name, "status": "unchanged"},
            {"type": "assignment", "id": None, "name": title.strip(), "status": "created"},
        ],
        **_reversibility_fields("create_assignment"),
    }


def _preview_update_assignment(course: Course, params: dict) -> dict:
    assignment_id = params.get("assignment_id", "?")
    title = params.get("title")
    description = params.get("description")
    due_date = params.get("due_date")
    points_possible = params.get("points_possible")

    changes: dict[str, str] = {}
    if title is not None:
        changes["title"] = title.strip()
    if description is not None:
        changes["description"] = description[:200] + ("..." if len(description) > 200 else "")
    if due_date is not None:
        changes["due_date"] = _format_due_date(due_date)
    if points_possible is not None:
        changes["points_possible"] = f"{points_possible} points"

    unchanged = [
        label
        for label, value in (
            ("title", title),
            ("description", description),
            ("due date", due_date),
            ("points possible", points_possible),
        )
        if value is None
    ]

    if changes:
        change_text = "; ".join(f"{k.replace('_', ' ')} → {v}" for k, v in changes.items())
        summary = f"Update assignment (ID {assignment_id}) in {course.name}: {change_text}."
        if unchanged:
            summary += f" Everything else ({', '.join(unchanged)}) stays the same."
    else:
        summary = f"No fields were specified to update assignment (ID {assignment_id}) in {course.name}."

    return {
        "action": "update_assignment",
        "course": course.name,
        "metadata": {
            "assignment_id": assignment_id,
            "changes": changes,
            "unchanged_fields": unchanged,
        },
        "summary": summary,
        "affected_resources": [
            {"type": "course", "id": course.id, "name": course.name, "status": "unchanged"},
            {
                "type": "assignment",
                "id": assignment_id if assignment_id != "?" else None,
                "name": None,
                "status": "modified",
                "changed_fields": list(changes.keys()),
            },
        ],
        **_reversibility_fields("update_assignment"),
    }


def _preview_send_message(course: Course, params: dict) -> dict:
    subject = params.get("subject", "")
    body = params.get("body", "")
    body_preview = body[:200] + ("..." if len(body) > 200 else "")
    recipient_ids = params.get("recipient_canvas_user_ids") or []

    if recipient_ids:
        recipient_count = len(recipient_ids)
        summary = (
            f"Send \"{subject.strip()}\" as a private Canvas message to "
            f"{recipient_count} selected student(s) in {course.name}."
        )
        audience = {"scope": "selected_students", "size": recipient_count}
        resource_type = "conversation"
    else:
        summary = (
            f"Post \"{subject.strip()}\" as a public announcement visible to "
            f"the entire class in {course.name}."
        )
        audience = {"scope": "entire_class", "size": None}
        resource_type = "announcement"

    return {
        "action": "send_message",
        "course": course.name,
        "metadata": {
            "subject": subject.strip(),
            "body_preview": body_preview,
            "recipient_canvas_user_ids": recipient_ids,
        },
        "summary": summary,
        "affected_resources": [
            {"type": "course", "id": course.id, "name": course.name, "status": "unchanged"},
            {"type": resource_type, "id": None, "name": subject.strip(), "status": "created"},
        ],
        "audience": audience,
        **_reversibility_fields("send_message"),
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
        "affected_resources": [
            {"type": "course", "id": course.id, "name": course.name, "status": "unchanged"},
            {"type": "assignment", "id": assignment_id if assignment_id != "?" else None, "name": None, "status": "unchanged"},
            {
                "type": "submission",
                "id": student_id if student_id != "?" else None,
                "name": None,
                "status": "modified",
                "changed_fields": ["grade"],
            },
        ],
        **_reversibility_fields("update_grade"),
    }


def _preview_generic(course: Course, params: dict) -> dict:
    action_type = params.get("action", "unknown")
    return {
        "action": action_type,
        "course": course.name,
        "metadata": {k: v for k, v in params.items() if k != "action"},
        "summary": f"Perform '{action_type}' on {course.name}.",
        "affected_resources": [],
        **_reversibility_fields(action_type),
    }


def _format_due_date(due_date: str | None) -> str:
    if not due_date:
        return "No due date set"
    try:
        return datetime.fromisoformat(due_date).strftime("%B %d, %Y at %I:%M %p")
    except ValueError:
        return due_date
