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


def _assignment_id_from_nested(assignment: dict[str, Any]) -> int | None:
    """Accept both ``id`` and chat-chain ``assignment_id`` nested shapes."""
    return _coerce_int(
        assignment.get("id")
        or assignment.get("assignment_id")
        or assignment.get("canvas_assignment_id")
    )


def _assignment_name_from_nested(assignment: dict[str, Any]) -> str | None:
    for key in ("name", "assignment_name", "title"):
        value = assignment.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


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
        assignment_id = _assignment_id_from_nested(result["assignment"])
    if assignment_id is None:
        assignment_id = _coerce_int(action_dump.get("assignment_id"))
    if assignment_id is not None:
        refs["assignment_id"] = assignment_id

    assignment_ref = result.get("assignment_name") or result.get("assignment_reference")
    if isinstance(result.get("assignment"), dict):
        assignment_ref = assignment_ref or _assignment_name_from_nested(result["assignment"])
    if not assignment_ref:
        assignment_ref = action_dump.get("assignment_reference")
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


def _remember_assignments_from_list(memory: dict[str, Any], items: list[Any]) -> None:
    """Populate recent_assignments from fetch_assignments-style payloads."""
    # Insert in reverse so the first list item ends up most-recent (front).
    for item in reversed(items):
        if not isinstance(item, dict):
            continue
        assignment_id = _assignment_id_from_nested(item)
        if assignment_id is None:
            continue
        name = _assignment_name_from_nested(item) or f"Assignment {assignment_id}"
        _remember_recent(
            memory,
            _RECENT_ASSIGNMENTS_KEY,
            {"id": assignment_id, "name": name},
            id_key="id",
        )


def _remember_students_from_list(memory: dict[str, Any], items: list[Any]) -> None:
    """Populate recent_students from fetch_students-style payloads.

    Prefer Canvas user ids (``canvas_user_id`` / ``user_id``) over the local
    Student row ``id`` — follow-up grade/student resolvers match submission
    ``user_id`` / prompt ``canvas_user_id``, not the local PK (#1302).
    """
    for item in reversed(items):
        if not isinstance(item, dict):
            continue
        student_id = _coerce_int(
            item.get("canvas_user_id") or item.get("user_id") or item.get("id")
        )
        if student_id is None:
            continue
        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            name = f"Student {student_id}"
        else:
            name = name.strip()
        _remember_recent(
            memory,
            _RECENT_STUDENTS_KEY,
            {"id": student_id, "name": name},
            id_key="id",
        )


def merge_read_result_into_field_memory(
    conversation: Conversation,
    action_dump: dict[str, Any] | None,
    result: dict[str, Any] | None,
) -> None:
    """Persist resolved read refs + capped recent entity lists (#1302)."""
    if not isinstance(result, dict) or result.get("clarify") or result.get("error"):
        return
    refs = extract_refs_from_read_result(action_dump, result)
    assignments_list = result.get("assignments")
    students_list = result.get("students")
    has_assignment_list = isinstance(assignments_list, list) and bool(assignments_list)
    has_student_list = isinstance(students_list, list) and bool(students_list)
    if not refs and not has_assignment_list and not has_student_list:
        return

    if refs:
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

    if has_assignment_list:
        _remember_assignments_from_list(memory, assignments_list)
        # Prefer the first list entry as the scalar follow-up default when the
        # read did not already resolve a single assignment.
        if "assignment_id" not in refs:
            first = next(
                (
                    item
                    for item in assignments_list
                    if isinstance(item, dict) and _assignment_id_from_nested(item) is not None
                ),
                None,
            )
            if first is not None:
                memory["assignment_id"] = _assignment_id_from_nested(first)
                first_name = _assignment_name_from_nested(first)
                if first_name:
                    memory["assignment_reference"] = first_name

    if has_student_list:
        _remember_students_from_list(memory, students_list)

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
