"""Preview metadata helpers for dry-run / intent_preview flows."""

REVERSIBLE_ACTIONS = frozenset({
    "fetch_courses",
    "fetch_assignments",
    "fetch_submissions",
    "fetch_students",
    "get_active_course",
})
IRREVERSIBLE_ACTIONS = frozenset({"create_assignment", "update_assignment", "send_message", "update_grade"})


def classify_reversibility(action: str) -> bool:
    if action in REVERSIBLE_ACTIONS:
        return True
    if action in IRREVERSIBLE_ACTIONS:
        return False
    return False


def build_action_preview(action: str, summary: str, proposed_action: dict, course_name: str | None = None) -> dict:
    reversible = classify_reversibility(action)
    affected: list[dict] = []

    if course_name:
        affected.append({"type": "course", "name": course_name})

    if action in {"create_assignment", "update_assignment"}:
        affected.append({"type": "assignment", "name": proposed_action.get("title", "Assignment")})
    elif action == "send_message":
        affected.append({"type": "announcement", "name": proposed_action.get("subject", "Message")})

    return {
        "action": action,
        "summary": summary,
        "metadata": proposed_action,
        "reversible": reversible,
        "affected_resources": affected,
    }
