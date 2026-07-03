# app/backend/app/mcp_tools/dispatcher.py
import json
import re
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp_tools.schemas import ACTION_SCHEMAS
from app.models.course import Course
from app.models.message import Message
from app.models.user import User
from app.schemas.canvas import AssignmentCreate, SubmissionResponse
from app.integrations.canvas import fetch_enrollments
from app.services.assignment_validation import validate_assignment_for_create
from app.services.canvas import (
    create_course_assignment,
    get_active_course,
    get_assignments,
    get_courses,
    get_submissions,
    require_canvas_token,
    set_active_course,
)
from app.services.canvas_status import CanvasWriteResult
from app.services.write_preview import generate_write_preview


class ToolExecutionError(Exception):
    """Callers catch this and turn it into a user-facing message.
    The raw exception text is for logs, not for the chatbox."""

    def __init__(self, message: str, *, log_detail: str | None = None):
        super().__init__(message)
        self.user_message = message
        self.log_detail = log_detail or message


def _extract_json(raw_llm_output: str) -> str:
    """Qwen3 and similar 'thinking' models wrap reasoning in <think>...</think>
    before the actual answer. Strip that block, then pull out the first
    {...} object found in what remains."""
    without_thinking = re.sub(
        r"<think>.*?</think>", "", raw_llm_output, flags=re.DOTALL
    )
    match = re.search(r"\{.*\}", without_thinking, re.DOTALL)
    if match:
        return match.group(0)
    return without_thinking.strip()


def parse_action(raw_llm_output: str) -> Any:
    """Validates the LLM's raw text output into a typed Pydantic action object.
    Step 1: strip <think> blocks and extract the first JSON object.
    Step 2: verify the 'action' field names a known tool.
    Step 3: validate remaining fields against that tool's schema.
    Any failure raises ToolExecutionError with a user-safe message."""
    cleaned = _extract_json(raw_llm_output)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise ToolExecutionError(
            "The assistant's response could not be understood. Please try rephrasing.",
            log_detail=f"JSON parse error: {e}. Raw output: {raw_llm_output!r}",
        )

    if not isinstance(data, dict) or "action" not in data:
        raise ToolExecutionError(
            "The assistant's response was missing required information. Please try again.",
            log_detail=f"Missing 'action' field. Raw output: {raw_llm_output!r}",
        )

    action_name = data["action"]
    schema_cls = ACTION_SCHEMAS.get(action_name)
    if schema_cls is None:
        raise ToolExecutionError(
            "The assistant tried to perform an action that isn't supported.",
            log_detail=f"Unknown action '{action_name}'. Raw output: {raw_llm_output!r}",
        )

    try:
        return schema_cls.model_validate(data)
    except ValidationError as e:
        raise ToolExecutionError(
            "The assistant's response was missing required details. Please try rephrasing your request.",
            log_detail=f"Validation error for action '{action_name}': {e}. Raw output: {raw_llm_output!r}",
        )


async def _resolve_course(
    db: AsyncSession, user: User, local_course_id: int
) -> Course:
    """Shared ownership check used by every action that takes a course ID."""
    course = await db.scalar(
        select(Course).where(
            Course.id == local_course_id, Course.instructor_id == user.id
        )
    )
    if not course:
        raise ToolExecutionError(
            "That course could not be found in your account.",
            log_detail=f"local_course_id={local_course_id} not found or not owned by user_id={user.id}",
        )
    return course


async def _add_person_submission_summary(
    course: Course,
    submissions: list[SubmissionResponse],
    user: User,
    db: AsyncSession,
) -> str:
    """Resolves user_id to name for display. Names are assembled here
    in Python from Canvas enrollment data — the LLM never sees or
    generates student PII directly."""
    token = require_canvas_token(user, course.canvas_url)
    enrollments = await fetch_enrollments(
        int(course.canvas_course_id), token, course.canvas_url
    )
    name_by_id = {
        e["user_id"]: e["user"]["name"] for e in enrollments if "user" in e
    }
    lines = []
    for s in submissions:
        name = name_by_id.get(s.user_id, f"Student {s.user_id}")
        status = "submitted" if s.workflow_state == "submitted" else "has not submitted"
        lines.append(f"{name} {status}")
    return "\n".join(lines)


async def execute_tool(db: AsyncSession, user: User, action: Any) -> dict:
    """Dispatch on the validated action's type.

    Architecture note — two distinct call paths:

    PATH A (normal chat turn, called from handle_chat_message):
      The LLM produces an intent_preview wrapping a proposed_action.
      execute_tool hits case 'intent_preview':, which calls
      generate_write_preview to build metadata, stores everything,
      and returns the preview to the user. No Canvas write happens.

    PATH B (confirm turn, called from handle_confirmed_action):
      The stored proposed_action is re-parsed and execute_tool is called
      with the specific write action (e.g. CreateAssignmentAction).
      execute_tool hits case 'create_assignment': (or another write case),
      which calls Canvas directly via services/canvas.py, wraps the result
      in CanvasWriteResult, and returns the execution status. No preview
      is generated.

    This separation means write action cases ONLY call Canvas — they never
    generate previews. Preview generation ONLY happens in case 'intent_preview':.
    This is the SRP boundary."""

    match action.action:

        # ── Read actions ──────────────────────────────────────────────
        case "fetch_courses":
            courses = await get_courses(user, _default_canvas_url(user), db)
            return {"courses": [c.model_dump() for c in courses]}

        case "fetch_assignments":
            course = await _resolve_course(db, user, action.local_course_id)
            assignments = await get_assignments(
                course.id, user, course.canvas_url, db
            )
            return {"assignments": [a.model_dump() for a in assignments]}

        case "fetch_submissions":
            course = await _resolve_course(db, user, action.local_course_id)
            submissions = await get_submissions(
                course.id, action.assignment_id, user, course.canvas_url, db
            )
            summary = await _add_person_submission_summary(
                course, submissions, user, db
            )
            return {
                "submissions": [s.model_dump() for s in submissions],
                "summary": summary,
            }

        case "set_active_course":
            result = await set_active_course(user, action.local_course_id, db)
            return {"active_course": result.model_dump()}

        case "get_active_course":
            result = await get_active_course(user, db)
            return {"active_course": result.model_dump() if result else None}

        # ── Write actions (PATH B only — Canvas write, no preview) ────
        # These cases are only reached from handle_confirmed_action after
        # the user has already seen and confirmed the intent_preview.
        # They call Canvas directly and wrap the result in CanvasWriteResult.
        # If services/canvas.py raises HTTPException, it propagates up and
        # handle_confirmed_action catches it as a ToolExecutionError.
        case "create_assignment":
            course = await _resolve_course(db, user, action.local_course_id)

            # re-validate at execution time — the preview may have been
            # shown seconds or minutes ago; Canvas state could have changed
            await validate_assignment_for_create(
                action.local_course_id,
                user,
                action.title,
                action.description,
                action.due_date,
                action.points_possible,
                db,
            )

            payload = AssignmentCreate(
                name=action.title,
                description=action.description,
                due_at=action.due_date,
                points_possible=action.points_possible,
            )
            # services/canvas.py raises HTTPException on any Canvas error,
            # so a returned object always means success
            assignment = await create_course_assignment(
                course.id, payload, user, course.canvas_url, db
            )
            result = CanvasWriteResult(
                action="create_assignment",
                data=assignment,
            )
            return result.to_dict()

        # ── Conversational actions ────────────────────────────────────
        # These results are logged verbatim as the assistant's message
        # content and fed back to the LLM as conversation history on the
        # next turn. Each must keep a top-level "action" key matching what
        # the system prompt teaches the model to produce — otherwise the
        # model imitates its own past (action-less) turn from history
        # instead of the system prompt's schema, and later outputs fail
        # to parse.
        case "out_of_scope":
            return {
                "action": "out_of_scope",
                "out_of_scope": True,
                "message": "Your Request is Out of Scope, it can't be processed.",
                "detail": action.message,
            }

        case "clarify":
            return {
                "action": "clarify",
                "clarify": True,
                "question": action.question,
                "partial_plan": action.partial_plan,
            }

        case "intent_preview":
            # PATH A: build the write preview here, not inside each write case.
            # proposed_action tells generate_write_preview which write type
            # this is — it dispatches internally and returns the right metadata.
            proposed = action.proposed_action
            write_actions = {"create_assignment", "send_reminder", "update_grade"}

            if proposed.get("action") in write_actions:
                # resolve the course for preview metadata (not for writing)
                course = await _resolve_course(
                    db, user, proposed.get("local_course_id", 0)
                )
                preview_metadata = generate_write_preview(proposed, course)
            else:
                # read-action previews don't need course-level metadata
                preview_metadata = {"action": proposed.get("action")}

            return {
                "action": "intent_preview",
                "intent_preview": True,
                "summary": action.summary,
                "proposed_action": proposed,
                "preview_metadata": preview_metadata,
            }

        case "respond":
            return {"action": "respond", "message": action.message}

        case _:
            raise ToolExecutionError(
                f"No handler implemented for action '{action.action}'."
            )


def _default_canvas_url(user: User) -> str:
    """fetch_courses needs a canvas_url but has no course to look it up from.
    Uses the user's first connected Canvas school as a fallback until
    per-conversation institution scoping (feature/multi-institution) is in."""
    if not user.canvas_connections:
        raise ToolExecutionError(
            "You haven't connected a Canvas account yet. Please connect one in Settings first.",
            log_detail=f"user_id={user.id} has no canvas_connections",
        )
    return user.canvas_connections[0].canvas_url