"""Credential gates for Canvas-touching assistant actions (issue #1245)."""

from __future__ import annotations

from typing import Literal

from app.mcp_tools.schemas import READ_ACTIONS, WRITE_ACTIONS
from app.models.user import User

# Local preference tools — no Canvas API credentials required.
_LOCAL_ONLY_ACTIONS = frozenset({"get_active_course", "set_active_course"})

# Conversational / planning actions that must stay available in limited mode.
_LIMITED_MODE_ALLOWED_ACTIONS = frozenset(
    {
        "respond",
        "clarify",
        "out_of_scope",
        *_LOCAL_ONLY_ACTIONS,
    }
)

CANVAS_CREDENTIAL_ACTIONS = (READ_ACTIONS | WRITE_ACTIONS) - _LOCAL_ONLY_ACTIONS


def user_has_canvas_credentials(user: User) -> bool:
    connections = getattr(user, "canvas_connections", None) or []
    return any(getattr(connection, "encrypted_token", None) for connection in connections)


def action_requires_canvas_credentials(action_name: str) -> bool:
    return action_name in CANVAS_CREDENTIAL_ACTIONS


def is_allowed_in_limited_mode(action_name: str) -> bool:
    return action_name in _LIMITED_MODE_ALLOWED_ACTIONS


def classify_action_for_limited_mode(
    action_name: str,
    proposed_action: dict | None = None,
) -> Literal["allow", "block"]:
    """Classify a parsed tool action before any Canvas tool execution.

    ``intent_preview`` is classified by its nested ``proposed_action``.
    """
    name = action_name
    if action_name == "intent_preview" and isinstance(proposed_action, dict):
        nested = proposed_action.get("action")
        if isinstance(nested, str) and nested.strip():
            name = nested.strip()

    if is_allowed_in_limited_mode(name):
        return "allow"
    if action_requires_canvas_credentials(name):
        return "block"
    # Unclassified intent_preview (missing/invalid proposed action) is unsafe.
    if action_name == "intent_preview":
        return "block"
    return "allow"
