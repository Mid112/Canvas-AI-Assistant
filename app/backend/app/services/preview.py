"""Preview metadata helpers for dry-run / intent_preview flows."""

from app.mcp_tools.schemas import get_risk_level, is_reversible


def build_action_preview(action: str, summary: str, proposed_action: dict, course_name: str | None = None) -> dict:
    reversible = is_reversible(action)
    affected: list[dict] = []

    if course_name:
        affected.append({"type": "course", "name": course_name})

    if action in {"create_assignment", "update_assignment"}:
        affected.append({"type": "assignment", "name": proposed_action.get("title") or proposed_action.get("name", "Assignment")})
    elif action == "create_quiz":
        affected.append({"type": "quiz", "name": proposed_action.get("title") or proposed_action.get("name", "Quiz")})
    elif action == "send_message":
        affected.append({"type": "announcement", "name": proposed_action.get("subject", "Message")})

    return {
        "action": action,
        "summary": summary,
        "metadata": proposed_action,
        "reversible": reversible,
        "risk_level": get_risk_level(action),
        "affected_resources": affected,
    }
