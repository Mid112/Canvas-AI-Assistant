from typing import Literal

from app.mcp_tools.schemas import ACTION_CLASSIFICATION, is_undoable

RiskLevel = Literal["low", "medium", "high"]


def classify_action_risk(action_name: str, params: dict | None = None) -> dict:
    """Return confirmation metadata for a Canvas action.

    This service is intentionally data-local: it classifies the already
    resolved action payload and does not call Canvas. Resolver chains in
    services/chat.py remain responsible for turning natural language into
    real course, assignment, and student identifiers before this runs.
    """
    params = params or {}
    classification = ACTION_CLASSIFICATION.get(action_name)
    risk_level: RiskLevel

    if classification == "read_only":
        risk_level = "low"
    elif classification == "irreversible":
        risk_level = "high"
    elif _is_broad_message(action_name, params):
        # A course-wide message is still classified as "modifying" by the
        # action table, but its blast radius deserves the stronger UI gate.
        risk_level = "high"
    else:
        risk_level = "medium"

    undoable = is_undoable(action_name)
    reversible = classification in {"read_only", "modifying"}
    destructive = risk_level == "high" or not reversible

    return {
        "risk_level": risk_level,
        "classification": classification or "unknown",
        "requires_confirmation": classification != "read_only",
        "confirmation_requirement": _confirmation_requirement(risk_level),
        "destructive": destructive,
        "reversible": reversible,
        "undoable": undoable,
        "can_undo": undoable,
        "reversibility": _reversibility_label(classification, undoable, reversible),
        "warnings": _execution_warnings(action_name, risk_level, params, reversible),
        "technical_details": {
            "action": action_name,
            "classification": classification or "unknown",
            "affected_parameter_keys": sorted(k for k in params.keys() if k != "action"),
        },
    }


def _is_broad_message(action_name: str, params: dict) -> bool:
    # An empty recipient list means Canvas will create a class announcement,
    # not a targeted conversation.
    return action_name == "send_message" and not params.get("recipient_canvas_user_ids")


def _confirmation_requirement(risk_level: RiskLevel) -> dict:
    if risk_level == "low":
        return {
            "type": "none",
            "label": "No confirmation needed",
            "description": "Read-only actions run immediately and do not change Canvas.",
        }
    if risk_level == "medium":
        return {
            "type": "standard",
            "label": "Standard confirmation",
            "description": "Review the preview, then confirm to apply the change.",
        }
    return {
        "type": "strong",
        "label": "Strong confirmation",
        "description": "Type CONFIRM before executing this high-risk action.",
        "confirmation_phrase": "CONFIRM",
    }


def _reversibility_label(classification: str | None, undoable: bool, reversible: bool) -> str:
    if classification == "read_only":
        return "No Canvas changes will be made."
    if undoable:
        return "This action can be undone from workflow history."
    if reversible:
        return "This action may be changed later, but there is no one-click undo."
    return "This action cannot be undone once submitted."


def _execution_warnings(action_name: str, risk_level: RiskLevel, params: dict, reversible: bool) -> list[str]:
    warnings: list[str] = []
    if risk_level == "high":
        warnings.append("Review recipients and content carefully before confirming.")
    if action_name == "send_message" and not params.get("recipient_canvas_user_ids"):
        warnings.append("This will be visible to the entire class.")
    if not reversible:
        warnings.append("Canvas does not provide an undo path for this action.")
    return warnings
