# app/backend/app/services/chat.py
import asyncio
import json
import logging
import re
from collections.abc import Coroutine, Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any, TypeVar, cast

import httpx
from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy import update as sa_update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.canvas_url import canvas_urls_equivalent
from app.core.database import AsyncSessionLocal
from app.core.secret_redaction import redact_secrets, safe_exception_text
from app.mcp_tools.dispatcher import ToolExecutionError, execute_tool, parse_action
from app.mcp_tools.dispatcher import _resolve_course as resolve_course
from app.mcp_tools.schemas import (
    ACTION_SCHEMAS,
    FORM_HANDOFF_ACTIONS,
    FORM_OWNED_FIELDS,
    READ_ACTIONS,
    WRITE_ACTIONS,
    AnalyzeCourseSubmissionsAction,
    FetchAssignmentsAction,
    FetchStudentsAction,
    FetchSubmissionsAction,
    FindAssignmentBySubmissionRateAction,
    FindAssignmentsBySubmissionStatusAction,
    IntentPreviewAction,
    RecipientDirective,
    ResolveMissingSubmissionsAction,
    ResolveScoreRangeAction,
    SemanticIntentAction,
)
from app.models.assignment import Assignment
from app.models.audit_log import AuditLog
from app.models.canvas_connection import CanvasConnection
from app.models.canvas_course_name import CanvasCourseName
from app.models.conversation import Conversation
from app.models.course import Course
from app.models.message import Message
from app.models.student import Student
from app.models.submission import Submission
from app.models.tool_call_log import ToolCallLog
from app.models.user import User
from app.models.user_preference import UserPreference
from app.models.workflow import Workflow
from app.schemas.canvas import SubmissionStatus
from app.services.analysis import SUBMITTED_STATUSES
from app.services.assignment_draft import draft_assignment_content
from app.services.assignment_rate import find_assignments_by_submission_rate
from app.services.audience import (
    AudienceScope,
    bank_audience,
    read_audience_phrase,
    select_by_status,
)
from app.services.canvas import (
    CanvasTokenRequiredError,
    _is_expected_canvas_token_sync_error,
    _is_transient_canvas_outage,
    get_active_course,
    get_submissions,
    sync_courses_if_stale,
)
from app.services.canvas_assistant_gate import (
    classify_action_for_limited_mode,
    user_has_canvas_credentials,
)
from app.services.canvas_timezone import get_instructor_canvas_timezone
from app.services.deferred_assistant import defer_assistant_request, mark_deferred_request_resumed
from app.services.due_date_resolver import resolve_due_date
from app.services.failed_operations import record_failed_operation
from app.services.field_memory import (
    _PARTIAL_PLAN_SAFE_KEYS,
    clear_course_scoped_field_memory,
    clear_pending_expectation,
    format_field_memory_for_prompt,
    merge_field_memory,
    merge_grounded_facts_into_memory,
    merge_read_result_into_field_memory,
    pending_expectation,
    read_yes_no,
    record_course_context,
    record_pending_expectation,
    resolve_against_expectation,
    trim_tool_dump_for_history,
)
from app.services.intent import normalize_semantic_intent
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
from app.services.messages import draft_subject_and_body
from app.services.quiz_draft import draft_quiz_content
from app.services.quiz_validation import validate_quiz_for_create
from app.services.reference_resolution import (
    ReferenceKind,
    find_reference_across_courses,
)
from app.services.resolved_set import (
    active_roster_names,
    compute_submissions_by_score_range,
    compute_submissions_by_status_breakdown,
    create_resolved_set,
    materialize_resolved_set,
    status_label,
    status_slug,
)
from app.services.score_range import (
    describe_basis,
    detect_explicit_basis,
    format_range,
)
from app.services.student import get_submission_derived_students
from app.services.write_preview import generate_write_preview

logger = logging.getLogger(__name__)

_ANNOUNCEMENT_REQUEST_RE = re.compile(
    r"\b(announcement|announce|course[- ]wide|post to the class|post for the class)\b",
    re.IGNORECASE,
)
_NEGATED_ANNOUNCEMENT_RE = re.compile(
    r"\b(?:don't|do not|not|never|without)\b(?!\s+forget\b)[^,.!?]{0,80}"
    r"\b(?:announcement|announce|course[- ]wide)\b",
    re.IGNORECASE,
)
_REMINDER_ANNOUNCEMENT_RE = re.compile(
    r"\b(?:don't|do not|never)\s+forget\s+to\s+(?:make|post|send|publish)?\s*"
    r"(?:an?\s+)?(?:announcement|announce|course[- ]wide)\b",
    re.IGNORECASE,
)
_PRIVATE_MESSAGE_REQUEST_RE = re.compile(
    r"\b(?:private(?:ly)?|just message|send .*\bmessage|message\s+\w+)\b",
    re.IGNORECASE,
)


def _explicit_announcement_request(message: str) -> bool:
    """Recognize explicit public-audience language as a server-side guard."""
    if _NEGATED_ANNOUNCEMENT_RE.search(message) or _REMINDER_ANNOUNCEMENT_RE.search(message):
        return False
    if _PRIVATE_MESSAGE_REQUEST_RE.search(message) and not _explicit_dual_delivery_request(message):
        return False
    return bool(_ANNOUNCEMENT_REQUEST_RE.search(message))


def _explicit_dual_delivery_request(message: str) -> bool:
    """Return true when the user explicitly requests both audiences.

    This is intentionally conjunction-based: merely mentioning an
    announcement in a private-message sentence must not broaden delivery,
    while an explicit "and also privately" request should retain recipients.
    """
    if _NEGATED_ANNOUNCEMENT_RE.search(message) or _REMINDER_ANNOUNCEMENT_RE.search(message):
        return False
    has_announcement = bool(_ANNOUNCEMENT_REQUEST_RE.search(message))
    has_private = bool(_PRIVATE_MESSAGE_REQUEST_RE.search(message))
    has_conjunction = bool(re.search(r"\b(?:and|also|both)\b", message, re.IGNORECASE))
    return has_announcement and has_private and has_conjunction


def _is_combined_announcement_request(action: Any) -> bool:
    """True when the action already says "announce AND message these people".

    The action-shaped counterpart to _explicit_dual_delivery_request above,
    which reads the same intent off the message text. Either is enough to keep
    the private half: the phrasing may be too implicit for the regex while the
    model has still understood it and filled in recipients.

    also_announce_to_class exists for exactly one shape: a public announcement
    plus targeted messages in the same turn. When the model has set it
    alongside real recipients it has already understood a request like
    "announce this and also message Alice separately", and forcing
    announcement-only would silently drop Alice's message — the private half of
    a request the instructor made explicitly, with nothing in the reply to say
    it was dropped.

    Deliberately narrow: it takes the flag AND recipients together. The flag
    alone cannot re-enable private delivery, so a plain "announce this" is
    still forced public exactly as before.
    """
    if action.action == "send_message":
        return bool(
            getattr(action, "also_announce_to_class", False)
            and (
                getattr(action, "recipient_directives", None)
                or getattr(action, "recipient_canvas_user_ids", None)
                or getattr(action, "recipient_handle", None)
                or getattr(action, "broadcast_to_all_students", False)
            )
        )
    if action.action == "intent_preview":
        proposed = action.proposed_action
        if not isinstance(proposed, dict) or proposed.get("action") != "send_message":
            return False
        return bool(
            proposed.get("also_announce_to_class")
            and (
                proposed.get("recipient_directives")
                or proposed.get("recipient_canvas_user_ids")
                or proposed.get("recipient_handle")
                or proposed.get("broadcast_to_all_students")
            )
        )
    return False


def _force_announcement_delivery(action: Any) -> Any:
    """Strip private recipient fields from an explicit announcement action."""
    if action.action == "send_message":
        return action.model_copy(
            update={
                "recipient_canvas_user_ids": None,
                "recipient_directives": None,
                "recipient_handle": None,
                "broadcast_to_all_students": False,
                "also_announce_to_class": False,
            }
        )
    if action.action == "intent_preview":
        proposed = action.proposed_action
        if proposed.get("action") != "send_message":
            return action
        cleaned = dict(proposed)
        for key in (
            "recipient_canvas_user_ids",
            "recipient_directives",
            "recipient_handle",
            "broadcast_to_all_students",
            "also_announce_to_class",
        ):
            cleaned.pop(key, None)
        return action.model_copy(update={"proposed_action": cleaned})
    return action


def _preserve_dual_delivery(action: Any) -> Any:
    """Keep private recipients while marking an explicit public broadcast."""
    if action.action == "send_message":
        return action.model_copy(update={"also_announce_to_class": True})
    if action.action == "intent_preview":
        proposed = action.proposed_action
        if proposed.get("action") != "send_message":
            return action
        proposed = {
            **proposed,
            "also_announce_to_class": True,
        }
        return action.model_copy(update={"proposed_action": proposed})
    return action


def _rebase_action_to_course(action: Any, local_course_id: int) -> Any:
    """Move a pending proposal to a verified course without carrying IDs
    that were resolved in the old course across the boundary.

    Human-readable references can be resolved again in the new course, but
    assignment/student/recipient IDs and opaque recipient handles are
    course-scoped and must never survive a course correction.
    """
    stale_course_scoped_keys = {
        "assignment_id",
        "student_id",
        "recipient_canvas_user_ids",
        "recipient_handle",
    }
    if action.action == "intent_preview":
        proposed = dict(action.proposed_action)
        proposed["local_course_id"] = local_course_id
        for key in stale_course_scoped_keys:
            proposed.pop(key, None)
        return action.model_copy(update={"proposed_action": proposed})
    if hasattr(action, "local_course_id"):
        updates: dict[str, Any] = {"local_course_id": local_course_id}
        updates.update({key: None for key in stale_course_scoped_keys if hasattr(action, key)})
        return action.model_copy(update=updates)
    return action


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
# update_assignment; find_assignments_by_submission_status can produce an
# aggregate recipient_handle for a follow-up message. These always continue
# the step loop, asking the model what to do next, rather than terminating
# the turn like an ordinary read. Adding a future resolver here is the only
# wiring a new one needs to get automatic multi-step chaining — no loop/
# dispatch changes required.
_CHAINABLE_READ_ACTIONS = frozenset(
    {
        "resolve_missing_submissions",
        "resolve_score_range",
        "find_assignment_by_submission_rate",
        "find_assignments_by_submission_status",
    }
)

# How many times one turn may answer its own clarify by going back to the model
# for another tool call. Two: enough to try the obvious read and one follow-up,
# short enough that a model which cannot resolve the reference reaches the
# instructor quickly instead of burning the whole step budget in silence.
_CLARIFY_RETRY_BUDGET = 2

# Writes that create a brand-new Canvas resource inside a course. They have no
# existing resource to resolve against, so the course is the only thing that
# can be — and until _run_create_chain, the only thing that wasn't.
_COURSE_SCOPED_CREATE_ACTIONS = frozenset({"create_assignment", "create_quiz"})
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

async def _sync_course_context_envelope(
    db: AsyncSession,
    conversation: Conversation,
    local_course_id: int | None,
) -> None:
    """Persist the compact course_context JSON for #1507 / Ticket 46.

    Call whenever a conversation's course is seeded or switched so follow-up
    turns see an indexed, timestamped selection without re-pasting the full
    course catalog into the prompt.
    """
    if local_course_id is None:
        return
    course = await db.scalar(select(Course).where(Course.id == local_course_id))
    if course is None:
        return
    record_course_context(
        conversation,
        local_course_id=course.id,
        course_name=course.name,
        course_code=course.course_code,
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
                if seed_course_id is None:
                    only_course_ids = list(
                        await db.scalars(
                            select(Course.id)
                            .where(
                                Course.instructor_id == user.id,
                                Course.workflow_state == "available",
                            )
                            .limit(2)
                        )
                    )
                    if len(only_course_ids) == 1:
                        seed_course_id = only_course_ids[0]
                if seed_course_id is not None:
                    course = await db.scalar(
                        select(Course).where(Course.id == seed_course_id, Course.instructor_id == user.id)
                    )
                    if course is not None:
                        conversation.course_id = course.id
                        conversation.course_name = await _stable_course_name(db, course.id, course.name)
                        await _sync_course_context_envelope(db, conversation, course.id)
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
                    forked = await _find_or_fork_conversation_for_course(db, user, course.id, course.name)
                    await _sync_course_context_envelope(db, forked, course.id)
                    return forked
                return conversation
            # Same course (or no switch) — ensure the envelope exists for
            # follow-ups that already have a resolved conversation course.
            await _sync_course_context_envelope(db, conversation, conversation.course_id)
            return conversation

    seed_course_id = local_course_id
    if seed_course_id is None:
        seed_course_id = await db.scalar(
            select(UserPreference.active_course_id).where(UserPreference.user_id == user.id)
        )
    if seed_course_id is None:
        # A user with exactly one selectable course has an unambiguous default
        # even when the active-course preference has not reached the server
        # yet (common immediately after opening a fresh chat). Never choose
        # from multiple courses here; the normal course-name resolver must
        # clarify in that case.
        only_course_ids = list(
            await db.scalars(
                select(Course.id)
                .where(
                    Course.instructor_id == user.id,
                    Course.workflow_state == "available",
                )
                .limit(2)
            )
        )
        if len(only_course_ids) == 1:
            seed_course_id = only_course_ids[0]
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
    await _sync_course_context_envelope(db, conversation, seed_course_id)
    return conversation


async def _stable_course_name(db: AsyncSession, local_course_id: int, fallback: str) -> str:
    """Return the current Course.name for conversation snapshots.

    Conversation.course_name is denormalized for prompt/API ergonomics,
    but Course is the canonical row. Refreshing from Course here prevents
    existing chats from carrying a stale Canvas name after a rename.
    """
    current_name = await db.scalar(select(Course.name).where(Course.id == local_course_id))
    return current_name if current_name is not None else fallback


async def _refresh_conversation_course_snapshot(db: AsyncSession, conversation: Conversation, user: User) -> None:
    if conversation.course_id is None:
        return
    current_name = await db.scalar(
        select(Course.name).where(
            Course.id == conversation.course_id,
            Course.instructor_id == user.id,
        )
    )
    if current_name is not None and conversation.course_name != current_name:
        conversation.course_name = current_name


async def _get_course_names_for_user(db: AsyncSession, user: User) -> list[CanvasCourseName]:
    """The full canvas_course_names index across every Canvas connection
    this user has, with the canonical Course row eagerly loaded. The
    connection-scoped alias index avoids cross-institution Canvas ID
    collisions; the joined Course supplies the current prompt-facing
    name/code while historical alias rows remain matchable."""
    return list(
        await db.scalars(
            select(CanvasCourseName)
            .options(joinedload(CanvasCourseName.course))
            .join(CanvasConnection, CanvasCourseName.canvas_connection_id == CanvasConnection.id)
            .where(CanvasConnection.user_id == user.id)
        )
    )


def _course_display_name(course_name: CanvasCourseName) -> str:
    return course_name.course.name if course_name.course is not None else course_name.name


def _course_code(course_name: CanvasCourseName) -> str | None:
    if course_name.course is None:
        return None
    code = course_name.course.course_code
    return code.strip() if code and code.strip() else None


def _course_prompt_label(course_name: CanvasCourseName) -> str:
    name = _course_display_name(course_name)
    code = _course_code(course_name)
    if code and _normalize_course_text(code) != _normalize_course_text(name):
        return f"{name} / {code}"
    return name


def _course_identity(course_name: CanvasCourseName) -> tuple[str, int] | tuple[str, int, str]:
    if course_name.local_course_id is not None:
        return ("local", course_name.local_course_id)
    return ("canvas", course_name.canvas_connection_id, course_name.canvas_course_id)


def _dedupe_course_aliases(course_names: list[CanvasCourseName]) -> list[CanvasCourseName]:
    deduped: dict[tuple[str, int] | tuple[str, int, str], CanvasCourseName] = {}
    for course_name in course_names:
        identity = _course_identity(course_name)
        existing = deduped.get(identity)
        if existing is None:
            deduped[identity] = course_name
            continue
        existing_seen = existing.last_seen_at or existing.created_at or datetime.min.replace(tzinfo=UTC)
        candidate_seen = course_name.last_seen_at or course_name.created_at or datetime.min.replace(tzinfo=UTC)
        if candidate_seen > existing_seen:
            deduped[identity] = course_name
    return list(deduped.values())


def _course_prompt_labels(course_names: list[CanvasCourseName]) -> list[str]:
    labels: list[str] = []
    seen: set[str] = set()
    for course_name in _dedupe_course_aliases(course_names):
        label = _course_prompt_label(course_name)
        normalized = _normalize_course_text(label)
        if normalized in seen:
            continue
        seen.add(normalized)
        labels.append(label)
    return labels


def _course_exact_match_texts(course_name: CanvasCourseName) -> tuple[str, ...]:
    display_name = _course_display_name(course_name)
    values = [display_name, course_name.name]
    code = _course_code(course_name)
    if code:
        values.append(code)
        values.append(f"{display_name} {code}")
        values.append(f"{display_name} / {code}")
        values.append(f"{course_name.name} {code}")
        values.append(f"{course_name.name} / {code}")
    return tuple(values)


def _course_substring_match_texts(course_name: CanvasCourseName) -> tuple[str, ...]:
    return (_course_display_name(course_name), course_name.name)


_COURSE_NAME_FUZZY_MATCH_MIN_LENGTH = 4


def _resolve_duplicate_course_name_matches(
    matches: list[CanvasCourseName],
) -> CanvasCourseName | None:
    """fetch_courses deliberately includes completed (past-term) courses
    alongside active ones, so an instructor
    who has taught the same course code more than once accumulates
    multiple rows with an identical name. That's the normal steady state
    for a returning instructor, not a rare edge case, so a same-name
    collision shouldn't immediately give up: narrow to whichever match(es)
    aren't a known-completed term first. Still returns None (ambiguous) if
    that doesn't narrow to exactly one — e.g. two genuinely active
    sections, or a legacy row with no workflow_state recorded at all
    sitting alongside another candidate."""
    logical_matches = _dedupe_course_aliases(matches)
    if len(logical_matches) == 1:
        return logical_matches[0]
    still_relevant = [cn for cn in logical_matches if cn.workflow_state != "completed"]
    return still_relevant[0] if len(still_relevant) == 1 else None


def _match_course_name(course_names: list[CanvasCourseName], course_name: str | None) -> CanvasCourseName | None:
    """Exact (normalized) match first across display names and course
    codes; a normalized substring match only if that finds nothing, and
    only against display names. Course codes are short identifiers, so a
    prefix like "COSC" must not bind to the one available COSC course just
    because historical completed terms were narrowed away."""
    if not course_name:
        return None
    normalized_target = _normalize_course_text(course_name)

    exact_matches = [
        cn for cn in course_names
        if any(_normalize_course_text(value) == normalized_target for value in _course_exact_match_texts(cn))
    ]
    if len(exact_matches) == 1:
        return exact_matches[0]
    if len(exact_matches) > 1:
        return _resolve_duplicate_course_name_matches(exact_matches)

    if len(normalized_target) < _COURSE_NAME_FUZZY_MATCH_MIN_LENGTH:
        return None
    substring_matches = [
        cn for cn in course_names
        if any(
            normalized_target in _normalize_course_text(value)
            or _normalize_course_text(value) in normalized_target
            for value in _course_substring_match_texts(cn)
        )
    ]
    if len(substring_matches) == 1:
        return substring_matches[0]
    if len(substring_matches) > 1:
        return _resolve_duplicate_course_name_matches(substring_matches)
    return None


def _prescan_course_reference(
    course_names: list[CanvasCourseName], message: str
) -> CanvasCourseName | None:
    """The course a message names, matched locally against the instructor's
    real course list — no LLM call, no Canvas round-trip.

    _match_course_name answers "which course is this *name*"; this answers
    "does this *message* name a course at all", which is what a resolver
    running before the model has committed to anything needs. The normalized
    substring test is the same one _message_may_name_another_course already
    uses, so "... for capstone project" finds "Capstone Project" regardless of
    case or punctuation.

    Longest match wins for the same reason it does in
    _prescan_assignment_reference: a message naming "COSC 499W" should not
    bind to "COSC 499". Several rows matching at that same length go through
    _resolve_duplicate_course_name_matches, which folds aliases together and
    drops completed terms; anything still ambiguous returns None rather than
    guessing between two live courses.
    """
    normalized_message = _normalize_course_text(message)
    if not normalized_message:
        return None

    matches: list[tuple[int, CanvasCourseName]] = []
    for course_name in course_names:
        longest = 0
        for value in _course_exact_match_texts(course_name):
            normalized = _normalize_course_text(value)
            # Short codes ("CS") turn up inside ordinary words.
            if len(normalized) < _COURSE_NAME_FUZZY_MATCH_MIN_LENGTH:
                continue
            if normalized in normalized_message:
                longest = max(longest, len(normalized))
        if longest:
            matches.append((longest, course_name))

    if not matches:
        return None
    best_length = max(length for length, _ in matches)
    top = [course_name for length, course_name in matches if length == best_length]
    if len(top) == 1:
        return top[0]
    return _resolve_duplicate_course_name_matches(top)


_PENDING_COURSE_CORRECTION_PATTERNS = (
    re.compile(
        r"\b(?:i\s+)?(?:meant|use|switch(?:\s+to)?|change\s+(?:the\s+)?(?:course|class)\s+to|set\s+(?:the\s+)?(?:course|class)\s+to)\s+"
        r"(?P<name>[^,.!?]+)",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:put|move|change)\s+(?:this|it)\s+(?:in|to)\s+(?P<name>[^,.!?]+?)\s+instead\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bchange\s+(?:this|it)\s+to\s+(?P<name>[^,.!?]+)",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bno\s*,?\s*(?P<name>(?:[A-Za-z]{2,}\s*)?\d{2,4}(?:\s+[^,.!?]+)?)\s*$",
        re.IGNORECASE,
    ),
    re.compile(r"\bactually\s+(?P<name>[^,.!?]+)", re.IGNORECASE),
)


def _resolve_pending_course_correction(
    course_names: list[CanvasCourseName], user_message: str
) -> CanvasCourseName | None:
    """Resolve only explicit course-correction wording on a pending edit.

    Matching the entire message would incorrectly switch courses when a
    course code happens to appear in an assignment title or message body.
    Restricting this fast path to correction phrases keeps the pending
    workflow safe without adding another LLM call.
    """
    for pattern in _PENDING_COURSE_CORRECTION_PATTERNS:
        match = pattern.search(user_message)
        if match:
            resolved = _match_course_name(course_names, match.group("name"))
            if resolved is not None:
                return resolved
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
{"switched_to": "<exact course display name or code from CURRENT COURSES, or null>"}

Set switched_to to the exact display name or course code of a course from
CURRENT COURSES — copied verbatim, never invented — ONLY when the message
clearly asks about a course that is NOT the current one: naming a different
course directly, or asking to switch/open a different one. If the message
doesn't name a course at all, is a plain follow-up about the current course,
or doesn't clearly and unambiguously point at one specific different course,
respond with {"switched_to": null} instead of guessing."""

COURSE_SWITCH_RESOLVER_TIMEOUT_SECONDS = 30.0


def _message_may_name_another_course(
    course_names: list[CanvasCourseName],
    current_course_name: str | None,
    message: str,
) -> bool:
    """Cheap local check for whether a turn is worth a pre-resolver call.

    Decides only "does this message contain the name or code of one of this
    instructor's other courses" — no LLM, no network. Used to let the
    pre-resolver run on a conversation's first turn, where there is no history
    to justify it but the message can still plainly name a different course.

    Substring, not exact: _normalize_course_text strips everything but
    alphanumerics, so "... for capstone project" contains "capstoneproject".
    That also makes it case- and punctuation-blind, which is the difference
    between "Capstone Project" and "capstone project" working equally well.

    A false positive costs one small call that answers null. A false negative
    just leaves the old behaviour, so this can only improve on it.
    """
    normalized_message = _normalize_course_text(message)
    if not normalized_message:
        return False
    current = _normalize_course_text(current_course_name or "")

    for course_name in course_names:
        for value in _course_exact_match_texts(course_name):
            normalized = _normalize_course_text(value)
            # Short codes ("CS") turn up inside ordinary words, and the current
            # course is not a switch however often it is named.
            if (
                len(normalized) < _COURSE_NAME_FUZZY_MATCH_MIN_LENGTH
                or normalized == current
            ):
                continue
            if normalized in normalized_message:
                return True
    return False


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

    listing = "\n".join(f"- {label}" for label in _course_prompt_labels(course_names))
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


# The fields a clarify may never be the only thing asking for: the app drafts
# them from the instructor's own sentence, and the page that opens shows every
# one filled in and editable before anything reaches Canvas. Asking for one is
# asking for something we are about to hand over for free.
#
# Derived from FORM_OWNED_FIELDS rather than restated, so "what a form owns"
# is declared once and the schema contract and this rewrite cannot drift into
# disagreeing about it.
#
# feedback is the one deliberate subtraction. "Give Sam some feedback" is
# genuinely ambiguous between an assignment comment and a private message, and
# that question is about which channel the instructor means, not about content
# we could have written for them. Identity fields — course, student,
# assignment, recipients — were never in the set at all: nothing can write
# those from the request, and getting one wrong sends real mail to the wrong
# people.
_CONTENT_CLARIFY_FIELDS = FORM_OWNED_FIELDS - {"feedback"}


def _content_only_clarify_fields(question: str) -> set[str] | None:
    """The fields a clarify asks for, when it asks only for form-owned ones.

    Reads the bare comma-separated list the prompt asks the model to produce
    ("subject, body") and nothing else. Prose is left alone on purpose: a
    question we cannot read exactly is not one to rewrite a turn over, and the
    fallback is the instructor being asked — the behaviour we are improving
    on, not a failure. None whenever any token is unreadable or names
    something outside _CONTENT_CLARIFY_FIELDS, so "subject, recipients" still asks.
    """
    tokens = [part.strip().strip(".!?").lower() for part in question.split(",")]
    if not all(tokens):
        return None
    if not all(token in _CONTENT_CLARIFY_FIELDS for token in tokens):
        return None
    return set(tokens)


def _form_handoff_action_for(fields: set[str]) -> str | None:
    """Which form-handoff write these field names belong to, when exactly one
    schema claims any of them.

    Read off the schemas rather than a hardcoded map, the same self-maintaining
    approach _inject_course_into_envelope uses, so a new field on an action is
    picked up without a second place to remember. Ambiguity returns None and
    the clarify stands: title/description alone cannot distinguish an
    assignment from a quiz, and guessing between two different Canvas objects
    is worse than one more question.
    """
    owners = {
        name
        for name in FORM_HANDOFF_ACTIONS
        if (schema := ACTION_SCHEMAS.get(name)) is not None
        and fields & set(schema.model_fields)
    }
    return owners.pop() if len(owners) == 1 else None


def _rewrite_content_only_clarify(parsed_envelope: dict) -> dict:
    """Turn a clarify that only wants content into the write it was avoiding.

    FORM HANDOFF in the system prompt tells the model not to clarify these,
    but a prompt is advice and this one demonstrably did not hold: asked for
    an announcement about a long weekend, the model returned
    {"question": "subject, body"} rather than proposing anything — an
    instructor being asked to write the message they had just written.

    Removing the dispatcher's own interrogation only ever covered the case
    where the model proposed the action. This covers the case where it
    declined to, which is the same defect one layer up, and it belongs
    server-side for the same reason the rest of the write gate does: the
    guarantee should not depend on the model having followed instructions.

    Nothing here weakens that gate. The rewrite produces an intent_preview,
    which is exactly what the model was supposed to send — so the preview is
    still built, still shown, and still confirmed before Canvas is touched.
    All that changes is that the instructor sees a drafted message they can
    edit instead of a question they have already answered.
    """
    if parsed_envelope.get("action") != "clarify":
        return parsed_envelope
    question = parsed_envelope.get("question")
    partial_plan = parsed_envelope.get("partial_plan")
    if not isinstance(question, str) or not isinstance(partial_plan, dict):
        return parsed_envelope

    asked = _content_only_clarify_fields(question)
    if not asked:
        return parsed_envelope

    # Both halves identify the action: the answer the model wanted, and what
    # it had already gathered. "subject, body" over a partial_plan holding
    # nothing but a course name is only recognisable from the question.
    target = _form_handoff_action_for(asked | set(partial_plan))
    if target is None:
        return parsed_envelope

    proposed = {
        key: value
        for key, value in partial_plan.items()
        # course_name is dropped rather than carried: the course is resolved
        # separately and re-injected as local_course_id just below, and a
        # leftover name is one more thing that can disagree with the id.
        if key not in ("action", "course_name")
    }
    proposed["action"] = target
    return {
        "action": "intent_preview",
        "summary": "I'll prepare this for your review.",
        "proposed_action": proposed,
    }


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
    # `final` says how to present the result, not what to fetch (see
    # ReadAction.final). It is not a parameter of the Canvas call and does not
    # belong in the audit trail of one — two identical reads logged with
    # different `final` values would read as two different queries.
    parameters = {key: value for key, value in parameters.items() if key != "final"}
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
with {"assignment_id": null} instead of guessing. For singular pronouns
such as "this assignment", "that assignment", or "it", prefer the
conversation's previously resolved assignment when one is available; never
choose among multiple assignments solely because a pronoun was used."""

ASSIGNMENT_RESOLVER_TIMEOUT_SECONDS = 30.0

# Same rationale as _COURSE_NAME_FUZZY_MATCH_MIN_LENGTH: a title normalizing to
# fewer characters than this ("HW", "Q1") appears inside ordinary prose too
# easily to be treated as a deliberate reference.
_PRESCAN_MIN_TITLE_LENGTH = 4


async def _prescan_assignment_reference(
    db: AsyncSession, conversation: Conversation, message: str
) -> dict | None:
    """Match an assignment named in the message against this course's already
    synced titles, *before* the main model sees the turn.

    Why this runs first: every other assignment resolution in this module is
    downstream of the model committing to an action. When the model hedges
    instead -- answering "Which assignment do you want the submissions for?" to
    a message that already named one -- _resolve_assignment_reference is never
    reached, and the instructor is asked to repeat themselves. Handing the
    model the resolved title up front removes the thing it was hedging about.

    Deliberately deterministic and local: it reads titles already synced into
    the assignments table, so it costs no LLM call and no Canvas round-trip,
    and it stays silent unless exactly one title is a confident match. Anything
    ambiguous falls through to the existing LLM resolver, which is better at
    "the latest one" than substring matching could be.
    """
    if conversation.course_id is None:
        return None
    normalized_message = _normalize_course_text(message)
    if not normalized_message:
        return None

    rows = (
        await db.execute(
            select(Assignment.canvas_assignment_id, Assignment.title).where(
                Assignment.course_id == conversation.course_id,
                Assignment.is_active.is_(True),
            )
        )
    ).all()

    matches: list[tuple[int, str, str]] = []
    for canvas_assignment_id, title in rows:
        normalized_title = _normalize_course_text(title or "")
        if len(normalized_title) < _PRESCAN_MIN_TITLE_LENGTH:
            continue
        if normalized_title in normalized_message:
            matches.append((len(normalized_title), canvas_assignment_id, title))

    if not matches:
        return None
    # Longest title wins: "user testing 2" contains "user testing", and the
    # more specific one is what the instructor typed. A tie between two
    # different assignments is genuine ambiguity -- stay out of it.
    matches.sort(reverse=True)
    if len(matches) > 1 and matches[0][0] == matches[1][0]:
        return None

    _, canvas_assignment_id, title = matches[0]
    resolved_id = _coerce_int(canvas_assignment_id)
    return None if resolved_id is None else {"assignment_id": resolved_id, "assignment_title": title}


async def _prescan_student_references(
    db: AsyncSession, conversation: Conversation, message: str
) -> list[dict]:
    """Students the message names, matched against this course's synced roster.

    Same contract as _prescan_assignment_reference — deterministic, local, and
    silent when unsure — but plural, because one message routinely names
    several people ("message Coin and Alice about the midterm").

    Three forms are matched per student, in the order the design fixes:
    full name, then surname, then given name. A student is kept only on their
    longest matching form, so "Alice Smith" does not also register as a hit on
    a different Alice.

    Two ways a match is dropped rather than guessed at:

    * the same text matches two students ("Smith" with two Smiths on the
      roster) — genuinely ambiguous, and dropping only those two still lets
      every other name in the same message resolve;
    * one student's matched text is a proper substring of another's, which is
      what "Alice" is next to "Alice Smith" — the longer one is what was
      actually typed.

    Inactive enrollments are excluded: a withdrawn student is not a target,
    and resolving one would put a name in the prompt that no later write could
    act on.
    """
    if conversation.course_id is None:
        return []
    normalized_message = _normalize_course_text(message)
    if not normalized_message:
        return []

    rows = (
        await db.execute(
            select(Student.canvas_user_id, Student.name, Student.sortable_name).where(
                Student.course_id == conversation.course_id,
                Student.enrollment_state == "active",
            )
        )
    ).all()

    # matched text -> the students it picked out, so an ambiguous name can be
    # dropped without taking the unambiguous ones in the same message with it.
    by_matched_text: dict[str, list[tuple[str, str]]] = {}
    for canvas_user_id, name, sortable_name in rows:
        best = ""
        for form in _student_name_forms(name, sortable_name):
            normalized_form = _normalize_course_text(form)
            if len(normalized_form) < _PRESCAN_MIN_TITLE_LENGTH:
                continue
            if normalized_form in normalized_message and len(normalized_form) > len(best):
                best = normalized_form
        if best:
            by_matched_text.setdefault(best, []).append((canvas_user_id, name))

    unambiguous = {
        text: students[0]
        for text, students in by_matched_text.items()
        if len(students) == 1
    }
    resolved: list[dict] = []
    for text, (canvas_user_id, name) in unambiguous.items():
        if any(text != other and text in other for other in unambiguous):
            continue
        student_id = _coerce_int(canvas_user_id)
        if student_id is not None:
            resolved.append({"student_id": student_id, "student_name": name})
    resolved.sort(key=lambda entry: entry["student_id"])
    return resolved


def _student_name_forms(name: str | None, sortable_name: str | None) -> tuple[str, ...]:
    """Full name, surname, given name — in the precedence order the matcher
    relies on. sortable_name is Canvas's "Surname, Given", which is where the
    surname can be read off without guessing at where a multi-word given name
    ends."""
    forms: list[str] = []
    if name:
        forms.append(name)
    if sortable_name and "," in sortable_name:
        surname, _, given = sortable_name.partition(",")
        forms.extend(part.strip() for part in (surname, given) if part.strip())
    elif name and " " in name:
        given, _, surname = name.partition(" ")
        forms.extend(part.strip() for part in (surname, given) if part.strip())
    return tuple(forms)


async def _prescan_submission_reference(
    db: AsyncSession,
    conversation: Conversation,
    assignment: dict | None,
    students: list[dict],
) -> dict | None:
    """The one submission a turn is about, once the assignment and exactly one
    student are already known.

    Derived rather than matched: nobody types a submission's name. It exists so
    that "regrade Coin's midterm" arrives with the submission already
    identified instead of the model asking which submission of which
    assignment. Two named students means the turn is not about one submission,
    so it stays silent.
    """
    if conversation.course_id is None or assignment is None or len(students) != 1:
        return None

    row = (
        await db.execute(
            select(Submission.canvas_submission_id, Submission.status)
            .join(Assignment, Submission.assignment_id == Assignment.id)
            .where(
                Assignment.course_id == conversation.course_id,
                Assignment.canvas_assignment_id == str(assignment["assignment_id"]),
                Submission.student_canvas_id == str(students[0]["student_id"]),
            )
        )
    ).first()
    if row is None:
        return None
    submission_id = _coerce_int(row[0])
    if submission_id is None:
        return None
    return {"submission_id": submission_id, "submission_status": row[1]}


# Above this many named students, the roster goes behind a handle instead of
# into the prompt. Five is the point at which a list stops being context and
# starts being a data dump the model will happily paraphrase back at the user.
_PRESCAN_STUDENT_NAME_LIMIT = 5


async def _run_reference_prescan(
    db: AsyncSession,
    conversation: Conversation,
    course_names: list[CanvasCourseName],
    message: str,
) -> dict:
    """Every local reference the raw message already settles, resolved before
    the model sees the turn.

    The ordering is a dependency chain, not a preference: the submission needs
    the assignment and the student, and both of those are scoped to the
    conversation's course. Each step stays silent when unsure and leaves the
    field to the existing LLM resolvers downstream, so this can only add
    certainty — never remove a resolution path that already worked.
    """
    prescan: dict[str, Any] = {}

    # An answer to the question the assistant is waiting on outranks anything
    # matched from scratch. "the second one" carries no title to match at all,
    # and "Lab Report B" typed in reply to "which of these?" means that
    # offered option — not a fresh search that might land elsewhere. Taken
    # first, and the generic matchers below defer to whatever it settled.
    answered = resolve_against_expectation(
        pending_expectation(conversation.field_memory), message
    )
    answered_field = answered.get("field") if answered else None
    answered_id = answered.get("id") if answered else None

    assignment: dict | None = None
    students: list[dict] = []
    if answered_id is not None and answered_field == "assignment_reference":
        assignment = {
            "assignment_id": answered_id,
            "assignment_title": answered["label"],
        }
    if answered_id is not None and answered_field == "student_reference":
        students = [{"student_id": answered_id, "student_name": answered["label"]}]

    named_course = _prescan_course_reference(course_names, message)
    if named_course is not None and named_course.local_course_id is not None:
        prescan["local_course_id"] = named_course.local_course_id
        prescan["course_name"] = _course_display_name(named_course)

    if assignment is None:
        assignment = await _prescan_assignment_reference(db, conversation, message)
    if assignment:
        prescan.update(assignment)

    if not students:
        students = await _prescan_student_references(db, conversation, message)
    if 0 < len(students) <= _PRESCAN_STUDENT_NAME_LIMIT:
        prescan["students"] = students
    elif students:
        # Past the limit the names are replaced by the same handle machinery
        # resolve_missing_submissions already uses, so a later send_message
        # turn can materialize the real recipients without them ever having
        # been in the prompt.
        resolved_set = await create_resolved_set(
            db,
            conversation,
            kind="prescan_students",
            query={"local_course_id": conversation.course_id, "source": "prescan"},
            recipients=[
                {"user_id": entry["student_id"], "name": entry["student_name"]}
                for entry in students
            ],
        )
        prescan["student_count"] = len(students)
        prescan["recipient_handle"] = resolved_set.handle

    submission = await _prescan_submission_reference(
        db, conversation, assignment, students
    )
    if submission:
        prescan.update(submission)

    return prescan


def _format_prescan_for_prompt(prescan: dict | None) -> str:
    if not prescan:
        return ""
    return (
        "RESOLVED REFERENCES (already matched server-side against this "
        "course's real Canvas data — treat these as confirmed, use them "
        "directly, and do NOT ask the user to name them again):\n"
        f"{json.dumps(prescan, default=str)}"
    )


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


async def _find_assignment_in_other_courses(
    db: AsyncSession,
    user: User,
    exclude_course_id: int,
    reference: str | None,
) -> list[tuple[int, str, str]]:
    """This instructor's OTHER courses that own an assignment by this name.

    Exists because the failure it catches is invisible from inside one
    course: an instructor asks about "testing event 2", the conversation is
    sitting on a course that has no such assignment, and the only honest
    conclusion available locally is "this course has no assignments" — which
    is true, useless, and identical on every retry. Naming an assignment the
    instructor plainly has is strong evidence the COURSE is wrong, not that
    the assignment doesn't exist, and that evidence is only visible by
    looking outside the current course.

    Returns [(local_course_id, course_name, assignment_title)]. Substring
    matching in both directions, so "testing event 2" finds "Testing Event
    2" and a reference that trims or extends the stored title still lands.
    """
    if not reference:
        return []
    target = _normalize_course_text(reference)
    if len(target) < _COURSE_NAME_FUZZY_MATCH_MIN_LENGTH:
        return []

    rows = await db.execute(
        select(Course.id, Course.name, Assignment.title)
        .join(Assignment, Assignment.course_id == Course.id)
        .where(Course.instructor_id == user.id, Course.id != exclude_course_id)
    )
    matches: list[tuple[int, str, str]] = []
    for course_id, course_name, title in rows:
        normalized = _normalize_course_text(title or "")
        if not normalized:
            continue
        if normalized == target or target in normalized or normalized in target:
            matches.append((course_id, course_name, title))
    return matches


COURSE_SWITCH_EXPECTATION_FIELD = "course_switch"


def build_switch_offer(
    *,
    question: str,
    targets: list[tuple[int, str]],
    reference: str | None,
    user_message: str,
) -> dict | None:
    """The one shape a course-switch offer has, whatever noticed it.

    Three different situations produce this — a named assignment that isn't
    here, a filter that matched nobody here, a reference that scores better in
    another course — and they differ only in the sentence. The candidate list,
    the expectation field the next turn reads the answer against, and the
    payload that carries the interrupted work all have to be identical, or
    accepting the offer works after one of them and silently does nothing
    after another. That is exactly how send_message ended up as the workflow
    where "yes" dropped the request: it never called any of this, so the model
    improvised a switch question with no payload behind it.

    ``targets`` is [(local_course_id, course_name)], best first. A single
    target puts its id in the payload so a bare "yes" is a complete answer;
    with several, the reply has to name one and that choice supplies the id.

    Returns None when there is nothing to offer, so callers keep their own
    ordinary wording for "genuinely not found".
    """
    if not targets:
        return None
    return {
        "action": "clarify",
        "clarify": True,
        "question": question,
        "partial_plan": {"assignment_reference": reference},
        "clarify_field": COURSE_SWITCH_EXPECTATION_FIELD,
        "clarify_candidates": [
            {"id": course_id, "label": course_name} for course_id, course_name in targets
        ],
        # The interrupted request travels with the offer, so a bare "yes"
        # switches AND carries on. handle_chat_message adds the parsed action
        # to this on the way out (see _with_pending_action).
        "clarify_payload": {
            "user_message": user_message,
            "assignment_reference": reference,
            "local_course_id": targets[0][0] if len(targets) == 1 else None,
            "course_name": targets[0][1] if len(targets) == 1 else None,
        },
    }


def _dedupe_targets(elsewhere: list[tuple[int, str, str]]) -> list[tuple[int, str]]:
    """(course_id, course_name), first occurrence wins, order preserved."""
    seen: set[int] = set()
    targets: list[tuple[int, str]] = []
    for course_id, course_name, _label in elsewhere:
        if course_id in seen:
            continue
        seen.add(course_id)
        targets.append((course_id, course_name))
    return targets


def _empty_filter_switch_offer(
    course: Course,
    assignment_name: str,
    criterion: str,
    elsewhere: list[tuple[int, str, str]],
    user_message: str,
) -> dict | None:
    """Offer a course switch when a filter matched nobody here but the same
    assignment name exists elsewhere.

    Only offered when the evidence is real. "No students matched" is usually a
    true answer about the right course — everyone submitted, nobody scored in
    that band — and turning every empty result into "did you mean another
    course?" would be noise on the common case. What makes it worth raising is
    the *assignment name existing in another course*.
    """
    if not elsewhere:
        return None
    if len(elsewhere) == 1:
        _, other_course, other_title = elsewhere[0]
        question = (
            f'No students in {course.name} {criterion} for "{assignment_name}". '
            f'There is also a "{other_title}" in {other_course} — '
            "should I switch to it and check there?"
        )
    else:
        options = ", ".join(sorted({name for _, name, _ in elsewhere}))
        question = (
            f'No students in {course.name} {criterion} for "{assignment_name}". '
            f"An assignment with that name also exists in: {options}. "
            "Which course did you mean?"
        )
    return build_switch_offer(
        question=question,
        targets=_dedupe_targets(elsewhere),
        reference=assignment_name,
        user_message=user_message,
    )


#: What each kind of reference is called in the offer sentence.
_REFERENCE_NOUNS: dict[ReferenceKind, str] = {
    "assignment": "assignment",
    "student": "student",
}


async def cross_course_switch_offer(
    db: AsyncSession,
    user: User,
    *,
    kind: ReferenceKind,
    reference: str | None,
    course: Course,
    user_message: str,
) -> dict | None:
    """"You are in the wrong course" — decided once, for every workflow.

    Called before a chain commits to resolving inside the conversation's
    course. That ordering is the fix: resolution used to start here and only
    look elsewhere once it had failed outright, which let a weak local match
    win by default. An instructor in Capstone Project asking for the due date
    of "homework 1 limits" got Capstone's "Homework 1", because Capstone had
    *something* plausible and Math 101's exact match was never consulted.

    Only fires when another course is plainly better — see
    ReferenceCandidates.elsewhere_is_better, which requires both real
    confidence and a clear margin, so a tie leaves the instructor where they
    are. Returns None otherwise, and the caller proceeds exactly as before.
    """
    if not reference:
        return None
    candidates = await find_reference_across_courses(
        db, user, kind=kind, reference=reference, current_course_id=course.id
    )
    if not candidates.elsewhere_is_better:
        return None

    targets = candidates.switch_targets
    noun = _REFERENCE_NOUNS[kind]
    best = targets[0]
    here = candidates.best_here
    # Naming the near-miss matters: without it the offer reads as "that does
    # not exist here", which is false and looks like a bug to someone staring
    # at an assignment list that plainly contains something similar.
    local_note = (
        f' The closest thing in {course.name} is "{here.label}".' if here else ""
    )
    if len(targets) == 1:
        question = (
            f'"{reference}" looks like the {noun} "{best.label}" in '
            f"{best.course_name}, not {course.name}.{local_note} "
            "Should I switch to it and continue there?"
        )
    else:
        options = ", ".join(match.course_name for match in targets)
        question = (
            f'"{reference}" matches a {noun} in: {options} — not '
            f"{course.name}.{local_note} Which course did you mean?"
        )
    return build_switch_offer(
        question=question,
        targets=[(match.local_course_id, match.course_name) for match in targets],
        reference=reference,
        user_message=user_message,
    )


# Fields on a stored action that name a *thing inside a course* — a Canvas id
# the app resolved, or a set it computed. None of them survive a move to a
# different course: assignment 4821 is not in the course being switched to,
# and a recipient handle was scoped to a roster that is no longer the roster.
#
# Everything NOT listed here is the instructor's own intent and content — the
# message body, the subject, the grade, the due date, the words they used to
# name an assignment — and all of it is kept. That split is the whole point:
# replaying the raw sentence through the model re-derives the intent and can
# land somewhere else, which is how "send messages to students who submitted
# testing event 2 saying they did well" came back, after the switch, as a
# submissions report with the message body gone.
_COURSE_SCOPED_ACTION_FIELDS = frozenset(
    {
        "assignment_id",
        "quiz_id",
        "student_id",
        "recipient_handle",
        "recipient_canvas_user_ids",
        "recipient_names",
        "student_grades",
    }
)


@dataclass(frozen=True)
class SwitchOutcome:
    """What answering a course-switch offer decided.

    A dataclass rather than a tuple because the shape kept growing and the
    unpacking at the call site stopped saying what each slot meant.
    """

    #: A reply that ends the turn — the instructor declined, or the offer was
    #: no longer usable. None means the turn carries on in ``conversation``.
    terminal: dict | None
    #: The interrupted request, in the instructor's own words. Used when there
    #: is no storable action to resume.
    replay_message: str
    #: Where the turn continues. The source conversation on a decline.
    conversation: Conversation
    #: The interrupted action, rebased onto the course being entered. Resuming
    #: this rather than re-reading ``replay_message`` is what stops a write
    #: from being re-planned into something else on the way across.
    pending_action: dict | None = None


def _with_pending_action(payload: dict | None, action: Any) -> dict | None:
    """Attach the action a course-switch offer interrupted, so accepting the
    offer resumes the work instead of re-asking the model what the work was.

    Only for the switch offer — every other clarify already carries what it
    needs in ``partial_plan``, and storing a whole action on them would put
    model-authored fields into conversation memory for no gain.
    """
    if payload is None or action is None:
        return payload
    try:
        dumped = action.model_dump(exclude_none=True)
    except Exception:
        return payload
    return {**payload, "pending_action": dumped}


def rebase_pending_action(pending_action: dict | None, course_id: int) -> dict | None:
    """Point a stored action at a different course, dropping what cannot follow.

    Returns None when there is nothing worth resuming, so the caller falls back
    to replaying the instructor's sentence through the model.
    """
    if not isinstance(pending_action, dict) or not pending_action.get("action"):
        return None
    rebased = {
        key: value
        for key, value in pending_action.items()
        if key not in _COURSE_SCOPED_ACTION_FIELDS
    }
    rebased["local_course_id"] = course_id
    return rebased


_SWITCH_CONFIRMATION_RESOLVER_SYSTEM_PROMPT = """You decide whether an
instructor's reply answers a yes/no question the assistant just asked about
switching the conversation to a different course.

Respond with exactly one JSON object and nothing else:
{"answer": "yes" | "no" | "unrelated", "course_id": <integer from COURSES> | null}

"yes" — the reply agrees to the switch, in whatever words ("yeah do that",
  "sounds right, go for it", "that's the one", "ugh fine").
"no" — the reply declines, in whatever words ("nah I'm good", "leave it",
  "don't bother", "I meant this course").
"unrelated" — the reply is not an answer to that question: a brand-new
  request ("show me the roster instead"), a question back ("which one has
  more students?"), or anything you are not confident about.

Prefer "unrelated" whenever you are unsure. A wrong "yes" moves the
instructor's work into a different Canvas course; a wrong "unrelated" only
means they get asked again, so guessing is never worth it.

Set "course_id" only when the reply points at one specific course from
COURSES ("yes, the capstone one"), using that course's id exactly as
listed — never an id that is not in COURSES. Otherwise use null.

Judge meaning, not the words present: a reply can agree while containing
"no" ("no problem, go ahead") and decline while containing "yes" ("yes I
know, but stay here")."""

SWITCH_CONFIRMATION_RESOLVER_TIMEOUT_SECONDS = 15.0


async def _resolve_switch_confirmation(
    question: str,
    candidates: list[dict],
    reply: str,
    adapter: LLMAdapter,
) -> tuple[bool, int | None] | None:
    """Read a free-form reply to a pending course-switch offer.

    The literal check in read_yes_no covers the words people usually type,
    but it is a closed vocabulary: "yeah let's do that" matches nothing in
    it. This is the same paradigm as _resolve_course_switch and
    _resolve_assignment_reference — one narrow question, a real candidate
    list, never trusted to invent a value — and it runs only when an offer
    is actually outstanding AND the free checks came back inconclusive, so
    it costs nothing on ordinary turns.

    Returns (answer, course_id): (False, None) for a refusal, (True, id) for
    consent. Returns None for "not an answer" and for every failure —
    timeout, provider error, unparseable JSON, an id that isn't on offer —
    which lands on the caller's existing fall-through: drop the offer and
    let the turn proceed normally.

    The asymmetry is deliberate and lives here rather than in the prompt: an
    affirmative that names no course, with several on offer, answers nothing
    and is rejected, exactly as resolve_against_expectation rejects a bare
    "yes" to a list.
    """
    valid_ids = {_coerce_int(candidate.get("id")) for candidate in candidates}
    valid_ids.discard(None)
    listing = (
        "\n".join(
            f"- id={_coerce_int(candidate.get('id'))}, "
            f"name={str(candidate.get('label') or '')!r}"
            for candidate in candidates
        )
        or "- (none)"
    )
    prompt = (
        f"COURSES:\n{listing}\n\n"
        f"Question the assistant asked: {question}\n"
        f"Instructor's reply: {reply}"
    )
    try:
        raw = await asyncio.wait_for(
            adapter.generate(
                _SWITCH_CONFIRMATION_RESOLVER_SYSTEM_PROMPT, prompt, history=[],
                timeout=SWITCH_CONFIRMATION_RESOLVER_TIMEOUT_SECONDS,
            ),
            timeout=SWITCH_CONFIRMATION_RESOLVER_TIMEOUT_SECONDS,
        )
        parsed = json.loads(extract_json_object(raw))
    except Exception:
        # Broad on purpose, same as _resolve_course_switch: no provider or
        # parsing failure may escape a confirmation read and 500 a turn whose
        # only content is the word "yeah".
        return None
    if not isinstance(parsed, dict):
        return None

    answer = str(parsed.get("answer") or "").strip().lower()
    if answer == "no":
        return False, None
    if answer != "yes":
        # "unrelated", or a label this resolver never defined. Neither is
        # consent, and an unrecognised value is a broken response, not a yes.
        return None

    chosen = _coerce_int(parsed.get("course_id"))
    if chosen not in valid_ids:
        chosen = None
    if chosen is None:
        if len(valid_ids) != 1:
            return None
        chosen = next(iter(valid_ids))
    return True, chosen


def _expectation_candidate_label(expectation: dict, course_id: int) -> str | None:
    for candidate in expectation.get("candidates") or []:
        if _coerce_int(candidate.get("id")) == course_id:
            return str(candidate.get("label") or "").strip() or None
    return None


async def _apply_pending_course_switch(
    db: AsyncSession,
    user: User,
    conversation: Conversation,
    message: str,
    adapter: LLMAdapter | None,
) -> SwitchOutcome | None:
    """Read a reply to a pending "switch to <course>?" offer.

    Returns None when there is no such offer or the reply isn't an answer to
    it — the turn then proceeds untouched, so changing the subject mid-offer
    still works. Otherwise returns (terminal_result, replay_message): a
    terminal result for a decline, or (None, original_message) once the
    switch is done and the interrupted request should be replayed.

    Declining is a real answer, not just an absence of consent: it clears the
    offer so the instructor isn't asked the same question forever.

    ``adapter`` is what makes a reply outside read_yes_no's word list readable
    (see _resolve_switch_confirmation); pass None to keep this to the two
    deterministic reads.
    """
    expectation = pending_expectation(conversation.field_memory)
    if not expectation or expectation.get("field") != COURSE_SWITCH_EXPECTATION_FIELD:
        return None

    payload = expectation.get("payload") or {}
    target_course_id = _coerce_int(payload.get("local_course_id"))
    original_message = payload.get("user_message") or ""
    course_label = payload.get("course_name") or "that course"

    # Three reads, cheapest first. The two free ones cover the common replies;
    # only what neither recognises is worth an LLM call.
    answer = read_yes_no(message)
    if answer is None:
        # A named course is a yes with the target spelled out — "use capstone
        # project" both consents and chooses.
        chosen = resolve_against_expectation(expectation, message)
        if chosen is not None and _coerce_int(chosen.get("id")) is not None:
            target_course_id = _coerce_int(chosen["id"])
            course_label = chosen.get("label") or course_label
            answer = True

    if answer is None and adapter is not None:
        # Everything else: "yeah let's do that", "nah I'm good", or a change of
        # subject. read_yes_no is a fixed word list and cannot tell those
        # apart, and the offer is outstanding right now, so this is the one
        # moment where asking is both cheap and decisive.
        resolved = await _resolve_switch_confirmation(
            expectation.get("question") or "",
            expectation.get("candidates") or [],
            message,
            adapter,
        )
        if resolved is not None:
            answer, resolved_course_id = resolved
            if resolved_course_id is not None:
                target_course_id = resolved_course_id
                course_label = (
                    _expectation_candidate_label(expectation, resolved_course_id)
                    or course_label
                )

    if answer is None:
        # Still not an answer: the instructor moved on. Drop the offer rather
        # than leave it to swallow whatever they say next.
        clear_pending_expectation(conversation)
        return None

    clear_pending_expectation(conversation)

    if not answer:
        return SwitchOutcome(
            terminal={
                "action": "respond",
                "message": (
                    f"Staying in {conversation.course_name or 'this course'}. "
                    "Let me know what you'd like to do here instead."
                ),
            },
            replay_message=message,
            conversation=conversation,
        )

    if target_course_id is None or not original_message:
        # The offer is unusable without both halves; say so rather than
        # switching to nothing or switching and then doing nothing.
        return SwitchOutcome(
            terminal={
                "action": "respond",
                "message": (
                    "I've lost track of which course that referred to — could "
                    "you say the course and what you'd like me to do?"
                ),
            },
            replay_message=message,
            conversation=conversation,
        )

    target = await db.get(Course, target_course_id)
    if target is None or target.instructor_id != user.id:
        # Ownership is re-checked at use, not trusted from stored memory —
        # field_memory is per conversation, but a course id read back out of
        # it must still belong to this instructor before anything is done in it.
        return SwitchOutcome(
            terminal={
                "action": "respond",
                "message": "That course is no longer available on your account.",
            },
            replay_message=message,
            conversation=conversation,
        )

    # Route to that course's own conversation rather than re-pointing this one.
    # This is what the tab strip is built on: "tabs never decide conversation
    # identity — the server already routes a course switch to that course's
    # conversation" (useChatTabs). Mutating in place would leave one
    # conversation whose course changed underneath it, so the tab would keep
    # showing a thread that no longer belongs to the course it claims.
    target_conversation = await _find_or_fork_conversation_for_course(
        db, user, target.id, target.name
    )
    # Stale ids from the old course must not survive the move (#1306) — the
    # replayed request re-resolves everything against the new course.
    clear_course_scoped_field_memory(conversation)
    clear_pending_expectation(target_conversation)
    await _sync_course_context_envelope(db, target_conversation, target.id)

    # Close the thread being left. It keeps the honest record of what happened
    # in it — the question, "not here, try X?", and the "yes" — and this says
    # where the work went. Without it the transcript ends on a bare "yes" and
    # reads as a question this course never answered, which is the same
    # dead-end appearance the whole offer exists to remove.
    named = payload.get("assignment_reference") or "that"
    await log_message(
        db,
        conversation,
        role="assistant",
        content=json.dumps(
            {
                "action": "respond",
                "message": (
                    f'"{named}" isn\'t in '
                    f"{conversation.course_name or 'this course'} — continuing "
                    f"in {course_label}. This chat stays here."
                ),
            }
        ),
    )
    print(f"Switched to {course_label}; continuing the original request")
    return SwitchOutcome(
        terminal=None,
        replay_message=original_message,
        conversation=target_conversation,
        # Rebased onto the course being entered: the intent and the content
        # travel, the old course's resolved ids do not.
        pending_action=rebase_pending_action(payload.get("pending_action"), target.id),
    )


def _assignment_elsewhere_clarify(
    course: Course,
    reference: str | None,
    elsewhere: list[tuple[int, str, str]],
    user_message: str = "",
) -> dict:
    """Say which course actually has it, and let one word switch to it.

    The old reply stated a fact about the wrong course and offered nothing
    to act on, so repeating the request — or naming a different course —
    produced the identical sentence every time. Candidates are recorded so
    the next turn reads a bare course name as an answer to this question
    rather than as a brand-new request that resolves the same wrong way.
    """
    named = reference or "that assignment"
    if len(elsewhere) == 1:
        course_id, course_name, title = elsewhere[0]
        question = (
            f'I couldn\'t find "{named}" in {course.name} — this conversation '
            f'is set to that course. "{title}" is in {course_name}. '
            "Should I switch to it?"
        )
    else:
        options = ", ".join(sorted({name for _, name, _ in elsewhere}))
        question = (
            f'I couldn\'t find "{named}" in {course.name} — this conversation '
            f"is set to that course. Assignments with that name exist in: "
            f"{options}. Which course did you mean?"
        )
    return build_switch_offer(
        question=question,
        targets=_dedupe_targets(elsewhere),
        reference=reference,
        user_message=user_message,
    )


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
        # Pronouns are intentionally resolved from trusted conversation
        # memory before asking the assignment resolver to choose from a list.
        # This makes "show submissions for this assignment" follow a prior
        # assignment result, while plural/ambiguous references still go
        # through the normal exact-one resolver and clarification path.
        reference_key = (assignment_reference or "").strip().lower()
        if reference_key in {"this assignment", "that assignment", "it", "this", "that"}:
            remembered_id = _coerce_int(
                (conversation.field_memory or {}).get("assignment_id")
            )
            if remembered_id is not None:
                remembered = await db.scalar(
                    select(Assignment.id).where(
                        Assignment.course_id == course.id,
                        Assignment.canvas_assignment_id == str(remembered_id),
                    )
                )
                if remembered is not None:
                    assignment_id = remembered_id

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
            # Before concluding anything about the assignment, check whether
            # the COURSE is the thing that's wrong. Without this the reply is
            # a true but dead-end statement about a course the instructor
            # never named, and it repeats verbatim no matter what they say
            # next.
            elsewhere = await _find_assignment_in_other_courses(
                db, user, course.id, assignment_reference
            )
            if elsewhere:
                return _assignment_elsewhere_clarify(
                    course, assignment_reference, elsewhere, user_message
                )
            return {
                "action": "clarify",
                "clarify": True,
                "question": (
                    f"{course.name} — the course this conversation is set to — "
                    "has no assignments yet. Did you mean a different course?"
                ),
                "partial_plan": {"local_course_id": course.id},
            }

        # Before resolving inside this course, check whether another one is
        # plainly a better fit. This runs BEFORE _resolve_assignment_reference,
        # not after it, and that ordering is the whole point: the in-course
        # resolver is asked to pick the closest title from a list, so given
        # "homework 1 limits" and a course containing "Homework 1" it will
        # happily pick it — and the exact match sitting in another course is
        # never looked at. Only a clear win elsewhere pre-empts it, so an
        # ordinary in-course request is untouched.
        #
        # Placed after fetch_assignments above so this course's own rows are
        # freshly synced when they are compared against everyone else's.
        offer = await cross_course_switch_offer(
            db, user, kind="assignment", reference=assignment_reference,
            course=course, user_message=user_message,
        )
        if offer is not None:
            return offer

        assignment_id = await _resolve_assignment_reference(
            assignments, assignment_reference, user_message, adapter
        )
        if assignment_id is None:
            # Same reasoning as the empty-course branch: a named assignment
            # that matches nothing here but exists in another course is a
            # course-resolution failure wearing an assignment-resolution
            # costume. Only consulted after the in-course resolver declines,
            # so a real in-course match always wins.
            elsewhere = await _find_assignment_in_other_courses(
                db, user, course.id, assignment_reference
            )
            if elsewhere:
                return _assignment_elsewhere_clarify(
                    course, assignment_reference, elsewhere, user_message
                )
            names = ", ".join(a["name"] for a in assignments)
            return {
                "action": "clarify",
                "clarify": True,
                "question": f"Which assignment in {course.name} did you mean? Options: {names}.",
                "partial_plan": {"local_course_id": course.id},
                # Recorded as a pending expectation so the next turn can read
                # "the second one" against this exact list, in this order,
                # instead of re-deriving it from the question text.
                "clarify_field": "assignment_reference",
                "clarify_candidates": [
                    {"id": _coerce_int(a.get("id")), "label": a.get("name")}
                    for a in assignments
                ],
            }

    return course, assignment_id


_GRADE_CLARIFICATION_FIELDS = (
    "assignment_reference",
    "student_reference",
    "new_grade",
    "feedback",
    "reason",
)


def _preserve_grade_clarification_context(
    result: dict,
    action: Any,
) -> dict:
    """Carry user-provided grade context through resolver clarifications.

    Assignment/student IDs are deliberately not copied here: they must be
    resolved and verified server-side. Natural-language targets and the
    instructor's grade/feedback values are safe to retain while a later
    clarification resolves those targets.
    """
    if result.get("action") != "clarify":
        return result
    partial_plan = dict(result.get("partial_plan") or {})
    for field_name in _GRADE_CLARIFICATION_FIELDS:
        value = getattr(action, field_name, None)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        partial_plan[field_name] = value
    preserved = {
        field: partial_plan[field]
        for field in ("new_grade", "feedback", "reason")
        if field in partial_plan
    }
    return {
        **result,
        "partial_plan": partial_plan,
        # Consumed before the response is serialized. This keeps validated
        # resolver context separate from arbitrary LLM clarify payloads.
        "_server_preserved_grade_context": preserved,
    }


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
    (see materialize_resolved_set). action.status picks which categories
    (see compute_submissions_by_status); "missing" and "late" are mutually
    exclusive, but both can be requested at once and resolve to their union,
    with the summary naming the split so a combined group never reads as a
    single category."""
    resolved = await _resolve_course_and_assignment(
        db, user, conversation, user_msg,
        action.local_course_id, action.assignment_id, action.assignment_reference, user_message,
        adapter,
    )
    if isinstance(resolved, dict):
        return resolved
    course, assignment_id = resolved

    # Local row is normally populated by fetch_assignments inside
    # _resolve_course_and_assignment; the generic "Assignment {id}" label
    # is only a fallback when that sync somehow missed the row.
    assignment_row = await db.scalar(
        select(Assignment).where(
            Assignment.course_id == course.id,
            Assignment.canvas_assignment_id == str(assignment_id),
        )
    )
    assignment_name = (
        assignment_row.title if assignment_row else f"Assignment {assignment_id}"
    )
    due_at = assignment_row.due_date if assignment_row else None

    statuses = action.status
    slug = status_slug(statuses)
    query = {
        "local_course_id": course.id,
        "assignment_id": assignment_id,
        "status": slug,
        "statuses": list(statuses),
    }

    print(f"Checking {course.name} for {status_label(statuses)} submissions")
    matched, status_counts = await _run_tracked_read(
        db, user, conversation, user_msg.id, "resolve_missing_submissions",
        query,
        compute_submissions_by_status_breakdown(
            course, assignment_id, user, db, statuses
        ),
    )

    if not matched:
        # Nobody here matched. If the same assignment name lives in another
        # course, that is worth raising before reporting an empty group —
        # the instructor may simply be in the wrong course, which is invisible
        # from a correct-looking "0 students" answer.
        offer = _empty_filter_switch_offer(
            course, assignment_name,
            f"{status_label(statuses)} submissions",
            await _find_assignment_in_other_courses(
                db, user, course.id, assignment_name
            ),
            user_message,
        )
        if offer is not None:
            return offer

    resolved_set = await create_resolved_set(
        db, conversation, kind=f"{slug}_submissions",
        query=query,
        recipients=matched,
    )

    sample = [r["name"] for r in matched[:_RESOLVED_SET_SAMPLE_SIZE]]
    summary = _build_resolve_missing_summary(
        course_name=course.name,
        assignment_name=assignment_name,
        due_at=due_at,
        statuses=statuses,
        status_counts=status_counts,
        matched_count=len(matched),
        sample=sample,
    )

    return {
        "action": "resolve_missing_submissions",
        # Kept a single string: the frontend reads this with a string reader
        # (map-chat-reply.ts), which would silently fall back to "missing" on
        # a list and mislabel a union as a missing-only result.
        "status": slug,
        "statuses": list(statuses),
        "status_counts": {status: status_counts[status] for status in statuses},
        "local_course_id": course.id,
        "course_name": course.name,
        "assignment_id": assignment_id,
        "assignment_name": assignment_name,
        "due_at": due_at.isoformat() if due_at else None,
        "count": len(matched),
        "sample": sample,
        "handle": resolved_set.handle,
        "summary": summary,
    }


def _basis_clarify_question(
    course_name: str,
    assignment_name: str,
    low: float,
    high: float,
    percentage_matched: list[dict],
    points_matched: list[dict],
) -> str:
    """The ambiguous-range question, showing what each reading would select.

    Both counts AND names, because counts alone are exactly the information
    that makes the two readings look interchangeable — "4 or 3?" invites a
    coin flip, while seeing two disjoint name lists makes it obvious that
    only one of them is the group the instructor had in mind.
    """

    def _side(label: str, rows: list[dict]) -> str:
        names = ", ".join(row["name"] for row in rows[:_RESOLVED_SET_SAMPLE_SIZE])
        more = len(rows) - _RESOLVED_SET_SAMPLE_SIZE
        if more > 0:
            names += f", and {more} more"
        return f"{label} matches {len(rows)} student(s): {names}."

    return (
        f'Did you mean {format_range(low, high, "percentage")} or '
        f'{format_range(low, high, "points")} on "{assignment_name}" in '
        f"{course_name}? They select different students. "
        + _side(format_range(low, high, "percentage").capitalize(), percentage_matched)
        + " "
        + _side(format_range(low, high, "points").capitalize(), points_matched)
    )


async def _run_resolve_score_range_chain(
    db: AsyncSession,
    user: User,
    conversation: Conversation,
    user_msg: Message,
    action: ResolveScoreRangeAction,
    user_message: str,
    adapter: LLMAdapter,
) -> dict:
    """Resolves "students who scored between X and Y" to a recipient handle.

    Same shape as _run_resolve_missing_submissions_chain — resolve the
    course/assignment server-side, compute the set without ever putting raw
    per-student scores in the LLM's context, persist a ResolvedSet so a
    follow-up send_message/feedback turn can materialize it. The one thing
    it adds is deciding whether the band meant percent or points, which is
    genuinely ambiguous and can select opposite groups of students; see
    services/score_range.py for the rule, and note that this chain always
    states the interpretation it used, including when it picked
    automatically.
    """
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
    assignment_name = (
        assignment_row.title if assignment_row else f"Assignment {assignment_id}"
    )
    points_possible = assignment_row.points_possible if assignment_row else None

    low, high = sorted((action.min_score, action.max_score))
    # The model's `basis` is only a report of what the instructor wrote, so
    # the literal text is checked first: it is the same evidence, available
    # server-side, and not subject to the model having paraphrased it away.
    requested_basis = detect_explicit_basis(user_message) or action.basis

    print(f"Checking {course.name} for scores in {low}-{high}")
    decision = await _run_tracked_read(
        db, user, conversation, user_msg.id, "resolve_score_range",
        {
            "local_course_id": course.id,
            "assignment_id": assignment_id,
            "min_score": low,
            "max_score": high,
            "basis": requested_basis,
        },
        compute_submissions_by_score_range(
            course, assignment_id, user, db,
            low=low, high=high, points_possible=points_possible,
            requested_basis=requested_basis,
        ),
    )

    if decision.unsupported:
        # Not a clarify with candidates: there is no percent-or-points choice
        # to offer, the assignment simply has no scores to band.
        return {
            "action": "clarify",
            "clarify": True,
            "question": (
                f'"{assignment_name}" in {course.name} is graded '
                "complete/incomplete rather than with scores, so a range of "
                f"{low}-{high} doesn't apply to it. Did you mean a different "
                "assignment?"
            ),
            "partial_plan": {"local_course_id": course.id},
        }

    if decision.needs_clarification:
        question = _basis_clarify_question(
            course.name, assignment_name, low, high,
            decision.percentage_matched or [], decision.points_matched,
        )
        return {
            "action": "clarify",
            "clarify": True,
            "question": question,
            "partial_plan": {
                "local_course_id": course.id,
                "assignment_id": assignment_id,
                "min_score": low,
                "max_score": high,
            },
            # Recorded so a one-word "percentage" answers this question
            # instead of reading as a fresh request. Labels stay bare unit
            # words because resolve_against_expectation matches them as
            # substrings of the reply.
            "clarify_field": "basis",
            "clarify_candidates": [
                {"id": "percentage", "label": "percentage"},
                {"id": "points", "label": "points"},
            ],
        }

    matched = decision.matched
    basis = decision.basis

    if not matched:
        # Same reasoning as the status resolver: an empty band in this course
        # is a correct answer that hides a wrong-course request when the
        # assignment name also exists elsewhere.
        offer = _empty_filter_switch_offer(
            course, assignment_name,
            f"scored {format_range(low, high, basis)}",
            await _find_assignment_in_other_courses(
                db, user, course.id, assignment_name
            ),
            user_message,
        )
        if offer is not None:
            return offer

    query = {
        "local_course_id": course.id,
        "assignment_id": assignment_id,
        "min_score": low,
        "max_score": high,
        "basis": basis,
        "points_possible": points_possible,
    }
    resolved_set = await create_resolved_set(
        db, conversation, kind="score_range", query=query, recipients=matched,
    )

    sample = [r["name"] for r in matched[:_RESOLVED_SET_SAMPLE_SIZE]]
    interpretation = describe_basis(decision, low, high, points_possible)
    band = format_range(low, high, basis)
    if matched:
        summary = (
            f"{len(matched)} active student(s) in {course.name} scored "
            f'{band} on "{assignment_name}". {interpretation}'
        )
        if sample:
            summary += f" Examples: {', '.join(sample)}."
    else:
        summary = (
            f"No active students in {course.name} scored {band} on "
            f'"{assignment_name}". {interpretation}'
        )

    return {
        "action": "resolve_score_range",
        "local_course_id": course.id,
        "course_name": course.name,
        "assignment_id": assignment_id,
        "assignment_name": assignment_name,
        "points_possible": points_possible,
        "min_score": low,
        "max_score": high,
        "basis": basis,
        "basis_reason": decision.reason,
        "basis_explanation": interpretation,
        "range_label": band,
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


def _format_analysis_line(entry: dict) -> str:
    """One assignment's line in the course-wide summary.

    The count is always the full matched total while the names may have been
    cut by the shared budget, so a truncated line says how many of the total
    it is actually showing. "Assignment 1: 60 (Alice, Bob, ...)" otherwise
    reads as the complete roster for that assignment.
    """
    name = entry["assignment_name"]
    count = entry["count"]
    students = entry["students"]
    if not students:
        return f"{name}: {count}"
    if entry.get("students_truncated"):
        return f"{name}: {count} (showing {len(students)}: {', '.join(students)})"
    return f"{name}: {count} ({', '.join(students)})"


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
    statuses = action.status
    slug = status_slug(statuses)

    logger.info("Gathering %s assignments", course.name)
    fetch_action = FetchAssignmentsAction(local_course_id=course.id)
    assignments_result = await _run_tracked_read(
        db, user, conversation, user_msg.id, "fetch_assignments",
        fetch_action.model_dump(), execute_tool(db, user, fetch_action),
    )
    assignments = assignments_result["assignments"]
    if not assignments:
        return {
            "action": "analyze_course_submissions",
            "status": slug,
            "course": course.name,
            "assignments": [],
            "total": 0,
            "summary": f"{course.name} has no assignments yet, so there is nothing to analyse.",
        }

    # Drafts are invisible to students and cannot have real submissions, so
    # every active student looks "missing" on one. course_overview.py draws
    # exactly this line for the dashboard's missing/late counts; the chat
    # answer to the same question has to agree with it, or the assistant
    # contradicts the course again — the bug this chain exists to fix.
    # Defaulting to published matches AssignmentResponse.published and
    # get_assignments' own item.get("published", True): an older Canvas
    # payload that omits the field is a real assignment, not a draft.
    published = [a for a in assignments if a.get("published", True)]
    if not published:
        return {
            "action": "analyze_course_submissions",
            "status": slug,
            "course": course.name,
            "assignments": [],
            "total": 0,
            "summary": (
                f"All {len(assignments)} assignment(s) in {course.name} are still "
                "unpublished, so students have nothing to submit yet."
            ),
        }

    logger.info(
        "Checking %s for %s submissions", course.name, status_label(statuses)
    )
    # One roster for the whole scan. compute_submissions_by_status would
    # otherwise re-fetch enrollments from Canvas for every assignment.
    active_names = await active_roster_names(course, user, db)
    per_assignment: list[dict] = []
    names_budget = _COURSE_ANALYSIS_MAX_NAMES
    truncated = False
    # Course-wide split, accumulated across assignments so a combined scan can
    # report "12 missing and 5 late" rather than an unattributed 17.
    total_counts: dict[str, int] = dict.fromkeys(statuses, 0)

    for assignment in published:
        canvas_assignment_id = assignment.get("id")
        if canvas_assignment_id is None:
            continue
        matched, assignment_counts = await _run_tracked_read(
            db, user, conversation, user_msg.id, "analyze_course_submissions",
            {
                "local_course_id": course.id,
                "assignment_id": canvas_assignment_id,
                "status": slug,
                "statuses": list(statuses),
            },
            compute_submissions_by_status_breakdown(
                course, canvas_assignment_id, user, db, statuses,
                active_names=active_names,
            ),
        )
        for status, count in assignment_counts.items():
            total_counts[status] += count
        names = [student["name"] for student in matched]
        # Truncation is tracked per assignment, not just globally: the budget
        # is shared across the whole scan, so a later assignment can be cut
        # short (or get no names at all) while an earlier one was listed in
        # full. Rendering both the same way made a partial list read as the
        # complete roster for that assignment.
        entry_truncated = len(names) > names_budget
        if entry_truncated:
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
                "students_truncated": entry_truncated,
            }
        )

    total = sum(entry["count"] for entry in per_assignment)
    combined = len(statuses) > 1
    label = status_label(statuses)
    if total == 0:
        # A late scan only establishes that nothing was submitted late. It
        # says nothing about work never submitted at all, so it must not
        # claim students are up to date — that is the assistant contradicting
        # the course, in the opposite direction from bug 12. A combined scan
        # did cover both, so it is the one case that can say so.
        if combined:
            summary = (
                f"No missing or late submissions in {course.name} — every active "
                f"student has submitted all {len(per_assignment)} published "
                "assignment(s) on time."
            )
        elif statuses[0] == "missing":
            summary = (
                f"No missing submissions in {course.name} — every active student "
                f"has submitted all {len(per_assignment)} published assignment(s)."
            )
        else:
            summary = (
                f"No late submissions in {course.name} across "
                f"{len(per_assignment)} published assignment(s). This does not "
                "cover work that was never submitted — ask about missing "
                "submissions for that."
            )
    else:
        affected = [entry for entry in per_assignment if entry["count"]]
        lines = "; ".join(_format_analysis_line(entry) for entry in affected)
        summary = (
            f"{total} {label} submission(s) across {len(affected)} of "
            f"{len(per_assignment)} published assignment(s) in {course.name}. {lines}."
        )
        if combined:
            split = " and ".join(
                f"{total_counts.get(status, 0)} {status}" for status in statuses
            )
            summary += f" Combined from both categories: {split}."
        if truncated:
            summary += (
                f" Student names are capped at {_COURSE_ANALYSIS_MAX_NAMES} for "
                "the whole course; open the course Submissions view for the "
                "full lists."
            )

    return {
        "action": "analyze_course_submissions",
        "status": slug,
        "statuses": list(statuses),
        "status_counts": {status: total_counts[status] for status in statuses},
        "course": course.name,
        "assignments": per_assignment,
        "total": total,
        "truncated": truncated,
        "summary": summary,
    }


# Derived, not restated. This was a third hand-written copy of the same three
# statuses; "submitted" meaning one thing in analytics and another in chat is
# how an instructor gets two different counts for one question.
_ACTUAL_SUBMISSION_STATUSES = frozenset(SUBMITTED_STATUSES)
_ASSIGNMENT_STATUS_MAX_RESULTS = 25
_ASSIGNMENT_STATUS_MAX_CONCURRENT_FETCHES = 4


async def _fetch_assignment_submissions_bounded(
    db: AsyncSession,
    user: User,
    conversation: Conversation,
    triggering_message_id: int,
    course: Course,
    assignments: list[dict[str, Any]],
    status: str,
) -> list[list[Any]]:
    """Fetch assignment submissions with bounded Canvas concurrency.

    Canvas has no course-wide submission endpoint in the current integration.
    A small semaphore removes the serial N+1 latency without creating an
    unbounded request burst. Tool-call rows are created before the requests
    and finalized afterward so the existing audit trail remains intact while
    avoiding concurrent writes through one AsyncSession.
    """
    semaphore = asyncio.Semaphore(_ASSIGNMENT_STATUS_MAX_CONCURRENT_FETCHES)
    logs: list[ToolCallLog] = []
    for assignment in assignments:
        params = {
            "local_course_id": course.id,
            "assignment_id": int(assignment["id"]),
            "status": status,
        }
        logs.append(
            ToolCallLog(
                conversation_id=conversation.id,
                user_id=user.id,
                course_id=course.id,
                triggering_message_id=triggering_message_id,
                action_name="find_assignments_by_submission_status",
                parameters=params,
                status="executing",
            )
        )
    db.add_all(logs)
    await db.flush()

    async def fetch(assignment: dict[str, Any]) -> list[Any]:
        async with semaphore:
            # Each concurrent Canvas fetch gets its own short-lived session;
            # AsyncSession is intentionally not shared across tasks.
            async with AsyncSessionLocal() as fetch_db:
                return await get_submissions(
                    course.id,
                    int(assignment["id"]),
                    user,
                    course.canvas_url,
                    fetch_db,
                )

    results = await asyncio.gather(
        *(fetch(assignment) for assignment in assignments),
        return_exceptions=True,
    )
    first_error: BaseException | None = None
    for log, result in zip(logs, results, strict=True):
        if isinstance(result, BaseException):
            log.status = "failed"
            log.error_detail = safe_exception_text(result)
            first_error = first_error or result
            continue
        log.status = "executed"
        log.completed_at = datetime.now(UTC)
    await db.flush()
    if first_error is not None:
        raise first_error
    return [result for result in results if not isinstance(result, BaseException)]


def _format_assignment_status_match(entry: dict[str, Any]) -> str:
    """Format the count that matched the requested filter.

    ``submitted_count`` is useful diagnostic data, but it is not the answer
    for missing/late queries. Keeping this formatting in one helper prevents
    future response changes from accidentally selecting the broader count.
    """
    return f"{entry['assignment_name']} ({entry['matching_count']} matching)"


async def _run_find_assignments_by_submission_status_chain(
    db: AsyncSession,
    user: User,
    conversation: Conversation,
    user_msg: Message,
    action: FindAssignmentsBySubmissionStatusAction,
) -> dict:
    """Return published assignments matching an explicit submission state.

    This is deliberately separate from the missing/late course overview:
    ``any_submissions`` and ``no_submissions`` are assignment-level filters,
    while the existing analyzer is a course-wide missing/late report.
    Counts are computed from active-roster records server-side; no model
    supplied IDs or inferred percentages participate in the decision.
    """
    course = await resolve_course(db, user, action.local_course_id)
    assignments_result = await _run_tracked_read(
        db,
        user,
        conversation,
        user_msg.id,
        "fetch_assignments",
        {"local_course_id": course.id},
        execute_tool(db, user, FetchAssignmentsAction(local_course_id=course.id)),
    )
    published = [
        assignment
        for assignment in assignments_result.get("assignments", [])
        if assignment.get("published", True) and assignment.get("id") is not None
    ]
    active_names = await active_roster_names(course, user, db)
    matches: list[dict[str, Any]] = []
    aggregate_recipients: dict[int, dict[str, Any]] = {}

    submission_batches = await _fetch_assignment_submissions_bounded(
        db,
        user,
        conversation,
        user_msg.id,
        course,
        published,
        action.status,
    )

    for assignment, submissions in zip(published, submission_batches, strict=True):
        assignment_id = int(assignment["id"])
        submitted_ids = {
            int(submission.user_id)
            for submission in submissions
            if submission.user_id in active_names
            and submission.status in _ACTUAL_SUBMISSION_STATUSES
        }
        submitted_count = len(submitted_ids)

        if action.status == "any_submissions":
            matching_recipients = {
                int(submission.user_id): {
                    "user_id": int(submission.user_id),
                    "name": active_names[int(submission.user_id)],
                }
                for submission in submissions
                if submission.user_id in active_names
                and submission.status in _ACTUAL_SUBMISSION_STATUSES
            }
        elif action.status == "no_submissions":
            matching_recipients = {
                student_id: {"user_id": student_id, "name": name}
                for student_id, name in active_names.items()
                if student_id not in submitted_ids
            }
        else:
            matching_statuses = (
                {SubmissionStatus.missing, SubmissionStatus.unsubmitted}
                if action.status == "missing_submissions"
                else {SubmissionStatus.late}
            )
            matching_recipients = {
                int(submission.user_id): {
                    "user_id": int(submission.user_id),
                    "name": active_names[int(submission.user_id)],
                }
                for submission in submissions
                if submission.user_id in active_names
                and submission.status in matching_statuses
            }

        if action.status == "any_submissions" and submitted_count == 0:
            continue
        if action.status == "no_submissions" and submitted_count != 0:
            continue

        if action.status in {"missing_submissions", "late_submissions"}:
            matching_count = len(matching_recipients)
            if matching_count == 0:
                continue
            count = matching_count
        else:
            # For any/no-submission filters, report the number of students
            # matching the requested assignment-level condition as well. In
            # particular, a no-submissions assignment can have zero
            # submitted students but many matching recipients.
            count = len(matching_recipients)

        aggregate_recipients.update(matching_recipients)

        matches.append(
            {
                "assignment_id": assignment_id,
                "assignment_name": assignment.get("name") or "Untitled assignment",
                "due_at": assignment.get("due_at"),
                "submitted_count": submitted_count,
                "matching_count": count,
            }
        )

    total_matches = len(matches)
    visible_matches = matches[:_ASSIGNMENT_STATUS_MAX_RESULTS]
    labels = {
        "any_submissions": "at least one submission",
        "no_submissions": "no submissions",
        "missing_submissions": "missing submissions",
        "late_submissions": "late submissions",
    }
    label = labels[action.status]
    recipient_handle = None
    if aggregate_recipients:
        resolved_set = await create_resolved_set(
            db,
            conversation,
            kind=f"assignment_status_{action.status}",
            query={
                "local_course_id": course.id,
                "status": action.status,
                "assignment_ids": [entry["assignment_id"] for entry in matches],
            },
            recipients=list(aggregate_recipients.values()),
        )
        recipient_handle = resolved_set.handle
    if visible_matches:
        summary = (
            f"{total_matches} published assignment(s) in {course.name} have {label}: "
            + "; ".join(
                _format_assignment_status_match(entry)
                for entry in visible_matches
            )
            + "."
        )
        if recipient_handle:
            summary += " I can message these matching students if you want."
        if total_matches > _ASSIGNMENT_STATUS_MAX_RESULTS:
            summary += (
                f" Showing the first {_ASSIGNMENT_STATUS_MAX_RESULTS}; "
                "narrow the request for the rest."
            )
    else:
        summary = f"No published assignments in {course.name} have {label}."

    return {
        "action": "find_assignments_by_submission_status",
        "course": course.name,
        "status": action.status,
        "assignments": visible_matches,
        "count": total_matches,
        "recipient_handle": recipient_handle,
        "summary": summary,
    }
_STATUS_VERBS = {"missing": "are missing", "late": "submitted late"}


def _build_resolve_missing_summary(
    *,
    course_name: str,
    assignment_name: str,
    due_at: datetime | None,
    statuses: Sequence[str],
    status_counts: dict[str, int],
    matched_count: int,
    sample: list[str],
) -> str:
    """Name the assignment/course explicitly and explain empty results
    clearly — mirrors _build_fetch_submissions_summary so chat analytics
    are scannable even when the model paraphrases in a follow-up respond.

    A multi-status request always states the per-category split, including a
    zero side ("4 missing and 0 late"). Collapsing "0 late" away would make a
    real union indistinguishable from the model having quietly resolved one
    category, which is the failure this combined mode exists to prevent.
    """
    due_part = f" (due {due_at.strftime('%B %d, %Y at %I:%M %p')})" if due_at else ""
    combined = len(statuses) > 1

    if matched_count == 0:
        if combined:
            return (
                f'No active students are missing or submitted "{assignment_name}"'
                f"{due_part} late in {course_name}."
            )
        if statuses and statuses[0] == "late":
            return (
                f'No active students submitted "{assignment_name}"{due_part} '
                f"late in {course_name}."
            )
        return (
            f'No active students are missing "{assignment_name}"{due_part} '
            f"in {course_name}."
        )

    if combined:
        split = " and ".join(
            f"{status_counts.get(status, 0)} {status}" for status in statuses
        )
        summary = (
            f"{matched_count} active student(s) in {course_name} — {split} — "
            f'for "{assignment_name}"{due_part}. '
            "This is one combined group of both categories."
        )
    else:
        verb = _STATUS_VERBS.get(statuses[0] if statuses else "missing", "are missing")
        summary = (
            f'{matched_count} active student(s) in {course_name} {verb} '
            f'"{assignment_name}"{due_part}.'
        )
    if sample:
        summary += f" Examples: {', '.join(sample)}."
    return summary


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
            "local_course_id": course.id,
            "course_name": course.name,
            "assignment_id": None,
            "assignment_name": None,
            "due_at": None,
            "submission_rate_percent": None,
            "summary": (
                f"{course.name} has no assignments yet, so submission-rate "
                "analytics are unavailable."
            ),
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
            "local_course_id": course.id,
            "course_name": course.name,
            "assignment_id": None,
            "assignment_name": None,
            "due_at": None,
            "submission_rate_percent": None,
            "summary": (
                f"No assignment in {course.name} currently has a submission rate "
                f"{action.comparator} {action.threshold_percent}%."
            ),
        }

    best = max(matches, key=lambda m: m["due_at"] or datetime.min.replace(tzinfo=UTC))
    due_at = best["due_at"].isoformat() if best["due_at"] else None
    rate = round(best["rate_percent"], 1)
    return {
        "action": "find_assignment_by_submission_rate",
        "matched": True,
        "local_course_id": course.id,
        "course_name": course.name,
        "assignment_id": best["id"],
        "assignment_name": best["name"],
        "due_at": due_at,
        "submission_rate_percent": rate,
        "summary": (
            f'"{best["name"]}" in {course.name} has a {rate}% submission rate '
            f'(current due date: {due_at or "not set"}).'
        ),
    }


_UPDATE_ASSIGNMENT_FIELDS = ("title", "description", "due_date", "points_possible")


async def _resolve_create_target_course(
    db: AsyncSession,
    user: User,
    conversation: Conversation,
    course_names: list[CanvasCourseName],
    proposed: dict[str, Any],
    user_message: str,
) -> Course | dict:
    """Decide which course a create_assignment / create_quiz turn is really
    about, before a preview quotes one.

    Precedence, strongest signal first:

    1. A course the message itself unambiguously names. The instructor typed
       it; nothing beats that.
    2. The conversation's course. By the time a turn reaches here this has
       already survived the explicit dropdown selection and
       _resolve_course_switch, so it is a resolved value, not a guess.
    3. proposed["local_course_id"] — the model's own echo, which is the value
       that goes wrong and so is trusted last.

    Every branch ends at resolve_course, so an id that is not this
    instructor's still fails the ownership check exactly as before.

    Returns the Course, or a clarify dict when there is nothing to resolve.
    """
    named = _prescan_course_reference(course_names, user_message)
    if named is not None and named.local_course_id is not None:
        return await resolve_course(db, user, named.local_course_id)

    for candidate in (conversation.course_id, proposed.get("local_course_id")):
        resolved_id = _coerce_int(candidate)
        if resolved_id is not None:
            return await resolve_course(db, user, resolved_id)

    options = ", ".join(
        sorted({_course_display_name(course_name) for course_name in course_names})
    )
    return {
        "action": "clarify",
        "clarify": True,
        "question": (
            f"Which course should I create this in? Options: {options}."
            if options
            else "Which course should I create this in?"
        ),
        "partial_plan": {
            key: value
            for key, value in proposed.items()
            if key not in ("action", "local_course_id") and value is not None
        },
    }


async def _run_create_chain(
    db: AsyncSession,
    user: User,
    conversation: Conversation,
    course_names: list[CanvasCourseName],
    proposed: dict[str, Any],
    user_message: str,
    summary: str | None = None,
) -> dict:
    """create_assignment / create_quiz, with the course resolved server-side.

    These two were the only writes with no resolver in front of them: the
    model's action went straight to a preview. Nothing downstream catches a
    wrong course either — the intent_preview path resolves
    proposed["local_course_id"] only to check the instructor *owns* it, never
    to check it is the one they meant. So "create an assignment for capstone
    project" typed while another course was active built it against the active
    course, and the confirm card named that course, which looks correct.

    Only local_course_id is corrected here. Title, description, due date and
    points stay exactly as the model produced them: resolving those would be
    inventing them. Everything else — missing-field clarifies, the past-due-date
    clarify, due-date timezone resolution and the preview metadata itself —
    is left to the existing intent_preview dispatch rather than duplicated.

    Takes the proposed dict rather than a parsed action because both routes in
    have to land here: the model naming create_assignment directly, and the
    model wrapping it in intent_preview as the system prompt asks. Guarding
    only the first would leave the common case unresolved.
    """
    resolved = await _resolve_create_target_course(
        db, user, conversation, course_names, proposed, user_message
    )
    if isinstance(resolved, dict):
        return resolved

    corrected = {**proposed, "local_course_id": resolved.id}
    action_name = str(corrected.get("action", "create")).replace("_", " ")
    return await execute_tool(
        db,
        user,
        IntentPreviewAction(
            summary=summary
            or (
                f"I'll {action_name} in {resolved.name} as described below. "
                "Please review before confirming."
            ),
            proposed_action=corrected,
        ),
    )


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

    assignment_row = await db.scalar(
        select(Assignment).where(
            Assignment.course_id == course.id,
            Assignment.canvas_assignment_id == str(assignment_id),
        )
    )
    assignment_name = assignment_row.title if assignment_row else None

    proposed_action: dict[str, Any] = {
        "action": "update_assignment",
        "local_course_id": course.id,
        "assignment_id": assignment_id,
    }
    if assignment_name:
        proposed_action["assignment_name"] = assignment_name
    instructor_timezone = get_instructor_canvas_timezone(user, course.canvas_url)
    for field_name in _UPDATE_ASSIGNMENT_FIELDS:
        value = getattr(action, field_name)
        if value is not None:
            # Resolve here too, so the confirm card and the Canvas write quote
            # one instant rather than the raw string the model produced.
            if field_name == "due_date" and isinstance(value, str):
                value = resolve_due_date(value, user, course.canvas_url)
            proposed_action[field_name] = value

    preview_metadata = generate_write_preview(
        proposed_action, course, instructor_timezone
    )
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
        return _preserve_grade_clarification_context(resolved, action)
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
    # One reading of the phrase, shared with the message chain — see audience.
    reading = read_audience_phrase(action.student_reference)
    bulk_update = reading.scope is AudienceScope.EVERYONE
    if student_id is not None:
        valid_ids = {_coerce_int(s.get("user_id")) for s in submissions}
        valid_ids.discard(None)
        if student_id not in valid_ids:
            student_id = None

    assignment_row = await db.scalar(
        select(Assignment).where(
            Assignment.course_id == course.id,
            Assignment.canvas_assignment_id == str(assignment_id),
        )
    )
    assignment_name = assignment_row.title if assignment_row else None

    # A resolved set from an earlier resolve_missing_submissions /
    # resolve_score_range turn targets that whole group at once. Checked
    # before student_reference, because a handle is an exact set the app
    # computed itself and a reference is a phrase the model wrote — when
    # both arrive, the computed one wins.
    handle = getattr(action, "recipient_handle", None)
    if handle:
        resolved_set = await materialize_resolved_set(db, handle, conversation.id)
        if resolved_set is None:
            return {
                "action": "clarify",
                "clarify": True,
                "question": (
                    "That resolved group is no longer available (it may have "
                    "expired) — should I work out who it covered again?"
                ),
                "partial_plan": _grade_partial_plan(action, course.id, assignment_id),
            }
        # The set may have been resolved against a DIFFERENT assignment
        # ("who's missing lab 4" → "add 5 marks to them on lab 5"), which is a
        # legitimate request. Intersect with this assignment's submissions so
        # the grade targets are always rows that actually exist here, rather
        # than trusting the snapshot's ids against the wrong assignment.
        wanted = {
            _coerce_int(r.get("user_id")) for r in resolved_set.snapshot_recipients
        }
        wanted.discard(None)
        targeted = [
            s for s in submissions if _coerce_int(s.get("user_id")) in wanted
        ]
        if not targeted:
            return {
                "action": "clarify",
                "clarify": True,
                "question": (
                    f"None of those {len(wanted)} student(s) have a submission "
                    f"record on that assignment in {course.name}, so there's "
                    "nothing to grade for them there."
                ),
                "partial_plan": _grade_partial_plan(action, course.id, assignment_id),
            }
        return _build_grade_handoff_result(
            course,
            assignment_id,
            targeted,
            action.new_grade,
            action.feedback,
            assignment_name=assignment_name,
        )

    if reading.scope is AudienceScope.BY_STATUS and reading.statuses:
        targeted = select_by_status(submissions, reading.statuses)
        if not targeted:
            return {
                "action": "clarify",
                "clarify": True,
                "question": (
                    f"No students in {course.name} match that on "
                    f"{assignment_name or 'that assignment'}, so there's "
                    "nothing to apply it to. Who did you mean?"
                ),
                "partial_plan": _grade_partial_plan(action, course.id, assignment_id),
            }
        return await _grade_handoff_with_reusable_audience(
            db,
            conversation,
            course,
            assignment_id,
            targeted,
            action,
            assignment_name=assignment_name,
        )

    if bulk_update:
        return await _grade_handoff_with_reusable_audience(
            db,
            conversation,
            course,
            assignment_id,
            submissions,
            action,
            assignment_name=assignment_name,
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
            "clarify_field": "student_reference",
            "clarify_candidates": [
                {
                    "id": _coerce_int(s.get("user_id")),
                    "label": s.get("student_name") or f"Student {s.get('user_id')}",
                }
                for s in submissions
            ],
        }

    selected = next(s for s in submissions if _coerce_int(s.get("user_id")) == student_id)
    return _build_grade_handoff_result(
        course,
        assignment_id,
        [selected],
        action.new_grade,
        action.feedback,
        assignment_name=assignment_name,
    )


_GRADE_HANDOFF_NAMED_STUDENT_LIMIT = 3

# "+5" / "-3" — a relative adjustment rather than a grade.
#
# "Add 5 marks to everyone" has no single new_grade: each student's target
# depends on what they already have. Emitting one absolute value for a
# relative request would set the whole class to 5, which is why this is
# parsed out and applied per student against real fetched scores instead.
_GRADE_DELTA_RE = re.compile(r"^([+-])\s*(\d+(?:\.\d+)?)$")


def parse_grade_delta(new_grade: str) -> float | None:
    """The signed adjustment in a relative grade, or None if it's absolute.

    Deliberately strict: only a leading sign followed by a bare number. "85"
    stays absolute (a student can legitimately be given 85), and anything
    else — letter grades, "complete", percentages — is left alone for the
    existing path to handle.
    """
    match = _GRADE_DELTA_RE.match((new_grade or "").strip())
    if not match:
        return None
    sign, magnitude = match.groups()
    return float(magnitude) if sign == "+" else -float(magnitude)


def _format_grade_value(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else str(round(value, 2))


def apply_grade_delta(
    submissions: list[dict], delta: float
) -> tuple[list[dict], list[dict]]:
    """Per-student targets for a relative adjustment.

    Returns (adjusted, skipped). A student with no score yet is *skipped*,
    not treated as a zero: "add 5" to someone who has never been graded
    would invent a 5 out of nothing and mark ungraded work as graded. The
    caller says how many were skipped rather than quietly shrinking the
    group.

    Results are clamped at 0 — Canvas rejects negative scores, and silently
    submitting one would fail the whole batch partway through.
    """
    adjusted: list[dict] = []
    skipped: list[dict] = []
    for submission in submissions:
        user_id = _coerce_int(submission.get("user_id"))
        if user_id is None:
            continue
        current = submission.get("score")
        if current is None:
            skipped.append(submission)
            continue
        try:
            target = float(current) + delta
        except (TypeError, ValueError):
            skipped.append(submission)
            continue
        adjusted.append(
            {
                "user_id": user_id,
                "name": submission.get("student_name") or f"Student {user_id}",
                "current_score": float(current),
                "new_grade": _format_grade_value(max(target, 0.0)),
            }
        )
    return adjusted, skipped


def _grade_handoff_student_phrase(submissions: list[dict], student_count: int) -> str:
    """Name a small resolved set in the assistant bubble; fall back to count."""
    if student_count > _GRADE_HANDOFF_NAMED_STUDENT_LIMIT:
        return f"{student_count} student{'s' if student_count != 1 else ''}"

    names = [
        submission.get("student_name") or f"Student {submission.get('user_id')}"
        for submission in submissions
        if _coerce_int(submission.get("user_id")) is not None
    ]
    if not names:
        return f"{student_count} student{'s' if student_count != 1 else ''}"
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return f"{names[0]}, {names[1]}, and {names[2]}"


async def _grade_handoff_with_reusable_audience(
    db: AsyncSession,
    conversation: Conversation,
    course: Course,
    assignment_id: int,
    submissions: list[dict],
    action: Any,
    *,
    assignment_name: str | None = None,
) -> dict:
    """A grade handoff that leaves its audience behind for the next turn.

    Working out who a request covers is the expensive, error-prone half of it,
    and until now only the analytics resolvers banked that work:
    resolve_missing_submissions and resolve_score_range each stored their
    group and handed back a recipient_handle, so a later send_message could
    reuse the exact set. The grade chain resolved just as carefully and then
    threw the answer away.

    That made the two directions behave differently for no reason an
    instructor could see. "Message everyone who missed lab 4, actually give
    them feedback instead" carried the group across, because the message side
    had a handle. "Give feedback to everyone who submitted, actually send them
    a message instead" started over, because the grade side had none — and
    starting over is where a set silently changes size.

    recipient_handle is on both UpdateGradeAction and SendMessageAction and
    materialize_resolved_set checks ownership and expiry rather than which
    feature produced the set, so one handle already works for either channel.
    This just stops the grade side being the one that never issues one.
    """
    result = _build_grade_handoff_result(
        course,
        assignment_id,
        submissions,
        action.new_grade,
        action.feedback,
        assignment_name=assignment_name,
    )
    # Only a real handoff carries an audience; a clarify has not resolved one.
    handoff = result.get("grade_handoff")
    if not isinstance(handoff, dict):
        return result

    handle = await bank_audience(
        db,
        conversation,
        kind="grade_targets",
        query={
            "local_course_id": course.id,
            "assignment_id": assignment_id,
            "student_reference": getattr(action, "student_reference", None),
        },
        rows=submissions,
    )
    if handle:
        handoff["recipient_handle"] = handle
    return result


def _build_grade_handoff_result(
    course: Course,
    assignment_id: int,
    submissions: list[dict],
    new_grade: str,
    feedback: str | None,
    *,
    assignment_name: str | None = None,
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
                "feedback": feedback,
            },
        }

    # A relative request ("add 5 marks to everyone") resolves to a different
    # target per student, computed here from the scores the chain already
    # fetched — the one place that has them.
    delta = parse_grade_delta(new_grade)
    student_grades: list[dict] | None = None
    skipped: list[dict] = []
    if delta is not None:
        student_grades, skipped = apply_grade_delta(submissions, delta)
        if not student_grades:
            return {
                "action": "clarify",
                "clarify": True,
                "question": (
                    f"No students in {course.name} have a grade on that assignment "
                    f"yet, so there's nothing to adjust by {new_grade}. Did you mean "
                    "to set a grade instead?"
                ),
                "partial_plan": {
                    "action": "update_grade",
                    "local_course_id": course.id,
                    "assignment_id": assignment_id,
                    "new_grade": new_grade,
                    "feedback": feedback,
                },
            }
        student_ids = [row["user_id"] for row in student_grades]

    student_count = len(student_ids)
    assignment_label = (
        f'assignment "{assignment_name}"'
        if assignment_name
        else f'assignment "{assignment_id}"'
    )
    student_phrase = _grade_handoff_student_phrase(submissions, student_count)
    # Keep the assistant bubble brief; the action card carries the actual link
    # and the Grades tab carries the detailed warnings/confirmation state.
    if delta is not None:
        direction = "Adding" if delta > 0 else "Subtracting"
        message = (
            f"{direction} {_format_grade_value(abs(delta))} to {student_count} "
            f"already-graded student(s) in {course.name}."
        )
        if skipped:
            # Said out loud: an unexplained smaller number reads as the
            # resolver having lost students rather than having declined to
            # invent grades for work nobody has marked.
            message += (
                f" {len(skipped)} student(s) have no grade yet and were left out — "
                "a relative change needs an existing score."
            )
        message += (
            " Open the Grades tab to review the Canvas preview, warnings, and "
            "approval step before anything is submitted."
        )
    else:
        message = (
            f"I found {student_phrase} for {course.name}. Open the Grades tab to review "
            "the Canvas preview, warnings, and approval step before anything is submitted."
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
            # Absolute for a normal update. For a relative one this stays the
            # instructor's literal "+5" so the card can show what was asked,
            # while student_grades carries the actual per-student targets —
            # sending "+5" to the Grades tab as a grade would set everyone to 5.
            "new_grade": new_grade,
            "grade_delta": delta,
            "student_grades": student_grades,
            "skipped_ungraded_count": len(skipped) if delta is not None else 0,
            "feedback": feedback,
        },
    }


def _build_grouped_grade_update_result(
    course: Course,
    assignment_id: int,
    submissions: list[dict],
    new_grade: str,
    feedback: str | None,
) -> dict:
    # Compatibility wrapper for older tests/imports. Bulk grade updates now use
    # the same handoff shape as single-student updates.
    return _build_grade_handoff_result(
        course, assignment_id, submissions, new_grade, feedback
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
        "feedback": getattr(action, "feedback", None),
    }
    return {key: value for key, value in plan.items() if value is not None}


def _is_bulk_student_reference(reference: str) -> bool:
    """Kept as a thin name over the shared reader — audience.py owns what a
    "who" phrase means now, so the grade chain and the message chain cannot
    drift into reading the same sentence differently."""
    return read_audience_phrase(reference).scope is AudienceScope.EVERYONE


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
    resolved: dict[str, int | None] = dict.fromkeys(references)
    pronoun_references = {
        reference
        for reference in references
        if reference.strip().lower() in {
            "this student",
            "that student",
            "the student",
            "this person",
            "that person",
            "them",
        }
    }
    # A pronoun is safe only when prior trusted context identifies exactly one
    # student. Never let the resolver LLM pick an arbitrary student from a
    # multi-name roster just because the user said “this student”.
    memory = conversation.field_memory or {}
    remembered_id = _coerce_int(memory.get("student_id"))
    if remembered_id is not None and remembered_id in known:
        remembered_candidates: list[int] = [remembered_id]
    else:
        remembered_candidates = []
        for item in memory.get("recent_students") or []:
            if not isinstance(item, dict):
                continue
            candidate_id = _coerce_int(item.get("id"))
            if candidate_id is not None and candidate_id in known:
                remembered_candidates.append(candidate_id)
        remembered_candidates = list(dict.fromkeys(remembered_candidates))
    if len(remembered_candidates) == 1:
        for reference in pronoun_references:
            resolved[reference] = remembered_candidates[0]

    named_references = [reference for reference in references if reference not in pronoun_references]
    named_resolved = await _resolve_students_via_llm(
        list(known.values()), named_references, user_message, adapter
    )
    resolved.update(named_resolved)

    unresolved = [ref for ref in named_references if resolved.get(ref) is None]
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


def _format_outstanding_question(expectation: dict[str, Any] | None) -> str:
    """Tell the model it is mid-conversation, and about what.

    The model sees the transcript, but a transcript does not say which line
    is still waiting for an answer, and SCOPE CHECK runs before anything
    else in the prompt. So a reply that only makes sense as an answer --
    "monty python is a good childrens book", offered as an assignment
    description -- was judged on its own as a request about a book, and
    rejected as unrelated to Canvas. It was neither a request nor unrelated.

    Stated as a fact about the conversation rather than an instruction to
    obey, and left as "most likely" on purpose: an instructor is always
    allowed to change the subject, and a rule that forced every reply to be
    an answer would trap them in a question they no longer want.
    """
    if not expectation:
        return ""
    question = str(expectation.get("question") or "").strip()
    if not question:
        return ""
    lines = [
        "OUTSTANDING QUESTION:",
        f'One turn ago you asked the instructor: "{question}"',
        "Their next message is most likely the answer to it. Read it that way",
        "first, and fold it into the request that was already in progress —",
        "the details you had then are in FIELD MEMORY above.",
        "An answer can look like anything, including a bare fragment or a",
        "sentence with no Canvas words in it at all. It is still an answer, so",
        "it is in scope: do not return out_of_scope for it.",
        "If they have plainly moved on to something else, treat that as a new",
        "request and let this question go.",
    ]
    return "\n".join(lines)


def _is_blank(value: Any) -> bool:
    return not isinstance(value, str) or not value.strip()


# The write actions whose text content is written from the instructor's
# request rather than collected by asking. Mapped to the drafter that knows
# how to write that kind of thing.
_CONTENT_DRAFTERS = {
    "create_assignment": draft_assignment_content,
    "create_quiz": draft_quiz_content,
}


def _proposed_write(action: Any, names: Any) -> dict | None:
    """The proposed write as a plain dict, whether it arrived bare or wrapped.

    Both routes have to be covered here or the behaviour depends on whether
    the model followed the system prompt that turn, which is exactly the
    kind of difference that produces "it works when I say it one way".
    """
    if action.action in names:
        return action.model_dump()
    if (
        action.action == "intent_preview"
        and isinstance(getattr(action, "proposed_action", None), dict)
        and action.proposed_action.get("action") in names
    ):
        return dict(action.proposed_action)
    return None


def _rebuild_with(action: Any, proposed: dict) -> Any:
    if action.action == "intent_preview":
        return action.model_copy(update={"proposed_action": proposed})
    # model_copy rather than a re-parse, so filling a gap can never be the
    # thing that fails the turn. The schemas no longer carry content minimums
    # that could raise here (see FORM_OWNED_FIELDS), but re-validating an
    # action that already parsed to improve it is a risk taken for nothing:
    # the real gate is the validator at confirm — validate_quiz_for_create /
    # validate_assignment_for_create — which runs on whatever the instructor
    # finally approves rather than on an intermediate draft.
    return action.model_copy(update=proposed)


async def _ensure_write_content_is_drafted(
    action: Any, user_message: str, adapter: LLMAdapter
) -> Any:
    """Write an assignment's or quiz's title and description before the
    instructor is shown a preview of it.

    This is what replaced the interrogation. create_assignment used to
    refuse to go anywhere without a title, a description, a due date and a
    point value, asking for each in turn -- so "create an assignment" cost
    four round trips, and the third one failed outright: an instructor who
    answered the description question with "monty python is a good childrens
    book" got told their request was out of scope, because by then nothing
    remembered that a description had been asked for.

    Reading the whole request at once is also the only thing that can handle
    an ambiguous phrase. "An assignment called September 11th due next
    Friday" needs something to decide that the first date-shaped phrase is a
    name and the second is a deadline; a question about one field at a time
    never even poses that question. The model gets it wrong sometimes, and
    that is fine -- it lands in a form field the instructor can correct in
    one keystroke, which is cheaper than the round trip that asking would
    have cost even when the answer was right.

    Only fills what is missing, so a title the instructor actually typed is
    never quietly rewritten into something the model preferred.
    """
    proposed = _proposed_write(action, _CONTENT_DRAFTERS)
    if proposed is None:
        return action

    title_blank = _is_blank(proposed.get("title"))
    description_blank = _is_blank(proposed.get("description"))
    if not (title_blank or description_blank):
        return action

    drafter = _CONTENT_DRAFTERS[proposed["action"]]
    drafted_title, drafted_description = await drafter(user_message, adapter=adapter)

    if title_blank and drafted_title:
        proposed["title"] = drafted_title
    if description_blank and drafted_description:
        proposed["description"] = drafted_description

    return _rebuild_with(action, proposed)


async def _ensure_message_is_written(
    action: Any, user_message: str, adapter: LLMAdapter
) -> Any:
    """Fill in a send_message's subject and body before anything downstream
    looks at them, so the Messages compose form always opens on a real draft.

    The model is allowed to emit a send_message carrying only recipients —
    that is what makes "message everyone who missed the quiz" a single turn.
    But nothing then wrote the message. The empty draft reached the Messages
    tab, which filled the gap from its own template presets, and the
    instructor was shown a subject of "Assignment Reminder: Course Update"
    over a body reading "Remind students about the assignment, due date, and
    any next steps." — a description of a message sitting in the field that
    was about to be sent to a class.

    The instructor's own sentence is the draft. "Make an announcement saying
    the midterm exam 2 is coming up" is already the message; turning it into
    "Midterm 2 Reminder" plus two sentences is writing, not guessing, and
    every field stays editable in the form afterwards. What we do not do is
    ask them for it field by field — that clarify used to live in the
    dispatcher and has been removed.

    Handles both the bare action and the intent_preview the system prompt
    actually asks for, so there is one place this happens rather than one per
    dispatch branch. Feedback is deliberately untouched: it is a different
    action, written against a specific submission.
    """
    if action.action == "send_message":
        proposed = action.model_dump()
    elif (
        action.action == "intent_preview"
        and isinstance(getattr(action, "proposed_action", None), dict)
        and action.proposed_action.get("action") == "send_message"
    ):
        proposed = dict(action.proposed_action)
    else:
        return action

    directives = proposed.get("recipient_directives") or []
    blank_directives = [d for d in directives if _is_blank(d.get("body"))]
    subject_blank = _is_blank(proposed.get("subject"))
    body_blank = _is_blank(proposed.get("body"))
    if not (subject_blank or body_blank or blank_directives):
        return action

    # A subject has to describe the message that is actually going out, so
    # when the model wrote a body and only skipped the subject, that body is
    # the better prompt than the request that produced it.
    source = proposed.get("body") if not body_blank else user_message
    drafted_subject, drafted_body = await draft_subject_and_body(
        source, adapter=adapter
    )

    if subject_blank:
        proposed["subject"] = drafted_subject
    if body_blank:
        proposed["body"] = drafted_body
    for directive in blank_directives:
        directive["body"] = proposed["body"]
    if directives:
        proposed["recipient_directives"] = directives

    if action.action == "send_message":
        return parse_action(json.dumps(proposed))
    return action.model_copy(update={"proposed_action": proposed})


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
    earlier resolver turn — resolve_missing_submissions or
    resolve_score_range — via recipient_handle. Handles are kind-agnostic
    here: materialize_resolved_set checks ownership and expiry, not which
    criterion produced the set, so a score-range group messages exactly like
    a missing-submissions one. Mirrors
    _run_fetch_submissions_chain's "resolve server-side, never trust the
    model with a raw ID" shape, for people instead of assignments. Only
    reached when handle_chat_message's dispatch sees one of those three
    fields set; a plain send_message (an announcement, or one with
    recipient_canvas_user_ids already known) is unaffected and keeps using
    the existing single-preview auto-wrap path."""
    course = await resolve_course(db, user, action.local_course_id)

    # The same "are we even in the right course?" check the reads already do.
    # send_message not having one is half the reported bug: with nothing
    # server-side to raise it, the model improvised its own "should I switch?"
    # question — one with no candidates and no payload behind it — so
    # answering "yes please" was read as a brand-new request and came back as
    # a submissions report with the message body gone.
    #
    # Named people, here. An assignment named inside a directive ("everyone
    # who submitted X") reaches this chain as a recipient_handle from a
    # resolver that already ran, and that resolver checks the assignment
    # through the same function via _resolve_course_and_assignment.
    #
    # First clear miss wins: messaging the wrong roster cannot be taken back.
    for directive in action.recipient_directives or []:
        offer = await cross_course_switch_offer(
            db, user, kind="student",
            reference=getattr(directive, "student_reference", None),
            course=course, user_message=user_message,
        )
        if offer is not None:
            return offer

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

    directives = list(action.recipient_directives or [])
    if directives:
        # A directive whose reference names the whole class is a group, not a
        # person. Read with the same audience reader the grade chain uses, so
        # "everyone" means one thing across both channels — this path used to
        # hand "all students" to the name resolver and have it search the
        # roster for a student called that.
        class_wide = [
            d
            for d in directives
            if read_audience_phrase(d.student_reference).scope is AudienceScope.EVERYONE
        ]
        for directive in class_wide:
            active = [s for s in roster if s.get("enrollment_state") == "active"]
            groups.append(MessageGroup(
                body=directive.body or action.body,
                recipient_ids=[int(s["canvas_user_id"]) for s in active],
                recipient_names=[
                    s.get("name") or f"Student {s['canvas_user_id']}" for s in active
                ],
            ))
        directives = [d for d in directives if d not in class_wide]

    if directives:
        resolved = await _resolve_recipient_directives(
            db, user, conversation, user_msg, course, roster, directives, user_message,
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
                # Deliberately not "students missing this assignment": handles
                # now also come from score-range resolution, and naming the
                # wrong criterion here invites the instructor to confirm a
                # re-run of a query they never asked for.
                "question": (
                    "That resolved recipient set is no longer available (it may "
                    "have expired) — should I work out who it covered again?"
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

    Course context is display-name/course-code only, by design — never a numeric ID. The
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
        names = "\n".join(f"- {label}" for label in _course_prompt_labels(course_names))
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
            f"Step {i + 1} result ({action_name}):\n{json.dumps(result, default=str)}"
            for i, (action_name, result) in enumerate(_compact_step_results(loop_steps))
        )
        parts.append(
            "You are mid-way through a multi-step turn — the steps below "
            "already ran, in order, still for this same user request below "
            "(not a new one). Decide the next action based on their "
            "results: propose another read/resolver to gather more, a "
            "write (via intent_preview) once you have everything it needs, "
            "or respond/clarify if you're done or stuck. Do not repeat a "
            "step you already have a result for below.\n\n"
            "If these results already answer the request, reply with "
            "respond — do not call another tool just to confirm what you "
            "can already see.\n\n" + steps_text
        )

    parts.append(f"User request: {message}")
    return "\n\n".join(parts)


def _step_signature(action: Any) -> str | None:
    """A stable identity for "this exact read, with these exact arguments".

    None for anything that is not a read — a repeated write is a second
    announcement, not a redundant lookup, and must never be collapsed.
    """
    name = getattr(action, "action", None)
    if name not in READ_ACTIONS:
        return None
    try:
        arguments = action.model_dump(exclude_none=True)
    except Exception:
        return None
    arguments.pop("action", None)
    # `final` says how to PRESENT the result, not what to fetch. Leaving it in
    # would make the same query asked twice with different presentation look
    # like two different reads, and pay for Canvas twice.
    arguments.pop("final", None)
    return json.dumps({"action": name, "arguments": arguments}, sort_keys=True, default=str)


def _repeated_step_result(loop_steps: list[dict], action: Any) -> dict | None:
    """The stored result when this turn already ran this exact read."""
    signature = _step_signature(action)
    if signature is None:
        return None
    for step in loop_steps:
        if step.get("signature") == signature:
            return step.get("result")
    return None


def _step_signature_count(loop_steps: list[dict], action: Any) -> int:
    """How many times this turn has already asked for this exact read."""
    signature = _step_signature(action)
    if signature is None:
        return 0
    return sum(1 for step in loop_steps if step.get("signature") == signature)


# Per-step and whole-turn budgets for feeding results back into the next
# prompt. Larger than trim_tool_dump_for_history's history budget on purpose:
# history is scrollback the model can mostly ignore, while a step result is
# the thing it is being asked to reason over right now. Truncating a 27-item
# assignment list down to a 2500-character preview is how "which of these is
# due on the 1st" becomes unanswerable one step after being asked.
#
# The turn total is what actually protects the context window. Per-step alone
# would let five steps of 6000 through.
_STEP_RESULT_CHAR_BUDGET = 6000
_TURN_RESULT_CHAR_BUDGET = 14000


def _compact_step_results(loop_steps: list[dict]) -> list[tuple[str, Any]]:
    """(action, trimmed result) per step, oldest trimmed hardest.

    Recency wins when the turn total is blown: the newest step is the one the
    model is reasoning from, and the oldest is usually a lookup whose useful
    content has already been carried forward into a later step.
    """
    trimmed = [
        (step["action"], trim_tool_dump_for_history(step["result"], max_chars=_STEP_RESULT_CHAR_BUDGET))
        for step in loop_steps
    ]
    total = sum(len(json.dumps(result, default=str)) for _action, result in trimmed)
    if total <= _TURN_RESULT_CHAR_BUDGET:
        return trimmed

    # Walk newest-first, spending the budget as we go; whatever is left over
    # for the older steps is what they get.
    remaining = _TURN_RESULT_CHAR_BUDGET
    rebuilt: list[tuple[str, Any]] = []
    for action_name, result in reversed(trimmed):
        allowance = max(remaining, 400)
        rebuilt.append(
            (action_name, trim_tool_dump_for_history(result, max_chars=allowance))
        )
        remaining -= len(json.dumps(rebuilt[-1][1], default=str))
    rebuilt.reverse()
    return rebuilt


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


_STRUCTURED_ANALYTICS_ACTIONS = frozenset(
    {
        "resolve_missing_submissions",
        "resolve_score_range",
        "find_assignment_by_submission_rate",
    }
)
_STRUCTURED_ANALYTICS_FIELDS = (
    "action",
    "status",
    "status_counts",
    "count",
    "sample",
    "summary",
    "local_course_id",
    "course_name",
    "assignment_id",
    "assignment_name",
    "due_at",
    "matched",
    "submission_rate_percent",
    "handle",
    # Without these a score-range result that ends in a respond loses the
    # interpretation it used, which is the one part of the answer the
    # instructor most needs to see in order to catch a wrong auto-pick.
    "basis",
    "basis_explanation",
    "range_label",
    "min_score",
    "max_score",
    "points_possible",
)


def _attach_structured_analytics_from_chain(
    result: dict,
    loop_steps: list[dict],
) -> dict:
    """Preserve scannable missing/analytics fields when a chainable read
    is followed by a free-form respond in the same turn.

    resolve_missing_submissions / find_assignment_by_submission_rate are
    chainable so the model can propose send_message next — but when the
    instructor only asked "who's missing?", the terminal reply is usually
    respond prose that would otherwise drop the structured payload the
    frontend needs for a readable list + analytics link (#1443).

    Skip intent_preview / clarify / out_of_scope terminals so a follow-up
    write preview is not polluted with analytics fields."""
    if not loop_steps or not isinstance(result, dict):
        return result

    terminal_action = result.get("action")
    if terminal_action not in _STRUCTURED_ANALYTICS_ACTIONS | {"respond"}:
        return result

    analytics_source: dict | None = None
    if terminal_action in _STRUCTURED_ANALYTICS_ACTIONS:
        analytics_source = result
    else:
        for step in reversed(loop_steps):
            step_result = step.get("result")
            if (
                isinstance(step_result, dict)
                and step_result.get("action") in _STRUCTURED_ANALYTICS_ACTIONS
            ):
                analytics_source = step_result
                break

    if analytics_source is None:
        return result

    structured = {
        key: analytics_source[key]
        for key in _STRUCTURED_ANALYTICS_FIELDS
        if key in analytics_source
    }
    if not structured:
        return result

    attached = dict(result)
    attached["structured_analytics"] = structured
    # Prefer the grounded tool summary when respond left message empty or
    # just restated without naming the assignment.
    if not attached.get("summary") and structured.get("summary"):
        attached["summary"] = structured["summary"]
    return attached


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
    action_name = str(proposed_action.get("action") or "")
    resources = affected_resources or []

    # The validated proposal is the execution source of truth. Resolve its
    # course against the instructor's owned rows and use that same value for
    # the workflow, rather than copying a possibly stale conversation scope.
    # This keeps confirmation/audit routing aligned with the preview summary
    # after an explicit course correction.
    workflow_course_id = conversation.course_id
    proposed_local_course_id = proposed_action.get("local_course_id")
    if proposed_local_course_id is not None:
        owned_course = await db.scalar(
            select(Course.id).where(
                Course.id == proposed_local_course_id,
                Course.instructor_id == user.id,
            )
        )
        if owned_course is not None:
            workflow_course_id = owned_course
            if conversation.course_id is None:
                conversation.course_id = owned_course

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
        existing.course_id = workflow_course_id
        existing.status = "pending"
        existing.error_detail = None
        existing.executed_at = None
        existing.result_message_id = None
        return

    db.add(
        Workflow(
            conversation_id=conversation.id,
            user_id=user.id,
            course_id=workflow_course_id,
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


def _attach_quiz_generation_prompt(
    result: dict[str, Any],
    user_message: str,
) -> dict[str, Any]:
    """Stamp create_quiz handoffs with the raw instructor utterance (#1512).

    The quiz create page's describe/generation field must see the full prompt
    (topic, question type, points, time limit), not a title-only fallback.
    Attaching here — before the assistant message is persisted — means both
    live navigation and history "Open quiz creation form" carry the same seed.

    Keep an existing non-empty generation_prompt: refine/modify follow-ups that
    still emit create_quiz intent_preview often send a short utterance
    ("make it harder") that must not replace the original constraints.
    """
    if not result.get("intent_preview"):
        return result
    proposed = result.get("proposed_action")
    if not isinstance(proposed, dict) or proposed.get("action") != "create_quiz":
        return result
    existing = proposed.get("generation_prompt")
    if isinstance(existing, str) and existing.strip():
        return result
    prompt = user_message.strip() if isinstance(user_message, str) else ""
    if not prompt:
        return result
    return {
        **result,
        "proposed_action": {
            **proposed,
            "generation_prompt": prompt,
        },
    }


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
    if data.get("action") == "analyze_course_submissions":
        # This read action carries per-assignment student name lists, so the
        # pass-through below would replay up to _COURSE_ANALYSIS_MAX_NAMES
        # names into every later prompt in the conversation. Its sibling
        # _run_resolve_missing_submissions_chain deliberately returns only
        # {count, sample, handle} for the same reason. Counts are what a
        # follow-up turn needs; names are re-resolvable server-side.
        total = data.get("total")
        entries = [
            {
                "assignment_id": entry.get("assignment_id"),
                "assignment_name": entry.get("assignment_name"),
                "count": entry.get("count"),
            }
            for entry in data.get("assignments", [])
            if isinstance(entry, dict)
        ]
        # The stored summary embeds the same names whenever anything matched,
        # so it is only safe to carry through verbatim in the nothing-matched
        # case — where it holds the caveat that a late scan says nothing about
        # missing work, which a follow-up turn should not lose.
        compact_summary = (
            data.get("summary")
            if total == 0
            else (
                f"{total} {data.get('status')} submission(s) in "
                f"{data.get('course')} across {len(entries)} published "
                "assignment(s). Per-assignment counts included; student names "
                "omitted from history."
            )
        )
        return _json_dumps(
            {
                "action": "analyze_course_submissions",
                "status": data.get("status"),
                "course": data.get("course"),
                "total": total,
                "assignments": entries,
                "summary": compact_summary,
            }
        )
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


_MODEL_HIDDEN_ACTIONS = frozenset(
    {
        # These remain valid server-side execution actions for compatibility,
        # but the model should select their semantic intent instead of
        # choosing between several overlapping submission tools.
        "semantic_intent",
        "resolve_missing_submissions",
        "resolve_score_range",
        "analyze_course_submissions",
        "find_assignments_by_submission_status",
        "find_assignment_by_submission_rate",
    }
)


def build_system_prompt(has_canvas_token: bool = True) -> str:
    tool_list = "\n".join(
        f"- {name}: {_schema_for_prompt(schema)}"
        for name, schema in ACTION_SCHEMAS.items()
        if name not in _MODEL_HIDDEN_ACTIONS
        and name not in {"out_of_scope", "clarify", "intent_preview", "respond"}
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
This check does NOT apply to create_assignment, create_quiz, send_message or
update_grade. Those never clarify for a missing field — see FORM HANDOFF.
Only ask about fields that are REQUIRED by that action's schema (see
AVAILABLE ACTIONS) and that the user did not give you, directly or
earlier in CONVERSATION HISTORY / FIELD MEMORY. Do not treat optional
fields as blockers — if you mention an optional field, label it clearly
as optional. Do not ask about anything that isn't literally one of that
action's fields — e.g. fetch_submissions only needs a course and an
assignment, so never ask what format, detail level, or extra info the
user wants to see. If every required field is known, propose the
action immediately; do not ask a question just to double-check. Never
invent, guess, or write a placeholder value for a required field you
don't have. When multiple required fields are missing, list ALL of them
together in a single clarify response so the user can answer them in
one reply. To ask, respond ONLY with:
{"action": "clarify", "question": "<list every missing required field>", "partial_plan": <dict>}
Put every field you already do have into partial_plan so the next turn
doesn't lose it once the user answers. Do not re-ask for fields already
present in partial_plan, FIELD MEMORY, or CONVERSATION HISTORY.

FORM HANDOFF — create_assignment, create_quiz, send_message and update_grade
never clarify for missing fields. Propose them immediately with whatever the
instructor gave you, however little that is.

Each opens a dedicated page — the assignment form, the quiz review form, the
Messages composer, the grading form — where every field is shown filled in
and fully editable before anything is sent to Canvas. That page is where
missing details get filled and wrong ones get corrected, and the app writes
a title, description, subject or body from the instructor's own words before
the page opens. Asking here instead costs a round trip to collect what they
already said in their first sentence.

So: "create an assignment" with no other detail is a complete request.
Propose it. Do not ask for a title, a description, a due date or a point
value, and do not invent them either — leave a field out and it gets
written or filled in on the form.

Read the whole request before deciding which phrase is which. The role a
phrase plays is what identifies it, not how it looks:
- "an assignment called September 11th due next Friday" — "called X" makes X
  the title even though it looks like a date; "due Y" makes Y the due date.
- "an assignment about September 11th" — "about X" makes X the subject
  matter, so it belongs in the description, not the title.
- "quiz on chapter 4, 20 points, Friday" — topic, points, due date, in one
  line with no field names anywhere.
If a phrase is genuinely ambiguous, choose the reading you think is most
likely and propose it. Do not ask. The instructor will see your reading on
the form and can change it in one edit, which is cheaper for them than
answering a question.

REQUIRED FIELDS — for write actions NOT in the list above (update_assignment),
check every field listed as "required" in that action's schema below. This
includes the action/task type itself (e.g. don't guess whether the user
wants create_assignment vs create_quiz vs update_assignment). If any are
missing, use the AMBIGUITY CHECK format to ask for all of them together.
Never invent a placeholder value.

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

create_quiz follows FORM HANDOFF above: propose immediately with whatever
you have, never clarify for a missing title, description, due date or point
value. The quiz review form owns those.

REUSING A GROUP ACROSS CHANNELS:
Working out who a request covers is the expensive part, so once the app has
resolved a group it hands back a "recipient_handle" and that handle works for
any channel. resolve_missing_submissions, resolve_score_range AND a grade
handoff all produce one.
So when the instructor changes their mind about HOW to reach a group they
already named — "actually send them a message instead", "give them that
feedback instead", "post that as an announcement instead" — copy the
recipient_handle from the previous turn's result verbatim into the new action
rather than re-describing who they are. Re-deriving the group is how it
silently changes size between two turns that named the same people.
Keep the content too: "instead of a message, give them that feedback" means
the feedback text is the message you already drafted.

UPDATE_GRADE HANDOFF:
update_grade follows FORM HANDOFF above, with one addition: never invent a
grade. If the instructor did not say what the new grade is, leave new_grade
out and propose anyway — they enter it in the grading form, against the
submission they are actually looking at. A number you guessed here would be
a real mark on a real student's record.
When the user asks to change
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
send_message follows FORM HANDOFF above. NEVER clarify for a missing subject
or body — not ever, and not for any kind of message. This holds whether the
request names recipients, implies them, or is a public announcement with no
recipients at all.

"Make an announcement about the long weekend" is a COMPLETE request. Propose
it. The instructor already told you what the message is about; asking them to
supply a subject and a body is asking them to write the message they just
described. Leave subject and body as "" — the app writes both from their own
sentence before the Messages composer opens, and every field stays editable
there.

Set delivery_mode="announcement" and no recipients for a public announcement.
For a private message include the recipients you were given: copy a
recipient_handle from an earlier resolve_missing_submissions or
resolve_score_range turn verbatim, or set recipient_directives from the
user's own words, or set broadcast_to_all_students for the whole roster.

The one and only reason to clarify a send_message: the user asked to "send a
message" and named nobody at all — no recipients, no handle, no broadcast,
and no public announcement either. Then ask who it goes to, and only that.
Recipients are the one thing the app cannot write for them.

READ ACTIONS — execute immediately, no preview:
fetch_courses, fetch_assignments, fetch_quizzes, fetch_students, fetch_submissions,
and get_active_course never change any data, so propose them directly and
plainly — do NOT wrap them in intent_preview:
{"action": "fetch_assignments", "course_name": "<course>"}
They run right away and their result is shown to the user in this same
response, not a separate confirm step.

Submission analytics are selected through SEMANTIC INTENT, not by choosing
between overlapping internal actions. The server maps the semantic intent to
the appropriate read-only implementation after validating its scope/status.

STUDENT LISTING: fetch_students is in scope for listing the students in the
resolved course. Present only their names in the natural-language answer; do
not reveal email addresses, login IDs, or other contact fields. If a later
message says “message this student” and more than one recent student could
match, ask for the student's name and show the available names rather than
guessing.

MULTI-STEP REQUESTS: propose the first step you need, not the whole plan.
The server runs it and comes back to you with the result, in this same turn,
as many times as the request needs. ANY read can be a first step:

  "message students missing assignment 4"
      find_missing_submissions, then send_message with the resolved group
  "push back the last assignment under 30% submissions by 3 days"
      find_assignment_by_rate, then update_assignment
  "what is the due date of homework 1?"
      fetch_assignments, then respond with that one date

That last one matters: a read is a step toward an answer, not the answer.
When a question asks for one fact, fetch what you need and then RESPOND with
the fact — do not leave the raw list as your reply and make the user find it.

FINAL READS: when the instructor asked to SEE the data itself — "show me my
assignments", "who submitted to lab 4", "list my courses" — the payload is
the answer, and the app renders it as a proper table or list. Set "final":
true on that read and the turn ends there:

  {"action": "fetch_submissions", "assignment_reference": "lab 4",
   "final": true}

Use it only when the whole result is what was asked for. A question about one
field of one row ("when is it due?", "did Alice submit?") is not a final read
— fetch, then respond with the answer.

Use respond as soon as the results in front of you answer the request, and do
not re-request something you already have a result for. Stop early with
clarify only when something is genuinely missing or ambiguous.

CONVERSATION HISTORY:
Previous messages in this conversation are provided below. If this is
a follow-up to a clarification question or a refinement of a previous
plan, incorporate the user's feedback into the updated partial_plan
before responding.

COURSE RESOLUTION:
Every response must include a top-level "course_name" field naming
exactly one course from YOUR COURSES (see the list injected with each
message). Use either that course's display name or its course code exactly
as listed. Never invent a course name/code, never output a course ID
(local or Canvas), and never ask the user for one — they only know their
courses by name/code, never by an internal ID.

GROUNDING — retrieved Canvas data only (Feature 13 #855):
Never invent Canvas facts that were not returned by a tool in this
conversation (assignment/student/course IDs, grades, scores, due dates,
roster names, submission status). If you need a fact you do not have,
call the appropriate read tool or ask a clarify question — do not guess.
When summarizing a tool result, only cite fields present in that result.
Never fabricate numeric Canvas IDs.

- If the message clearly names one of YOUR COURSES, even a partial name
  (e.g. "Intro to Programming" for "COSC 111 - Introduction to
  Programming with Java") or a course code, set course_name to that
  course's exact display name or course code and use it as the subject of
  this and future turns.
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

SEMANTIC INTENT — when the user's wording is informal, abbreviated,
misspelled, refers to earlier context ("this assignment", "those students"),
or combines a goal with natural-language constraints, you may first express
the meaning instead of guessing an exact internal tool name. Return ONLY:
{"action":"semantic_intent","intent":"<intent>","course_name":"<course or null>",
"assignment_reference":"<user's words or null>","student_reference":"<user's words or null>",
"delivery_mode":"announcement|private_message|null",
"status":"missing|late|null","comparator":"below|above|null",
"submission_status":"any_submissions|no_submissions|missing_submissions|late_submissions|null",
"threshold_percent":<number|null>,
"min_score":<number|null>,"max_score":<number|null>,
"basis":"percentage|points|null","fields":{},"criteria":{},
"message":"<optional>","question":"<optional>","partial_plan":{},"confidence":<0 to 1>}
 Supported intents are read_courses, read_assignments, read_submissions,
 read_students, read_quizzes, analyze_submissions, find_missing_submissions,
 find_score_range, find_assignments_by_submission_status,
find_assignment_by_rate, create_assignment, create_quiz, update_assignment,
update_grade, send_message, respond, clarify, and unsupported. Put only the
user's natural-language values in fields/criteria; never invent Canvas or
local IDs. The server maps this envelope to a trusted action and preserves
the normal ownership, read/write, preview, and confirmation safeguards.
Use a normal action directly when it is already an exact, unambiguous match.

SUBMISSION STATUS FILTERS:
For “which assignments have submissions?”, “which have no submissions?”,
“which have missing submissions?”, or “which have late submissions?”, use
the semantic intent find_assignments_by_submission_status and set
submission_status to exactly one of any_submissions, no_submissions,
missing_submissions, or late_submissions. Do not reinterpret any_submissions
as missing_submissions. This is an assignment-level filter and is different
from analyze_submissions, which is a course-wide missing/late overview.

CREATING AN ASSIGNMENT:
title must be the user's own wording for the assignment name, copied
verbatim — never substitute a different assignment name from earlier in
this conversation (e.g. from a previous fetch_assignments result) even if
it seems related. due_date is required and must be a full ISO 8601
string, e.g. "2026-07-11T23:59:00" — resolve it using today's date above.
If the user gives a date but no time, default the time to 23:59:00. If
the user does not give a due date at all, do not guess or leave due_date
null — use the AMBIGUITY CHECK above and ask for it instead. If the user
does not mention points or grading, ask whether the assignment is graded
(and if so, how many points) rather than inventing a value — never default
to 10, 100, or any other number. Only set points_possible to null when the
user explicitly says the assignment is ungraded or has no point value.
Never invent a value for a field the user didn't give you.

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
your context when you only need a count. Instead use semantic intent
find_missing_submissions with assignment_reference and status (status is
missing or late). The server resolves the assignment and runs the guarded
read implementation.
Set status to "missing" (the default — not submitted at all) or "late"
(submitted, but after the due date) — these are separate, mutually
exclusive groups; never guess which one the user means if it's ambiguous
("students behind on assignment 4" usually means missing; "students who
turned it in late" means late).
When the user asks for BOTH at once ("missing and late", "everyone who
didn't submit or was late", "anyone behind or late on assignment 4"), set
status to the list ["missing", "late"]. The server returns their union as
one recipient set and says out loud that it is a combined group. Do NOT
pick just one category for a request that named both — that silently drops
half the students, and the instructor has no way to see it happened.
The result gives you a "count", a short
"sample" of names, and a "handle" string — never the full list. To
message everyone in that resolved set, propose send_message with
recipient_handle set to that exact handle string, copied verbatim from
the result — never invent one, and never build recipient_directives out
of the "sample" names instead, that's only a preview excerpt, not the
full set.

FINDING STUDENTS BY SCORE RANGE:
When the user picks students out by the score they got rather than by
whether they submitted (e.g. "message everyone who got between 70 and 90",
"send feedback to students scoring under 50 on the midterm", "who scored
90 to 100 on quiz 2"), use semantic intent find_score_range with
assignment_reference, min_score and max_score. Do not propose
fetch_submissions and pick the students out yourself — same reason as
above, and the range needs the assignment's points_possible, which the
server has and you do not.
Copy the user's two numbers EXACTLY as they said them. Never convert
between percent and points yourself, and never fill in a bound the user
did not give: for "under 50" use min_score 0 and max_score 50, for "above
80" use min_score 80 and max_score 100 only if they clearly meant percent,
otherwise leave the intent for the server by still copying their number
and letting it decide.
Set "basis" ONLY when the user named the unit outright — "70 percent" or
"70%" gives basis "percentage", "70 points"/"70 marks"/"70 out of 100"
gives basis "points". If they just said "between 70 and 90", leave basis
null. That null is meaningful: the server then works out what each reading
would select and either resolves it (when one reading is impossible, or
when both pick exactly the same students) or asks the instructor. Guessing
a basis destroys that check — on an assignment out of 200, percent and
points select opposite groups of students.
The result carries "count", a short "sample", a "handle", and a
"basis_explanation" saying which reading was used. Always pass the
basis_explanation on to the user; do not drop it. Message the group the
same way as above, with send_message and recipient_handle set to that
exact handle string.

ANALYSING A WHOLE COURSE'S SUBMISSIONS:
When the user asks about submissions across a course rather than one
assignment (e.g. "analyse missing submissions", "who hasn't submitted
anything", "how are submissions looking in this course", "give me a
submission overview"), use semantic intent analyze_submissions — NOT
find_missing_submissions, which needs one specific assignment, and never a
plain "respond" written from memory. Set status to missing or late when the
user explicitly requests one, or to ["missing", "late"] when they ask for
both at once; otherwise use the existing course-overview default for
compatibility.
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
Instead use semantic intent find_assignment_by_rate with comparator and
threshold_percent:
{"action": "semantic_intent", "intent": "find_assignment_by_rate",
 "course_name": "<course>", "comparator": "below", "threshold_percent": 30}
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
work changes" should use update_grade with the text in the feedback field
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
submission list and hand off the full target set to the Grades tab.
If the group is one an earlier turn already resolved — students missing or
late on an assignment, or students in a score range — do NOT describe it
again in student_reference and do NOT rebuild it from the "sample" names.
Set recipient_handle to that result's exact "handle" string instead, the
same way send_message does. This is what makes "give feedback to everyone
who scored below 50" or "add 5 marks to everyone missing lab 4" work: the
app already computed that exact set and will grade or comment on all of
them. A handle is the only way to target a resolved group here; the sample
is a truncated preview, so grading from it silently skips students. Never
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

For an explicit announcement request ("make an announcement", "post this
to the class", "announce to everyone"), use semantic_intent with
delivery_mode="announcement" and do not include recipients. For a private
request, use delivery_mode="private_message" and include named recipients,
a resolved recipient handle, or an explicit private broadcast. The server
uses this mode to prevent an announcement from becoming a private message.

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

MESSAGING STUDENTS ACROSS ASSIGNMENTS: if the user asks to message students
matching an assignment-level filter (for example, "message the students on
assignments with no submissions"), use the result's recipient_handle from
find_assignments_by_submission_status when one is returned. That handle is a
server-owned aggregate set across the matching assignments; copy it exactly
into send_message and never reconstruct recipients from assignment IDs or
sample names. The normal send_message preview and confirmation are still
required.

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

    Multi-step turns: ANY read result is fed back for another LLM decision
    within the SAME turn — see the step loop below — bounded by
    MAX_TURN_STEPS, so "message students missing assignment 4" resolves the
    recipient set AND proposes the send_message in one turn, and "what is the
    due date of homework 1" fetches the assignments and then answers with the
    one date rather than rendering all of them. Only a write, a clarify, or an
    explicit respond ends a turn. Repeated identical reads are served from the
    result already in hand, and a model that asks a third time is answered
    with it rather than left to exhaust the budget. A modify turn never enters
    this loop at all — revising an already-proposed write is a single edit,
    not a multi-step plan.

    Course resolution: local_course_id here is only ever an explicit
    client-supplied value (the "set active course" button). Every other
    way a course enters this turn — the user naming one in the message,
    or answering a clarify question — is resolved by the LLM itself
    (COURSE RESOLUTION in build_system_prompt) against real course names,
    never a numeric ID; the app matches that name back to a real course
    only after the LLM call returns (see below).

    Course data is never fetched from Canvas live, in-band, as part of
    handling a message — this turn only ever reads local Course rows via
    the connection-scoped canvas_course_names index. Keeping it fresh is
    a decoupled background concern: a periodic
    sweep (see app.main's lifespan) and a refresh right after a
    successful write (handle_confirmed_action) — both live in
    app.services.canvas. A chat turn is a pure local-DB read for course
    names, so a slow/broken Canvas connection can never fail a chat
    request that doesn't even need fresh course data."""

    conversation = await get_or_create_conversation(db, user, conversation_id, local_course_id)
    user_msg = await log_message(db, conversation, role="user", content=message)
    course_names = await _get_course_names_for_user(db, user)
    await _refresh_conversation_course_snapshot(db, conversation, user)
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

    # An answer to a pending "switch course?" offer is handled before anything
    # else that reads the message. It has to run ahead of course resolution:
    # "yes" names no course and describes no task, so every resolver
    # downstream would read it as a fresh request against the SAME wrong
    # course and produce the same dead-end reply — which is exactly the loop
    # this whole mechanism exists to end.
    #
    # It sits just below adapter construction only because reading a reply
    # that isn't a literal yes/no needs one (_resolve_switch_confirmation).
    # Nothing between here and there looks at the message.
    resumed_action: dict | None = None
    switch_reply = await _apply_pending_course_switch(
        db, user, conversation, message, adapter
    )
    if switch_reply is not None:
        if switch_reply.terminal is not None:
            return conversation, switch_reply.terminal, False
        resumed_action = switch_reply.pending_action
        conversation = switch_reply.conversation
        # The interrupted request continues through the normal pipeline rather
        # than being re-dispatched by hand, so it gets the same resolvers and
        # write-preview gating as if it had been typed in the right course to
        # begin with. What continues is the ACTION when one was stored (see
        # rebase_pending_action) and the instructor's own words otherwise —
        # the words alone let the model re-plan, which is how a send_message
        # came back across the switch as a submissions report.
        message = switch_reply.replay_message
        # The replayed request is logged as this course's own user message, and
        # the "yes" stays behind in the course it answered a question in.
        #
        # Moving the "yes" across instead (what this used to do) split the
        # exchange down the middle: the course being left showed an offer
        # nobody replied to, and the course being entered showed an answer with
        # no question above it — so reopening that tab, or sending one more
        # turn there, meant reading a reply to something recorded in a
        # different conversation. Each transcript now stands on its own.
        #
        # user_msg is rebound because everything downstream hangs off it —
        # workflows record source_user_message_id, and a write in this course
        # must not point at a message filed under another one.
        user_msg = await log_message(db, conversation, role="user", content=message)
        history = await _get_recent_messages(db, conversation.id)

    # Bind a course-less conversation to the course its first message names.
    #
    # This replaces _resolve_course_context_statement, a pair of regexes that
    # matched only "course is X" / "switch to course X" and answered them with
    # "Using X for this chat." — a whole turn spent acknowledging the course
    # instead of doing the thing the message asked for. _prescan_course_reference
    # finds the course anywhere in the sentence, so the turn now continues into
    # the normal path and "course is CPSC 320, show me the assignments" shows
    # the assignments.
    #
    # Only the course-less case is handled here. Moving an already-bound
    # conversation to a different course stays with _resolve_course_switch
    # below, which asks the model rather than a substring match — the switch is
    # the destructive direction (it forks the thread), so it gets the more
    # careful resolver.
    if (
        pending_message_id is None
        and local_course_id is None
        and conversation.course_id is None
    ):
        named_course = _prescan_course_reference(course_names, message)
        if named_course is not None and named_course.local_course_id is not None:
            conversation.course_id = named_course.local_course_id
            conversation.course_name = await _stable_course_name(
                db, named_course.local_course_id, _course_display_name(named_course)
            )
            await _sync_course_context_envelope(
                db, conversation, named_course.local_course_id
            )

    # Pre-resolve a course switch from the raw message alone, before the
    # main prompt is built for this turn — see _resolve_course_switch's
    # docstring for why this has to happen here, not after the main LLM
    # call.
    #
    # This used to require prior history outright, on the reasoning that a
    # first-ever turn has no stale framing to leak and so is not worth an
    # extra call. That covered only half of what this resolver does. Leaking
    # old history is one failure; the other is the main call being told
    # "CURRENT COURSE: <active course>" while the message plainly names a
    # different one — which happens just as much on turn one, and is where a
    # write lands in the wrong Canvas course. Observed exactly that: the first
    # "create an assignment ... for capstone project" built it against the
    # active course, and only a retry (by then with history, so the resolver
    # ran) got it right.
    #
    # A first turn now qualifies when the message actually names one of the
    # instructor's other courses — a local substring check, no call. The
    # original cost argument still holds for every turn that names nothing:
    # those are the common case, and they stay at one call.
    #
    # Still skipped for a modify turn (pending_message_id set — that's
    # revising an existing proposed action tied to this conversation, not a
    # fresh request). Still skipped when local_course_id is explicitly given
    # (the "set active course" button, sent alongside this same message) —
    # that explicit selection is a stronger, deliberate signal than a course
    # name the message happens to mention, and wins outright for this turn
    # rather than being silently overridden by this resolver.
    if (
        pending_message_id is None
        and local_course_id is None
        and conversation.course_id is not None
        # A resumed switch already settled the course, by the instructor
        # saying yes to it a moment ago. Re-asking a resolver whether the
        # replayed sentence names a different one can only undo that, and
        # costs a call to do it.
        and resumed_action is None
        and (
            history
            or _message_may_name_another_course(
                course_names, conversation.course_name, message
            )
        )
    ):
        switched = await _resolve_course_switch(course_names, conversation.course_name, message, adapter)
        if switched is None and history:
            # _resolve_course_switch collapses every failure — timeout, provider
            # error, malformed JSON — into the same None it returns for "no
            # switch here". Safe against crashing the turn, but it makes a
            # broken model indistinguishable from a message that named no other
            # course, and the conversation then silently stays on the old one.
            #
            # The local prescan is the same check already trusted to pick the
            # course on a conversation's first turn, so falling back to it costs
            # nothing and makes a plainly-named course work even when the model
            # call produced nothing at all. The != current check below still
            # applies, so naming the current course is not a switch.
            #
            # Only with history. A brand-new preference-seeded conversation
            # already has a correct path for this — the post-hoc detection
            # below mutates it in place, which is what stops an orphaned empty
            # Conversation row being left behind. Forking it here instead
            # would trade one bug for that one.
            switched = _prescan_course_reference(course_names, message)
        if (
            switched is not None
            and switched.local_course_id is not None
            and switched.local_course_id != conversation.course_id
        ):
            target = await _find_or_fork_conversation_for_course(
                db, user, switched.local_course_id, _course_display_name(switched)
            )
            user_msg.conversation_id = target.id
            conversation = target
            history = await _get_recent_messages(db, conversation.id)

    # A preview modification stays in the same conversation so the pending
    # workflow/message IDs remain valid. That does not mean its course is
    # immutable: an explicit course name in the correction must move the
    # conversation and the pending proposal together. Resolve the name from
    # the owned course index (never from a model/client-supplied ID), clear
    # course-scoped memory, and refresh the compact course context envelope.
    # Otherwise the summary can mention course B while execution still uses
    # course A's local_course_id.
    pending_course_switch = None
    if (
        pending_message_id is not None
        and local_course_id is None
    ):
        candidate_course = _resolve_pending_course_correction(course_names, message)
        if (
            candidate_course is not None
            and candidate_course.local_course_id is not None
            and candidate_course.local_course_id != conversation.course_id
        ):
            pending_course_switch = candidate_course
            clear_course_scoped_field_memory(conversation)
            conversation.course_id = candidate_course.local_course_id
            conversation.course_name = _course_display_name(candidate_course)
            await _sync_course_context_envelope(
                db, conversation, candidate_course.local_course_id
            )

    stored_preview = None
    current_proposed_action = None
    if pending_message_id is not None:
        stored_preview = await _load_stored_intent_preview(
            db, conversation.id, pending_message_id
        )
        if stored_preview:
            current_proposed_action = dict(stored_preview.get("proposed_action") or {})
            if pending_course_switch is not None and conversation.course_id is not None:
                current_proposed_action["local_course_id"] = conversation.course_id
                for key in (
                    "assignment_id",
                    "student_id",
                    "recipient_canvas_user_ids",
                    "recipient_handle",
                ):
                    current_proposed_action.pop(key, None)

    system_prompt = build_system_prompt(has_canvas_token=bool(user.canvas_connections))
    field_memory_block = format_field_memory_for_prompt(conversation.field_memory)
    if field_memory_block:
        system_prompt = f"{system_prompt}\n\n{field_memory_block}"
    outstanding_block = _format_outstanding_question(
        pending_expectation(conversation.field_memory)
    )
    if outstanding_block:
        system_prompt = f"{system_prompt}\n\n{outstanding_block}"
    # Resolve references the message already names before the model answers, so
    # it cannot ask for something it was just told. Skipped on a modify turn,
    # which is revising an already-resolved proposed action.
    if pending_message_id is None:
        prescan_block = _format_prescan_for_prompt(
            await _run_reference_prescan(db, conversation, course_names, message)
        )
        if prescan_block:
            system_prompt = f"{system_prompt}\n\n{prescan_block}"
    first_llm_message = _build_llm_message(
        message,
        course_names,
        conversation.course_name,
        current_proposed_action,
        [],
    )
    cache_key: str | None = None
    cached_raw_output: str | None = None
    if resumed_action is not None:
        # Step 1 is the action the instructor already approved by accepting the
        # switch, injected where the model's first reply would go. Everything
        # downstream — course resolution, the resolver chains, the write
        # preview gate — then runs exactly as if they had typed the request in
        # the right course to begin with, which is the whole reason to resume
        # the action rather than dispatch it by hand.
        cached_raw_output = json.dumps(resumed_action)
    elif llm_config.cache_enabled and is_safe_cache_candidate(
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
    # Separate from MAX_TURN_STEPS: see the clarify branch at the bottom of the
    # loop for why a model going back for information gets its own, much
    # smaller allowance than a plan making progress.
    clarify_retries_left = _CLARIFY_RETRY_BUDGET
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
                    conversation.course_name = _course_display_name(matched)
                    resolved_local_course_id = matched_local_course_id
                    await _sync_course_context_envelope(
                        db, conversation, matched_local_course_id
                    )
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
                        db, user, matched_local_course_id, _course_display_name(matched)
                    )
                    user_msg.conversation_id = target.id
                    conversation = target
                    history = await _get_recent_messages(db, conversation.id)
                    resolved_local_course_id = matched_local_course_id
                    await _sync_course_context_envelope(
                        db, conversation, matched_local_course_id
                    )
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
            # Before the injection, not after: this turns a clarify into an
            # intent_preview wrapping a real write, and that write needs the
            # resolved course id putting into it like any other.
            parsed_envelope = _rewrite_content_only_clarify(parsed_envelope)
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
            if isinstance(action, SemanticIntentAction):
                # Keep semantic interpretation separate from execution. The
                # mapper copies only an allowlisted subset into an existing
                # action and therefore cannot grant a new Canvas capability.
                action = parse_action(
                    json.dumps(
                        normalize_semantic_intent(
                            action,
                            local_course_id=resolved_local_course_id,
                        )
                    )
                )
            if pending_course_switch is not None and conversation.course_id is not None:
                action = _rebase_action_to_course(action, conversation.course_id)
            if _explicit_dual_delivery_request(message):
                action = _preserve_dual_delivery(action)
            elif _explicit_announcement_request(message) and not _is_combined_announcement_request(
                action
            ):
                action = _force_announcement_delivery(action)
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

            # After the unwrap, so both the bare send_message and the wrapped
            # one land here, and before any dispatch branch reads subject or
            # body — the grouped chain copies them into every preview.
            action = await _ensure_message_is_written(action, message, adapter)
            action = await _ensure_write_content_is_drafted(action, message, adapter)

            limited_reply = await _defer_canvas_limited_mode_reply(
                db,
                user=user,
                conversation=conversation,
                message=message,
                action=action,
            )
            if limited_reply is not None:
                return conversation, limited_reply, True

            repeated = _repeated_step_result(loop_steps, action)
            if repeated is not None:
                # The model asked for something it already has. Serving the
                # stored result costs nothing; the alternative is a second
                # identical Canvas round trip for data already in its prompt.
                #
                # Only reads are deduped. A repeated write is not a redundant
                # lookup — it is a second announcement, a second grade change —
                # and must reach the preview/confirm gate on its own.
                result = repeated
                if _step_signature_count(loop_steps, action) >= 2:
                    # Asked for the same thing three times: it is not going to
                    # move on. Ending here with that read's own result is
                    # exactly what the turn did before reads could chain, so a
                    # model that cannot use the loop is no worse off for the
                    # loop existing — and the instructor gets an answer rather
                    # than fifteen steps of silence and a budget message.
                    break
                loop_steps.append(
                    {"action": action.action, "result": result,
                     "signature": _step_signature(action)}
                )
                continue

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
            elif action.action == "resolve_score_range":
                # Same server-side resolution and compact-summary shape as
                # resolve_missing_submissions, but filtered by score rather
                # than submission status — and it decides percent-vs-points
                # (or asks) before producing a handle.
                result = await _run_resolve_score_range_chain(
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
            elif action.action == "find_assignments_by_submission_status":
                result = await _run_find_assignments_by_submission_status_chain(
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
            elif action.action in _COURSE_SCOPED_CREATE_ACTIONS:
                # The two writes that used to reach a preview with no course
                # resolution at all — see _run_create_chain. Must come before
                # the auto-wrap branch below, which is what previously handled
                # a bare create action and trusted local_course_id outright.
                result = await _run_create_chain(
                    db, user, conversation, course_names, action.model_dump(), message
                )
            elif (
                action.action == "intent_preview"
                and isinstance(getattr(action, "proposed_action", None), dict)
                and action.proposed_action.get("action") in _COURSE_SCOPED_CREATE_ACTIONS
            ):
                # The same resolution for the route the system prompt actually
                # asks for: the model wrapping its own create in an
                # intent_preview. Guarding only the bare-action branch above
                # would leave the common case unresolved.
                result = await _run_create_chain(
                    db, user, conversation, course_names,
                    action.proposed_action, message, action.summary,
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

        # A clarify used to end the turn outright. Most of the time that is
        # right — "what should the due date be?" is a question only the
        # instructor can answer. But a resolver clarify is different: it means
        # the SERVER could not resolve a reference, and the model may well be
        # able to by calling a read tool it has not called yet. Ending there
        # made the instructor do the lookup by hand.
        #
        # Retryable clarifies are the ones that arrive with candidates: the
        # resolver got far enough to have a list and could not choose from it.
        # A missing-field clarify has nothing to look up and stays terminal.
        #
        # Budgeted separately from MAX_TURN_STEPS, and deliberately small. The
        # step budget is for a plan making progress; this one is for a model
        # going back for information, where two attempts is the difference
        # between "try the obvious tool" and a loop that spends fifteen steps
        # asking itself the same question.
        if (
            result.get("clarify")
            and result.get("clarify_candidates")
            and pending_message_id is None
            and clarify_retries_left > 0
        ):
            clarify_retries_left -= 1
            loop_steps.append(
                {"action": action.action, "result": result,
                 "signature": _step_signature(action)}
            )
            if step >= MAX_TURN_STEPS:
                result = _step_budget_exhausted_response(loop_steps)
                break
            continue

        # Any read continues unless the model marked it final; a write, a
        # clarify, or an explicit respond always ends the turn.
        #
        # This used to be gated on a four-action whitelist, which meant a read
        # outside it terminated the turn at step 1 with its raw payload as the
        # answer. That is not a rare edge: "what is the due date of homework 1
        # limits?" makes the model call fetch_assignments — the correct first
        # step — and the loop then cut it off and rendered all 27 assignments
        # instead of the one date that was asked for. The model had planned it
        # right; it was never allowed to finish.
        #
        # Widening the whitelist would have fixed that one question and left
        # the next unanticipated shape broken the same way, so the whitelist is
        # gone. What bounds the loop instead is real: MAX_TURN_STEPS, the
        # dedupe above, and the fact that the model has to emit respond/clarify
        # to say anything at all.
        #
        # `final` is how a read still ends a turn: the model saying the
        # payload it asked for IS the answer, so the frontend renders the
        # table rather than a sentence about it (see ReadAction.final). The
        # default is the chaining one, so forgetting the flag costs a call and
        # gives prose — never a raw dump in place of an answer.
        is_chainable_step = (
            pending_message_id is None
            and action.action in READ_ACTIONS
            and not result.get("clarify")
            and not getattr(action, "final", False)
        )
        if not is_chainable_step:
            break
        loop_steps.append(
            {"action": action.action, "result": result,
             "signature": _step_signature(action)}
        )
        if step >= MAX_TURN_STEPS:
            result = _step_budget_exhausted_response(loop_steps)
            break

    # Grade resolver clarifications are the only path allowed to retain grade
    # values across turns. Generic LLM clarify payloads stay memory-safe.
    if (
        isinstance(result, dict)
        and result.get("clarify")
        and getattr(action, "action", None) == "update_grade"
    ):
        result = _preserve_grade_clarification_context(result, action)

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
    result = _attach_structured_analytics_from_chain(result, loop_steps)

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

    # Preserve the instructor's full utterance on create_quiz handoffs so the
    # quiz describe/generation field follows topic constraints (and points /
    # time / question-type instructions), not a title-only fallback (#1512).
    # Must run before the assistant message is persisted so history reopen
    # ("Open quiz creation form") also carries the prompt.
    result = _attach_quiz_generation_prompt(result, message)

    server_preserved_grade_context = result.pop(
        "_server_preserved_grade_context", None
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
            if isinstance(server_preserved_grade_context, dict):
                merge_field_memory(
                    conversation,
                    server_preserved_grade_context,
                    # `reason` is deprecated: UpdateGradeAction normalizes the
                    # old spelling to `feedback` at the boundary, so nothing
                    # downstream produces or reads it.
                    allowed_keys=frozenset({"new_grade", "feedback"}),
                )
            # Remember what was asked and what was on offer, so a bare "the
            # second one" next turn is an answer rather than a new request.
            #
            # Recorded for EVERY clarify, not just the ones offering a choice.
            # It used to be candidates-only, on the reasoning that a
            # question like "what should the due date be?" has nothing to
            # choose between and so nothing worth storing. But the candidate
            # list was never the valuable part — the question being
            # outstanding was. Without it, the next turn saw a bare reply
            # with no idea it was a reply, ran SCOPE CHECK on it, and an
            # instructor who answered "what should the description say?"
            # with "monty python is a good childrens book" was told their
            # request was out of scope. It was a perfectly good answer to a
            # question the assistant had asked one turn earlier and
            # immediately forgotten.
            clarify_candidates = result.get("clarify_candidates")
            if clarify_candidates or result.get("question"):
                record_pending_expectation(
                    conversation,
                    field=result.get("clarify_field") or "",
                    question=result.get("question") or "",
                    candidates=clarify_candidates or [],
                    action=result.get("clarify_action"),
                    # Only ever set by server-built clarifies (the course-switch
                    # offer). Model-authored clarify payloads never reach this —
                    # the key isn't in any action schema — so a replayed request
                    # is always one the app itself chose to defer.
                    #
                    # The action being interrupted is attached HERE rather than
                    # by whichever chain built the offer: there are five of
                    # those and counting, and every one of them would otherwise
                    # need to remember to do it — which is exactly how
                    # send_message ended up as the workflow that forgot.
                    payload=_with_pending_action(result.get("clarify_payload"), action),
                )
        else:
            # Any settled turn answers the outstanding question or abandons it;
            # either way it is no longer outstanding. Leaving it would let a
            # much later "yes" reattach to a question from several turns ago.
            clear_pending_expectation(conversation)
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
    if cast(CursorResult, claim).rowcount > 0:
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

    preview_metadata = generate_write_preview(
        proposed, course, get_instructor_canvas_timezone(user, course.canvas_url)
    )
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
    loaded_user = await db.scalar(
        sa_select(User)
        .where(User.id == user.id)
        .options(selectinload(User.canvas_connections))
    )
    if loaded_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user = loaded_user

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
