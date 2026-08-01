# app/backend/app/services/chat.py
import asyncio
import json
import logging
import re
from collections.abc import Coroutine
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any, TypeVar

import httpx
from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.canvas_url import canvas_urls_equivalent
from app.core.database import AsyncSessionLocal
from app.core.secret_redaction import redact_secrets, safe_exception_text
from app.mcp_tools.dispatcher import ToolExecutionError, execute_tool, parse_action
from app.mcp_tools.dispatcher import _resolve_course as resolve_course
from app.mcp_tools.schemas import (
    ACTION_SCHEMAS,
    READ_ACTIONS,
    WRITE_ACTIONS,
    AnalyzeCourseSubmissionsAction,
    FetchAssignmentsAction,
    FetchStudentsAction,
    FetchSubmissionsAction,
    FindAssignmentBySubmissionRateAction,
    IntentPreviewAction,
    RecipientDirective,
    ResolveMissingSubmissionsAction,
)
from app.models.assignment import Assignment
from app.models.audit_log import AuditLog
from app.models.canvas_connection import CanvasConnection
from app.models.canvas_course_name import CanvasCourseName
from app.models.conversation import Conversation
from app.models.course import Course
from app.models.message import Message
from app.models.tool_call_log import ToolCallLog
from app.models.user import User
from app.models.user_preference import UserPreference
from app.models.workflow import Workflow
from app.services.assignment_rate import find_assignments_by_submission_rate
from app.services.canvas import (
    CanvasTokenRequiredError,
    _is_expected_canvas_token_sync_error,
    _is_transient_canvas_outage,
    get_active_course,
    sync_courses_if_stale,
)
from app.services.canvas_assistant_gate import (
    classify_action_for_limited_mode,
    user_has_canvas_credentials,
)
from app.services.deferred_assistant import defer_assistant_request, mark_deferred_request_resumed
from app.services.failed_operations import record_failed_operation
from app.services.field_memory import (
    _PARTIAL_PLAN_SAFE_KEYS,
    clear_course_scoped_field_memory,
    format_field_memory_for_prompt,
    merge_field_memory,
    merge_grounded_facts_into_memory,
    merge_read_result_into_field_memory,
    trim_tool_dump_for_history,
)
from app.services.llm.base import LLMAdapter
from app.services.llm.json_extraction import extract_json_object
from app.services.llm.llm_connections import resolve_instructor_llm_request
from app.services.llm.llm_setting import get_llm_adapter
from app.services.llm.provider_registry import (
    ObservableAdapter,
    get_active_llm_config,
)
from app.services.llm.response_cache import (
    build_cache_key,
    get_cached_response,
    is_safe_cache_candidate,
    is_safe_cache_response,
    store_cached_response,
)
from app.services.llm.student_context import (
    format_llm_student_listing,
    ground_assistant_result,
    llm_student_candidates,
)
from app.services.quiz_validation import validate_quiz_for_create
from app.services.resolved_set import (
    compute_submissions_by_status,
    create_resolved_set,
    materialize_resolved_set,
)
from app.services.student import get_submission_derived_students
from app.services.write_preview import generate_write_preview

logger = logging.getLogger(__name__)


def _is_expected_canvas_reconnect_failure(exc: BaseException) -> bool:
    """Match sweep policy: missing/invalid/corrupted tokens are account state,
    not monitored infrastructure failures (avoids spam on retries)."""
    if isinstance(exc, CanvasTokenRequiredError):
        return True
    if _is_expected_canvas_token_sync_error(exc):
        return True
    text = ""
    if isinstance(exc, ToolExecutionError):
        text = exc.log_detail or exc.user_message or ""
    elif isinstance(exc, HTTPException) and isinstance(exc.detail, str):
        text = exc.detail
    else:
        text = str(exc)
    return (
        "Invalid Canvas API token" in text
        or "No Canvas token" in text
        or "Canvas token is corrupted" in text
    )


LLM_TIMEOUT_SECONDS = 90.0
HISTORY_WINDOW = 10
CANVAS_TOKEN_REQUIRED_MESSAGE = (
    "This action needs a connected Canvas account. Connect Canvas in Settings, "
    "then resume this request from the assistant."
)

LIMITED_MODE_PROMPT = (
    "\nLIMITED MODE — the current user has NOT connected a Canvas account. "
    "You are in limited mode: answer general teaching/Canvas-process questions "
    "with {\"action\": \"respond\", ...} only. Do not propose or execute any "
    "Canvas-touching action (fetch/create/update/send/grade). If the request "
    "needs Canvas data or would change Canvas, respond with "
    '{"action": "respond", "message": "..."} telling them they are in limited '
    "mode and must connect Canvas in Settings to continue — the app will save "
    "the request so they can resume after connecting.\n"
)

# Hard cap on how many LLM decisions a single user turn may chain through
# (see handle_chat_message's step loop) before giving up and asking the
# user to continue. Local to one handle_chat_message call — since a new
# HTTP request is a fresh call, and modify/confirm/cancel turns each go
# through their own separate call (handle_chat_message /
# handle_confirmed_action / handle_cancelled_action), this counter is
# already reset on every new chat message and on every confirm/cancel/
# modify by construction, with no persisted state needed.
MAX_TURN_STEPS = 15

# Read actions whose result is specifically meant to feed a follow-up
# decision within the SAME turn (see their own docstrings —
# resolve_missing_submissions produces a recipient_handle for send_message;
# find_assignment_by_submission_rate produces an assignment_id for
# update_assignment) — these always continue the step loop, asking the
# model what to do next, rather than terminating the turn like an ordinary
# read. Adding a future resolver here is the only wiring a new one needs
# to get automatic multi-step chaining — no loop/dispatch changes required.
_CHAINABLE_READ_ACTIONS = frozenset({"resolve_missing_submissions", "find_assignment_by_submission_rate"})
# Failure paths (parse errors, timeouts, HTTP errors) log the full raw
# diagnostic — for a "thinking" model that can mean the entire verbose
# <think> block, hundreds to thousands of tokens — as the assistant message
# content for that turn. _get_recent_messages then feeds that same content
# back to the LLM as conversation history on the *next* turn, which both
# wastes context on text the LLM never meant as an answer and can cascade
# into the next request itself being rejected as too large (observed live:
# a JSON-parse-failure turn's full raw output got included as history and
# the following request failed with a 413 from Groq). Cap any single
# history message's contribution regardless of why it got large.
HISTORY_MESSAGE_MAX_CHARS = 2000

# A normal chat turn may only ever *propose* one of these without going
# through intent_preview/confirm — every write action (create_assignment,
# update_assignment, send_message) must still be proposed via
# intent_preview first, never executed directly. Read actions
# (READ_ACTIONS, from app.mcp_tools.schemas) are a separate, deliberately
# ungated category handled earlier in handle_chat_message's dispatch: they
# execute immediately since they can never mutate Canvas state, so there's
# nothing for intent_preview to protect. Nothing in execute_tool's dispatch
# enforces the write gate on its own (create_assignment etc. are
# independently reachable top-level cases), and the model does not
# reliably follow the system prompt's instruction to always preview a
# write first — observed skipping straight to a raw create_assignment call
# with no preview shown at all. handle_confirmed_action's PATH B is exempt:
# executing the previously-proposed action directly is the entire point of
# confirm. A raw write action outside this set gets auto-wrapped into a
# real intent_preview instead of rejected outright — see handle_chat_message.
NORMAL_TURN_ALLOWED_ACTIONS = {"intent_preview", "clarify", "out_of_scope", "respond"}

# WRITE_ACTIONS (imported from app.mcp_tools.schemas) is also the set of
# actions that get a Workflow row (the replay-safe confirm state machine).
# Read actions are structurally free to be wrapped in an intent_preview too
# (see dispatcher.py's intent_preview case), but replaying a read is
# harmless, so they're deliberately excluded — scoping this to writes only
# also avoids a real collision: a modify-turn's Workflow lookup keys off
# preview_message_id, and a stray read-preview sharing that id with an
# unrelated pending write could otherwise corrupt it.

# action_name -> (resource_type, operation) for AuditLog rows.
# send_message's entry here is only a default: the action can produce
# either a public announcement or a private conversation depending on
# recipient_canvas_user_ids, and the actual outcome is resolved dynamically
# from the write result below rather than assumed from action_name alone.
_AUDIT_RESOURCE_MAP = {
    "create_assignment": ("assignment", "create"),
    "create_quiz": ("quiz", "create"),
    "update_assignment": ("assignment", "update"),
    "update_grade": ("submission", "update"),
    "send_message": ("announcement", "create"),
}


def _normalize_course_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _json_dumps(obj) -> str:
    """json.dumps with datetime serialization support.
    Pydantic model_dump() returns Python datetime objects for
    DateTime fields — standard json.dumps can't handle these."""
    def default(o):
        if isinstance(o, datetime | date):
            return o.isoformat()
        raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")
    return json.dumps(obj, default=default)


async def record_write_audit(
    db: AsyncSession,
    user: User,
    workflow: Workflow,
    result: dict,
) -> None:
    """Write an AuditLog row for a successfully executed Canvas write.
    Shared by handle_confirmed_action (chat confirm path) and form write
    endpoints (e.g. create_quiz REST) that record Workflow rows directly.
    """
    if workflow.action_name not in WRITE_ACTIONS:
        return

    resource_type, operation = _AUDIT_RESOURCE_MAP.get(
        workflow.action_name, (workflow.action_name, "create")
    )
    if workflow.action_name == "send_message":
        created_resource = next(
            (
                resource
                for resource in result.get("affected_resources", [])
                if resource.get("status") == "created"
            ),
            None,
        )
        if created_resource and created_resource.get("type"):
            resource_type = created_resource["type"]

    raw_data = result.get("data") or {}
    if hasattr(raw_data, "model_dump"):
        raw_data = raw_data.model_dump(mode="json")
    data = json.loads(_json_dumps(raw_data))
    resource_id = (
        str(data["id"]) if isinstance(data, dict) and data.get("id") is not None else None
    )
    before_data = (
        json.loads(_json_dumps(result["previous_data"]))
        if result.get("previous_data") is not None
        else None
    )
    db.add(
        AuditLog(
            user_id=user.id,
            workflow_id=workflow.id,
            course_id=workflow.course_id,
            action=workflow.action_name,
            resource_type=resource_type,
            resource_id=resource_id,
            operation=operation,
            status="success",
            before_data=before_data,
            after_data=data,
            request_payload=workflow.proposed_action,
        )
    )

async def get_or_create_conversation(
    db: AsyncSession,
    user: User,
    conversation_id: int | None,
    local_course_id: int | None,
) -> Conversation:
    """local_course_id here is only ever the client-supplied explicit value
    (pathway a — the "set active course" button; see ChatRequest.local_course_id)
    — never something guessed from message text. A conversation's course,
    once set, is never mutated in place: switching away from it routes to
    a different conversation (reused if one already exists for the target
    course, forked otherwise) via _find_or_fork_conversation_for_course.
    conversation_id=None (a deliberate "new chat" request) always creates
    fresh regardless of local_course_id — the find-or-reuse rule only
    applies when routing away from a conversation that already had a
    course.

    When local_course_id is omitted and a conversation has no course yet
    (brand new, or an existing conversation that was never resolved), this
    falls back to the user's persisted UserPreference.active_course_id —
    still pathway (a) (the button), just read from storage instead of
    requiring the client to resend it on every request (e.g. the client's
    own active-course context hasn't loaded yet). Never used to override a
    conversation that already has a course — only to seed one that has
    none, exactly like the explicit-local_course_id case above."""
    if conversation_id is not None:
        conversation = await db.scalar(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user.id,
            )
        )
        if conversation:
            if conversation.course_id is None:
                seed_course_id = local_course_id
                if seed_course_id is None:
                    seed_course_id = await db.scalar(
                        select(UserPreference.active_course_id).where(UserPreference.user_id == user.id)
                    )
                if seed_course_id is not None:
                    course = await db.scalar(
                        select(Course).where(Course.id == seed_course_id, Course.instructor_id == user.id)
                    )
                    if course is not None:
                        conversation.course_id = course.id
                        conversation.course_name = await _stable_course_name(db, course.id, course.name)
                return conversation
            if (
                local_course_id is not None
                and conversation.course_id is not None
                and conversation.course_id != local_course_id
            ):
                course = await db.scalar(
                    select(Course).where(Course.id == local_course_id, Course.instructor_id == user.id)
                )
                if course is not None:
                    return await _find_or_fork_conversation_for_course(db, user, course.id, course.name)
                return conversation
            return conversation

    seed_course_id = local_course_id
    if seed_course_id is None:
        seed_course_id = await db.scalar(
            select(UserPreference.active_course_id).where(UserPreference.user_id == user.id)
        )
    course_name = None
    if seed_course_id is not None:
        course_name = await db.scalar(
            select(Course.name).where(Course.id == seed_course_id, Course.instructor_id == user.id)
        )
        if course_name is None:
            seed_course_id = None
        else:
            course_name = await _stable_course_name(db, seed_course_id, course_name)
    conversation = Conversation(user_id=user.id, course_id=seed_course_id, course_name=course_name)
    db.add(conversation)
    await db.flush()
    return conversation


async def _stable_course_name(db: AsyncSession, local_course_id: int, fallback: str) -> str:
    """Prefers canvas_course_names' write-once name over Course.name
    (overwritten in place on every Canvas sync) for anything that becomes
    a Conversation.course_name snapshot — same rename-stability rationale
    as CanvasCourseName's docstring: a course renamed on Canvas
    mid-conversation must not change what that conversation has already
    been calling it. Falls back to the given Course.name only when this
    course has never been synced into canvas_course_names yet (e.g. its
    connection's first sync hasn't run)."""
    stable_name = await db.scalar(
        select(CanvasCourseName.name).where(CanvasCourseName.local_course_id == local_course_id)
    )
    return stable_name if stable_name is not None else fallback


async def _get_course_names_for_user(db: AsyncSession, user: User) -> list[CanvasCourseName]:
    """The full canvas_course_names index across every Canvas connection
    this user has — the only source of course names the LLM is ever shown
    (see _build_llm_message) and the only thing course_name is matched
    against (see _match_course_name). Never queries `courses` directly for
    this purpose: canvas_course_names is connection-scoped (so two
    institutions with colliding numeric canvas_course_ids never collide)
    and write-once (so a mid-conversation Canvas rename can't retroactively
    change what a conversation has been calling a course)."""
    return list(
        await db.scalars(
            select(CanvasCourseName)
            .join(CanvasConnection, CanvasCourseName.canvas_connection_id == CanvasConnection.id)
            .where(CanvasConnection.user_id == user.id)
        )
    )


_COURSE_NAME_FUZZY_MATCH_MIN_LENGTH = 4


def _resolve_duplicate_course_name_matches(
    matches: list[CanvasCourseName],
) -> CanvasCourseName | None:
    """canvas_course_names is write-once and fetch_courses deliberately
    includes completed (past-term) courses alongside active ones (so a
    Canvas rename mid-conversation can never retroactively change what an
    in-progress conversation has been calling a course) — so an instructor
    who has taught the same course code more than once accumulates
    multiple rows with an identical name. That's the normal steady state
    for a returning instructor, not a rare edge case, so a same-name
    collision shouldn't immediately give up: narrow to whichever match(es)
    aren't a known-completed term first. Still returns None (ambiguous) if
    that doesn't narrow to exactly one — e.g. two genuinely active
    sections, or a legacy row with no workflow_state recorded at all
    sitting alongside another candidate."""
    still_relevant = [cn for cn in matches if cn.workflow_state != "completed"]
    return still_relevant[0] if len(still_relevant) == 1 else None


def _match_course_name(course_names: list[CanvasCourseName], course_name: str | None) -> CanvasCourseName | None:
    """Exact (normalized) match first; a normalized substring match only
    if that finds nothing, since the model is given the literal course
    name strings in YOUR COURSES and told to copy one verbatim, so exact
    is both the expected and the safest case. The substring fallback
    exists only for a smaller/weaker model paraphrasing or abbreviating
    despite that instruction — restricted to a single unambiguous
    candidate (in either substring direction) and a minimum normalized
    length, so a short/generic fragment can't spuriously match half the
    course list. Either stage can still hit a same-name collision across
    terms (see _resolve_duplicate_course_name_matches); if that's also
    ambiguous, this returns None either way — no match is ever guessed,
    only ever resolved to something already unambiguous — and the caller
    falls back to its existing sticky-course behavior, same
    belt-and-suspenders philosophy as dispatcher.py's
    _create_assignment_missing_field."""
    if not course_name:
        return None
    normalized_target = _normalize_course_text(course_name)

    exact_matches = [cn for cn in course_names if _normalize_course_text(cn.name) == normalized_target]
    if len(exact_matches) == 1:
        return exact_matches[0]
    if len(exact_matches) > 1:
        return _resolve_duplicate_course_name_matches(exact_matches)

    if len(normalized_target) < _COURSE_NAME_FUZZY_MATCH_MIN_LENGTH:
        return None
    substring_matches = [
        cn for cn in course_names
        if normalized_target in _normalize_course_text(cn.name)
        or _normalize_course_text(cn.name) in normalized_target
    ]
    if len(substring_matches) == 1:
        return substring_matches[0]
    if len(substring_matches) > 1:
        return _resolve_duplicate_course_name_matches(substring_matches)
    return None


_COURSE_CONTEXT_PATTERNS = (
    re.compile(r"^\s*(?:course|couse|class)\s*(?:is|=|:)\s*(?P<name>.+?)\s*$", re.IGNORECASE),
    re.compile(r"^\s*(?:use|switch(?:\s+to)?|set)\s+(?:course|class)\s+(?:to\s+)?(?P<name>.+?)\s*$", re.IGNORECASE),
)


def _resolve_course_context_statement(
    course_names: list[CanvasCourseName],
    user_message: str,
) -> CanvasCourseName | None:
    """Fast path for terse course-selection replies such as "course is
    COSC 777" (and the common typo "couse is ..."). These are not really
    Canvas tasks; they are context-setting utterances. Resolving them
    deterministically keeps the main LLM from replaying the previous task
    with stale context."""
    for pattern in _COURSE_CONTEXT_PATTERNS:
        match = pattern.match(user_message)
        if match:
            return _match_course_name(course_names, match.group("name"))
    return None


async def _find_or_fork_conversation_for_course(
    db: AsyncSession, user: User, local_course_id: int, course_name: str
) -> Conversation:
    """Reuse the most recent conversation already anchored to this course,
    or start a new one. Only called when actively switching a conversation
    away from a course it already had (button click or the model naming a
    different course mid-conversation) — never for a conversation's first
    course resolution (course_id None -> some value), which just sets
    course_id on the same conversation instead.

    course_name is only ever used as a fallback: _stable_course_name
    always prefers whatever canvas_course_names already has for this
    course, so a caller passing a freshly-synced (and possibly renamed)
    Course.name here can't undermine that stability guarantee."""
    existing = await db.scalar(
        select(Conversation)
        .where(Conversation.user_id == user.id, Conversation.course_id == local_course_id)
        .order_by(Conversation.id.desc())
        .limit(1)
    )
    if existing:
        return existing
    stable_name = await _stable_course_name(db, local_course_id, course_name)
    conversation = Conversation(user_id=user.id, course_id=local_course_id, course_name=stable_name)
    db.add(conversation)
    await db.flush()
    return conversation


_COURSE_SWITCH_RESOLVER_SYSTEM_PROMPT = """You determine whether a user's
message is asking about a course OTHER than the one their conversation is
currently about, given the real list of their courses.

Respond with exactly one JSON object and nothing else:
{"switched_to": "<exact course name from CURRENT COURSES, or null>"}

Set switched_to to the exact name of a course from CURRENT COURSES —
copied verbatim, never invented — ONLY when the message clearly asks about
a course that is NOT the current one: naming a different course directly,
or asking to switch/open a different one. If the message doesn't name a
course at all, is a plain follow-up about the current course, or doesn't
clearly and unambiguously point at one specific different course, respond
with {"switched_to": null} instead of guessing."""

COURSE_SWITCH_RESOLVER_TIMEOUT_SECONDS = 30.0


async def _resolve_course_switch(
    course_names: list[CanvasCourseName],
    current_course_name: str | None,
    user_message: str,
    adapter: LLMAdapter,
) -> CanvasCourseName | None:
    """Detects a course switch from the raw user message ALONE, before
    history or the main system prompt are built for this turn — closes a
    real gap in the original design: course-switch detection depended
    entirely on the main model's own course_name output, which only comes
    back *after* that same call already ran using the OLD conversation's
    history and "CURRENT COURSE" framing (confirmed live: a genuine
    conversation-265-vs-266 fork, with cosc 501's Q&A still sitting in the
    history sent for a cosc 502 request). This is a separate, narrowly
    scoped call for exactly that one question — mirrors
    _resolve_assignment_reference/_resolve_students_via_llm's paradigm
    (small dedicated call, given a real candidate list, never trusted to
    invent a value) rather than reusing the main call's broader reasoning.

    Returns None (never raises) on no course set yet, no switch detected,
    or any failure (timeout/HTTP/bad JSON/unmatched name) — the caller
    falls back to the existing post-hoc detection from the main model's
    own output in every one of those cases, so a miss here is never worse
    than today's behavior, only a hit closes the gap."""
    if not course_names or current_course_name is None:
        return None

    listing = "\n".join(f"- {cn.name}" for cn in course_names)
    prompt = (
        f"CURRENT COURSES:\n{listing}\n\n"
        f"This conversation is currently about: {current_course_name}\n"
        f"User's message: {user_message}"
    )
    try:
        raw = await asyncio.wait_for(
            adapter.generate(
                _COURSE_SWITCH_RESOLVER_SYSTEM_PROMPT, prompt, history=[],
                timeout=COURSE_SWITCH_RESOLVER_TIMEOUT_SECONDS,
            ),
            timeout=COURSE_SWITCH_RESOLVER_TIMEOUT_SECONDS,
        )
        parsed = json.loads(extract_json_object(raw))
    except Exception:
        # Broad on purpose: a provider/network failure (httpx.ConnectError,
        # httpx.ReadTimeout, httpx.RemoteProtocolError, ...) or malformed
        # parsed data must never escape this resolver and 500 the whole
        # turn — every failure mode here degrades to "no switch detected,"
        # which is always safe (see this function's own docstring: the
        # caller falls back to post-hoc detection either way).
        return None

    candidate_name = parsed.get("switched_to") if isinstance(parsed, dict) else None
    return _match_course_name(course_names, candidate_name)


# Actions where "which course?" has no sensible fallback, so a missing
# course is a hard stop with a plain explanation rather than a clarify.
_COURSE_REQUIRED_ACTIONS = frozenset({"analyze_course_submissions"})


def _inject_course_into_envelope(parsed_envelope: dict, local_course_id: int | None) -> dict:
    """Injects the resolved local_course_id directly into the model's raw
    parsed JSON — into proposed_action if it already wrapped its answer in
    intent_preview, or into the envelope itself if it named a raw action
    (NORMAL_TURN_ALLOWED_ACTIONS auto-wrapping turns that same dict into
    proposed_action right after parse_action succeeds, so either shape
    ends up with the id in the right place).

    This has to happen *before* parse_action's strict schema validation,
    not after: the model is never allowed to supply local_course_id
    itself (see COURSE RESOLUTION in build_system_prompt), so a
    course-scoped action's schema — which still declares local_course_id
    as required, unchanged — would otherwise fail validation on a
    required field it was never given. Checked dynamically via
    ACTION_SCHEMAS.model_fields rather than a hardcoded action-name set,
    the same self-maintaining approach build_system_prompt's tool list
    already uses.

    If the action needs a course and none could be resolved this turn,
    replaces the whole envelope with a clarify response instead of
    letting a missing local_course_id crash Pydantic validation
    downstream (same belt-and-suspenders philosophy as dispatcher.py's
    _create_assignment_missing_field). Returns the (possibly replaced)
    envelope; the caller re-serializes it in place of the raw LLM output."""
    if (
        parsed_envelope.get("action") == "intent_preview"
        and isinstance(parsed_envelope.get("proposed_action"), dict)
    ):
        target = parsed_envelope["proposed_action"]
    else:
        target = parsed_envelope

    schema_cls = ACTION_SCHEMAS.get(target.get("action"))
    if schema_cls is None or "local_course_id" not in schema_cls.model_fields:
        return parsed_envelope

    if local_course_id is None:
        # A course-wide analysis has nothing to fall back on — there is no
        # partial answer to give and nothing useful to guess, so say plainly
        # that it can't run rather than opening a clarify round-trip that
        # implies the request is still in progress (#12).
        if target.get("action") in _COURSE_REQUIRED_ACTIONS:
            return {
                "action": "respond",
                "message": (
                    "I can't analyse submissions without knowing which course. "
                    "Select an active course, or name the course in your "
                    "message, and ask again."
                ),
            }

        partial_plan = {key: value for key, value in target.items() if key != "action"}
        return {
            "action": "clarify",
            "question": "Which course is this about?",
            "partial_plan": partial_plan,
        }

    target["local_course_id"] = local_course_id
    return parsed_envelope


_ReadResult = TypeVar("_ReadResult")


async def _run_tracked_read(
    db: AsyncSession,
    user: User,
    conversation: Conversation,
    triggering_message_id: int,
    action_name: str,
    parameters: dict,
    coro: Coroutine[Any, Any, _ReadResult],
) -> _ReadResult:
    """Runs a single read-action coroutine and records its
    pending/executing/executed/failed lifecycle in tool_call_logs — the
    per-call bookkeeping intent_preview/Workflow used to provide implicitly
    (a user confirming a preview was also confirming "yes, make this
    Canvas call"), which reads no longer get now that they execute
    immediately (see handle_chat_message). Created directly in "executing"
    status: unlike workflows' pending state, there's no async gap here
    waiting on a human click between creating the row and starting the call.

    On failure, marks the row "failed" with the exception text and
    re-raises unchanged — the caller's existing ToolExecutionError/
    HTTPException handling in handle_chat_message is what actually turns
    this into a user-facing error; this function only adds the log row."""
    call_log = ToolCallLog(
        conversation_id=conversation.id,
        user_id=user.id,
        course_id=parameters.get("local_course_id"),
        triggering_message_id=triggering_message_id,
        action_name=action_name,
        parameters=parameters,
        status="executing",
    )
    db.add(call_log)
    await db.flush()
    try:
        result = await coro
    except Exception as e:
        call_log.status = "failed"
        call_log.error_detail = safe_exception_text(e)
        await db.flush()
        if not (
            _is_expected_canvas_reconnect_failure(e) or _is_transient_canvas_outage(e)
        ):
            await record_failed_operation(
                db,
                source="canvas",
                operation=action_name,
                error_detail=call_log.error_detail,
                user_id=user.id,
                course_id=parameters.get("local_course_id"),
                conversation_id=conversation.id,
                tool_call_id=call_log.id,
                context_json={"parameters": parameters},
            )
            # Persist monitoring rows even when the caller re-raises and the
            # request aborts before its own commit (otherwise the row is lost
            # on session close / rollback).
            await db.commit()
        raise
    call_log.status = "executed"
    call_log.completed_at = datetime.now(UTC)
    await db.flush()
    return result


def _coerce_int(value: Any) -> int | None:
    """LLM output is untrusted and inconsistent — a numeric ID sometimes
    comes back as a JSON string ("4821") instead of a number, which would
    otherwise silently fail an `in valid_ids` set-membership check even
    though it's semantically the exact right answer. Used by every
    resolver that compares a model-supplied ID against a real candidate
    set. Explicitly rejects bool — a subclass of int in Python, so
    accepting it would let a stray True/False silently coerce to 1/0 and
    false-positive match a real id of 1 or 0."""
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


_ASSIGNMENT_RESOLVER_SYSTEM_PROMPT = """You resolve which assignment a user
is referring to, given the real list of assignments in their course and how
they described the one they mean.

Respond with exactly one JSON object and nothing else:
{"assignment_id": <id>}

Use the "id" value from the matching assignment in ASSIGNMENTS — never a
value that isn't in that list. If the reference is "latest"/"most recent"/
"newest", pick the assignment with the latest due_at (if none have a
due_at, there is no reliable way to tell — treat it as no confident match).
If the reference is "earliest"/"first"/"oldest", pick the earliest due_at
the same way. If the reference names or closely matches one assignment's
name, pick that one. If you cannot confidently pick exactly one, respond
with {"assignment_id": null} instead of guessing."""

ASSIGNMENT_RESOLVER_TIMEOUT_SECONDS = 30.0


async def _resolve_assignment_reference(
    assignments: list[dict], reference: str | None, user_message: str, adapter: LLMAdapter,
) -> int | None:
    """Resolves a natural-language assignment reference (e.g. "the latest
    assignment") to a real Canvas assignment ID, via a small dedicated LLM
    call — not a recursive re-entry into handle_chat_message's full
    pipeline. Mirrors how course_name is resolved: the model is never
    trusted to invent a numeric ID, only to point at one from a real list
    the app gives it.

    Returns None (never raises) on any failure — timeout, HTTP error,
    a broader provider/network failure (connection reset, malformed
    response, ...), unparseable JSON, a malformed assignment dict, or a
    confident "I can't tell" from the model itself — so the caller can
    fall back to asking the user directly instead of surfacing this as an
    error. Nothing has failed in the sense of a lost write; this is a
    read that just needs one more piece of information. The whole body is
    one try/except so this guarantee holds even for the dict access below
    (constructing the listing, the single-assignment shortcut) — not just
    the LLM call itself."""
    try:
        if len(assignments) == 1:
            return _coerce_int(assignments[0].get("id"))

        listing = "\n".join(
            f"- id={a.get('id')}, name={a.get('name')!r}, due_at={a.get('due_at')}, "
            f"points_possible={a.get('points_possible')}"
            for a in assignments
        )
        prompt = (
            f"ASSIGNMENTS:\n{listing}\n\n"
            f"User's reference to an assignment: {reference or '(not given)'}\n"
            f"User's full message: {user_message}"
        )
        raw = await asyncio.wait_for(
            adapter.generate(
                _ASSIGNMENT_RESOLVER_SYSTEM_PROMPT, prompt, history=[],
                timeout=ASSIGNMENT_RESOLVER_TIMEOUT_SECONDS,
            ),
            timeout=ASSIGNMENT_RESOLVER_TIMEOUT_SECONDS,
        )
        parsed = json.loads(extract_json_object(raw))
        candidate = _coerce_int(parsed.get("assignment_id")) if isinstance(parsed, dict) else None
        # Coerce both sides — the model sometimes returns a numeric id as
        # a JSON string ("4821"), which would otherwise silently fail this
        # membership check even though it's the semantically correct answer.
        valid_ids = {_coerce_int(a.get("id")) for a in assignments}
        valid_ids.discard(None)
        return candidate if candidate in valid_ids else None
    except Exception:
        return None


_QUIZ_RESOLVER_SYSTEM_PROMPT = """You resolve which Canvas quiz an instructor is
referring to. You are given a list of real quizzes (with their Canvas ids
and titles) and the instructor's own words.

Respond with JSON only:
{"quiz_id": <integer from QUIZZES> | null}

Use the "id" value from the matching quiz in QUIZZES — never a value that
isn't in that list. If the reference is "latest"/"most recent"/"newest",
pick the quiz with the latest due_at (if none have a due_at, treat it as
no confident match). If the reference names or closely matches one quiz's
title, pick that one. If you cannot confidently pick exactly one, respond
with {"quiz_id": null} instead of guessing."""


async def _resolve_quiz_reference(
    quizzes: list[dict], reference: str | None, user_message: str, adapter: LLMAdapter,
) -> int | None:
    """Resolves a natural-language quiz reference to a real Canvas quiz ID
    against a candidate list the app already fetched — never invents an ID.
    Same contract as _resolve_assignment_reference: returns None on any
    failure so the caller can clarify instead of crashing the chat turn."""
    try:
        if len(quizzes) == 1:
            return _coerce_int(quizzes[0].get("id"))

        listing = "\n".join(
            f"- id={q.get('id')}, title={q.get('title')!r}, due_at={q.get('due_at')}, "
            f"points_possible={q.get('points_possible')}"
            for q in quizzes
        )
        prompt = (
            f"QUIZZES:\n{listing}\n\n"
            f"User's reference to a quiz: {reference or '(not given)'}\n"
            f"User's full message: {user_message}"
        )
        raw = await asyncio.wait_for(
            adapter.generate(
                _QUIZ_RESOLVER_SYSTEM_PROMPT, prompt, history=[],
                timeout=ASSIGNMENT_RESOLVER_TIMEOUT_SECONDS,
            ),
            timeout=ASSIGNMENT_RESOLVER_TIMEOUT_SECONDS,
        )
        parsed = json.loads(extract_json_object(raw))
        candidate = _coerce_int(parsed.get("quiz_id")) if isinstance(parsed, dict) else None
        valid_ids = {_coerce_int(q.get("id")) for q in quizzes}
        valid_ids.discard(None)
        return candidate if candidate in valid_ids else None
    except Exception:
        return None


async def _resolve_course_and_assignment(
    db: AsyncSession,
    user: User,
    conversation: Conversation,
    user_msg: Message,
    local_course_id: int,
    assignment_id: int | None,
    assignment_reference: str | None,
    user_message: str,
    adapter: LLMAdapter,
) -> tuple[Course, int] | dict:
    """Shared by every chain that needs a real Canvas assignment_id before
    it can proceed (_run_fetch_submissions_chain,
    _run_resolve_missing_submissions_chain): resolves the course, then
    verifies/resolves the assignment — chaining an internal
    fetch_assignments call and _resolve_assignment_reference when needed —
    all inside the single request handling the user's one message, instead
    of making the user ask a second time once the assignment list is in
    history.

    Returns (course, assignment_id) on success, or a clarify dict (never
    raises) when nothing confidently resolves.

    print() lines are a deliberate, simple placeholder for step-by-step
    transparency while a multi-call chain is in flight (stdout/server logs
    only, never returned to the client) — not one per tracked read action,
    just markers for this specific multi-step chain."""
    course = await resolve_course(db, user, local_course_id)

    if assignment_id is not None:
        # Only trust a bare assignment_id the model hands back if it
        # verifies against this course's locally synced assignments (from
        # any prior get_assignments call) — it could be hallucinated,
        # stale, or belong to a different course. If it doesn't verify,
        # fall through to the full resolution chain below exactly as if no
        # assignment_id had been given at all.
        verified = await db.scalar(
            select(Assignment.id).where(
                Assignment.course_id == course.id,
                Assignment.canvas_assignment_id == str(assignment_id),
            )
        )
        if verified is None:
            assignment_id = None

    if assignment_id is None:
        print(f"Gathering {course.name} data")
        print(f"Collecting {course.name} assignments")
        fetch_action = FetchAssignmentsAction(local_course_id=course.id)
        assignments_result = await _run_tracked_read(
            db, user, conversation, user_msg.id, "fetch_assignments",
            fetch_action.model_dump(), execute_tool(db, user, fetch_action),
        )
        assignments = assignments_result["assignments"]
        if not assignments:
            return {
                "action": "clarify",
                "clarify": True,
                "question": f"{course.name} has no assignments yet — is there something else I can help with?",
                "partial_plan": {"local_course_id": course.id},
            }
        assignment_id = await _resolve_assignment_reference(
            assignments, assignment_reference, user_message, adapter
        )
        if assignment_id is None:
            names = ", ".join(a["name"] for a in assignments)
            return {
                "action": "clarify",
                "clarify": True,
                "question": f"Which assignment in {course.name} did you mean? Options: {names}.",
                "partial_plan": {"local_course_id": course.id},
            }

    return course, assignment_id


async def _run_fetch_submissions_chain(
    db: AsyncSession,
    user: User,
    conversation: Conversation,
    user_msg: Message,
    action: FetchSubmissionsAction,
    user_message: str,
    adapter: LLMAdapter,
) -> dict:
    """fetch_submissions needs a real Canvas assignment_id, which the model
    is never allowed to invent (see COURSE RESOLUTION/assignment sections
    in build_system_prompt). When it isn't already known, _resolve_course_and_assignment
    resolves it server-side, all inside the single request handling the
    user's one message, instead of making the user ask a second time once
    the assignment list is in history.

    Attaches the resolved assignment's own id/name/due date to the result
    (under "assignment") and rewrites "summary" to name it explicitly
    (e.g. "For Final Project, 3 students have not submitted...") — without
    this, a plain submissions list/count is ambiguous about which
    assignment it's even about once "latest assignment" or a name
    resolved server-side, especially once the result is scrollback in
    conversation history. The local Assignment row read here is always
    already populated with the real Canvas title/due_date by the time
    _resolve_course_and_assignment returns — either freshly upserted by
    its own internal fetch_assignments call, or by an earlier one that
    let the model already know this assignment_id."""
    resolved = await _resolve_course_and_assignment(
        db, user, conversation, user_msg,
        action.local_course_id, action.assignment_id, action.assignment_reference, user_message,
        adapter,
    )
    if isinstance(resolved, dict):
        return resolved
    course, assignment_id = resolved

    assignment_row = await db.scalar(
        select(Assignment).where(
            Assignment.course_id == course.id,
            Assignment.canvas_assignment_id == str(assignment_id),
        )
    )
    assignment_name = assignment_row.title if assignment_row else f"Assignment {assignment_id}"
    due_at = assignment_row.due_date if assignment_row else None

    print(f"Combing through {course.name} submissions")
    submit_action = FetchSubmissionsAction(local_course_id=course.id, assignment_id=assignment_id)
    result = await _run_tracked_read(
        db, user, conversation, user_msg.id, "fetch_submissions",
        submit_action.model_dump(), execute_tool(db, user, submit_action),
    )
    result["assignment"] = {
        "assignment_id": assignment_id,
        "assignment_name": assignment_name,
        "due_at": due_at.isoformat() if due_at else None,
    }
    result["summary"] = _build_fetch_submissions_summary(
        assignment_name, due_at, result["counts"], result["pending_students"],
    )
    return result


def _build_fetch_submissions_summary(
    assignment_name: str,
    due_at: datetime | None,
    counts: dict[str, int],
    pending_students: list[dict],
) -> str:
    """Names the resolved assignment explicitly and leads with the
    instructor-relevant question ("who's pending?") rather than a bare
    count — mirrors the "For Final Project, these students have not
    submitted..." shape, plus late/graded/excused counts so those aren't
    left buried in the raw per-submission list either."""
    due_part = f" (due {due_at.strftime('%B %d, %Y at %I:%M %p')})" if due_at else ""
    if pending_students:
        names = [p["name"] for p in pending_students]
        sample = ", ".join(names[:10])
        more = f", and {len(names) - 10} more" if len(names) > 10 else ""
        lines = [f"For {assignment_name}{due_part}, {len(names)} student(s) have not submitted: {sample}{more}."]
    else:
        lines = [f"For {assignment_name}{due_part}, every student has submitted."]
    if counts.get("late"):
        lines.append(f"{counts['late']} submitted late.")
    if counts.get("graded"):
        lines.append(f"{counts['graded']} have been graded.")
    if counts.get("excused"):
        lines.append(f"{counts['excused']} are excused.")
    return " ".join(lines)


_RESOLVED_SET_SAMPLE_SIZE = 5


async def _run_resolve_missing_submissions_chain(
    db: AsyncSession,
    user: User,
    conversation: Conversation,
    user_msg: Message,
    action: ResolveMissingSubmissionsAction,
    user_message: str,
    adapter: LLMAdapter,
) -> dict:
    """Resolves "students missing (or late on) submissions for
    <assignment>" entirely server-side — never dumps the raw
    submission/roster lists into the LLM's context or conversation
    history (unlike a plain fetch_submissions call, whose full result is
    left as-is by _summarize_assistant_history_content). Only a compact
    {count, sample, handle} summary is returned; the handle is later
    materialized by _run_send_message_chain when a send_message turn sets
    recipient_handle, scoped to this conversation
    (see materialize_resolved_set). action.status picks which category
    (see compute_submissions_by_status) — "missing" and "late" are
    mutually exclusive, so this always resolves exactly one at a time."""
    resolved = await _resolve_course_and_assignment(
        db, user, conversation, user_msg,
        action.local_course_id, action.assignment_id, action.assignment_reference, user_message,
        adapter,
    )
    if isinstance(resolved, dict):
        return resolved
    course, assignment_id = resolved

    print(f"Checking {course.name} for {action.status} submissions")
    matched = await _run_tracked_read(
        db, user, conversation, user_msg.id, "resolve_missing_submissions",
        {"local_course_id": course.id, "assignment_id": assignment_id, "status": action.status},
        compute_submissions_by_status(course, assignment_id, user, db, action.status),
    )

    resolved_set = await create_resolved_set(
        db, conversation, kind=f"{action.status}_submissions",
        query={"local_course_id": course.id, "assignment_id": assignment_id, "status": action.status},
        recipients=matched,
    )

    sample = [r["name"] for r in matched[:_RESOLVED_SET_SAMPLE_SIZE]]
    if action.status == "missing":
        summary = f"{len(matched)} active student(s) in {course.name} are missing this assignment."
    else:
        summary = f"{len(matched)} active student(s) in {course.name} submitted this assignment late."
    if sample:
        summary += f" Examples: {', '.join(sample)}."

    return {
        "action": "resolve_missing_submissions",
        "status": action.status,
        "count": len(matched),
        "sample": sample,
        "handle": resolved_set.handle,
        "summary": summary,
    }


# Course-wide overviews list real names, not just a 5-name teaser like
# _RESOLVED_SET_SAMPLE_SIZE gives per assignment — the instructor asked who
# hasn't submitted and a truncated answer is the bug, not the feature. Still
# bounded so a 300-student course can't blow the prompt budget; when it
# trips, the result says so explicitly rather than quietly cutting off.
_COURSE_ANALYSIS_MAX_NAMES = 50


async def _run_analyze_course_submissions_chain(
    db: AsyncSession,
    user: User,
    conversation: Conversation,
    user_msg: Message,
    action: AnalyzeCourseSubmissionsAction,
) -> dict:
    """Course-wide missing/late submission overview across every assignment.

    Bug 12: the dashboard's analysis button had no tool behind it, so the
    model answered from nothing and invented submission rates that
    contradicted the course. This gives that question a real server-side
    read. resolve_missing_submissions already did this for ONE assignment;
    this walks the whole course and reuses the same
    compute_submissions_by_status so "missing" and "late" mean exactly what
    services/resolved_set.py says they mean, rather than being redefined
    here.
    """
    course = await resolve_course(db, user, action.local_course_id)

    print(f"Gathering {course.name} assignments")
    fetch_action = FetchAssignmentsAction(local_course_id=course.id)
    assignments_result = await _run_tracked_read(
        db, user, conversation, user_msg.id, "fetch_assignments",
        fetch_action.model_dump(), execute_tool(db, user, fetch_action),
    )
    assignments = assignments_result["assignments"]
    if not assignments:
        return {
            "action": "analyze_course_submissions",
            "status": action.status,
            "course": course.name,
            "assignments": [],
            "total": 0,
            "summary": f"{course.name} has no assignments yet, so there is nothing to analyse.",
        }

    print(f"Checking {course.name} for {action.status} submissions")
    per_assignment: list[dict] = []
    names_budget = _COURSE_ANALYSIS_MAX_NAMES
    truncated = False

    for assignment in assignments:
        canvas_assignment_id = assignment.get("id")
        if canvas_assignment_id is None:
            continue
        matched = await _run_tracked_read(
            db, user, conversation, user_msg.id, "analyze_course_submissions",
            {
                "local_course_id": course.id,
                "assignment_id": canvas_assignment_id,
                "status": action.status,
            },
            compute_submissions_by_status(
                course, canvas_assignment_id, user, db, action.status
            ),
        )
        names = [student["name"] for student in matched]
        if len(names) > names_budget:
            names = names[:names_budget]
            truncated = True
        names_budget -= len(names)
        per_assignment.append(
            {
                "assignment_id": canvas_assignment_id,
                "assignment_name": assignment.get("name") or "Untitled assignment",
                "due_at": assignment.get("due_at"),
                "count": len(matched),
                "students": names,
            }
        )

    total = sum(entry["count"] for entry in per_assignment)
    label = "missing" if action.status == "missing" else "late"
    if total == 0:
        summary = (
            f"No {label} submissions in {course.name} — every active student is "
            f"up to date across all {len(per_assignment)} assignment(s)."
        )
    else:
        affected = [entry for entry in per_assignment if entry["count"]]
        lines = "; ".join(
            f"{entry['assignment_name']}: {entry['count']} ({', '.join(entry['students'])})"
            if entry["students"]
            else f"{entry['assignment_name']}: {entry['count']}"
            for entry in affected
        )
        summary = (
            f"{total} {label} submission(s) across {len(affected)} of "
            f"{len(per_assignment)} assignment(s) in {course.name}. {lines}."
        )
        if truncated:
            summary += (
                f" Only the first {_COURSE_ANALYSIS_MAX_NAMES} student names are "
                "listed; open the course Submissions view for the full list."
            )

    return {
        "action": "analyze_course_submissions",
        "status": action.status,
        "course": course.name,
        "assignments": per_assignment,
        "total": total,
        "truncated": truncated,
        "summary": summary,
    }


async def _run_find_assignment_by_submission_rate_chain(
    db: AsyncSession,
    user: User,
    conversation: Conversation,
    user_msg: Message,
    action: FindAssignmentBySubmissionRateAction,
    user_message: str,
) -> dict:
    """Resolves "the assignment with fewer/more than X% submissions" to a
    single assignment — mirrors _resolve_assignment_reference's "resolve
    server-side, never trust the model with a raw ID" shape, but the
    criterion is a computed submission rate rather than a name/recency
    reference, so it needs real Canvas data (not just the model's
    judgment) to evaluate. Scans every assignment in the course
    (find_assignments_by_submission_rate), then picks "the last" — the
    matching assignment with the latest due date — the same "latest"
    convention _resolve_assignment_reference already uses. Resolves to a
    single ID, not a bulk recipient set, so this has no ResolvedSet/handle
    involvement: the returned assignment_id is meant to be used directly in
    a follow-up update_assignment turn, the same way a fetch_assignments
    result's "id" field already is (see RESOLVING AN ASSIGNMENT FOR
    update_assignment in build_system_prompt)."""
    course = await resolve_course(db, user, action.local_course_id)

    print(f"Gathering {course.name} data")
    print(f"Collecting {course.name} assignments")
    fetch_action = FetchAssignmentsAction(local_course_id=course.id)
    assignments_result = await _run_tracked_read(
        db, user, conversation, user_msg.id, "fetch_assignments",
        fetch_action.model_dump(), execute_tool(db, user, fetch_action),
    )
    assignments = assignments_result["assignments"]
    if not assignments:
        return {
            "action": "find_assignment_by_submission_rate",
            "matched": False,
            "assignment_id": None,
            "assignment_name": None,
            "due_date": None,
            "submission_rate_percent": None,
            "summary": f"{course.name} has no assignments yet.",
        }

    print(f"Checking {course.name} assignment submission rates")
    matches = await _run_tracked_read(
        db, user, conversation, user_msg.id, "find_assignment_by_submission_rate",
        {
            "local_course_id": course.id,
            "comparator": action.comparator,
            "threshold_percent": action.threshold_percent,
        },
        find_assignments_by_submission_rate(
            course, assignments, action.comparator, action.threshold_percent, user, db,
        ),
    )

    if not matches:
        return {
            "action": "find_assignment_by_submission_rate",
            "matched": False,
            "assignment_id": None,
            "assignment_name": None,
            "due_date": None,
            "submission_rate_percent": None,
            "summary": (
                f"No assignment in {course.name} currently has a submission rate "
                f"{action.comparator} {action.threshold_percent}%."
            ),
        }

    best = max(matches, key=lambda m: m["due_at"] or datetime.min.replace(tzinfo=UTC))
    due_date = best["due_at"].isoformat() if best["due_at"] else None
    rate = round(best["rate_percent"], 1)
    return {
        "action": "find_assignment_by_submission_rate",
        "matched": True,
        "assignment_id": best["id"],
        "assignment_name": best["name"],
        "due_date": due_date,
        "submission_rate_percent": rate,
        "summary": (
            f'"{best["name"]}" in {course.name} has a {rate}% submission rate '
            f'(current due date: {due_date or "not set"}).'
        ),
    }


_UPDATE_ASSIGNMENT_FIELDS = ("title", "description", "due_date", "points_possible")


async def _run_update_assignment_chain(
    db: AsyncSession,
    user: User,
    conversation: Conversation,
    user_msg: Message,
    action: Any,
    user_message: str,
    adapter: LLMAdapter,
) -> dict:
    """update_assignment needs an exact Canvas assignment_id before a
    preview can be built, but — like fetch_submissions,
    resolve_missing_submissions, and find_assignment_by_submission_rate —
    the model doesn't need to know it itself. Resolves it server-side via
    _resolve_course_and_assignment (the exact same shared helper those
    other chains use), which verifies a provided assignment_id against
    this course's synced assignments and re-resolves if it's hallucinated,
    stale, or belongs to a different course. Builds the intent_preview
    directly — one user turn, no loop needed — the same way
    _build_grouped_send_message_result builds a preview without routing
    back through execute_tool's own intent_preview case."""
    resolved = await _resolve_course_and_assignment(
        db, user, conversation, user_msg,
        action.local_course_id, action.assignment_id, action.assignment_reference, user_message,
        adapter,
    )
    if isinstance(resolved, dict):
        return resolved
    course, assignment_id = resolved

    proposed_action: dict[str, Any] = {
        "action": "update_assignment",
        "local_course_id": course.id,
        "assignment_id": assignment_id,
    }
    for field_name in _UPDATE_ASSIGNMENT_FIELDS:
        value = getattr(action, field_name)
        if value is not None:
            proposed_action[field_name] = value

    preview_metadata = generate_write_preview(proposed_action, course)
    return {
        "action": "intent_preview",
        "intent_preview": True,
        "summary": preview_metadata["summary"],
        "proposed_action": proposed_action,
        "preview_metadata": preview_metadata,
    }


async def _resolve_grade_target(
    db: AsyncSession,
    user: User,
    conversation: Conversation,
    user_msg: Message,
    action: Any,
    user_message: str,
    adapter: LLMAdapter,
) -> dict:
    """Resolves the assignment and student for update_grade before any
    preview is shown. Mirrors _resolve_assignment_reference and
    _resolve_students_via_llm: the LLM may describe a target naturally,
    but it only gets to choose from real assignments/submissions the app
    fetched from Canvas and cached locally through the normal read paths."""
    resolved = await _resolve_course_and_assignment(
        db, user, conversation, user_msg,
        action.local_course_id, action.assignment_id, action.assignment_reference,
        user_message, adapter,
    )
    if isinstance(resolved, dict):
        return resolved
    course, assignment_id = resolved

    print(f"Collecting {course.name} submissions for grade target resolution")
    fetch_action = FetchSubmissionsAction(
        local_course_id=course.id,
        assignment_id=assignment_id,
    )
    submissions_result = await _run_tracked_read(
        db, user, conversation, user_msg.id, "fetch_submissions",
        fetch_action.model_dump(), execute_tool(db, user, fetch_action),
    )
    submissions = submissions_result["submissions"]
    if not submissions:
        return {
            "action": "clarify",
            "clarify": True,
            "question": f"I couldn't find submissions for that assignment in {course.name}.",
            "partial_plan": _grade_partial_plan(action, course.id, assignment_id),
        }

    student_id = action.student_id
    bulk_update = bool(action.student_reference and _is_bulk_student_reference(action.student_reference))
    if student_id is not None:
        valid_ids = {_coerce_int(s.get("user_id")) for s in submissions}
        valid_ids.discard(None)
        if student_id not in valid_ids:
            student_id = None

    if bulk_update:
        return _build_grade_handoff_result(
            course,
            assignment_id,
            submissions,
            action.new_grade,
            action.reason,
        )

    if student_id is None and action.student_reference:
        candidates = [
            {
                "user_id": s.get("user_id"),
                "name": s.get("student_name") or f"Student {s.get('user_id')}",
                "login_id": s.get("student_login_id"),
                "email": s.get("student_email"),
            }
            for s in submissions
        ]
        resolved_students = await _resolve_students_via_llm(
            candidates, [action.student_reference], user_message, adapter
        )
        student_id = resolved_students.get(action.student_reference)

    if student_id is None:
        names = ", ".join(
            sorted(
                {
                    s.get("student_name") or f"Student {s.get('user_id')}"
                    for s in submissions
                }
            )
        )
        return {
            "action": "clarify",
            "clarify": True,
            "question": f"Which student in {course.name} did you mean? Options: {names}.",
            "partial_plan": _grade_partial_plan(action, course.id, assignment_id),
        }

    selected = next(s for s in submissions if _coerce_int(s.get("user_id")) == student_id)
    return _build_grade_handoff_result(
        course,
        assignment_id,
        [selected],
        action.new_grade,
        action.reason,
    )


def _build_grade_handoff_result(
    course: Course,
    assignment_id: int,
    submissions: list[dict],
    new_grade: str,
    reason: str | None,
) -> dict:
    """Return a chat response that opens the dedicated Grades tab.

    The resolver has already fetched submissions through the normal Canvas read
    path, so this function only serializes the resolved ids and draft grade.
    The frontend then previews/submits from the Grades tab, reusing the same
    high-risk approval workflow for single-student and bulk changes.
    """
    student_ids = []
    for submission in submissions:
        # Canvas submissions should have user_id, but keep the handoff robust
        # around malformed rows so one bad snapshot does not break all targets.
        student_id = _coerce_int(submission.get("user_id"))
        if student_id is not None:
            student_ids.append(student_id)

    if not student_ids:
        return {
            "action": "clarify",
            "clarify": True,
            "question": f"I couldn't find any students to grade for that assignment in {course.name}.",
            "partial_plan": {
                "action": "update_grade",
                "local_course_id": course.id,
                "assignment_id": assignment_id,
                "student_reference": "all students",
                "new_grade": new_grade,
                "reason": reason,
            },
        }

    student_count = len(student_ids)
    assignment_label = f'assignment "{assignment_id}"'
    # Keep the assistant bubble brief; the action card carries the actual link
    # and the Grades tab carries the detailed warnings/confirmation state.
    message = (
        f"I found {student_count} student{'s' if student_count != 1 else ''} for "
        f"{course.name}. Open the Grades tab to review the Canvas preview, warnings, "
        "and approval step before anything is submitted."
    )
    return {
        "action": "respond",
        "message": message,
        # Grade updates all use the dedicated Grades tab approval flow. That
        # keeps chat from creating many independent preview cards while still
        # preserving the resolver work already done from Canvas-fetched data.
        "grade_handoff": {
            "local_course_id": course.id,
            "course_name": course.name,
            "assignment_id": assignment_id,
            "assignment_label": assignment_label,
            "student_ids": student_ids,
            "student_count": student_count,
            "new_grade": new_grade,
            "reason": reason,
        },
    }


def _build_grouped_grade_update_result(
    course: Course,
    assignment_id: int,
    submissions: list[dict],
    new_grade: str,
    reason: str | None,
) -> dict:
    # Compatibility wrapper for older tests/imports. Bulk grade updates now use
    # the same handoff shape as single-student updates.
    return _build_grade_handoff_result(
        course, assignment_id, submissions, new_grade, reason
    )


def _grade_partial_plan(action: Any, local_course_id: int, assignment_id: int | None) -> dict:
    """Keep grade clarification turns resumable after short user replies."""
    plan = {
        "action": "update_grade",
        "local_course_id": local_course_id,
        "assignment_id": assignment_id,
        "assignment_reference": getattr(action, "assignment_reference", None),
        "student_id": getattr(action, "student_id", None),
        "student_reference": getattr(action, "student_reference", None),
        "new_grade": getattr(action, "new_grade", None),
        "reason": getattr(action, "reason", None),
    }
    return {key: value for key, value in plan.items() if value is not None}


def _is_bulk_student_reference(reference: str) -> bool:
    normalized = re.sub(r"[^a-z0-9]+", " ", reference.lower()).strip()
    if normalized.startswith("all ") and "student" in normalized:
        return True
    bulk_terms = {
        "all",
        "all students",
        "everyone",
        "every student",
        "everybody",
        "the class",
        "whole class",
        "entire class",
    }
    return normalized in bulk_terms


@dataclass
class MessageGroup:
    """One outgoing send_message: shared body text + who it goes to.
    recipient_ids/recipient_names are empty for a class-wide announcement
    group."""
    body: str
    recipient_ids: list[int] = field(default_factory=list)
    recipient_names: list[str] = field(default_factory=list)


_RECIPIENT_RESOLVER_SYSTEM_PROMPT = """You resolve which real students a
user is referring to, given the real list of candidate students in their
course and how they described each intended recipient.

Respond with exactly one JSON object and nothing else:
{"resolutions": [{"student_reference": "<copied exactly from input>", "canvas_user_id": <id or null>}, ...]}

Include exactly one entry per reference given to you in "References to
resolve", in the same order, using its exact original text for
student_reference. Use the "canvas_user_id" value from the matching
candidate in CANDIDATES — never a value that isn't in that list. Match on
name (a close or partial match is fine, e.g. a first name or a common
nickname), or on login_id/email if the reference looks like one. If a
reference could match more than one candidate, or doesn't confidently match
any of them, respond with null for that entry instead of guessing."""

RECIPIENT_RESOLVER_TIMEOUT_SECONDS = 30.0


async def _resolve_students_via_llm(
    candidates: list[dict], references: list[str], user_message: str, adapter: LLMAdapter,
) -> dict[str, int | None]:
    """Small dedicated LLM call resolving every natural-language student
    reference against a real candidate list at once — same paradigm as
    _resolve_assignment_reference (never trust the model to invent an ID,
    only to point at one from a real list the app gives it), batched into
    one call rather than one per name for latency.

    Returns a dict keyed by the original reference string. Any failure —
    timeout, HTTP error, a broader provider/network failure (connection
    reset, malformed response, ...), unparseable JSON, a malformed
    candidate/resolution entry — or a reference the model couldn't
    confidently match maps to None — never raises — so the caller always
    has a uniform "unresolved" signal to fall back on. The whole body is
    one try/except so this guarantee holds even for the dict access below
    (constructing the listing, reading resolutions back out) — not just
    the LLM call itself."""
    if not references:
        return {}
    result: dict[str, int | None] = dict.fromkeys(references)
    try:
        listing = format_llm_student_listing(candidates)
        prompt = (
            f"CANDIDATES:\n{listing}\n\n"
            f"References to resolve: {references}\n"
            f"User's full message: {user_message}"
        )
        raw = await asyncio.wait_for(
            adapter.generate(
                _RECIPIENT_RESOLVER_SYSTEM_PROMPT, prompt, history=[],
                timeout=RECIPIENT_RESOLVER_TIMEOUT_SECONDS,
            ),
            timeout=RECIPIENT_RESOLVER_TIMEOUT_SECONDS,
        )
        parsed = json.loads(extract_json_object(raw))

        resolutions = parsed.get("resolutions") if isinstance(parsed, dict) else None
        if not isinstance(resolutions, list):
            return result

        # Coerce both sides — the model sometimes returns a numeric id as
        # a JSON string ("4821"), which would otherwise silently fail this
        # membership check even though it's the semantically correct answer.
        valid_ids = {_coerce_int(c.get("user_id")) for c in candidates}
        valid_ids.discard(None)
        for entry in resolutions:
            if not isinstance(entry, dict):
                continue
            ref = entry.get("student_reference")
            candidate_id = _coerce_int(entry.get("canvas_user_id"))
            if isinstance(ref, str) and ref in result and candidate_id in valid_ids:
                result[ref] = candidate_id
        return result
    except Exception:
        return result


async def _run_update_grade_chain(
    db: AsyncSession,
    user: User,
    conversation: Conversation,
    user_msg: Message,
    action: Any,
    user_message: str,
    adapter: LLMAdapter,
) -> dict:
    """Resolve natural assignment/student references before grade preview.

    Numeric Canvas IDs are selected only from real assignment and roster
    data returned by existing backend fetches; they are never requested from
    the instructor or invented by the general chat model.
    """
    resolved_assignment = await _resolve_course_and_assignment(
        db,
        user,
        conversation,
        user_msg,
        action.local_course_id,
        action.assignment_id,
        action.assignment_reference,
        user_message,
        adapter,
    )
    if isinstance(resolved_assignment, dict):
        return resolved_assignment
    course, assignment_id = resolved_assignment

    student_id = action.student_id
    if student_id is None:
        if not action.student_reference:
            return {
                "action": "clarify",
                "clarify": True,
                "question": "Which student should receive this grade?",
                "partial_plan": {
                    "assignment_reference": action.assignment_reference,
                    "new_grade": action.new_grade,
                    "feedback": action.feedback,
                },
            }
        fetch_action = FetchStudentsAction(local_course_id=course.id)
        roster_result = await _run_tracked_read(
            db,
            user,
            conversation,
            user_msg.id,
            "fetch_students",
            fetch_action.model_dump(),
            execute_tool(db, user, fetch_action),
        )
        roster = roster_result.get("students", [])
        candidates = llm_student_candidates(roster)
        student_id = (
            await _resolve_students_via_llm(
                candidates, [action.student_reference], user_message, adapter
            )
        ).get(action.student_reference)
        if student_id is None:
            return {
                "action": "clarify",
                "clarify": True,
                "question": (
                    f'I could not confidently match "{action.student_reference}" '
                    "to one student in this course. What is their full name or email?"
                ),
                "partial_plan": {
                    "assignment_reference": action.assignment_reference,
                    "student_reference": action.student_reference,
                    "new_grade": action.new_grade,
                    "feedback": action.feedback,
                },
            }

    proposed_action = {
        "action": "update_grade",
        "local_course_id": course.id,
        "assignment_id": assignment_id,
        "assignment_reference": action.assignment_reference,
        "student_id": student_id,
        "student_reference": action.student_reference,
        "new_grade": action.new_grade,
        "feedback": action.feedback,
    }
    proposed_action = {
        key: value for key, value in proposed_action.items() if value is not None
    }
    preview_metadata = generate_write_preview(proposed_action, course)
    return {
        "action": "intent_preview",
        "intent_preview": True,
        "summary": preview_metadata["summary"],
        "proposed_action": proposed_action,
        "preview_metadata": preview_metadata,
    }


async def _resolve_recipient_directives(
    db: AsyncSession,
    user: User,
    conversation: Conversation,
    user_msg: Message,
    course: Course,
    roster: list[dict],
    directives: list[RecipientDirective],
    user_message: str,
    adapter: LLMAdapter,
) -> list[MessageGroup] | dict:
    """Resolves each directive's student_reference to a real Canvas user ID
    — the roster first, falling back to a submissions-derived corpus only
    for names the roster couldn't match (mirrors
    message_validation._submission_recipient_ids' existing "some Canvas
    instances only prove membership via submissions" fallback, sharing its
    underlying scan via get_submission_derived_students) — then groups
    directives that share identical body text into one MessageGroup each.

    Returns a clarify dict (never raises) if one or more references still
    can't be confidently resolved after both passes."""
    references = [d.student_reference for d in directives]
    known: dict[int, dict] = {
        int(student["canvas_user_id"]): candidate
        for student in roster
        for candidate in llm_student_candidates([student])
    }
    resolved = await _resolve_students_via_llm(
        list(known.values()), references, user_message, adapter
    )

    unresolved = [ref for ref in references if resolved.get(ref) is None]
    if unresolved:
        print(f"Checking {course.name} submissions for additional student records")
        fallback_students = await _run_tracked_read(
            db, user, conversation, user_msg.id, "fetch_submissions",
            {"local_course_id": course.id, "scope": "all_assignments"},
            get_submission_derived_students(course, user, course.canvas_url),
        )
        new_candidates = llm_student_candidates(
            [student for student in fallback_students if student["user_id"] not in known]
        )
        for student in new_candidates:
            known[student["user_id"]] = student
        if new_candidates:
            fallback_resolved = await _resolve_students_via_llm(
                new_candidates, unresolved, user_message, adapter
            )
            for ref, candidate_id in fallback_resolved.items():
                if candidate_id is not None:
                    resolved[ref] = candidate_id

    still_unresolved = [ref for ref in references if resolved.get(ref) is None]
    if still_unresolved:
        known_names = ", ".join(sorted({s["name"] for s in known.values() if s.get("name")}))
        return {
            "action": "clarify",
            "clarify": True,
            "question": (
                f"I couldn't match {', '.join(still_unresolved)} to a student in "
                f"{course.name}. Known students: {known_names or 'none found'}."
            ),
            "partial_plan": {"local_course_id": course.id},
        }

    by_body: dict[str, MessageGroup] = {}
    for directive in directives:
        canvas_user_id = resolved[directive.student_reference]
        assert canvas_user_id is not None  # guaranteed by the still_unresolved check above
        group = by_body.setdefault(directive.body, MessageGroup(body=directive.body))
        group.recipient_ids.append(canvas_user_id)
        group.recipient_names.append(known.get(canvas_user_id, {}).get("name") or directive.student_reference)

    return list(by_body.values())


def _build_grouped_send_message_result(course: Course, subject: str, groups: list[MessageGroup]) -> dict:
    """Builds proposed_action + preview_metadata for every resolved
    message group, without touching the DB — kept pure so it's easy to
    unit test. The caller (handle_chat_message) persists group 0 through
    the ordinary single-preview path unchanged (so a modify turn still
    overwrites the same message in place exactly as it does for any other
    write), and any remaining groups via _persist_additional_message_previews
    right after it."""
    entries = []
    for index, group in enumerate(groups):
        proposed_action = {
            "action": "send_message",
            "local_course_id": course.id,
            "subject": subject,
            "body": group.body,
            "recipient_canvas_user_ids": group.recipient_ids,
            # Informational only — never read by dispatcher's send_message
            # write case, just lets write_preview.py show real names
            # instead of bare Canvas IDs.
            "recipient_names": group.recipient_names,
        }
        preview_metadata = generate_write_preview(proposed_action, course)
        if len(groups) > 1:
            preview_metadata["message_index"] = index + 1
            preview_metadata["message_count"] = len(groups)
        entries.append({"proposed_action": proposed_action, "preview_metadata": preview_metadata})

    primary = entries[0]
    result = {
        "action": "intent_preview",
        "intent_preview": True,
        "summary": primary["preview_metadata"]["summary"],
        "proposed_action": primary["proposed_action"],
        "preview_metadata": primary["preview_metadata"],
    }
    if len(entries) > 1:
        # Popped and persisted by handle_chat_message right after it
        # handles the primary group — never sent to the client as-is.
        result["_extra_groups"] = entries[1:]
    return result


async def _supersede_stale_message_previews(
    db: AsyncSession, conversation: Conversation, pending_message_id: int | None
) -> None:
    """A fresh messaging batch retires any earlier one still open in this
    conversation. "superseded" already exists in the status vocabulary
    (see Workflow's docstring and the DB CHECK constraint) but nothing else
    in the app has ever set it — this is its first real use. Scoped to
    action_name == "send_message" so an unrelated pending
    create_assignment/update_assignment preview in the same conversation is
    left untouched, and skips the workflow being reused via
    pending_message_id on a modify turn (that one gets reset to "pending"
    with fresh content by _sync_workflow_for_preview instead, same as any
    other modify)."""
    query = select(Workflow).where(
        Workflow.conversation_id == conversation.id,
        Workflow.status == "pending",
        Workflow.action_name == "send_message",
    )
    if pending_message_id is not None:
        query = query.where(Workflow.preview_message_id != pending_message_id)
    stale_workflows = await db.scalars(query)
    for stale in stale_workflows:
        stale.status = "superseded"


async def _run_send_message_chain(
    db: AsyncSession,
    user: User,
    conversation: Conversation,
    user_msg: Message,
    action: Any,
    user_message: str,
    pending_message_id: int | None,
    adapter: LLMAdapter,
) -> dict:
    """Runs the recipient-resolution + grouping chain for a send_message
    turn that named recipients in natural language (recipient_directives),
    asked to broadcast privately to the whole class
    (broadcast_to_all_students), or referenced a server-computed set from an
    earlier resolve_missing_submissions turn (recipient_handle) — mirrors
    _run_fetch_submissions_chain's "resolve server-side, never trust the
    model with a raw ID" shape, for people instead of assignments. Only
    reached when handle_chat_message's dispatch sees one of those three
    fields set; a plain send_message (an announcement, or one with
    recipient_canvas_user_ids already known) is unaffected and keeps using
    the existing single-preview auto-wrap path."""
    course = await resolve_course(db, user, action.local_course_id)
    groups: list[MessageGroup] = []
    roster: list[dict] = []

    if action.broadcast_to_all_students or action.recipient_directives:
        print(f"Gathering {course.name} student roster")
        fetch_action = FetchStudentsAction(local_course_id=course.id)
        roster_result = await _run_tracked_read(
            db, user, conversation, user_msg.id, "fetch_students",
            fetch_action.model_dump(), execute_tool(db, user, fetch_action),
        )
        roster = roster_result["students"]

    if action.broadcast_to_all_students:
        active = [s for s in roster if s.get("enrollment_state") == "active"]
        groups.append(MessageGroup(
            body=action.body,
            recipient_ids=[int(s["canvas_user_id"]) for s in active],
            recipient_names=[s.get("name") or f"Student {s['canvas_user_id']}" for s in active],
        ))

    if action.recipient_directives:
        resolved = await _resolve_recipient_directives(
            db, user, conversation, user_msg, course, roster, action.recipient_directives, user_message,
            adapter,
        )
        if isinstance(resolved, dict):
            return resolved
        groups.extend(resolved)

    if action.recipient_handle:
        resolved_set = await materialize_resolved_set(db, action.recipient_handle, conversation.id)
        if resolved_set is None:
            return {
                "action": "clarify",
                "clarify": True,
                "question": (
                    "That resolved recipient set is no longer available (it may have "
                    "expired) — should I check again for students missing this assignment?"
                ),
                "partial_plan": {"local_course_id": course.id},
            }
        recipients = resolved_set.snapshot_recipients
        groups.append(MessageGroup(
            body=action.body,
            recipient_ids=[r["user_id"] for r in recipients],
            recipient_names=[r["name"] for r in recipients],
        ))

    if action.also_announce_to_class or not groups:
        groups.append(MessageGroup(body=action.body, recipient_ids=[], recipient_names=[]))

    await _supersede_stale_message_previews(db, conversation, pending_message_id)
    return _build_grouped_send_message_result(course, action.subject, groups)


async def _persist_additional_message_previews(
    db: AsyncSession,
    conversation: Conversation,
    extra_groups: list[dict],
) -> list[dict]:
    """Persists every message group after the first from a grouped
    send_message turn (see _run_send_message_chain / _build_grouped_send_message_result)
    — group 0 already went through the ordinary single-preview persistence
    path in handle_chat_message, unchanged. Each of these is a brand-new
    Message row so the transcript still shows every distinct body.

    send_message is a form-handoff action (Messages compose), so extras do
    not get pending Workflow rows or pending_message_id — same as the
    primary group. The client hands off the primary draft; additional
    groups remain informational in the reply payload."""
    previews = []
    for entry in extra_groups:
        proposed_action = entry["proposed_action"]
        preview_metadata = entry["preview_metadata"]
        result = {
            "action": "intent_preview",
            "intent_preview": True,
            "summary": preview_metadata["summary"],
            "proposed_action": proposed_action,
            "preview_metadata": preview_metadata,
        }
        await log_message(
            db, conversation, role="assistant", content=_json_dumps(result)
        )
        previews.append(result)
    return previews


async def _load_stored_intent_preview(
    db: AsyncSession, conversation_id: int, message_id: int
) -> dict | None:
    """Loads and parses a stored message's content, returning it only if
    it's a well-formed intent_preview (has a dict proposed_action) —
    None for anything else (missing row, unparseable JSON, or any other
    shape), so callers don't need to repeat that validation."""
    content = await db.scalar(
        select(Message.content).where(
            Message.id == message_id,
            Message.conversation_id == conversation_id,
        )
    )
    if not content:
        return None
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return None
    if (
        isinstance(parsed, dict)
        and parsed.get("intent_preview")
        and isinstance(parsed.get("proposed_action"), dict)
    ):
        return parsed
    return None


def _build_llm_message(
    message: str,
    course_names: list[CanvasCourseName],
    current_course_name: str | None,
    current_proposed_action: dict | None,
    loop_steps: list[dict] | None = None,
) -> str:
    """Wraps the user's raw message with whatever structured context the
    model needs, rather than leaving it to re-derive that context from
    free text or conversation history — both have proven unreliable in
    practice: a course name in the message can disagree with the actual
    active course, and a modify turn that only restates the part being
    changed (e.g. just the date) can lose already-answered fields
    (description, points_possible) that the model fails to carry forward
    from scrollback on its own.

    Course context is name-only, by design — never a numeric ID. The
    model resolves which course (if any) this message is about itself,
    from this list, and reports it back via the top-level course_name
    field (see build_system_prompt's COURSE RESOLUTION section); the app
    resolves that name to a real ID afterward (handle_chat_message).

    loop_steps carries results already produced earlier IN THIS SAME turn
    (see the step loop in handle_chat_message) — distinct from `history`,
    which is prior TURNS only. Never populated for a modify turn (which
    never loops); empty/None means "first step of this turn", identical to
    every existing single-step request."""
    parts = []

    if course_names:
        names = "\n".join(f"- {cn.name}" for cn in course_names)
        parts.append(
            "YOUR COURSES:\n"
            f"{names}\n\n"
            f"CURRENT COURSE FOR THIS CONVERSATION: {current_course_name or 'none set yet'}"
        )

    if current_proposed_action is not None:
        parts.append(
            "Current proposed plan (before this edit):\n"
            f"{json.dumps(current_proposed_action)}\n"
            "The user below is revising this plan, not starting a new "
            "request. Apply their requested change to it and keep every "
            "other field exactly as it is — do not drop description, "
            "points_possible, or any other already-answered field just "
            "because this message doesn't repeat it."
        )

    if loop_steps:
        steps_text = "\n\n".join(
            f'Step {i + 1} result ({step["action"]}):\n'
            f'{json.dumps(trim_tool_dump_for_history(step["result"]))}'
            for i, step in enumerate(loop_steps)
        )
        parts.append(
            "You are mid-way through a multi-step turn — the steps below "
            "already ran, in order, still for this same user request below "
            "(not a new one). Decide the next action based on their "
            "results: propose another read/resolver to gather more, a "
            "write (via intent_preview) once you have everything it needs, "
            "or respond/clarify if you're done or stuck. Do not repeat a "
            "step you already have a result for below.\n\n" + steps_text
        )

    parts.append(f"User request: {message}")
    return "\n\n".join(parts)


def _plain_text_response(raw_output: str) -> dict | None:
    """Treat plain local-model text as a normal assistant reply.

    If braces are present, assume the model attempted structured JSON and keep
    the stricter parser/error path so malformed internals are not echoed back.
    """
    stripped = raw_output.strip()
    # A local model may answer in ordinary prose. If it looks like attempted
    # JSON, keep the strict parser so malformed structured output is logged
    # safely instead of echoed back to the user.
    if stripped and "{" not in stripped and "}" not in stripped:
        return {"action": "respond", "message": stripped}
    return None


_STRICT_JSON_RETRY_INSTRUCTION = (
    "Your previous reply was not valid JSON for this assistant. "
    "Reply with ONLY one JSON object that matches the action schema "
    '(for example {"action":"respond","message":"..."}). '
    "No markdown fences and no commentary outside the JSON object."
)

_MALFORMED_ACTION_DEGRADE_MESSAGE = (
    "I had trouble formatting that reply as a structured action. "
    "Could you ask again, or rephrase your question?"
)


def _is_malformed_action_parse_error(exc: ToolExecutionError) -> bool:
    """JSON decode / missing-action failures are soft-recoverable (#1304).
    Unknown-action and schema validation stay hard errors."""
    message = (exc.user_message or "").lower()
    return (
        "could not be understood" in message
        or "missing required information" in message
    )


async def _parse_model_action_with_recovery(
    *,
    adapter: LLMAdapter,
    system_prompt: str,
    llm_message: str,
    history: list[dict],
    raw_output: str,
    resolved_local_course_id: int | None = None,
) -> tuple[Any | None, dict | None, str]:
    """Parse model output; on malformed JSON retry once, then soft-respond.

    Returns ``(action, respond_dict, raw_output_used)``. Exactly one of
    ``action`` / ``respond_dict`` is set.

    ``resolved_local_course_id`` is injected into the parsed envelope before
    parsing, and also into any retry output, so a retry that omits
    ``local_course_id`` doesn't fail validation (#1310).
    """
    # Inject course into the raw output before parsing
    raw_output = _inject_course_into_raw_output(raw_output, resolved_local_course_id)

    text_reply = _plain_text_response(raw_output)
    if text_reply is not None:
        return None, text_reply, raw_output

    try:
        return parse_action(raw_output), None, raw_output
    except ToolExecutionError as parse_error:
        if not _is_malformed_action_parse_error(parse_error):
            raise

    retry_message = (
        f"{_STRICT_JSON_RETRY_INSTRUCTION}\n\n"
        f"Original user request:\n{llm_message}"
    )
    try:
        retry_raw = await asyncio.wait_for(
            adapter.generate(
                system_prompt,
                retry_message,
                history=history,
                timeout=LLM_TIMEOUT_SECONDS,
            ),
            timeout=LLM_TIMEOUT_SECONDS,
        )
    except Exception:
        logger.warning("Strict JSON parse retry failed", exc_info=True)
        return None, {"action": "respond", "message": _MALFORMED_ACTION_DEGRADE_MESSAGE}, raw_output

    # Inject course into retry output too
    retry_raw = _inject_course_into_raw_output(retry_raw, resolved_local_course_id)
    text_retry = _plain_text_response(retry_raw)
    if text_retry is not None:
        return None, text_retry, retry_raw
    try:
        return parse_action(retry_raw), None, retry_raw
    except ToolExecutionError as retry_error:
        if _is_malformed_action_parse_error(retry_error):
            logger.info(
                "Malformed LLM action after retry; degrading to respond: %s",
                redact_secrets(retry_error.log_detail),
            )
            return None, {"action": "respond", "message": _MALFORMED_ACTION_DEGRADE_MESSAGE}, retry_raw
        raise


def _inject_course_into_raw_output(raw_output: str, local_course_id: int | None) -> str:
    """Parse raw LLM output, inject local_course_id, re-serialize.
    If parsing fails or the action doesn't need a course, return unchanged."""
    try:
        parsed = json.loads(extract_json_object(raw_output))
    except (json.JSONDecodeError, Exception):
        return raw_output
    if not isinstance(parsed, dict):
        return raw_output
    injected = _inject_course_into_envelope(parsed, local_course_id)
    return json.dumps(injected)


def _step_budget_exhausted_response(loop_steps: list[dict]) -> dict:
    """Terminal fallback when MAX_TURN_STEPS is reached mid-chain without
    the model ever reaching a write/respond/clarify — surfaces whatever
    the last step already found (its "summary", if it has one) rather
    than silently discarding it, and asks the user to narrow the request
    instead of erroring outright (nothing failed — the turn just needed
    more steps than the budget allows)."""
    message = "I wasn't able to finish this request within the allowed number of steps."
    if loop_steps:
        last_result = loop_steps[-1]["result"]
        last_summary = last_result.get("summary") if isinstance(last_result, dict) else None
        if last_summary:
            message += f" Here's what I found so far: {last_summary}"
    message += " Could you narrow down what you'd like me to do next?"
    return {"action": "respond", "message": message}


async def log_message(
    db: AsyncSession,
    conversation: Conversation,
    role: str,
    content: str,
) -> Message:
    message = Message(
        conversation_id=conversation.id, role=role, content=content
    )
    db.add(message)
    await db.flush()
    await db.refresh(message)
    return message


async def _defer_canvas_limited_mode_reply(
    db: AsyncSession,
    *,
    user: User,
    conversation: Conversation,
    message: str,
    action,
) -> dict | None:
    """Classify before tool execution; defer Canvas work in limited mode.

    Returns an error reply dict when blocked, or None when the action may proceed.
    """
    if user_has_canvas_credentials(user):
        return None

    proposed = getattr(action, "proposed_action", None)
    proposed_dict = proposed if isinstance(proposed, dict) else None
    if classify_action_for_limited_mode(action.action, proposed_dict) == "allow":
        return None

    deferred = await defer_assistant_request(
        db,
        user=user,
        conversation_id=conversation.id,
        message=message,
        proposed_action=action.model_dump(),
    )
    reply = {
        "error": CANVAS_TOKEN_REQUIRED_MESSAGE,
        "requires_canvas_token": True,
        "limited_mode": True,
        "deferred_request_id": deferred.id,
        "deferred_message": message,
    }
    await log_message(
        db,
        conversation,
        role="assistant",
        content=json.dumps(reply),
    )
    await db.commit()
    return reply


async def update_message_content(
    db: AsyncSession,
    conversation_id: int,
    message_id: int,
    new_content: str,
) -> Message:
    """Updates the content of an existing message row in place.
    Used when a user modifies a proposed action — the old intent_preview
    message is overwritten with the new preview so conversation history
    reflects only the latest agreed plan. This prevents the LLM from
    seeing both the old and new preview on the next turn, and keeps the
    messages table as a clean record of current state rather than an
    append-only log of every intermediate draft.

    Ownership is enforced via conversation_id — only messages belonging
    to the given conversation can be updated."""
    message = await db.scalar(
        select(Message).where(
            Message.id == message_id,
            Message.conversation_id == conversation_id,
        )
    )
    if not message:
        raise ToolExecutionError(
            "Preview message not found.",
            log_detail=f"message_id={message_id} not found in conversation_id={conversation_id}",
        )
    message.content = new_content
    await db.flush()
    await db.refresh(message)
    return message


async def _sync_workflow_for_preview(
    db: AsyncSession,
    conversation: Conversation,
    user: User,
    source_user_message_id: int,
    pending_message_id: int | None,
    preview_message_id: int,
    user_prompt: str,
    proposed_action: dict,
    affected_resources: list[dict] | None = None,
) -> None:
    """Creates or updates the Workflow row backing an intent_preview — the
    state machine handle_confirmed_action checks to guarantee an action
    executes at most once. Only ever called for `result.get("intent_preview")`
    turns, which read actions no longer produce (READ_ACTIONS execute
    immediately in handle_chat_message — see _run_tracked_read/
    _run_fetch_submissions_chain and their own tool_call_logs tracking) —
    in practice this is reached by write actions only now. AuditLog writing
    in handle_confirmed_action stays gated to WRITE_ACTIONS separately,
    since audit rows are only ever about actual Canvas mutations.

    Also backfills conversation.course_id from the proposed action the
    first time one is seen, since the client (e.g. the manual test
    harness) doesn't always send local_course_id up front. Only backfills
    when that course actually exists and belongs to this user — both
    conversations.course_id and workflows.course_id are real foreign keys,
    so blindly trusting an LLM-echoed local_course_id here (e.g. one the
    model hallucinated, or a stale/invalid id from client input) raises an
    unhandled IntegrityError instead of the graceful "course not found"
    message _resolve_course already produces at confirm time. Leaving it
    unset here means that existing, tested error path still fires."""
    action_name = proposed_action.get("action")
    resources = affected_resources or []

    if conversation.course_id is None:
        local_course_id = proposed_action.get("local_course_id")
        if local_course_id is not None:
            owned_course = await db.scalar(
                select(Course.id).where(Course.id == local_course_id, Course.instructor_id == user.id)
            )
            if owned_course is not None:
                conversation.course_id = local_course_id

    existing = None
    if pending_message_id:
        existing = await db.scalar(
            select(Workflow).where(
                Workflow.preview_message_id == pending_message_id,
                Workflow.conversation_id == conversation.id,
            )
        )

    if existing:
        # preview_message_id is unique, so a second Workflow can never be
        # created for the same message row — reuse this one regardless of
        # its current status. Reopening an already-settled workflow (only
        # reachable if a client replays a modify against a message id that
        # was already confirmed/cancelled) resets it back to pending with
        # the new proposed action, clearing the stale execution outcome.
        existing.action_name = action_name
        existing.user_prompt = user_prompt
        existing.proposed_action = proposed_action
        existing.affected_resources = resources
        existing.course_id = conversation.course_id
        existing.status = "pending"
        existing.error_detail = None
        existing.executed_at = None
        existing.result_message_id = None
        return

    db.add(
        Workflow(
            conversation_id=conversation.id,
            user_id=user.id,
            course_id=conversation.course_id,
            source_user_message_id=source_user_message_id,
            preview_message_id=preview_message_id,
            action_name=action_name,
            user_prompt=user_prompt,
            proposed_action=proposed_action,
            affected_resources=resources,
            status="pending",
        )
    )


async def _supersede_pending_workflow(
    db: AsyncSession,
    conversation_id: int,
    pending_message_id: int | None,
) -> None:
    if pending_message_id is None:
        return

    await db.execute(
        sa_update(Workflow)
        .where(
            Workflow.conversation_id == conversation_id,
            Workflow.preview_message_id == pending_message_id,
            Workflow.status == "pending",
        )
        .values(status="superseded")
    )


async def _get_recent_messages(
    db: AsyncSession, conversation_id: int
) -> list[dict]:
    """Fetch the last N messages for LLM context. Excludes the most
    recently logged message since generate() appends the current user
    turn explicitly — including it here would cause the current message
    to appear twice in the LLM's context window.

    In a future iteration this step gets replaced by a vector retrieval
    call that fetches semantically relevant history rather than just
    the most recent N messages."""
    rows = await db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(desc(Message.id))
        .limit(HISTORY_WINDOW + 1)
    )
    messages = list(rows)
    messages.reverse()
    # drop the last message — it's the current user turn, which generate()
    # will append separately, and including it here causes duplication
    if messages:
        messages = messages[:-1]
    return [
        {
            "role": m.role,
            "content": _truncate_history_content(
                _summarize_assistant_history_content(m.role, m.content)
            ),
        }
        for m in messages
    ]


def _summarize_assistant_history_content(role: str, content: str) -> str:
    """Assistant turns are stored as the full JSON result (needed for the
    API response, Workflow linkage, and UI rendering), but replaying that
    same raw JSON back to the LLM as "history" clutters its context with
    field names and structure it has previously echoed into its own
    output (e.g. inventing a field value seen in an unrelated prior
    turn's JSON rather than the current user message). Reduce terminal,
    already-resolved turns (clarify questions, plain replies, cancellations)
    to just their natural-language text.

    intent_preview turns are deliberately left as full JSON: a follow-up
    "modify" turn needs the complete previous proposed_action to correctly
    carry forward fields the user didn't ask to change. Read-action results
    (e.g. fetch_assignments) are also left as full JSON since a later turn
    may need to resolve a name to an ID from that data — those have none of
    the keys below and pass through unchanged."""
    if role != "assistant":
        return content
    try:
        data = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return content
    if not isinstance(data, dict) or data.get("intent_preview"):
        return content
    if data.get("action") == "clarify" and isinstance(data.get("partial_plan"), dict) and data["partial_plan"]:
        return _json_dumps(
            {
                "action": "clarify",
                "question": data.get("question"),
                "partial_plan": data.get("partial_plan"),
            }
        )
    return data.get("message") or data.get("question") or data.get("error") or content


def _truncate_history_content(content: str) -> str:
    if len(content) <= HISTORY_MESSAGE_MAX_CHARS:
        return content
    return content[:HISTORY_MESSAGE_MAX_CHARS] + " …[truncated]"


def _schema_for_prompt(schema_cls: type[BaseModel]) -> dict:
    """The model never supplies local_course_id itself — the app always
    injects the real one server-side once a course_name resolves (see
    COURSE RESOLUTION below and _inject_course_into_envelope). Rendering
    it here as a required integer field directly contradicts that prose
    instruction: a model facing "the schema says required int" vs. "never
    output an ID" has to guess which one to follow, and a smaller/weaker
    model has been observed resolving that tension by fabricating a
    plausible-looking ID or by dropping some other required field
    entirely instead. Excluding it from what's rendered removes the
    contradiction; execute_tool/_inject_course_into_envelope still treat
    it as a real required field at injection/validation time — this only
    changes what the model itself is told to produce. Builds a new dict
    rather than mutating model_json_schema()'s return value, in case
    Pydantic ever shares/caches that object elsewhere."""
    schema = schema_cls.model_json_schema()
    properties = {k: v for k, v in schema.get("properties", {}).items() if k != "local_course_id"}
    result = {**schema, "properties": properties}
    if "required" in schema:
        required = [f for f in schema["required"] if f != "local_course_id"]
        if required:
            result["required"] = required
        else:
            result.pop("required", None)
    return result


def build_system_prompt(has_canvas_token: bool = True) -> str:
    tool_list = "\n".join(
        f"- {name}: {_schema_for_prompt(schema)}"
        for name, schema in ACTION_SCHEMAS.items()
        if name not in {"out_of_scope", "clarify", "intent_preview", "respond"}
    )
    today = datetime.now(UTC).date()
    today_line = (
        f"Today's date is {today.isoformat()} ({today.strftime('%A')}). Resolve any\n"
        'relative or partial date the user gives (e.g. "July 11", "next Friday",\n'
        '"in two weeks") against this date — never against a year from your\n'
        "training data. A resolved date must always fall on or after today.\n"
    )
    # Soft guidance only — hard enforcement is classify_action_for_limited_mode
    # before any Canvas tool execution (issue #1245).
    canvas_gate_line = "" if has_canvas_token else LIMITED_MODE_PROMPT

    return """You are a Canvas LMS assistant for instructors. You help
with course management, assignments, student submissions, and
communicating with students.

""" + today_line + canvas_gate_line + """
SCOPE CHECK — do this first, before anything else:
Decide whether the request is about Canvas course management or student
communication. If the request is not about Canvas (e.g. creative
writing, roleplay, general coding help, personal advice, anything
unrelated to teaching), respond ONLY with:
{"action": "out_of_scope", "message": "<brief description of the request>"}

AMBIGUITY CHECK — if the request is in scope but missing information:
Only ask about a field that is REQUIRED by that action's schema (see
AVAILABLE ACTIONS) and that the user did not give you, directly or
earlier in CONVERSATION HISTORY. Do not ask about optional fields, and
do not ask about anything that isn't literally one of that action's
fields — e.g. fetch_submissions only needs a course and an assignment,
so never ask what format, detail level, or extra info the user wants to
see. If every required field is known, propose the
action immediately; do not ask a question just to double-check. Never
invent, guess, or write a placeholder value for a required field you
don't have. To ask, respond ONLY with:
{"action": "clarify", "question": "<one specific question>", "partial_plan": <dict>}
Put every field you already do have into partial_plan so the next turn
doesn't lose it once the user answers. Only ask ONE question per turn.

REQUIRED FIELDS — before proposing any write action (create_assignment,
update_assignment, create_quiz, send_message, update_grade), check every field listed as "required"
in that action's schema below. This includes the action/task type itself
(e.g. don't guess whether the user wants create_assignment vs
create_quiz vs update_assignment), and fields like title, description, and due_date.
(Exception: send_message's subject and body are optional — see
SEND_MESSAGE HANDOFF below. create_quiz and update_grade also skip the
missing-field clarify — see their HANDOFF sections.)
If any required field is missing or was not stated by the user, use the
AMBIGUITY CHECK format to ask for it. Never invent a placeholder value
and never silently omit a required field from proposed_action.
(create_quiz and update_grade are exceptions — see QUIZ ENGINES and
UPDATE_GRADE HANDOFF below: always propose directly, never clarify only
because required form fields are missing. The dedicated forms handle
validation.)

INTENT PREVIEW — before executing a WRITE action:
create_assignment, create_quiz, update_assignment, send_message, and update_grade change real Canvas
data, so the user must see and confirm exactly what will happen first:
{"action": "intent_preview", "summary": "<plain English description>", "proposed_action": <dict>}
The user will confirm, modify, or cancel from here.

QUIZ ENGINES:
For create_quiz, use quiz_engine="classic" unless the instructor explicitly
asks for a New Quiz. Use quiz_engine="new_quizzes" only for that explicit
request; the app verifies whether their Canvas course supports it. Classic
question-bank groups require real bank IDs selected by the instructor in
the quiz review form. Never invent bank_id values or add question_bank_groups
from natural-language guesses.

IMPORTANT — create_quiz ALWAYS skips the AMBIGUITY CHECK. Even when the
user gives only a partial request (e.g. "create a quiz" with no title or
description), propose intent_preview immediately with whatever details you
have. The quiz creation form opens with pre-filled values and handles all
missing-field validation. Never ask clarifying questions for create_quiz:
propose {"action": "intent_preview", "proposed_action": {"action": "create_quiz",
...}} right away.

UPDATE_GRADE HANDOFF:
IMPORTANT — update_grade likewise skips the missing-field AMBIGUITY CHECK
for grade or assignment-feedback requests. When the user asks to change
grades or add assignment feedback, propose update_grade immediately with
whatever details you have instead of asking for missing assignment/student
fields. Set assignment_reference to the user's own words (e.g. "all
assignments", "the latest one", "leetcode") and student_reference to their
words (e.g. "everyone", "all students"). The app resolves these server-side
against real Canvas data and opens the dedicated Grades tab with the details
pre-filled. Do not clarify only because update_grade is missing
assignment_id, assignment_reference, student_id, or student_reference.
Exception: if the user asks to "give feedback", "send feedback", or "leave
a note" for a student but does not tie it to an assignment/submission/grade,
ask whether they mean assignment feedback on a submission or a private
message to the student.

SEND_MESSAGE HANDOFF:
IMPORTANT — send_message skips the missing-field AMBIGUITY CHECK for
subject and body when the user's request implies a recipient set that
needs server-side resolution (recipient_handle from a prior
resolve_missing_submissions turn, recipient_directives naming students,
or broadcast_to_all_students). When the user says "send reminders to
students who haven't submitted assignment X" or "message all students
saying Y", propose send_message immediately with whatever details you
have. If the user provided a body or subject, include them; if not,
leave them empty ("") and the Messages compose form handoff lets the
user fill them in manually. Do not clarify subject or body when the
user's request already implies who should receive the message — propose
the action and let the form handle the rest. The one exception: if the
user asks to "send a message" but doesn't say WHO (no recipient
directives, no handle, no broadcast, no "students who haven't
submitted"), ask who the recipients should be.

READ ACTIONS — execute immediately, no preview:
fetch_courses, fetch_assignments, fetch_quizzes, fetch_students, fetch_submissions,
resolve_missing_submissions, find_assignment_by_submission_rate, and
get_active_course never change any data, so propose them directly and
plainly — do NOT wrap them in intent_preview:
{"action": "fetch_assignments", "course_name": "<course>"}
They run right away and their result is shown to the user in this same
response, not a separate confirm step.

MULTI-STEP REQUESTS: some requests need more than one step to satisfy in
a single message — e.g. "message students missing assignment 4" needs
resolve_missing_submissions before send_message can even be proposed;
"push back the last assignment under 30% submissions by 3 days" needs
find_assignment_by_submission_rate before update_assignment. Propose the
first step you need; if it's resolve_missing_submissions or
find_assignment_by_submission_rate, you'll be asked again, in the same
turn, what to do next once you have its result — use that next turn to
propose the write (or another read) the original request actually needed,
instead of stopping at the first step's raw result. Only stop early with
clarify/respond if something is genuinely missing or ambiguous.

CONVERSATION HISTORY:
Previous messages in this conversation are provided below. If this is
a follow-up to a clarification question or a refinement of a previous
plan, incorporate the user's feedback into the updated partial_plan
before responding.

COURSE RESOLUTION:
Every response must include a top-level "course_name" field naming
exactly one course from YOUR COURSES (see the list injected with each
message) — copy the name exactly as given, character for character.
Never invent a course name, never output a course ID (local or Canvas),
and never ask the user for one — they only know their courses by name,
never by an internal ID.

GROUNDING — retrieved Canvas data only (Feature 13 #855):
Never invent Canvas facts that were not returned by a tool in this
conversation (assignment/student/course IDs, grades, scores, due dates,
roster names, submission status). If you need a fact you do not have,
call the appropriate read tool or ask a clarify question — do not guess.
When summarizing a tool result, only cite fields present in that result.
Never fabricate numeric Canvas IDs.

- If the message clearly names one of YOUR COURSES, even a partial name
  (e.g. "Intro to Programming" for "COSC 111 - Introduction to
  Programming with Java"), set course_name to that course's exact full
  name and use it as the subject of this and future turns.
- If a partial name could match more than one course in YOUR COURSES
  (e.g. "Intro to Programming" when both COSC 111 and COSC 121 exist),
  do not guess — use the AMBIGUITY CHECK format to ask which one,
  listing the full names of the candidates.
- If the message doesn't name a course, reuse CURRENT COURSE FOR THIS
  CONVERSATION (also injected with each message) as course_name — do not
  ask again just because this message didn't repeat the name.
- If there is no CURRENT COURSE and the message doesn't name one either,
  and the action you're proposing needs a course, ask which course using
  the AMBIGUITY CHECK format.
- out_of_scope and general "respond" answers that aren't about a
  specific course may omit course_name entirely.

META QUESTIONS — if the user asks what you can do, asks for help,
or needs a natural language reply that isn't a Canvas tool call, respond with:
{"action": "respond", "message": "<your natural language answer here>"}
Use this for greetings, capability questions, and clarifying what is in scope.

CREATING AN ASSIGNMENT:
title must be the user's own wording for the assignment name, copied
verbatim — never substitute a different assignment name from earlier in
this conversation (e.g. from a previous fetch_assignments result) even if
it seems related. due_date is required and must be a full ISO 8601
string, e.g. "2026-07-11T23:59:00" — resolve it using today's date above.
If the user gives a date but no time, default the time to 23:59:00. If
the user does not give a due date at all, do not guess or leave due_date
null — use the AMBIGUITY CHECK above and ask for it instead. Likewise, if
the user does not mention points, ask rather than defaulting silently —
only omit points_possible if the user explicitly says it's ungraded or
has no point value. Never invent a value for a field the user didn't
give you.

RESOLVING AN ASSIGNMENT FOR fetch_submissions:
fetch_submissions needs an assignment, but you do not need to know its
Canvas ID yourself. If you already have it from earlier in this
conversation (the "id" field from a previous fetch_assignments or
fetch_submissions result), pass it directly as assignment_id. Otherwise
leave assignment_id unset and instead set assignment_reference to the
user's own words for which assignment they mean — e.g. "the latest
assignment", "Assignment 2", "the final project" — and propose
fetch_submissions directly (not fetch_assignments, and not
intent_preview). The app resolves assignment_reference to a real ID for
you, the same way course_name is resolved to a course — never invent or
guess a numeric assignment_id yourself.

The result carries "assignment" (the resolved assignment's own
assignment_id/assignment_name/due_at — always name it explicitly when you
answer, e.g. "For Final Project, ..."), "counts" (submitted/missing/
unsubmitted/late/graded/excused), and "pending_students" (missing +
unsubmitted combined — this app's definition of "who hasn't submitted",
matching resolve_missing_submissions). When answering "who hasn't
submitted" or similar from a fetch_submissions result already in history,
read pending_students/counts directly — do not recompute it yourself by
scanning the raw "submissions" list.

FINDING STUDENTS MISSING OR LATE ON A SUBMISSION:
When the user wants to find or message students who have not submitted an
assignment, or who submitted it LATE (e.g. "who's missing assignment 4",
"remind students who haven't submitted the project", "who turned in
assignment 2 late"), do not propose fetch_submissions and read through
the results yourself — for a large class that puts every student into
your context when you only need a count. Instead propose
resolve_missing_submissions directly (same convention as
fetch_submissions: not intent_preview, and assignment_id/
assignment_reference resolve the assignment the same way):
{"action": "resolve_missing_submissions", "course_name": "<course>", "assignment_reference": "<assignment>", "status": "missing"}
Set status to "missing" (the default — not submitted at all) or "late"
(submitted, but after the due date) — these are separate, mutually
exclusive groups; never guess which one the user means if it's ambiguous
("students behind on assignment 4" usually means missing; "students who
turned it in late" means late). The result gives you a "count", a short
"sample" of names, and a "handle" string — never the full list. To
message everyone in that resolved set, propose send_message with
recipient_handle set to that exact handle string, copied verbatim from
the result — never invent one, and never build recipient_directives out
of the "sample" names instead, that's only a preview excerpt, not the
full set.

ANALYSING A WHOLE COURSE'S SUBMISSIONS:
When the user asks about submissions across a course rather than one
assignment (e.g. "analyse missing submissions", "who hasn't submitted
anything", "how are submissions looking in this course", "give me a
submission overview"), propose analyze_course_submissions — NOT
resolve_missing_submissions, which needs one specific assignment, and
never a plain "respond" written from memory:
{"action": "analyze_course_submissions", "course_name": "<course>", "status": "missing"}
status works exactly as it does for resolve_missing_submissions.
The result carries "total", "course", and an "assignments" list, each
entry with assignment_name, count, and the "students" who match. Report
those numbers and names as given — never estimate a submission rate,
average, or percentage that is not in the result. If you were not given
data, say so instead of producing a plausible-looking figure.

FINDING AN ASSIGNMENT BY SUBMISSION RATE:
When the user describes an assignment by a submission-rate criterion
instead of by name (e.g. "the last assignment with fewer than 30%
submissions", "the assignment more than half the class has turned in"),
do not propose fetch_submissions per assignment and compute this yourself
— that dumps every student's data into your context once per assignment.
Instead propose find_assignment_by_submission_rate directly (same
convention as resolve_missing_submissions: not intent_preview):
{"action": "find_assignment_by_submission_rate", "course_name": "<course>", "comparator": "below", "threshold_percent": 30}
comparator is "below" for "fewer than X%" or "above" for "more than X%";
threshold_percent is a plain number like 30, never a fraction like 0.3.
The app scans every assignment's real submission data server-side and
picks the one with the latest due date among matches — "matched" is false
with no assignment_id when nothing qualifies, in which case say so plainly
rather than guessing. When it matches, the result's "assignment_id" and
"due_date" are real values from this course, safe to use directly in a
follow-up update_assignment turn — the same as any other id you already
have from earlier in this conversation.

RESOLVING AN ASSIGNMENT FOR update_assignment:
update_assignment needs an exact Canvas assignment_id, but — like
fetch_submissions — you do not need to know it yourself. If you already
have it from earlier in this conversation (the "id" field from a
previous fetch_assignments/fetch_submissions result, or "assignment_id"
from find_assignment_by_submission_rate), pass it directly as
assignment_id and propose intent_preview wrapping update_assignment as
usual — the preview must show precisely what will change. Otherwise leave
assignment_id unset and instead set assignment_reference to the user's
own words for which assignment they mean — e.g. "the final exam",
"assignment 1", "the midterm" — and propose update_assignment directly
(not fetch_assignments, and not intent_preview), together with whichever
fields the user wants changed. The app resolves assignment_reference to a
real ID for you and builds the preview in this same turn — never invent
or guess a numeric assignment_id yourself. Do not respond with clarify to
ask the user for an ID — clarify is only for information the user
themselves would know (e.g. which course, or which student); an
unresolvable assignment_reference is handled for you automatically. Only
include the fields the user actually wants changed — leave every other
field out of proposed_action entirely, since anything omitted is
preserved automatically.

RESOLVING A STUDENT AND ASSIGNMENT FOR update_grade:
update_grade handles both grade changes and assignment-specific submission
feedback. A feedback-only request such as "leave feedback on ggg for Coin:
work changes" should use update_grade with the feedback in reason and an
empty new_grade; do not use send_message for feedback tied to a specific
assignment/submission. Treat words like feedback, submission comment,
rubric note, or comment on assignment as gradebook feedback when an
assignment is named; use send_message only when the user asks to contact
students outside the gradebook. Grade changes are high risk; feedback-only
is low risk but still previews in the Grades tab. If you already have both real
IDs from earlier in the conversation, propose update_grade with
assignment_id, student_id, and new_grade (blank for feedback-only).
Otherwise leave unknown IDs unset and provide the user's own words as
assignment_reference and/or student_reference, then propose update_grade
directly (not fetch_assignments, not fetch_submissions, and not
intent_preview). The app resolves the assignment and student from real
Canvas assignments/submissions server-side, then opens the dedicated
Grades tab with those details prefilled so the instructor can preview and
approve there. Never invent or guess numeric assignment_id or student_id
values, and never ask the user for raw Canvas IDs. If the user asks to
update grades for "everyone", "all students", or "the whole class", set
student_reference to that exact phrase; the app will resolve the real
submission list and hand off the full target set to the Grades tab. Never
call fetch_students for grade updates.
If the user asks to "give feedback", "send feedback", or "leave a note"
for a student but does not tie it to an assignment/submission/grade, ask
via clarify: "Do you want to add assignment feedback on a submission, or
send a private message to the student?" Do not guess between update_grade
and send_message in that ambiguous case.

MESSAGING STUDENTS:
send_message can post a public class announcement, send a private Canvas
message to specific students, or both in the same turn — these have very
different audiences, so never guess which one the user means.
Use send_message for general communication that is not tied to a specific
assignment submission or gradebook feedback.

If it's genuinely unclear whether the user wants a private message to
specific people or a public announcement (e.g. "message my students" with
no other detail, and you don't already know), ask via clarify using exactly
this framing: reply with the student name(s) to send this privately to
them, or reply "skip"/"continue" (or leave it blank) to post it as a public
announcement to the whole class instead. Put whatever subject/body/course
you already have into partial_plan. On the next turn, read the user's
answer yourself the same way you read any other message — names mean
recipient_directives (below), skip/continue/empty means an announcement
(propose send_message with no recipient fields set, same as today).

PRIVATE MESSAGE TO NAMED STUDENTS: if the user names specific people —
directly, or via a reference to a group from earlier in this conversation
such as a previous fetch_students/fetch_submissions result — and you do
not already have their exact Canvas IDs, set recipient_directives: one
entry per intended recipient, each with student_reference (the user's own
words for that person, copied verbatim, never invented) and body (the
message meant for them). Copy body verbatim across every entry that shares
one message; give entries distinct body text only when the user actually
asked for different wording per person. The app resolves each
student_reference to a real Canvas ID server-side and groups identical
messages together for you — never invent or guess a numeric ID yourself,
and never fall back to a plain announcement just because you don't have the
IDs yet, that silently sends to a far larger audience than asked for.

If you already have a student's exact Canvas ID from earlier in this
conversation, you may set recipient_canvas_user_ids directly instead
(skips resolution) — but never mix a guessed ID into that list.

MESSAGING STUDENTS MISSING OR LATE ON A SUBMISSION: if the user wants to
message students missing or late on a specific assignment, use
recipient_handle (see FINDING STUDENTS MISSING OR LATE ON A SUBMISSION
above) — first propose resolve_missing_submissions (with the right
status) to get a handle, then once you have it from that turn's result,
propose send_message with recipient_handle set to that handle. Never
guess how many people are in the set or build recipient_directives from
its "sample" names.

BROADCASTING PRIVATELY TO THE WHOLE CLASS: if the user wants a private
message sent to every student — not a public announcement — set
broadcast_to_all_students: true and leave recipient_canvas_user_ids /
recipient_directives unset; the app resolves the full active roster for
you. This is also how to handle a follow-up like "actually send that
announcement as a message to everyone instead": re-propose send_message
with broadcast_to_all_students: true, dropping the announcement framing.

ANNOUNCEMENT PLUS TARGETED MESSAGES: if the user wants both a public
announcement AND a private message to specific people in the same turn,
set also_announce_to_class: true alongside recipient_directives (or
broadcast_to_all_students, or recipient_handle) — the top-level
subject/body becomes the announcement text.

This action is course-scoped like any other (see COURSE RESOLUTION above).
subject and body are both required and must be the user's actual words —
if the user hasn't told you what the message should say, use the AMBIGUITY
CHECK above and ask for it; do not invent wording or write a placeholder.
The user can ask you to revise the draft before confirming — treat that
like any other follow-up refinement.

AVAILABLE ACTIONS (only used inside proposed_action):
""" + tool_list


async def handle_chat_message(
    db: AsyncSession,
    user: User,
    message: str,
    local_course_id: int | None,
    conversation_id: int | None,
    pending_message_id: int | None = None,
    model_settings: dict | None = None,
    deferred_request_id: int | None = None,
) -> tuple[Conversation, dict, bool]:
    """Main chat handler. Two distinct flows:

    Normal turn (pending_message_id=None):
      logs user message, calls LLM, parses response, executes tool,
      logs assistant message as a new row, returns result.

    Modify turn (pending_message_id=<id>):
      same as normal, but if the result is an intent_preview, the old
      preview message is overwritten in place rather than a new row
      being appended. This keeps conversation history clean so the LLM
      sees only the latest agreed plan on subsequent turns. Modify turns
      only ever apply to write actions now — a read never produces a
      pending preview to revise.

    Action execution: write actions (create_assignment, update_assignment,
    send_message) are still gated behind intent_preview -> confirm exactly
    as before. Read actions (READ_ACTIONS) execute immediately within this
    same call — no preview, no confirm click — since they can never mutate
    Canvas state; each tracked read call is logged in tool_call_logs
    (see _run_tracked_read). fetch_submissions additionally resolves a
    missing/unverified assignment_id server-side before executing, chaining
    an internal fetch_assignments call and a small dedicated LLM call when
    needed (see _run_fetch_submissions_chain) — still all within this one
    request, so a question like "show me submissions for the latest
    assignment" never needs a second user turn.

    Multi-step turns: an ordinary single read (fetch_assignments,
    fetch_students, ...) still terminates the turn on its own first
    result, exactly as always. But a _CHAINABLE_READ_ACTIONS result
    (resolve_missing_submissions, find_assignment_by_submission_rate) is
    fed back for another LLM decision within the SAME turn — see the step
    loop below — bounded by MAX_TURN_STEPS, so e.g. "message students
    missing assignment 4" can resolve the recipient set AND propose the
    send_message in one turn instead of needing a follow-up message. Once
    genuinely mid-chain (past the first step), any further read continues
    the same way. A modify turn never enters this loop at all — revising
    an already-proposed write is a single edit, not a multi-step plan.

    Course resolution: local_course_id here is only ever an explicit
    client-supplied value (the "set active course" button). Every other
    way a course enters this turn — the user naming one in the message,
    or answering a clarify question — is resolved by the LLM itself
    (COURSE RESOLUTION in build_system_prompt) against real course names,
    never a numeric ID; the app matches that name back to a real course
    only after the LLM call returns (see below).

    Course data (canvas_course_names) is never fetched from Canvas live,
    in-band, as part of handling a message — this turn only ever reads
    it. Keeping it fresh is a decoupled background concern: a periodic
    sweep (see app.main's lifespan) and a refresh right after a
    successful write (handle_confirmed_action) — both live in
    app.services.canvas. A chat turn is a pure local-DB read for course
    names, so a slow/broken Canvas connection can never fail a chat
    request that doesn't even need fresh course data."""

    conversation = await get_or_create_conversation(db, user, conversation_id, local_course_id)
    user_msg = await log_message(db, conversation, role="user", content=message)
    course_names = await _get_course_names_for_user(db, user)
    history = await _get_recent_messages(db, conversation.id)

    # Instructors choose a connected provider/model. Credentials are resolved
    # server-side from stored instructor keys or deployment secrets.
    try:
        llm_config = await get_active_llm_config(db)
        selected_provider, selected_model, adapter_settings = (
            await resolve_instructor_llm_request(
                db,
                user.id,
                llm_config.provider,
                llm_config.model,
                model_settings,
            )
        )
        primary = (
            selected_provider,
            get_llm_adapter(adapter_settings),
        )
        fallback = None
        if (
            llm_config.fallback_provider
            and llm_config.fallback_model
            and llm_config.fallback_provider != selected_provider
        ):
            try:
                fallback_provider, _, fallback_settings = (
                    await resolve_instructor_llm_request(
                        db,
                        user.id,
                        llm_config.fallback_provider,
                        llm_config.fallback_model,
                        None,
                    )
                )
                fallback = (
                    fallback_provider,
                    get_llm_adapter(fallback_settings),
                )
            except ValueError:
                fallback = None
        adapter = ObservableAdapter(primary, fallback)
    except (KeyError, ValueError) as e:
        provider_error = safe_exception_text(e)
        await record_failed_operation(
            db,
            source="ai",
            operation="assistant_chat",
            error_detail=provider_error,
            user_id=user.id,
            conversation_id=conversation.id,
        )
        await log_message(
            db,
            conversation,
            role="assistant",
            content=f"LLM provider error: {provider_error}",
        )
        await db.commit()
        # build_adapter_settings/get_llm_adapter raise plain, hand-written
        # messages (e.g. "OpenAI rejected your saved API key. Reconnect it in
        # Settings.") with no secrets in them, so show the instructor the
        # actual reason instead of a one-size-fits-all "not connected" line.
        user_facing_error = redact_secrets(str(e)).strip() or (
            "That AI model is not connected. Connect it in Settings and try again."
        )
        return conversation, {"error": user_facing_error}, True

    if pending_message_id is None and local_course_id is None:
        selected_course = _resolve_course_context_statement(course_names, message)
        if selected_course is not None and selected_course.local_course_id is not None:
            if conversation.course_id is None:
                conversation.course_id = selected_course.local_course_id
                conversation.course_name = await _stable_course_name(
                    db, selected_course.local_course_id, selected_course.name
                )
            elif selected_course.local_course_id != conversation.course_id:
                target = await _find_or_fork_conversation_for_course(
                    db, user, selected_course.local_course_id, selected_course.name
                )
                user_msg.conversation_id = target.id
                conversation = target
            history = await _get_recent_messages(db, conversation.id)
            await log_message(
                db,
                conversation,
                role="assistant",
                content=json.dumps(
                    {
                        "action": "respond",
                        "message": f"Using {conversation.course_name} for this chat.",
                    }
                ),
            )
            await db.commit()
            return conversation, {
                "action": "respond",
                "message": f"Using {conversation.course_name} for this chat.",
            }, False

    # Pre-resolve a course switch from the raw message alone, before the
    # main prompt is built for this turn — see _resolve_course_switch's
    # docstring for why this has to happen here, not after the main LLM
    # call. Gated on actually having prior history, not just
    # conversation.course_id being set: a conversation's first-ever turn
    # can already have course_id set (seeded from the "set active course"
    # button or the persisted UserPreference fallback — see
    # get_or_create_conversation) with nothing yet said in it, so there is
    # no stale framing/history to leak and nothing worth paying an extra
    # call for. Also skipped for a modify turn (pending_message_id set —
    # that's revising an existing proposed action tied to this
    # conversation, not a fresh request). Also skipped when local_course_id
    # is explicitly given (the "set active course" button, sent alongside
    # this same message) — that explicit selection is a stronger,
    # deliberate signal than a course name the message happens to mention,
    # and wins outright for this turn rather than being silently
    # overridden by this resolver.
    if (
        pending_message_id is None
        and local_course_id is None
        and conversation.course_id is not None
        and history
    ):
        switched = await _resolve_course_switch(course_names, conversation.course_name, message, adapter)
        if (
            switched is not None
            and switched.local_course_id is not None
            and switched.local_course_id != conversation.course_id
        ):
            target = await _find_or_fork_conversation_for_course(
                db, user, switched.local_course_id, switched.name
            )
            user_msg.conversation_id = target.id
            conversation = target
            history = await _get_recent_messages(db, conversation.id)

    stored_preview = None
    current_proposed_action = None
    if pending_message_id is not None:
        stored_preview = await _load_stored_intent_preview(
            db, conversation.id, pending_message_id
        )
        if stored_preview:
            current_proposed_action = stored_preview.get("proposed_action")

    system_prompt = build_system_prompt(has_canvas_token=bool(user.canvas_connections))
    field_memory_block = format_field_memory_for_prompt(conversation.field_memory)
    if field_memory_block:
        system_prompt = f"{system_prompt}\n\n{field_memory_block}"
    first_llm_message = _build_llm_message(
        message,
        course_names,
        conversation.course_name,
        current_proposed_action,
        [],
    )
    cache_key: str | None = None
    cached_raw_output: str | None = None
    if llm_config.cache_enabled and is_safe_cache_candidate(
        message,
        has_history=bool(history),
        local_course_id=local_course_id,
        conversation_course_id=conversation.course_id,
        pending_message_id=pending_message_id,
    ):
        cache_key = build_cache_key(
            user_id=user.id,
            provider=selected_provider,
            model=selected_model,
            system_prompt=system_prompt,
            llm_message=first_llm_message,
        )
        cached_raw_output = await get_cached_response(
            db,
            cache_key=cache_key,
            user_id=user.id,
        )

    # Step loop: lets the model chain a bounded sequence of read/resolver
    # decisions within this ONE user turn, instead of every read
    # terminating the turn immediately. Only a _CHAINABLE_READ_ACTIONS
    # result (or, once already mid-chain at step > 1, any read result)
    # continues the loop — an ordinary single read at step 1 (e.g. "show
    # me my assignments") breaks immediately below exactly as it always
    # has, so every existing single-step/two-step (chain) case is
    # unaffected: this is a strict superset of prior behavior, not a
    # replacement for it. A modify turn (pending_message_id set) never
    # loops at all — is_chainable_step is unconditionally False for one —
    # since revising an already-proposed write is a single edit, not a
    # multi-step plan. loop_steps accumulates each step's result so later
    # steps' prompts (_build_llm_message) can see everything gathered so
    # far in this same turn, distinct from `history` (prior turns only).
    loop_steps: list[dict] = []
    result: dict = {}

    for step in range(1, MAX_TURN_STEPS + 1):
        try:
            if step == 1 and cached_raw_output is not None:
                raw_output = cached_raw_output
            else:
                llm_message = (
                    first_llm_message
                    if step == 1
                    else _build_llm_message(
                        message,
                        course_names,
                        conversation.course_name,
                        current_proposed_action,
                        loop_steps,
                    )
                )
                raw_output = await asyncio.wait_for(
                    adapter.generate(
                        system_prompt,
                        llm_message,
                        history=history,
                        timeout=LLM_TIMEOUT_SECONDS,
                    ),
                    timeout=LLM_TIMEOUT_SECONDS,
                )
        except TimeoutError:
            log_detail = f"LLM request timed out after {LLM_TIMEOUT_SECONDS}s"
            await record_failed_operation(
                db,
                source="ai",
                operation="assistant_chat",
                error_detail=log_detail,
                user_id=user.id,
                conversation_id=conversation.id,
                provider=selected_provider,
            )
            await log_message(db, conversation, role="assistant", content=log_detail)
            await db.commit()
            return (
                conversation,
                {"error": "The assistant took too long to respond. Please try again."},
                True,
            )
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                log_detail = "LLM provider rate limit hit"
                user_message = "The assistant is temporarily rate-limited. Please wait a moment and try again."
            else:
                log_detail = f"LLM API error: {e.response.status_code}"
                user_message = "The assistant service returned an error. Please try again shortly."
            await record_failed_operation(
                db,
                source="ai",
                operation="assistant_chat",
                error_detail=log_detail,
                user_id=user.id,
                conversation_id=conversation.id,
                provider=selected_provider,
            )
            await log_message(db, conversation, role="assistant", content=log_detail)
            await db.commit()
            return conversation, {"error": user_message}, True
        except Exception as e:
            log_detail = f"LLM request failed: {safe_exception_text(e)}"
            await record_failed_operation(
                db,
                source="ai",
                operation="assistant_chat",
                error_detail=log_detail,
                user_id=user.id,
                conversation_id=conversation.id,
                provider=selected_provider,
            )
            await log_message(db, conversation, role="assistant", content=log_detail)
            await db.commit()
            return (
                conversation,
                {"error": "The assistant is currently unavailable. Please try again shortly."},
                True,
            )

        # Course resolution: pull the model's own course_name call-out out of
        # the raw response (same <think>-stripping + brace-scanning helper
        # dispatcher.py's parse_action uses, so this works uniformly whether
        # the model answered with clarify/intent_preview/a raw action, or
        # plain prose with no JSON at all — in which case there's nothing to
        # extract and course_name_from_llm stays None). This never touches an
        # ID: it matches the model's name against canvas_course_names and
        # only reads the local_course_id that lookup already carries.
        try:
            parsed_envelope = json.loads(extract_json_object(raw_output))
        except json.JSONDecodeError:
            parsed_envelope = None
        # Read the model's course_name from the envelope — or, if it wrapped a
        # course-scoped action inside intent_preview (against instructions),
        # from the nested proposed_action, where the name actually lives.
        # Without this second lookup a wrapped action's course never resolves
        # and the turn falls back to a spurious "Which course?" clarify even
        # though the model named it.
        course_name_from_llm = None
        if isinstance(parsed_envelope, dict):
            course_name_from_llm = parsed_envelope.get("course_name")
            if course_name_from_llm is None and parsed_envelope.get("action") == "intent_preview":
                nested = parsed_envelope.get("proposed_action")
                if isinstance(nested, dict):
                    course_name_from_llm = nested.get("course_name")

        resolved_local_course_id = conversation.course_id
        # Fallback: if the conversation has no course_id yet (e.g. a fresh
        # conversation seeded from the active-course preference but not yet
        # resolved), try the user's active course preference before giving
        # up. Without this, a resolve_missing_submissions action with
        # course_name that doesn't exactly match canvas_course_names would
        # fail validation on a required local_course_id (#1310).
        if resolved_local_course_id is None:
            active = await get_active_course(user, db)
            if active is not None:
                resolved_local_course_id = active.local_id
        matched = _match_course_name(course_names, course_name_from_llm)
        if matched is not None:
            matched_local_course_id = matched.local_course_id
            if matched_local_course_id is None:
                # Defensive fallback — shouldn't happen, sync_courses_if_stale
                # always populates this from the Course row it upserts in the
                # same transaction, but don't let a null here silently break
                # course resolution.
                matched_local_course_id = await db.scalar(
                    select(Course.id).where(
                        Course.canvas_course_id == matched.canvas_course_id,
                        Course.instructor_id == user.id,
                    )
                )
            if matched_local_course_id is not None:
                if conversation.course_id is None or not history:
                    # This conversation's first course resolution, OR a
                    # preference-seeded new conversation
                    # (get_or_create_conversation) that hasn't accumulated
                    # any real prior-turn history yet — either way there's
                    # nothing to preserve by forking, so mutate in place.
                    # Without the `not history` half: a brand-new
                    # conversation gets course_id seeded from the user's
                    # active-course preference immediately, even before
                    # anything is said in it; if its first message then
                    # named a DIFFERENT course, the fork below would
                    # re-parent that only message away, leaving the
                    # preference-seeded conversation permanently empty and
                    # orphaned.
                    if (
                        conversation.course_id is not None
                        and conversation.course_id != matched_local_course_id
                    ):
                        # Switching a preference-seeded conversation to a
                        # different course before any history — clear
                        # course-scoped field memory so stale IDs from the
                        # seeded course don't leak into the new one (#1306).
                        clear_course_scoped_field_memory(conversation)
                    conversation.course_id = matched_local_course_id
                    conversation.course_name = matched.name
                    resolved_local_course_id = matched_local_course_id
                elif (
                    pending_message_id is None
                    and local_course_id is None
                    and matched_local_course_id != conversation.course_id
                ):
                    # Switching away from a course this conversation
                    # already had, with real prior activity — route to a
                    # different conversation (reused or forked) instead of
                    # mutating this one, and re-parent this turn's user
                    # message onto it.
                    #
                    # Never on a modify turn (pending_message_id set):
                    # update_message_content further below looks that
                    # message up scoped to conversation.id, so forking
                    # here would silently break "revise this pending
                    # action" — the message no longer exists in the new
                    # conversation.id, raising an unhandled
                    # ToolExecutionError instead of applying the revision.
                    #
                    # Never when the client just explicitly set the active
                    # course this same turn either (local_course_id set,
                    # the "set active course" button) — an explicit click
                    # is a stronger, more deliberate signal than a course
                    # name the model merely echoed from message text, and
                    # wins outright rather than being silently overridden.
                    target = await _find_or_fork_conversation_for_course(
                        db, user, matched_local_course_id, matched.name
                    )
                    user_msg.conversation_id = target.id
                    conversation = target
                    history = await _get_recent_messages(db, conversation.id)
                    resolved_local_course_id = matched_local_course_id
                # else: either the model just confirmed the conversation's
                # own course (nothing to do), or one of the guards above
                # blocked a would-be switch — resolved_local_course_id
                # stays pinned to conversation.course_id (its default,
                # set above) either way.

        # Inject the resolved course id (or downgrade to a clarify envelope)
        # directly into the parsed JSON, before parse_action's strict schema
        # validation ever sees it — see _inject_course_into_envelope. Only
        # when parsing succeeded as a dict; a plain-text/malformed reply has
        # nothing to inject into and falls through to the existing
        # _plain_text_response/parse_action handling on the original raw_output.
        if isinstance(parsed_envelope, dict):
            parsed_envelope = _inject_course_into_envelope(parsed_envelope, resolved_local_course_id)
            raw_output = json.dumps(parsed_envelope)

        try:
            action, text_reply, raw_output = await _parse_model_action_with_recovery(
                adapter=adapter,
                system_prompt=system_prompt,
                llm_message=(
                    first_llm_message
                    if step == 1
                    else _build_llm_message(
                        message,
                        course_names,
                        conversation.course_name,
                        current_proposed_action,
                        loop_steps,
                    )
                ),
                history=history,
                raw_output=raw_output,
                resolved_local_course_id=resolved_local_course_id,
            )
            if text_reply is not None:
                result = text_reply
                break
            if action is None:
                # Defensive: _parse_model_action_with_recovery should always
                # return one of (action, text_reply), but if a future change
                # breaks that invariant, degrade to a safe respond instead
                # of crashing with an AssertionError.
                result = {
                    "action": "respond",
                    "message": _MALFORMED_ACTION_DEGRADE_MESSAGE,
                }
                break
            needs_unwrap = False
            if action.action == "intent_preview":
                proposed = action.proposed_action
                proposed_name = proposed.get("action")
                needs_unwrap = proposed_name in READ_ACTIONS or (
                    proposed_name == "send_message"
                    and bool(
                        proposed.get("recipient_directives")
                        or proposed.get("broadcast_to_all_students")
                        or proposed.get("recipient_handle")
                    )
                ) or proposed_name in ("update_assignment", "update_grade")
            if needs_unwrap:
                # Defensive: the model wrapped a read, a send_message that
                # still needs server-side recipient resolution, or an
                # update_assignment that still needs server-side
                # assignment resolution, in intent_preview despite the
                # system prompt saying not to — each produces its own
                # intent_preview internally (a read never does at all; a
                # directive-/handle-bearing send_message and a
                # reference-bearing update_assignment/update_grade do, via their own
                # chains below) — so unwrap and dispatch directly instead
                # of showing a pointless double preview.
                action = parse_action(json.dumps(action.proposed_action))

            limited_reply = await _defer_canvas_limited_mode_reply(
                db,
                user=user,
                conversation=conversation,
                message=message,
                action=action,
            )
            if limited_reply is not None:
                return conversation, limited_reply, True

            if action.action == "fetch_submissions":
                # Needs a real Canvas assignment_id, which the model is
                # never allowed to invent — resolve it server-side (chains
                # an internal fetch_assignments call when needed) rather
                # than executing directly.
                result = await _run_fetch_submissions_chain(
                    db, user, conversation, user_msg, action, message, adapter
                )
            elif action.action == "resolve_missing_submissions":
                # Same assignment-resolution need as fetch_submissions,
                # plus server-side filtering down to a compact
                # {count, sample, handle} summary — never the raw list.
                result = await _run_resolve_missing_submissions_chain(
                    db, user, conversation, user_msg, action, message, adapter
                )
            elif action.action == "analyze_course_submissions":
                # Course-wide overview across every assignment — the read
                # that the dashboard's analysis button previously had no
                # tool for, which is why the model used to invent
                # submission rates instead of fetching them (#12).
                result = await _run_analyze_course_submissions_chain(
                    db, user, conversation, user_msg, action
                )
            elif action.action == "find_assignment_by_submission_rate":
                # Scans every assignment's real submission data server-side
                # to resolve a single assignment by a computed criterion
                # (e.g. "fewer than 30% submitted") — never trusts the
                # model's own judgment over raw data it was never shown.
                result = await _run_find_assignment_by_submission_rate_chain(
                    db, user, conversation, user_msg, action, message
                )
            elif action.action == "update_assignment":
                # Always route through the resolver chain — even when the
                # model provides assignment_id directly, _resolve_course_and_assignment
                # verifies it against this course's synced assignments and
                # re-resolves if it's hallucinated, stale, or belongs to a
                # different course. Never trust a bare ID from the model.
                result = await _run_update_assignment_chain(
                    db, user, conversation, user_msg, action, message, adapter
                )
            elif action.action == "update_grade":
                # Always route through _resolve_grade_target — it fetches
                # real submissions and validates assignment_id and
                # student_id against them, so a hallucinated or stale ID
                # is caught and re-resolved instead of passing through to
                # a preview with unverified targets.
                result = await _resolve_grade_target(
                    db, user, conversation, user_msg, action, message, adapter
                )
            elif action.action == "send_message" and (
                action.recipient_directives or action.broadcast_to_all_students or action.recipient_handle
            ):
                # Named recipients without known Canvas IDs, a whole-roster
                # private broadcast, or a server-computed recipient handle
                # from an earlier resolve_missing_submissions turn —
                # resolve server-side (never trust the model with a raw
                # ID) and build one preview per distinct message group,
                # rather than executing directly or auto-wrapping into a
                # single intent_preview.
                result = await _run_send_message_chain(
                    db, user, conversation, user_msg, action, message, pending_message_id, adapter
                )
            elif action.action in READ_ACTIONS:
                # Every other read executes immediately — no preview, no
                # confirm click, nothing to review before a call that can
                # never mutate Canvas state. get_active_course is a local
                # UserPreference read with no Canvas call and nothing that
                # can meaningfully fail, so it's the one read left
                # untracked (see _run_tracked_read's docstring).
                if action.action == "get_active_course":
                    result = await execute_tool(db, user, action)
                else:
                    result = await _run_tracked_read(
                        db, user, conversation, user_msg.id, action.action,
                        action.model_dump(), execute_tool(db, user, action),
                    )
            elif action.action not in NORMAL_TURN_ALLOWED_ACTIONS:
                # The model named a write action directly instead of
                # wrapping it in intent_preview like the system prompt
                # asks. Not every model follows that instruction reliably
                # (smaller local models especially). Auto-wrapping into a
                # real intent_preview here, rather than rejecting outright,
                # gives the user the same confirmation step they should
                # have gotten without losing the turn to an error message.
                action = IntentPreviewAction(
                    summary=f"I'll {action.action.replace('_', ' ')} as described below. Please review before confirming.",
                    proposed_action=action.model_dump(),
                )
                result = await execute_tool(db, user, action)
            else:
                result = await execute_tool(db, user, action)

            # #1302: persist resolved assignment/student refs from successful reads
            # so later turns can reuse "the first assignment" without re-asking.
            if (
                action.action in READ_ACTIONS
                and isinstance(result, dict)
                and not result.get("clarify")
                and not result.get("error")
            ):
                merge_read_result_into_field_memory(
                    conversation,
                    action.model_dump(),
                    result,
                )
        except ToolExecutionError as e:
            await log_message(
                db, conversation, role="assistant", content=redact_secrets(e.log_detail)
            )
            await db.commit()
            return conversation, {"error": e.user_message}, True
        except CanvasTokenRequiredError as e:
            await log_message(
                db, conversation, role="assistant", content=redact_secrets(str(e.detail))
            )
            await db.commit()
            return conversation, {"error": CANVAS_TOKEN_REQUIRED_MESSAGE, "requires_canvas_token": True}, True
        except HTTPException as e:
            detail = e.detail if isinstance(e.detail, str) else str(e.detail)
            error_detail = redact_secrets(f"HTTPException {e.status_code}: {detail}")
            await log_message(db, conversation, role="assistant", content=error_detail)
            await db.commit()
            return conversation, {"error": detail}, True

        # A clarify result is always terminal regardless of action name —
        # it means the model needs the USER to answer something, so
        # calling the LLM again immediately would be pointless. Otherwise,
        # a _CHAINABLE_READ_ACTIONS result always continues (that's the
        # entire point of those actions — see MAX_TURN_STEPS' docstring);
        # any other read only continues once already mid-chain (step > 1),
        # so a lone ordinary read at step 1 is untouched from before this
        # loop existed.
        is_chainable_step = (
            pending_message_id is None
            and action.action in READ_ACTIONS
            and not result.get("clarify")
            and (action.action in _CHAINABLE_READ_ACTIONS or step > 1)
        )
        if not is_chainable_step:
            break
        loop_steps.append({"action": action.action, "result": result})
        if step >= MAX_TURN_STEPS:
            result = _step_budget_exhausted_response(loop_steps)
            break

    # Feature 13 (#855 / #856) + #1303: strip Canvas ID / grade / title claims
    # that were never present in this-turn tool payloads or prior tool-derived
    # grounded_facts accumulated on the conversation.
    tool_payloads = [step["result"] for step in loop_steps]
    if result.get("action") not in {
        "respond",
        "clarify",
        "out_of_scope",
        "intent_preview",
    }:
        tool_payloads.append(result)
    result, new_tool_facts = ground_assistant_result(
        result,
        tool_results=tool_payloads,
        field_memory=conversation.field_memory,
    )
    merge_grounded_facts_into_memory(
        conversation,
        ids=new_tool_facts.ids,
        names=new_tool_facts.names,
        grades=new_tool_facts.grades,
        dates=new_tool_facts.dates,
    )

    # Only terminal conversational responses are cacheable. Canvas reads,
    # writes, previews, clarification flows, and multi-step turns always bypass
    # storage even if their initial wording looked harmless.
    if (
        cache_key
        and cached_raw_output is None
        and result.get("action") == "respond"
        and not loop_steps
        and is_safe_cache_response(raw_output)
    ):
        await store_cached_response(
            db,
            user_id=user.id,
            cache_key=cache_key,
            provider=adapter.last_provider,
            model=adapter.last_model or selected_model,
            response=raw_output,
            ttl_seconds=llm_config.cache_ttl_seconds,
        )

    # Log the assistant result — if this is a modify turn superseding a
    # previous intent_preview, overwrite that message in place rather than
    # appending a new row, so the LLM's next turn sees only the updated plan.
    # Before overwriting, snapshot the version being replaced (already
    # loaded above as stored_preview, to build the modify context) onto
    # the new result as previous_*, so the client can show a one-step diff
    # (current vs. the immediately preceding revision only — anything
    # older than that was already discarded the same way on the prior
    # modify round).
    if result.get("intent_preview") and pending_message_id:
        if stored_preview:
            result["previous_proposed_action"] = stored_preview.get("proposed_action")
            result["previous_summary"] = stored_preview.get("summary")

        assistant_msg = await update_message_content(
            db, conversation.id, pending_message_id, _json_dumps(result)
        )
    else:
        assistant_msg = await log_message(
            db, conversation, role="assistant", content=_json_dumps(result)
        )

    if result.get("intent_preview"):
        proposed_action = result.get("proposed_action", {})
        merge_field_memory(conversation, proposed_action)
        # Form-handoff actions redirect to dedicated UIs that record audit on
        # approve — skip creating a pending Workflow here.
        if proposed_action.get("action") not in {
            "create_quiz",
            "send_message",
            "update_grade",
        }:
            preview_metadata = result.get("preview_metadata") or {}
            await _sync_workflow_for_preview(
                db, conversation, user,
                source_user_message_id=user_msg.id,
                pending_message_id=pending_message_id,
                preview_message_id=assistant_msg.id,
                user_prompt=message,
                proposed_action=proposed_action,
                affected_resources=preview_metadata.get("affected_resources", []),
            )
    else:
        if result.get("action") == "clarify":
            # Use _PARTIAL_PLAN_SAFE_KEYS so raw Canvas IDs (assignment_id,
            # student_id) from the LLM's parsed action are NOT persisted —
            # they may be hallucinated. Only reference strings and non-ID
            # fields are carried forward; the resolver chains re-resolve
            # IDs server-side on the next turn (see #1305).
            merge_field_memory(
                conversation,
                result.get("partial_plan"),
                allowed_keys=_PARTIAL_PLAN_SAFE_KEYS,
            )
        await _supersede_pending_workflow(
            db,
            conversation.id,
            pending_message_id,
        )

    # A grouped send_message turn (_run_send_message_chain) may have
    # resolved to more than one distinct message — group 0 was just
    # persisted above through the ordinary single-preview path unchanged;
    # every remaining group still needs its own Message + Workflow row.
    # Only persist extras when the primary result is an intent_preview;
    # otherwise log and discard so a clarify/error path cannot silently
    # drop (or incorrectly keep) orphaned group payloads.
    extra_groups = result.pop("_extra_groups", None)
    if extra_groups:
        if result.get("intent_preview"):
            result["additional_previews"] = await _persist_additional_message_previews(
                db, conversation, extra_groups,
            )
        else:
            logger.error(
                "Discarding %s _extra_groups because primary chat result "
                "is not an intent_preview (action=%s)",
                len(extra_groups),
                result.get("action"),
            )

    # Persist the chat turn first so a deferred-status update failure cannot
    # roll back an already-generated assistant reply.
    await db.commit()

    if deferred_request_id is not None:
        try:
            await mark_deferred_request_resumed(db, user, deferred_request_id)
            await db.commit()
        except HTTPException as exc:
            await db.rollback()
            logger.warning(
                "Chat reply saved but deferred request %s was not marked resumed: %s",
                deferred_request_id,
                exc.detail,
            )

    # attach the stored message ID so the client can confirm by ID.
    # Form-handoff actions are not confirmable in chat.
    if result.get("intent_preview") and (
        result.get("proposed_action") or {}
    ).get("action") not in {"create_quiz", "send_message", "update_grade"}:
        result["pending_message_id"] = assistant_msg.id

    return conversation, result, False


async def _claim_pending_workflow(db: AsyncSession, workflow: Workflow, new_status: str) -> bool:
    """Atomically transitions a workflow from pending to new_status via a
    conditional UPDATE, not a read-then-check race — two simultaneous
    requests each run in their own DB transaction, so a plain
    SELECT-then-check would let both pass under READ COMMITTED. The
    conditional UPDATE takes a row lock instead: a concurrent duplicate
    blocks until the first transaction commits, then correctly
    re-evaluates against committed state and affects 0 rows. Returns
    whether the claim succeeded; caller must commit immediately after a
    successful claim to release the row lock before doing anything slow.
    Shared by handle_confirmed_action (pending->executing) and
    handle_cancelled_action (pending->cancelled) — same race, same fix."""
    claim = await db.execute(
        sa_update(Workflow)
        .where(Workflow.id == workflow.id, Workflow.status == "pending")
        .values(status=new_status)
    )
    if claim.rowcount > 0:
        return True
    # SQLAlchemy's default synchronize_session='evaluate' strategy re-checks
    # the bulk UPDATE's WHERE clause against workflow's in-memory attributes,
    # not the DB row — on a 0-row update it can still apply .values() to the
    # loaded object, leaving workflow.status holding the just-attempted
    # target instead of the row's real, currently-committed value. Refresh
    # just the status column (not attribute_names=None / the whole object)
    # so callers building a 409 message report what's actually true, without
    # expiring the eagerly-loaded `user` relationship some callers depend on
    # — an async lazy-load on that would fail outside a greenlet context.
    await db.refresh(workflow, attribute_names=["status"])
    return False


_EDITABLE_PREVIEW_FIELDS: dict[str, frozenset[str]] = {
    "create_assignment": frozenset(
        {"title", "description", "due_date", "points_possible"}
    ),
    "create_quiz": frozenset(
        {
            "title",
            "description",
            "due_date",
            "points_possible",
            "allowed_attempts",
            "time_limit",
            "quiz_engine",
            "questions",
            "question_bank_groups",
        }
    ),
    "update_assignment": frozenset(
        {"title", "description", "due_date", "points_possible"}
    ),
    # Feedback is represented by the message body for targeted Canvas
    # messages, so this same form covers both messages and feedback drafts.
    "send_message": frozenset({"subject", "body"}),
    "update_grade": frozenset({"new_grade", "feedback"}),
}


async def handle_modified_action(
    db: AsyncSession,
    user: User,
    conversation_id: int,
    pending_message_id: int,
    changes: dict,
) -> tuple[Conversation, dict, bool]:
    """Apply validated structured edits to a pending preview.

    Resolved Canvas identifiers are copied from the server-stored workflow
    and cannot be replaced by the client. The refreshed metadata is generated
    by the same preview builder used for the original proposal, so the form,
    in-chat card, and confirmation payload stay synchronized.
    """
    conversation = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    workflow = await db.scalar(
        select(Workflow).where(
            Workflow.preview_message_id == pending_message_id,
            Workflow.conversation_id == conversation_id,
        )
    )
    if not workflow:
        raise HTTPException(
            status_code=404, detail="Preview not found in this conversation."
        )
    if workflow.status != "pending":
        raise HTTPException(
            status_code=409,
            detail=(
                "This action is no longer pending "
                f"(status: {workflow.status}). "
                "It may already have been confirmed or cancelled "
                "in another tab."
            ),
        )

    current = dict(workflow.proposed_action or {})
    action_name = current.get("action")
    editable = _EDITABLE_PREVIEW_FIELDS.get(str(action_name))
    if not editable:
        raise HTTPException(
            status_code=422,
            detail="This action does not have editable preview fields.",
        )

    disallowed = set(changes) - editable
    if disallowed:
        raise HTTPException(
            status_code=422,
            detail=(
                "These fields cannot be edited from the preview: "
                + ", ".join(sorted(disallowed))
            ),
        )

    proposed = {**current, **changes}
    try:
        # Full schema validation prevents a form edit from producing a
        # proposal that could fail only after the instructor confirms it.
        validated_action = parse_action(_json_dumps(proposed))
        proposed = validated_action.model_dump(exclude_none=True)
    except ToolExecutionError as exc:
        raise HTTPException(status_code=422, detail=exc.user_message) from exc

    local_course_id = proposed.get("local_course_id")
    if local_course_id is None:
        raise HTTPException(status_code=422, detail="The preview has no course.")
    try:
        course = await resolve_course(db, user, int(local_course_id))
    except ToolExecutionError as exc:
        raise HTTPException(status_code=422, detail=exc.user_message) from exc

    if action_name == "create_quiz":
        await validate_quiz_for_create(
            int(local_course_id),
            user,
            str(proposed.get("title") or ""),
            str(proposed.get("description") or ""),
            proposed.get("due_date"),
            proposed.get("points_possible"),
            db,
            allowed_attempts=proposed.get("allowed_attempts"),
            time_limit=proposed.get("time_limit"),
            questions=proposed.get("questions"),
            quiz_engine=str(proposed.get("quiz_engine") or "classic"),
            question_bank_groups=proposed.get("question_bank_groups"),
        )

    preview_metadata = generate_write_preview(proposed, course)
    result = {
        "action": "intent_preview",
        "intent_preview": True,
        "summary": preview_metadata["summary"],
        "proposed_action": proposed,
        "preview_metadata": preview_metadata,
        "previous_proposed_action": current,
    }
    await update_message_content(
        db, conversation.id, pending_message_id, _json_dumps(result)
    )
    workflow.proposed_action = proposed
    workflow.user_prompt = "Edited in review form"
    workflow.affected_resources = preview_metadata.get("affected_resources", [])
    workflow.error_detail = None
    await db.commit()
    result["pending_message_id"] = pending_message_id
    return conversation, result, False


async def handle_confirmed_action(
    db: AsyncSession,
    user: User,
    conversation_id: int,
    pending_message_id: int,
) -> tuple[Conversation, dict, bool]:
    """Executes the action stored in a previous intent_preview message.
    The client confirms by message ID only — it cannot redefine what
    action gets executed. The server loads the proposed_action from its
    own Workflow record, verifying ownership and that the workflow is
    still pending, before executing anything.

    Replay safety: the pending->executing transition is an atomic
    conditional UPDATE (`WHERE status='pending'`), not a Python-side
    read-then-check — two simultaneous confirm requests each run in
    their own DB transaction, so a plain SELECT-then-check race would let
    both pass under READ COMMITTED. The conditional UPDATE takes a row
    lock instead: a concurrent duplicate blocks until the first
    transaction commits, then correctly re-evaluates against committed
    state and affects 0 rows. Committing immediately after (rather than
    holding the lock through the Canvas call) means a concurrent
    duplicate gets an instant 409 instead of hanging.

    This is PATH B in the dispatcher's two-path architecture: by the
    time execute_tool is called here, the user has already confirmed,
    so write action cases call Canvas directly without generating another
    preview."""

    conversation = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    workflow = await db.scalar(
        select(Workflow).where(
            Workflow.preview_message_id == pending_message_id,
            Workflow.conversation_id == conversation_id,
        )
    )
    if not workflow:
        raise HTTPException(
            status_code=404,
            detail="Preview not found in this conversation.",
        )

    if not await _claim_pending_workflow(db, workflow, "executing"):
        raise HTTPException(
            status_code=409,
            detail=(
                "This action is no longer pending "
                f"(status: {workflow.status}). "
                "It may already have been confirmed or cancelled "
                "in another tab."
            ),
        )
    await db.commit()
    workflow.status = "executing"

    # reload user with relationships eagerly loaded for this db session —
    # the user object from get_current_user may have canvas_connections
    # loaded in a different session context, causing greenlet errors when
    # execute_tool accesses them during async execution
    from sqlalchemy import select as sa_select
    user = await db.scalar(
        sa_select(User)
        .where(User.id == user.id)
        .options(selectinload(User.canvas_connections))
    )

    await log_message(db, conversation, role="user", content="[confirmed action]")

    try:
        action = parse_action(json.dumps(workflow.proposed_action))
        if not user_has_canvas_credentials(user) and classify_action_for_limited_mode(
            action.action,
            action.proposed_action if isinstance(getattr(action, "proposed_action", None), dict) else None,
        ) == "block":
            # Preserve the pending preview so confirm can resume after Canvas
            # is connected (issue #1245).
            workflow.status = "pending"
            reply = {
                "error": CANVAS_TOKEN_REQUIRED_MESSAGE,
                "requires_canvas_token": True,
                "limited_mode": True,
                "pending_message_id": pending_message_id,
            }
            await log_message(
                db, conversation, role="assistant", content=json.dumps(reply)
            )
            await db.commit()
            return conversation, reply, True
        result = await execute_tool(
            db, user, action, exclude_workflow_id=workflow.id
        )
        merge_field_memory(
            conversation,
            workflow.proposed_action if isinstance(workflow.proposed_action, dict) else None,
        )
    except ToolExecutionError as e:
        safe_detail = redact_secrets(e.log_detail)
        if not (
            _is_expected_canvas_reconnect_failure(e) or _is_transient_canvas_outage(e)
        ):
            await record_failed_operation(
                db,
                source="canvas",
                operation=workflow.action_name,
                error_detail=safe_detail,
                user_id=user.id,
                course_id=workflow.course_id,
                conversation_id=conversation.id,
                workflow_id=workflow.id,
            )
        await log_message(db, conversation, role="assistant", content=safe_detail)
        workflow.status = "failed"
        workflow.error_detail = safe_detail
        await db.commit()
        return conversation, {"error": e.user_message}, True
    except CanvasTokenRequiredError as e:
        # Expected reconnect state — surface in chat, do not flood monitoring.
        safe_detail = redact_secrets(str(e.detail))
        await log_message(db, conversation, role="assistant", content=safe_detail)
        workflow.status = "failed"
        workflow.error_detail = safe_detail
        await db.commit()
        return conversation, {"error": CANVAS_TOKEN_REQUIRED_MESSAGE, "requires_canvas_token": True}, True
    except HTTPException as e:
        # Semantic validators (e.g. validate_assignment_for_create) and
        # services/canvas.py raise HTTPException directly rather than
        # ToolExecutionError. Left uncaught, this propagates past
        # ChatResponse and the client gets a bare {"detail": ...} body
        # with no "reply" key. Fold it into the same error-reply shape
        # so the user actually sees why the confirmed action failed.
        detail = e.detail if isinstance(e.detail, str) else str(e.detail)
        error_detail = redact_secrets(f"HTTPException {e.status_code}: {detail}")
        if not (
            _is_expected_canvas_reconnect_failure(e) or _is_transient_canvas_outage(e)
        ):
            await record_failed_operation(
                db,
                source="canvas",
                operation=workflow.action_name,
                error_detail=error_detail,
                user_id=user.id,
                course_id=workflow.course_id,
                conversation_id=conversation.id,
                workflow_id=workflow.id,
            )
        await log_message(db, conversation, role="assistant", content=error_detail)
        workflow.status = "failed"
        workflow.error_detail = error_detail
        await db.commit()
        return conversation, {"error": detail}, True

    result_msg = await log_message(
        db, conversation, role="assistant", content=_json_dumps(result)
    )
    workflow.status = "executed"
    workflow.executed_at = datetime.now(UTC)
    workflow.result_message_id = result_msg.id
    if result.get("affected_resources"):
        workflow.affected_resources = result["affected_resources"]

    # AuditLog is only ever about actual Canvas mutations — read actions
    # (e.g. fetch_courses) now get Workflow rows too (see
    # _sync_workflow_for_preview), but must NOT get an audit row: their
    # action_name isn't in _AUDIT_RESOURCE_MAP and would violate
    # audit_logs' resource_type/operation CHECK constraints if written.
    await record_write_audit(db, user, workflow, result)

    await db.commit()

    # Opportunistic course-name refresh: a write just happened, so this is
    # a natural moment to also refresh canvas_course_names for the
    # connection it touched (the other trigger is the periodic sweep in
    # app.main's lifespan — chat turns themselves never call Canvas for
    # this, see handle_chat_message). Best-effort, and run in an ISOLATED
    # session — never the shared `db` this function returns objects from
    # (mirrors run_course_sync_sweep's own fix for the identical bug, see
    # its docstring in services/canvas.py). AsyncSession.rollback() always
    # expires every object already loaded in that session, not just the
    # ones touched by the failed operation, regardless of
    # expire_on_commit. Rolling back the shared `db` here would expire
    # `conversation` right before this function returns it, and the
    # caller's very next plain attribute read (routers/chat.py's
    # `conversation.id`) would raise MissingGreenlet — turning an
    # already-successful confirmed write into a 500.
    if workflow.action_name in WRITE_ACTIONS and workflow.course_id is not None:
        async with AsyncSessionLocal() as sync_db:
            course = await sync_db.scalar(select(Course).where(Course.id == workflow.course_id))
            sync_user = await sync_db.scalar(
                select(User).where(User.id == user.id).options(selectinload(User.canvas_connections))
            )
            if course is not None and sync_user is not None:
                connection = next(
                    (c for c in sync_user.canvas_connections if canvas_urls_equivalent(c.canvas_url, course.canvas_url)),
                    None,
                )
                if connection is not None:
                    try:
                        did_sync = await sync_courses_if_stale(
                            sync_user, connection, sync_db
                        )
                        # Same clearing rule as run_course_sync_sweep /
                        # set_active_course — a successful real sync should
                        # drop a stale last_sync_error so Troubleshooting
                        # stops listing this instructor as failing.
                        if did_sync:
                            previous_error = await sync_db.scalar(
                                select(CanvasConnection.last_sync_error).where(
                                    CanvasConnection.id == connection.id
                                )
                            )
                            if previous_error is not None:
                                await sync_db.execute(
                                    sa_update(CanvasConnection)
                                    .where(CanvasConnection.id == connection.id)
                                    .values(last_sync_error=None)
                                )
                                await sync_db.commit()
                    except Exception:
                        logger.warning(
                            "post-write sync_courses_if_stale failed for canvas_connection_id=%s user_id=%s",
                            connection.id, user.id, exc_info=True,
                        )
                        await sync_db.rollback()

    return conversation, result, False


async def handle_cancelled_action(
    db: AsyncSession,
    user: User,
    conversation_id: int,
    pending_message_id: int,
) -> tuple[Conversation, dict, bool]:
    """Cancels the action stored in a previous intent_preview message.
    Mirrors handle_confirmed_action's load/verify steps, but never calls
    execute_tool — cancelling never touches Canvas, only the Workflow's
    status. Uses the same atomic claim as confirm (pending->cancelled
    instead of pending->executing), which means a second cancel attempt,
    or a confirm attempt after a cancel, both 409 for the identical
    structural reason: only one pending->X transition can ever win.

    Deliberately does NOT overwrite the preview Message's content (unlike
    the "modify" flow) — messages stays the immutable transcript of what
    was proposed, Workflow.status is the mutable state layer that actually
    blocks re-use. Blurring that line again is exactly what the
    Workflow/AuditLog redesign was for."""

    conversation = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    workflow = await db.scalar(
        select(Workflow).where(
            Workflow.preview_message_id == pending_message_id,
            Workflow.conversation_id == conversation_id,
        )
    )
    if not workflow:
        raise HTTPException(
            status_code=404,
            detail="Preview not found in this conversation.",
        )

    if not await _claim_pending_workflow(db, workflow, "cancelled"):
        raise HTTPException(
            status_code=409,
            detail=(
                "This action is no longer pending "
                f"(status: {workflow.status}). "
                "It may already have been confirmed or cancelled "
                "in another tab."
            ),
        )
    await db.commit()
    workflow.status = "cancelled"

    # Workflow doesn't store the LLM's natural-language summary itself
    # (only structured action_name/proposed_action) — load the preview
    # message it's still linked to for a human-readable description.
    preview_message = await db.scalar(
        select(Message).where(Message.id == workflow.preview_message_id)
    )
    try:
        stored = json.loads(preview_message.content) if preview_message else {}
    except (json.JSONDecodeError, TypeError):
        stored = {}
    cancelled_action = stored.get("summary", workflow.action_name)

    # source_user_message_id is a direct FK, pinned to the first turn that
    # started this preview chain — reliable across any number of "modify"
    # revisions without needing to infer position from message ids.
    source_message = await db.scalar(
        select(Message).where(Message.id == workflow.source_user_message_id)
    )
    original_request = source_message.content if source_message else workflow.user_prompt

    await log_message(db, conversation, role="user", content="[cancelled action]")

    result = {
        "action": "cancelled",
        "cancelled": True,
        "cancelled_action": cancelled_action,
        "cancelled_proposed_action": workflow.proposed_action,
        "original_request": original_request,
        "message": (
            f'Cancelled — no changes were made. Your original request '
            f'("{original_request}") was not completed.'
        ),
    }
    await log_message(db, conversation, role="assistant", content=_json_dumps(result))

    await db.commit()
    return conversation, result, False


async def get_conversation_with_messages(
    db: AsyncSession, user: User, conversation_id: int
) -> Conversation | None:
    """Eager-loads workflows alongside messages — see WorkflowStatus in
    schemas/chat.py for why: the router builds an authoritative
    preview-status map from conversation.workflows for the frontend,
    instead of leaving it to reconstruct status from transcript text."""
    return await db.scalar(
        select(Conversation)
        .where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
        .options(selectinload(Conversation.messages), selectinload(Conversation.workflows))
    )


async def list_conversations(
    db: AsyncSession,
    user: User,
    limit: int,
    offset: int,
) -> tuple[list[Conversation], int]:
    total = await db.scalar(
        select(func.count()).select_from(Conversation).where(Conversation.user_id == user.id)
    )
    latest_message = (
        select(
            Message.conversation_id,
            func.max(Message.created_at).label("updated_at"),
        )
        .group_by(Message.conversation_id)
        .subquery()
    )
    rows = await db.scalars(
        select(Conversation)
        .outerjoin(latest_message, latest_message.c.conversation_id == Conversation.id)
        .where(Conversation.user_id == user.id)
        .options(selectinload(Conversation.messages), selectinload(Conversation.workflows))
        .order_by(
            desc(func.coalesce(latest_message.c.updated_at, Conversation.created_at)),
            desc(Conversation.id),
        )
        .limit(limit)
        .offset(offset)
    )
    return list(rows), total or 0
