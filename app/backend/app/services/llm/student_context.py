"""Helpers for minimizing student-identifiable data sent to LLM providers.

Feature 14 (#908): keep names + Canvas user IDs (needed to resolve "Alex" →
the right submission), but never email/login_id or other contact fields.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


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


_PII_KEYS = frozenset(
    {
        "email",
        "student_email",
        "login_id",
        "student_login_id",
        "primary_email",
        "sortable_name",
    }
)


def llm_safe_student_dict(student: Any) -> dict[str, Any]:
    """Minimize a StudentResponse (or similar) for LLM / tool-result payloads."""
    if hasattr(student, "model_dump"):
        raw = student.model_dump()
    elif isinstance(student, dict):
        raw = student
    else:
        raw = {
            "id": getattr(student, "id", None),
            "canvas_user_id": getattr(student, "canvas_user_id", None),
            "name": getattr(student, "name", None),
            "enrollment_state": getattr(student, "enrollment_state", None),
            "course_id": getattr(student, "course_id", None),
        }
    return {
        "id": raw.get("id"),
        "canvas_user_id": raw.get("canvas_user_id"),
        "course_id": raw.get("course_id"),
        "name": raw.get("name"),
        "enrollment_state": raw.get("enrollment_state"),
    }


def llm_safe_submission_dict(submission: Any) -> dict[str, Any]:
    """Minimize a SubmissionResponse for LLM / tool-result payloads."""
    if hasattr(submission, "model_dump"):
        try:
            raw = submission.model_dump(mode="json")
        except TypeError:
            raw = submission.model_dump()
    elif isinstance(submission, dict):
        raw = dict(submission)
    else:
        status = getattr(submission, "status", None)
        status_value = status.value if status is not None and hasattr(status, "value") else status
        raw = {
            "id": getattr(submission, "id", None),
            "assignment_id": getattr(submission, "assignment_id", None),
            "user_id": getattr(submission, "user_id", None),
            "student_name": getattr(submission, "student_name", None),
            "submitted_at": getattr(submission, "submitted_at", None),
            "workflow_state": getattr(submission, "workflow_state", None),
            "status": status_value,
            "score": getattr(submission, "score", None),
            "grade": getattr(submission, "grade", None),
            "graded_at": getattr(submission, "graded_at", None),
        }
    for key in _PII_KEYS:
        raw.pop(key, None)
    return {
        "id": raw.get("id"),
        "assignment_id": raw.get("assignment_id"),
        "user_id": raw.get("user_id"),
        "student_name": raw.get("student_name"),
        "submitted_at": raw.get("submitted_at"),
        "workflow_state": raw.get("workflow_state"),
        "status": raw.get("status"),
        "score": raw.get("score"),
        "grade": raw.get("grade"),
        "graded_at": raw.get("graded_at"),
    }


_ID_FIELD_NAMES = frozenset(
    {
        "id",
        "canvas_id",
        "canvas_user_id",
        "user_id",
        "assignment_id",
        "course_id",
        "local_course_id",
        "local_id",
    }
)

_GROUNDED_ID_PATTERN = re.compile(r"\b\d+\b")


def _try_add_grounded_id(value: Any, grounded: set[int]) -> None:
    try:
        grounded.add(int(value))
    except (TypeError, ValueError):
        return


def _collect_ids_from_value(value: Any, grounded: set[int]) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if key in _ID_FIELD_NAMES or key.endswith("_id"):
                _try_add_grounded_id(item, grounded)
            _collect_ids_from_value(item, grounded)
        return

    if isinstance(value, list):
        for item in value:
            _collect_ids_from_value(item, grounded)


def collect_grounded_ids(tool_results: list[Any]) -> set[int]:
    """Collect assignment/student/course IDs present in prior tool payloads."""
    grounded: set[int] = set()
    for result in tool_results:
        _collect_ids_from_value(result, grounded)
    return grounded


def strip_ungrounded_ids(text: str, grounded_ids: set[int]) -> str:
    """Replace numeric IDs in free text that were not returned by tools."""

    def _replace(match: re.Match[str]) -> str:
        candidate = int(match.group(0))
        if candidate in grounded_ids:
            return match.group(0)
        return "[ID redacted]"

    return _GROUNDED_ID_PATTERN.sub(_replace, text)


# Explicit Canvas-ID claim patterns — safer than stripping every digit
# (which would redact years, points, and grades). Feature 13 #855.
# Bare titles like "Assignment 1" are NOT ID claims; require an "id"
# token or punctuation (=/: /#) so clarify option lists stay readable.
_CANVAS_ID_CLAIM_PATTERN = re.compile(
    r"(?i)\b(?:"
    r"(assignment\s+id|student\s+id|user\s+id|course\s+id|"
    r"canvas(?:\s+user)?\s+id|submission\s+id|"
    r"local_course_id|canvas_user_id|assignment_id|student_id|user_id|course_id|submission_id)"
    r"(?:\s*(?:=|:|#)\s*|\s+)(\d+)"
    r"|"
    r"(assignment|student|user|course|submission)\s*(?:=|:|#)\s*(\d+)"
    r")\b"
)


def strip_ungrounded_canvas_id_claims(text: str, grounded_ids: set[int]) -> str:
    """Redact only explicit Canvas ID claims that were not tool-retrieved."""

    def _replace(match: re.Match[str]) -> str:
        label = match.group(1) or match.group(3)
        raw_id = match.group(2) or match.group(4)
        numeric = int(raw_id)
        if numeric in grounded_ids:
            return match.group(0)
        return f"{label} [ID redacted]"

    return _CANVAS_ID_CLAIM_PATTERN.sub(_replace, text)


_NAME_KEYS = frozenset(
    {
        "name",
        "title",
        "student_name",
        "assignment_name",
        "course_name",
        "display_name",
    }
)
_GRADE_KEYS = frozenset({"grade", "new_grade", "posted_grade", "score"})
_DATE_KEYS = frozenset({"due_at", "due_date", "submitted_at", "graded_at"})

_GRADE_CLAIM_PATTERN = re.compile(
    r"(?i)\b(?:grade|score|scored|marks?)\b[^0-9]{0,12}(\d+(?:\.\d+)?)\b"
)


@dataclass(frozen=True)
class GroundedFacts:
    ids: set[int]
    names: set[str]
    grades: set[str]
    dates: set[str]


def collect_grounded_facts(tool_results: list[Any]) -> GroundedFacts:
    """Collect IDs, names, grades/scores, and dates from retrieved tool payloads."""
    ids = collect_grounded_ids(tool_results)
    names: set[str] = set()
    grades: set[str] = set()
    dates: set[str] = set()

    def _walk(value: Any) -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                if key in _NAME_KEYS and isinstance(item, str) and item.strip():
                    names.add(item.strip().casefold())
                if key in _GRADE_KEYS and item is not None and str(item).strip():
                    grades.add(str(item).strip().casefold())
                if key in _DATE_KEYS and item is not None and str(item).strip():
                    dates.add(str(item).strip().casefold())
                _walk(item)
            return
        if isinstance(value, list):
            for item in value:
                _walk(item)

    for result in tool_results:
        _walk(result)
    return GroundedFacts(ids=ids, names=names, grades=grades, dates=dates)


def _grade_claim_is_backed(raw: str, facts: GroundedFacts) -> bool:
    # Allow integer forms of float scores present as "88.0".
    return raw.casefold() in facts.grades or f"{raw}.0".casefold() in facts.grades


def detect_unverified_claims(text: str, facts: GroundedFacts) -> set[str]:
    """Name the Canvas-fact claim types in prose that no retrieval backs.

    Detection only — this never rewrites the text (bug 2 / bug 13). The
    previous behaviour substituted "[grade redacted]" and
    '"[name redacted]"' into the reply the instructor reads, which was the
    wrong end of the pipe for a privacy control and destroyed two kinds of
    legitimate content:

    * Quoted strings. The pattern could not tell a Canvas assignment title
      from the message body the instructor themselves typed, so composing
      "send X to the class" came back with X blanked out — hiding the very
      text they were being asked to approve.
    * Aggregates. facts.grades only ever holds individual fetched scores,
      so an average, rate, or percentile is unrepresentable in it by
      construction and was redacted 100% of the time.

    Callers surface the returned claim types to the instructor as a trust
    signal instead, which keeps the anti-hallucination value (see bug 12,
    where the model invented statistics with no tool call behind them)
    without censoring real answers.
    """
    unverified: set[str] = set()

    for match in _GRADE_CLAIM_PATTERN.finditer(text):
        if not _grade_claim_is_backed(match.group(1), facts):
            unverified.add("grade")
            break

    for match in _CANVAS_ID_CLAIM_PATTERN.finditer(text):
        raw_id = match.group(2) or match.group(4)
        try:
            numeric = int(raw_id)
        except (TypeError, ValueError):
            continue
        if numeric not in facts.ids:
            unverified.add("canvas_id")
            break

    return unverified


def strip_ungrounded_canvas_facts(text: str, facts: GroundedFacts) -> str:
    """Redact ungrounded Canvas ID claims only.

    ID claims stay destructive because a wrong Canvas ID is qualitatively
    different from a wrong number in prose: it can misroute a later write to
    the wrong assignment or student. Grade and title scrubbing were removed
    in favour of detect_unverified_claims — see its docstring.
    """
    return strip_ungrounded_canvas_id_claims(text, facts.ids)


def filter_grounded_dict_fields(
    data: dict[str, Any],
    grounded_ids: set[int],
) -> dict[str, Any]:
    """Drop ungrounded *_id fields from structured assistant payloads."""
    filtered: dict[str, Any] = {}
    for key, value in data.items():
        if key.endswith("_id") or key in _ID_FIELD_NAMES:
            try:
                numeric = int(value)
            except (TypeError, ValueError):
                filtered[key] = value
                continue
            if numeric in grounded_ids:
                filtered[key] = value
            continue
        if isinstance(value, dict):
            filtered[key] = filter_grounded_dict_fields(value, grounded_ids)
        elif isinstance(value, list):
            filtered[key] = [
                filter_grounded_dict_fields(item, grounded_ids)
                if isinstance(item, dict)
                else item
                for item in value
            ]
        else:
            filtered[key] = value
    return filtered


_RETRIEVED_REF_KEYS = frozenset(
    {
        "assignment_id",
        "student_id",
        "user_id",
        "canvas_user_id",
        "submission_id",
        "quiz_id",
    }
)


_LLM_PROSE_ACTIONS = frozenset({"respond", "clarify", "out_of_scope"})

# Claim types strip_ungrounded_canvas_facts already rewrites in place.
# detect_unverified_claims and strip_ungrounded_canvas_id_claims share a
# pattern and a grounded set, so an ID it detects is always one it redacts —
# the instructor reads "[ID redacted]" in the prose itself. Repeating that in
# the "could not be verified" notice points them at a figure no longer on
# screen. Only claims left standing in the text need the warning, which today
# means grades: deliberately not rewritten, so the number is still shown and
# still needs qualifying (bug 12).
_SELF_EVIDENT_CLAIMS = frozenset({"canvas_id"})


def action_is_llm_prose(result: dict[str, Any]) -> bool:
    """True when the result's prose was written by the model, not the server.

    Two producers emit intent_preview results with identical shapes, and only
    one of them is server text:

    * The resolver chains in services/chat.py set ``summary`` to
      generate_write_preview's output — the same string they also hand back
      as ``preview_metadata["summary"]``. That text is composed from
      already-validated params, and scrubbing it hid the instructor's own
      subject/body from the approval step (bug 2).
    * dispatcher.py's generic ``case "intent_preview":`` — the primary write
      preview path — passes the model's own ``IntentPreviewAction.summary``
      straight through, with preview_metadata built separately alongside it.
      That is free text and can cite a Canvas ID nothing ever retrieved.

    So the two are told apart by whether ``summary`` is the very string
    write_preview produced. Deciding this from the payload rather than a
    marker field is deliberate: several of the chat.py sites persist their
    result via log_message before grounding runs, and handle_modified_action
    never grounds at all, so an added key would leak into stored message JSON
    and into that response.

    Anything untagged and non-conversational is a tool echo whose summary
    comes from a resolver chain, so it stays exempt as before.
    """
    if result.get("intent_preview"):
        metadata = result.get("preview_metadata")
        server_summary = (
            metadata.get("summary") if isinstance(metadata, dict) else None
        )
        return result.get("summary") != server_summary
    return result.get("action") in _LLM_PROSE_ACTIONS


def ground_assistant_result(
    result: dict[str, Any],
    *,
    tool_results: list[Any] | None = None,
    field_memory: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], GroundedFacts]:
    """Prevent assistant replies from citing Canvas data that was never
    retrieved (Feature 13 #855 / #856).

    Scrubs only ungrounded Canvas ID claims; grade/score claims become
    ``unverified_claims`` warnings instead of being rewritten, and quoted
    title scrubbing intentionally stays gone (bugs 2 and 13). Facts come from
    this-turn tool payloads unioned with the append-only ``grounded_facts``
    accumulator in field_memory (prior real tool fetches — #1303). Scalar
    field_memory keys alone never authorize claims. Returns
    ``(scrubbed_result, unioned_tool_facts)`` so the caller can persist newly
    observed tool facts.
    """
    sources: list[Any] = list(tool_results or [])
    if result.get("action") not in {"respond", "clarify", "out_of_scope", "intent_preview"}:
        # Direct tool echo — the payload itself is the retrieval source.
        sources.append(result)

    tool_facts = collect_grounded_facts(sources)
    prior_facts = grounded_facts_from_field_memory(field_memory)
    facts = union_grounded_facts(prior_facts, tool_facts)
    out = dict(result)

    # Only the model's own free text is a hallucination surface. An
    # intent_preview "summary" is composed server-side by
    # services/write_preview.py from already-validated params, and a direct
    # tool echo's "summary" is built by the resolver chains in
    # services/chat.py from real Canvas reads. Scrubbing either one edited
    # trustworthy server output and, for write previews, hid the
    # instructor's own subject/body from the approval step (bug 2).
    is_llm_authored = action_is_llm_prose(out)

    # Detection and scrubbing both use the union of prior + this-turn facts
    # so a follow-up turn can reference "HW1" from an earlier fetch without
    # re-fetching.
    unverified: set[str] = set()
    if is_llm_authored:
        for prose_key in ("message", "summary", "question"):
            value = out.get(prose_key)
            if isinstance(value, str):
                unverified |= detect_unverified_claims(value, facts)
                out[prose_key] = strip_ungrounded_canvas_facts(value, facts)

    # proposed_action scrubbing uses ONLY this-turn tool_facts — never
    # prior accumulated facts. A prior-turn ID (e.g. student 123 from
    # assignment A's submissions) must NOT authorize the same ID in a
    # proposed_action targeting assignment B, since the ID may not be
    # valid for the new context. The resolver chains (_resolve_grade_target,
    # _run_update_assignment_chain) already validate IDs server-side, so
    # this is defense-in-depth, not the primary guard.
    proposed = out.get("proposed_action")
    if isinstance(proposed, dict) and tool_facts.ids:
        cleaned = dict(proposed)
        for key in _RETRIEVED_REF_KEYS:
            if key not in cleaned:
                continue
            try:
                numeric = int(cleaned[key])
            except (TypeError, ValueError):
                continue
            if numeric not in tool_facts.ids:
                cleaned.pop(key, None)
        out["proposed_action"] = cleaned

    # Structured read echoes: drop ungrounded id fields if somehow mixed in.
    # Uses this-turn tool_facts only — same reasoning as proposed_action.
    if tool_facts.ids and out.get("action") == "respond" and isinstance(out.get("data"), dict):
        out["data"] = filter_grounded_dict_fields(out["data"], tool_facts.ids)

    if tool_facts.ids or tool_facts.names or tool_facts.grades:
        out["grounded"] = True

    # Names the claim types nothing retrieved backs, so the client can warn
    # on the bug 12 shape — the model answering "average grade is 82%" with
    # no Canvas read behind it — instead of the number being silently
    # rewritten to "[grade redacted]". Absent when everything checks out, so
    # ordinary replies carry no extra payload. Claims the scrubber already
    # rewrote are dropped here: the text shows the redaction, so warning
    # about them too would flag a figure that is no longer displayed.
    surfaced = unverified - _SELF_EVIDENT_CLAIMS
    if surfaced:
        out["unverified_claims"] = sorted(surfaced)

    # Only newly observed tool facts should be appended; prior_facts are
    # already stored. Callers merge tool_facts into memory.
    return out, tool_facts


def grounded_facts_from_field_memory(field_memory: dict[str, Any] | None) -> GroundedFacts:
    """Load prior tool-derived facts from the field_memory accumulator."""
    raw = (field_memory or {}).get("grounded_facts") or {}
    if not isinstance(raw, dict):
        return GroundedFacts(ids=set(), names=set(), grades=set(), dates=set())
    ids: set[int] = set()
    for value in raw.get("ids") or []:
        try:
            ids.add(int(value))
        except (TypeError, ValueError):
            continue
    return GroundedFacts(
        ids=ids,
        names={str(v).casefold() for v in (raw.get("names") or []) if str(v).strip()},
        grades={str(v).casefold() for v in (raw.get("grades") or []) if str(v).strip()},
        dates={str(v).casefold() for v in (raw.get("dates") or []) if str(v).strip()},
    )


def union_grounded_facts(left: GroundedFacts, right: GroundedFacts) -> GroundedFacts:
    return GroundedFacts(
        ids=left.ids | right.ids,
        names=left.names | right.names,
        grades=left.grades | right.grades,
        dates=left.dates | right.dates,
    )
