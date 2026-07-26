"""Conversation field memory helpers (Feature Assistant Context #1235)."""

from __future__ import annotations

import json
from typing import Any

from app.models.conversation import Conversation

# Fields safe to persist and reuse across turns. IDs and instructor-confirmed
# draft params only — never free-form tool dumps.
_FIELD_MEMORY_KEYS = frozenset(
    {
        "local_course_id",
        "assignment_id",
        "assignment_reference",
        "student_id",
        "student_reference",
        "title",
        "description",
        "due_date",
        "points_possible",
        "quiz_engine",
        "subject",
        "body",
        "new_grade",
        "feedback",
        "action",
    }
)


def merge_field_memory(conversation: Conversation, source: dict[str, Any] | None) -> None:
    """Merge confirmed/collected fields into conversation.field_memory."""
    if not source:
        return
    memory = dict(conversation.field_memory or {})
    for key, value in source.items():
        if key not in _FIELD_MEMORY_KEYS or value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        memory[key] = value
    conversation.field_memory = memory


def format_field_memory_for_prompt(memory: dict[str, Any] | None) -> str:
    if not memory:
        return ""
    compact = {k: v for k, v in memory.items() if k in _FIELD_MEMORY_KEYS and v is not None}
    if not compact:
        return ""
    return (
        "FIELD MEMORY (confirmed earlier in this conversation — reuse these "
        "values on follow-ups unless the user explicitly overrides them):\n"
        f"{json.dumps(compact, default=str)}"
    )


def trim_tool_dump_for_history(result: Any, *, max_chars: int = 2500) -> Any:
    """Keep field memory-sized context; truncate large tool payloads for the
    LLM history window (#1235 context-window audit)."""
    if isinstance(result, str):
        return result if len(result) <= max_chars else result[: max_chars - 3] + "..."
    try:
        encoded = json.dumps(result, default=str)
    except TypeError:
        return result
    if len(encoded) <= max_chars:
        return result
    return {
        "_truncated": True,
        "preview": encoded[: max_chars - 3] + "...",
    }
