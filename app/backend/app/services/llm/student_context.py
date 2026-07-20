"""Helpers for minimizing student-identifiable data sent to LLM providers."""

from __future__ import annotations


def llm_student_candidates(students: list[dict]) -> list[dict]:
    """Strip email/login identifiers before any LLM resolution call."""
    candidates: list[dict] = []
    for student in students:
        raw_id = student.get("canvas_user_id", student.get("user_id"))
        try:
            user_id = int(raw_id)
        except (TypeError, ValueError):
            continue
        name = student.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        candidates.append({"user_id": user_id, "name": name.strip()})
    return candidates


def format_llm_student_listing(candidates: list[dict]) -> str:
    return "\n".join(
        f"- canvas_user_id={candidate['user_id']}, name={candidate.get('name')!r}"
        for candidate in candidates
    )
