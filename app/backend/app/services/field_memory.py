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

# Capped MRU lists persisted alongside scalar keys (#1302). Not free-form
# tool dumps — only id + display label for prompt context.
_RECENT_ASSIGNMENTS_KEY = "recent_assignments"
_RECENT_STUDENTS_KEY = "recent_students"
_RECENT_LIST_CAP = 5

# Append-only grounding accumulator from real tool fetches (#1303). Stored
# separately so scalar memory fields never authorize grade/title claims alone.
_GROUNDED_FACTS_KEY = "grounded_facts"
_GROUNDED_FACTS_CAP = 64


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


def _coerce_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _remember_recent(
    memory: dict[str, Any],
    list_key: str,
    entry: dict[str, Any],
    *,
    id_key: str,
    cap: int = _RECENT_LIST_CAP,
) -> None:
    entity_id = entry.get(id_key)
    if entity_id is None:
        return
    current = [
        item
        for item in (memory.get(list_key) or [])
        if isinstance(item, dict) and item.get(id_key) != entity_id
    ]
    current.insert(0, entry)
    memory[list_key] = current[:cap]


def extract_refs_from_read_result(
    action_dump: dict[str, Any] | None,
    result: dict[str, Any] | None,
) -> dict[str, Any]:
    """Pull resolved assignment/student refs from a read action + result (#1302)."""
    action_dump = action_dump or {}
    result = result or {}
    refs: dict[str, Any] = {}

    course_id = _coerce_int(result.get("local_course_id") or action_dump.get("local_course_id"))
    if course_id is not None:
        refs["local_course_id"] = course_id

    assignment_id = _coerce_int(result.get("assignment_id"))
    if assignment_id is None and isinstance(result.get("assignment"), dict):
        assignment_id = _coerce_int(result["assignment"].get("id"))
    if assignment_id is None:
        assignment_id = _coerce_int(action_dump.get("assignment_id"))
    if assignment_id is not None:
        refs["assignment_id"] = assignment_id

    assignment_ref = (
        result.get("assignment_name")
        or result.get("assignment_reference")
        or action_dump.get("assignment_reference")
    )
    if isinstance(result.get("assignment"), dict):
        assignment_ref = assignment_ref or result["assignment"].get("name")
    if isinstance(assignment_ref, str) and assignment_ref.strip():
        refs["assignment_reference"] = assignment_ref.strip()

    student_id = _coerce_int(result.get("student_id") or action_dump.get("student_id"))
    if student_id is not None:
        refs["student_id"] = student_id

    student_ref = result.get("student_name") or result.get("student_reference") or action_dump.get(
        "student_reference"
    )
    if isinstance(student_ref, str) and student_ref.strip():
        refs["student_reference"] = student_ref.strip()

    return refs


def merge_read_result_into_field_memory(
    conversation: Conversation,
    action_dump: dict[str, Any] | None,
    result: dict[str, Any] | None,
) -> None:
    """Persist resolved read refs + capped recent entity lists (#1302)."""
    if not isinstance(result, dict) or result.get("clarify") or result.get("error"):
        return
    refs = extract_refs_from_read_result(action_dump, result)
    if not refs:
        return

    merge_field_memory(conversation, refs)
    memory = dict(conversation.field_memory or {})

    if "assignment_id" in refs:
        _remember_recent(
            memory,
            _RECENT_ASSIGNMENTS_KEY,
            {
                "id": refs["assignment_id"],
                "name": refs.get("assignment_reference") or f"Assignment {refs['assignment_id']}",
            },
            id_key="id",
        )
    if "student_id" in refs:
        _remember_recent(
            memory,
            _RECENT_STUDENTS_KEY,
            {
                "id": refs["student_id"],
                "name": refs.get("student_reference") or f"Student {refs['student_id']}",
            },
            id_key="id",
        )

    conversation.field_memory = memory


def format_field_memory_for_prompt(memory: dict[str, Any] | None) -> str:
    if not memory:
        return ""
    compact = {k: v for k, v in memory.items() if k in _FIELD_MEMORY_KEYS and v is not None}
    recent_assignments = memory.get(_RECENT_ASSIGNMENTS_KEY) or []
    recent_students = memory.get(_RECENT_STUDENTS_KEY) or []
    if recent_assignments:
        compact[_RECENT_ASSIGNMENTS_KEY] = recent_assignments
    if recent_students:
        compact[_RECENT_STUDENTS_KEY] = recent_students
    if not compact:
        return ""
    return (
        "FIELD MEMORY (confirmed earlier in this conversation — reuse these "
        "values on follow-ups unless the user explicitly overrides them):\n"
        f"{json.dumps(compact, default=str)}"
    )


def grounded_facts_from_memory(memory: dict[str, Any] | None) -> dict[str, list]:
    """Return the persisted grounded_facts blob (lists) or empty lists."""
    raw = (memory or {}).get(_GROUNDED_FACTS_KEY) or {}
    if not isinstance(raw, dict):
        return {"ids": [], "names": [], "grades": [], "dates": []}
    return {
        "ids": [int(v) for v in (raw.get("ids") or []) if _coerce_int(v) is not None],
        "names": [str(v) for v in (raw.get("names") or []) if str(v).strip()],
        "grades": [str(v) for v in (raw.get("grades") or []) if str(v).strip()],
        "dates": [str(v) for v in (raw.get("dates") or []) if str(v).strip()],
    }


def merge_grounded_facts_into_memory(
    conversation: Conversation,
    *,
    ids: set[int],
    names: set[str],
    grades: set[str],
    dates: set[str],
    cap: int = _GROUNDED_FACTS_CAP,
) -> None:
    """Append-only union of tool-derived facts into field_memory (#1303)."""
    if not (ids or names or grades or dates):
        return
    memory = dict(conversation.field_memory or {})
    prior = grounded_facts_from_memory(memory)

    def _merge_list(existing: list, incoming: set[str] | set[int], *, as_int: bool = False) -> list:
        merged: list = list(existing)
        seen = set(merged)
        for item in sorted(incoming, key=lambda value: str(value)):
            value = int(item) if as_int else str(item)
            if value in seen:
                continue
            merged.append(value)
            seen.add(value)
        return merged[-cap:]

    memory[_GROUNDED_FACTS_KEY] = {
        "ids": _merge_list(prior["ids"], ids, as_int=True),
        "names": _merge_list(prior["names"], names),
        "grades": _merge_list(prior["grades"], grades),
        "dates": _merge_list(prior["dates"], dates),
    }
    conversation.field_memory = memory


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
