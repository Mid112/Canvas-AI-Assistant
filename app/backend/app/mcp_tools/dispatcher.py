# app/backend/app/mcp_tools/dispatcher.py
import json
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.integrations.mcp_client import MCPClientError, call_tool
from app.mcp_tools.schemas import ACTION_SCHEMAS, WRITE_ACTIONS, is_reversible
from app.models.course import Course
from app.models.user import User
from app.schemas.canvas import (
    AssignmentCreate,
    AssignmentResponse,
    AssignmentUpdate,
    GradeUpdateRequest,
    QuizCreate,
    QuizQuestionBankGroupCreate,
    QuizQuestionCreate,
    SubmissionResponse,
    SubmissionStatus,
)
from app.services.assignment_validation import (
    validate_assignment_for_create,
    validate_assignment_for_update,
)
from app.services.canvas import (
    _assert_no_executing_write,
    create_course_assignment,
    create_course_quiz,
    get_active_course,
    get_assignment,
    get_assignments,
    get_course_quizzes,
    get_courses,
    get_submissions,
    require_canvas_token,
    send_course_message,
    set_active_course,
    update_course_assignment,
)
from app.services.canvas_idempotency import (
    build_idempotency_key,
    run_idempotent_canvas_write,
)
from app.services.canvas_status import CanvasWriteResult
from app.services.course_access import get_owned_course_or_404
from app.services.grade_management import submit_grade_update
from app.services.llm.json_extraction import extract_json_object as _extract_json
from app.services.message_validation import check_message_profanity, validate_message_for_send
from app.services.quiz_validation import validate_quiz_for_create
from app.services.risk import classify_action_risk
from app.services.student import get_students
from app.services.write_preview import generate_write_preview


class ToolExecutionError(Exception):
    """Callers catch this and turn it into a user-facing message.
    The raw exception text is for logs, not for the chatbox."""

    def __init__(self, message: str, *, log_detail: str | None = None):
        super().__init__(message)
        self.user_message = message
        self.log_detail = log_detail or message


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
    # LLM JSON can put a nested object/array in "action"; dict/list keys are
    # unhashable and would crash ACTION_SCHEMAS.get with TypeError — callers
    # only catch ToolExecutionError, so coerce that into a user-safe failure.
    if not isinstance(action_name, str):
        raise ToolExecutionError(
            "The assistant's response could not be understood. Please try rephrasing.",
            log_detail=(
                f"Non-string action field: {action_name!r}. "
                f"Raw output: {raw_llm_output!r}"
            ),
        )

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


# Friendly clarifying questions for create_assignment's fields, keyed in
# the order they're checked. points_possible is Optional in
# CreateAssignmentAction (str | None, to keep update_assignment's partial
# updates and the data model flexible), but for a *new* assignment every
# field should be an explicit user decision before a preview is shown.
_CREATE_ASSIGNMENT_FIELD_QUESTIONS = {
    "title": "What should this assignment be called?",
    "description": "What should the assignment description say?",
    "due_date": "When is this assignment due?",
    "points_possible": "How many points is this assignment worth?",
}

# Kept for call-site compatibility; quiz field gathering happens in the
# dedicated quiz creation form, not via chat clarify turns.
_CREATE_QUIZ_FIELD_QUESTIONS: dict[str, str] = {}


async def _call_mcp_tool(
    user: User,
    canvas_url: str,
    tool_name: str,
    arguments: dict[str, Any],
) -> dict[str, Any]:
    """Call MCP when enabled. Raises ToolExecutionError on failure — no
    silent direct-Canvas fallback for MCP-routed actions (Feature 13 #860)."""
    if not settings.MCP_ENABLED:
        raise MCPClientError("MCP integration is disabled.")
    try:
        token = require_canvas_token(user, canvas_url)
        return await call_tool(
            tool_name,
            arguments,
            canvas_token=token,
            canvas_url=canvas_url,
        )
    except MCPClientError as exc:
        raise ToolExecutionError(
            "The Canvas MCP service could not complete this action. "
            "Check that the MCP server is running, then try again.",
            log_detail=f"MCP tool {tool_name!r} failed: {exc}",
        ) from exc


def _mcp_enabled() -> bool:
    return bool(settings.MCP_ENABLED)


async def _run_guarded_write(
    db: AsyncSession,
    *,
    user: User,
    action_name: str,
    local_course_id: int,
    operation: str,
    idempotency_parts: tuple[object, ...],
    write,
    exclude_workflow_id: int | None = None,
) -> dict[str, Any]:
    """Apply in-flight + reserve-first idempotency around a Canvas/MCP write.

    MCP-enabled dispatcher branches previously called `_call_mcp_tool` directly
    and skipped the service-layer guards. Routing every mutating path through
    this helper keeps #1188 / #1189 active whether MCP is on or off.

    ``exclude_workflow_id`` lets the confirm path ignore its own
    ``status='executing'`` workflow row (see ``_assert_no_executing_write``).
    """
    await _assert_no_executing_write(
        db,
        user_id=user.id,
        action_name=action_name,
        local_course_id=local_course_id,
        exclude_workflow_id=exclude_workflow_id,
    )
    return await run_idempotent_canvas_write(
        db,
        user_id=user.id,
        operation=operation,
        idempotency_key=build_idempotency_key(*idempotency_parts),
        write=write,
    )


def _tag_via_mcp(payload: dict[str, Any]) -> dict[str, Any]:
    out = dict(payload)
    out["via_mcp"] = True
    return out


def _map_mcp_courses_result(mcp_result: dict[str, Any]) -> dict[str, Any]:
    courses = []
    for item in mcp_result.get("courses", []):
        if not isinstance(item, dict):
            continue
        courses.append(
            {
                "canvas_id": item.get("id"),
                "name": item.get("name") or "",
                "course_code": item.get("course_code") or "",
                "workflow_state": item.get("workflow_state") or "available",
                "enrollment_term_id": item.get("enrollment_term_id"),
            }
        )
    return {"courses": courses}


def _map_mcp_assignments_result(mcp_result: dict[str, Any]) -> dict[str, Any]:
    assignments = []
    course_id = mcp_result.get("course_id")
    for item in mcp_result.get("assignments", []):
        if not isinstance(item, dict):
            continue
        assignments.append(
            {
                "id": item.get("id"),
                "name": item.get("name") or "",
                "description": item.get("description"),
                "due_at": item.get("due_at"),
                "points_possible": item.get("points_possible"),
                "course_id": item.get("course_id") or course_id,
            }
        )
    return {"assignments": assignments}


def _map_mcp_submissions_result(mcp_result: dict[str, Any]) -> dict[str, Any]:
    from app.services.llm.student_context import llm_safe_submission_dict

    groups: dict[str, list[dict]] = {status.value: [] for status in SubmissionStatus}
    submissions = []
    for item in mcp_result.get("submissions", []):
        if not isinstance(item, dict):
            continue
        workflow_state = item.get("workflow_state") or "unsubmitted"
        if item.get("missing") or workflow_state == "unsubmitted":
            status = SubmissionStatus.missing if item.get("missing") else SubmissionStatus.unsubmitted
        elif item.get("late"):
            status = SubmissionStatus.late
        elif workflow_state == "graded":
            status = SubmissionStatus.graded
        elif workflow_state == "submitted":
            status = SubmissionStatus.submitted
        else:
            status = SubmissionStatus.unsubmitted
        safe = llm_safe_submission_dict(
            {
                "id": item.get("id"),
                "assignment_id": mcp_result.get("assignment_id"),
                "user_id": item.get("user_id"),
                "student_name": f"Student {item.get('user_id')}",
                "submitted_at": item.get("submitted_at"),
                "workflow_state": workflow_state,
                "status": status.value,
                "score": item.get("score"),
                "grade": item.get("grade"),
            }
        )
        submissions.append(safe)
        name = safe.get("student_name") or f"Student {safe.get('user_id')}"
        groups[status.value].append({"user_id": safe.get("user_id"), "name": name})

    counts = {status: len(students) for status, students in groups.items()}
    pending_students = groups["missing"] + groups["unsubmitted"]
    return {
        "submissions": submissions,
        "counts": counts,
        "pending_students": pending_students,
        "submitted_students": groups["submitted"],
        "late_students": groups["late"],
        "graded_students": groups["graded"],
        "excused_students": groups["excused"],
    }


def _create_assignment_missing_field(proposed: dict) -> str | None:
    """Returns the name of the first required create_assignment field
    that's missing or effectively empty, or None if the proposal is
    complete.

    This can't be left to schema validation alone: proposed_action is a
    loosely typed dict at preview time (see the 'intent_preview' case
    below), not validated against CreateAssignmentAction until confirm —
    so a model can satisfy Pydantic's `str` type by emitting "" instead
    of actually asking the user, which slips past AMBIGUITY CHECK and
    REQUIRED FIELDS in the system prompt entirely undetected (observed in
    practice with the instruct model). Checking here is a server-side
    guarantee that doesn't depend on the model reliably following that
    prompt instruction."""
    for field in ("title", "description", "due_date"):
        value = proposed.get(field)
        if not isinstance(value, str) or not value.strip():
            return field
    if proposed.get("points_possible") is None:
        return "points_possible"
    return None


def _create_quiz_missing_field(proposed: dict) -> str | None:
    """Always None — quiz creation routes to the dedicated form.

    Title, description, due date, points, and questions are validated by
    the form (quizReviewSchema / validate_quiz_for_create), not via chat
    clarify turns. Returning a missing field here would block navigateTo.
    """
    del proposed  # kept for call-site signature compatibility
    return None


def _send_message_missing_field(proposed: dict) -> str | None:
    for field in ("subject", "body"):
        value = proposed.get(field)
        if not isinstance(value, str) or not value.strip():
            return field
    return None


def _create_assignment_due_date_in_past(due_date: str) -> bool:
    """True if due_date parses to a date that has already passed.

    Mirrors assignment_validation._check_due_date's future-date rule,
    checked here too so a stale year is caught before a doomed preview is
    shown, not just at confirm time (the TODAY'S DATE line in the system
    prompt tells the model what today is, but it doesn't reliably do the
    "nearest future occurrence" arithmetic itself — observed defaulting
    to the current year even when that puts the date in the past)."""
    from app.services.due_date import parse_due_date

    try:
        due_dt = parse_due_date(due_date)
    except (ValueError, TypeError, OverflowError):
        return False
    return due_dt <= datetime.now(UTC)


async def _resolve_course(
    db: AsyncSession, user: User, local_course_id: int
) -> Course:
    """Shared ownership check used by every action that takes a course ID.

    Delegates the actual lookup to services/course_access.py's
    get_owned_course_or_404 (the same query FastAPI routes use) rather than
    duplicating it, translating its HTTPException into this module's
    ToolExecutionError so every existing caller here keeps seeing the same
    exception type it already handles."""
    try:
        return await get_owned_course_or_404(local_course_id, user, db)
    except HTTPException as e:
        detail = e.detail if isinstance(e.detail, str) else str(e.detail)
        raise ToolExecutionError(
            "That course could not be found in your account.",
            log_detail=f"local_course_id={local_course_id} not found or not owned by user_id={user.id}: {detail}",
        )


def _build_submissions_result(submissions: list[SubmissionResponse]) -> dict:
    """Groups raw submissions by Canvas's own status categories
    (graded/submitted/late/missing/unsubmitted/excused — see
    SubmissionStatus/_parse_submission_status in services/canvas.py) so
    "who hasn't submitted" is a first-class, directly-readable field
    instead of something the caller has to infer by scanning the raw
    per-submission list itself. "pending_students" (missing + unsubmitted
    combined) mirrors the same default definition
    compute_submissions_by_status's status="missing" uses (see
    services/resolved_set.py), kept consistent across both code paths.

    Feature 14 (#908): tool results fed back to the LLM keep name + Canvas
    user_id only — email/login_id are stripped via llm_safe_submission_dict.
    student_name is already populated on each submission by get_submissions
    (services/canvas.py), which requests Canvas's include[]=user."""
    from app.services.llm.student_context import llm_safe_submission_dict

    groups: dict[str, list[dict]] = {status.value: [] for status in SubmissionStatus}
    for s in submissions:
        name = s.student_name or f"Student {s.user_id}"
        groups[s.status.value].append({"user_id": s.user_id, "name": name})

    counts = {status: len(students) for status, students in groups.items()}
    pending_students = groups["missing"] + groups["unsubmitted"]

    return {
        "submissions": [llm_safe_submission_dict(s) for s in submissions],
        "counts": counts,
        "pending_students": pending_students,
        "submitted_students": groups["submitted"],
        "late_students": groups["late"],
        "graded_students": groups["graded"],
        "excused_students": groups["excused"],
    }


def _merge_assignment_update(current: AssignmentResponse, action: Any) -> AssignmentUpdate:
    """Canvas's assignment PUT is a full overwrite — fields left out of the
    payload get blanked, not left alone. Any field the user didn't ask to
    change is carried over from the just-fetched current Canvas state."""
    from app.services.due_date import parse_due_date

    if action.due_date is not None:
        due_at = parse_due_date(action.due_date)
    else:
        due_at = current.due_at
        if isinstance(due_at, datetime) and due_at.tzinfo is None:
            due_at = due_at.replace(tzinfo=UTC)
        elif isinstance(due_at, str):
            due_at = parse_due_date(due_at)

    return AssignmentUpdate(
        name=action.title if action.title is not None else current.name,
        description=action.description if action.description is not None else current.description,
        due_at=due_at,
        points_possible=action.points_possible if action.points_possible is not None else current.points_possible,
    )


async def execute_tool(
    db: AsyncSession,
    user: User,
    action: Any,
    *,
    exclude_workflow_id: int | None = None,
) -> dict:
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
    This is the SRP boundary.

    ``exclude_workflow_id`` is set on PATH B so the in-flight write guard
    does not treat the confirming workflow as a competing write.
    """

    match action.action:

        # ── Read actions ──────────────────────────────────────────────
        case "fetch_courses":
            canvas_url = _default_canvas_url(user)
            if _mcp_enabled():
                mcp_result = await _call_mcp_tool(user, canvas_url, "fetch_courses", {})
                return _tag_via_mcp(_map_mcp_courses_result(mcp_result))
            courses = await get_courses(user, canvas_url, db)
            return {"courses": [c.model_dump() for c in courses]}

        case "fetch_assignments":
            course = await _resolve_course(db, user, action.local_course_id)
            if _mcp_enabled():
                mcp_result = await _call_mcp_tool(
                    user,
                    course.canvas_url,
                    "fetch_assignments",
                    {"course_id": int(course.canvas_course_id)},
                )
                return _tag_via_mcp(_map_mcp_assignments_result(mcp_result))
            assignments = await get_assignments(
                course.id, user, course.canvas_url, db
            )
            return {"assignments": [a.model_dump() for a in assignments]}

        case "fetch_submissions":
            course = await _resolve_course(db, user, action.local_course_id)
            if _mcp_enabled():
                mcp_result = await _call_mcp_tool(
                    user,
                    course.canvas_url,
                    "fetch_submissions",
                    {
                        "course_id": int(course.canvas_course_id),
                        "assignment_id": action.assignment_id,
                    },
                )
                mapped = _map_mcp_submissions_result(mcp_result)
                mapped["assignment"] = {"assignment_id": action.assignment_id}
                return _tag_via_mcp(mapped)
            submissions = await get_submissions(
                course.id, action.assignment_id, user, course.canvas_url, db
            )
            return _build_submissions_result(submissions)

        case "fetch_students":
            # Feature 14 (#908): strip email/login_id before this tool result
            # is echoed back into the LLM context.
            from app.services.llm.student_context import llm_safe_student_dict

            course = await _resolve_course(db, user, action.local_course_id)
            if _mcp_enabled():
                mcp_result = await _call_mcp_tool(
                    user,
                    course.canvas_url,
                    "fetch_students",
                    {"course_id": int(course.canvas_course_id)},
                )
                students = [
                    llm_safe_student_dict(item)
                    for item in mcp_result.get("students", [])
                    if isinstance(item, dict)
                ]
                active_count = sum(
                    1 for s in students if s.get("enrollment_state") == "active"
                )
                return _tag_via_mcp(
                    {
                        "students": students,
                        "count": len(students),
                        "active_count": active_count,
                        "summary": (
                            f"{course.name} has {active_count} active students "
                            f"and {len(students)} total enrollments."
                        ),
                    }
                )
            course_students = await get_students(
                course.id, user, course.canvas_url, db
            )
            active_students = [
                student for student in course_students if student.enrollment_state == "active"
            ]
            return {
                "students": [llm_safe_student_dict(student) for student in course_students],
                "count": len(course_students),
                "active_count": len(active_students),
                "summary": (
                    f"{course.name} has {len(active_students)} active students "
                    f"and {len(course_students)} total enrollments."
                ),
            }

        case "fetch_quizzes":
            course = await _resolve_course(db, user, action.local_course_id)
            if _mcp_enabled():
                mcp_result = await _call_mcp_tool(
                    user,
                    course.canvas_url,
                    "fetch_quizzes",
                    {"course_id": int(course.canvas_course_id)},
                )
                quizzes = [
                    item
                    for item in mcp_result.get("quizzes", [])
                    if isinstance(item, dict)
                ]
                return _tag_via_mcp(
                    {
                        "quizzes": quizzes,
                        "count": len(quizzes),
                        "summary": f"{course.name} has {len(quizzes)} quiz(zes).",
                    }
                )
            course_quizzes = await get_course_quizzes(
                course.id, user, course.canvas_url, db
            )
            return {
                "quizzes": [quiz.model_dump(mode="json") for quiz in course_quizzes],
                "count": len(course_quizzes),
                "summary": f"{course.name} has {len(course_quizzes)} quiz(zes).",
            }

        case "set_active_course":
            active_course_set = await set_active_course(user, action.local_course_id, db)
            return {"active_course": active_course_set.model_dump()}

        case "get_active_course":
            active_course_current = await get_active_course(user, db)
            return {"active_course": active_course_current.model_dump() if active_course_current else None}

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

            assignment_payload = AssignmentCreate(
                name=action.title,
                description=action.description,
                due_at=action.due_date,
                points_possible=action.points_possible,
            )
            if _mcp_enabled():
                async def _mcp_create_assignment() -> dict[str, Any]:
                    mcp_result = await _call_mcp_tool(
                        user,
                        course.canvas_url,
                        "create_assignment",
                        {
                            "course_id": int(course.canvas_course_id),
                            "name": action.title,
                            "points_possible": action.points_possible,
                            "due_at": action.due_date,
                            "description": action.description,
                        },
                    )
                    if not mcp_result.get("success") or not mcp_result.get("assignment"):
                        raise ToolExecutionError(
                            "Canvas did not create the assignment via MCP.",
                            log_detail=f"MCP create_assignment response: {mcp_result!r}",
                        )
                    created = mcp_result["assignment"]
                    return AssignmentResponse(
                        id=int(created.get("id")),
                        name=created.get("name") or action.title,
                        description=action.description,
                        due_at=created.get("due_at"),
                        points_possible=created.get("points_possible")
                        or action.points_possible,
                        course_id=int(course.canvas_course_id),
                        published=bool(created.get("published", False)),
                    ).model_dump(mode="json")

                assignment = AssignmentResponse(
                    **(
                        await _run_guarded_write(
                            db,
                            user=user,
                            action_name="create_assignment",
                            local_course_id=course.id,
                            operation="create_assignment",
                            idempotency_parts=(
                                "create_assignment",
                                user.id,
                                course.id,
                                assignment_payload.model_dump(mode="json"),
                            ),
                            write=_mcp_create_assignment,
                            exclude_workflow_id=exclude_workflow_id,
                        )
                    )
                )
            else:
                assignment = await create_course_assignment(
                    course.id,
                    assignment_payload,
                    user,
                    course.canvas_url,
                    db,
                    exclude_workflow_id=exclude_workflow_id,
                )
            assignment_write = CanvasWriteResult(
                action="create_assignment",
                data=assignment,
                reversible=is_reversible("create_assignment"),
                affected_resources=[
                    {"type": "course", "id": course.id, "name": course.name, "status": "unchanged"},
                    {"type": "assignment", "id": assignment.id, "name": assignment.name, "status": "created"},
                ],
            )
            out = assignment_write.to_dict()
            if _mcp_enabled():
                out["via_mcp"] = True
            return out

        case "create_quiz":
            # Intentionally not MCP-routed: classic/New Quizzes creation is a
            # multi-step Canvas flow (quiz shell + questions / bank groups) that
            # the MCP sidecar does not expose. When MCP_ENABLED, quiz writes stay
            # on create_course_quiz (direct Canvas) with the same in-flight +
            # idempotency guards — see MCP_REQUIRED_ACTIONS in mcp_client.py.
            course = await _resolve_course(db, user, action.local_course_id)
            questions = [
                q.model_dump() if hasattr(q, "model_dump") else q
                for q in (action.questions or [])
            ]
            question_bank_groups = [
                group.model_dump() if hasattr(group, "model_dump") else group
                for group in (action.question_bank_groups or [])
            ]
            await validate_quiz_for_create(
                action.local_course_id,
                user,
                action.title,
                action.description,
                action.due_date,
                action.points_possible,
                db,
                allowed_attempts=action.allowed_attempts,
                time_limit=action.time_limit,
                questions=questions,
                quiz_engine=action.quiz_engine,
                question_bank_groups=question_bank_groups,
            )
            quiz_payload = QuizCreate(
                title=action.title,
                description=action.description,
                due_at=action.due_date,
                points_possible=action.points_possible,
                allowed_attempts=action.allowed_attempts,
                time_limit=action.time_limit,
                quiz_engine=action.quiz_engine,
                questions=[
                    QuizQuestionCreate(
                        **{
                            **question,
                            "answers": question.get("answers") or [],
                        }
                    )
                    if isinstance(question, dict)
                    else question
                    for question in questions
                ],
                question_bank_groups=[
                    QuizQuestionBankGroupCreate(**group)
                    for group in question_bank_groups
                ],
            )
            quiz = await create_course_quiz(
                course.id,
                quiz_payload,
                user,
                course.canvas_url,
                db,
                exclude_workflow_id=exclude_workflow_id,
            )
            quiz_write = CanvasWriteResult(
                action="create_quiz",
                data=quiz,
                reversible=is_reversible("create_quiz"),
                affected_resources=[
                    {"type": "course", "id": course.id, "name": course.name, "status": "unchanged"},
                    {"type": "quiz", "id": quiz.id, "name": quiz.title, "status": "created"},
                ],
            )
            return quiz_write.to_dict()

        case "update_assignment":
            course = await _resolve_course(db, user, action.local_course_id)

            await validate_assignment_for_update(
                action.local_course_id,
                user,
                action.title,
                action.description,
                action.due_date,
                action.points_possible,
                db,
            )

            # fetch fresh Canvas state right before merging — the assignment
            # may have changed since the preview was shown, and this is also
            # where a bad/stale assignment_id surfaces as a Canvas 404
            current = await get_assignment(
                course.id, action.assignment_id, user, course.canvas_url, db
            )
            update_payload = _merge_assignment_update(current, action)

            if _mcp_enabled():
                async def _mcp_update_assignment() -> dict[str, Any]:
                    mcp_result = await _call_mcp_tool(
                        user,
                        course.canvas_url,
                        "update_assignment",
                        {
                            "course_id": int(course.canvas_course_id),
                            "assignment_id": action.assignment_id,
                            "name": update_payload.name,
                            "points_possible": update_payload.points_possible,
                            "due_at": (
                                update_payload.due_at.isoformat()
                                if update_payload.due_at is not None
                                else None
                            ),
                            "description": update_payload.description,
                        },
                    )
                    if not mcp_result.get("success") or not mcp_result.get("assignment"):
                        raise ToolExecutionError(
                            "Canvas did not update the assignment via MCP.",
                            log_detail=f"MCP update_assignment response: {mcp_result!r}",
                        )
                    created = mcp_result["assignment"]
                    return AssignmentResponse(
                        id=int(created.get("id") or action.assignment_id),
                        name=created.get("name") or current.name,
                        description=created.get("description")
                        if created.get("description") is not None
                        else current.description,
                        due_at=created.get("due_at"),
                        points_possible=created.get("points_possible")
                        if created.get("points_possible") is not None
                        else current.points_possible,
                        course_id=int(course.canvas_course_id),
                        published=bool(
                            created.get(
                                "published", getattr(current, "published", False)
                            )
                        ),
                    ).model_dump(mode="json")

                assignment = AssignmentResponse(
                    **(
                        await _run_guarded_write(
                            db,
                            user=user,
                            action_name="update_assignment",
                            local_course_id=course.id,
                            operation="update_assignment",
                            idempotency_parts=(
                                "update_assignment",
                                user.id,
                                course.id,
                                action.assignment_id,
                                update_payload.model_dump(mode="json"),
                            ),
                            write=_mcp_update_assignment,
                            exclude_workflow_id=exclude_workflow_id,
                        )
                    )
                )
            else:
                assignment = await update_course_assignment(
                    course.id,
                    action.assignment_id,
                    update_payload,
                    user,
                    course.canvas_url,
                    db,
                    exclude_workflow_id=exclude_workflow_id,
                )
            changed_fields = [
                field
                for field, value in (
                    ("title", action.title),
                    ("description", action.description),
                    ("due_date", action.due_date),
                    ("points_possible", action.points_possible),
                )
                if value is not None
            ]
            assignment_update_write = CanvasWriteResult(
                action="update_assignment",
                data=assignment,
                reversible=is_reversible("update_assignment"),
                affected_resources=[
                    {"type": "course", "id": course.id, "name": course.name, "status": "unchanged"},
                    {
                        "type": "assignment",
                        "id": assignment.id,
                        "name": assignment.name,
                        "status": "modified",
                        "changed_fields": changed_fields,
                    },
                ],
                previous_data=current,
            )
            out = assignment_update_write.to_dict()
            if _mcp_enabled():
                out["via_mcp"] = True
            return out

        case "update_grade":
            course = await _resolve_course(db, user, action.local_course_id)
            student_id = getattr(action, "student_id", None)
            assignment_id = getattr(action, "assignment_id", None)
            if assignment_id is None or student_id is None:
                raise ToolExecutionError(
                    "The assistant needs to resolve the assignment and student before updating a grade.",
                    log_detail=f"Unresolved update_grade action reached dispatcher: {action.model_dump()}",
                )
            new_grade = (getattr(action, "new_grade", None) or "").strip()
            feedback = getattr(action, "feedback", None) or getattr(action, "reason", None)
            if feedback and str(feedback).strip():
                # Shared student-communication blocklist (#1300) — cover chat/MCP
                # grade updates, not only the feedback wizard / grades UI.
                check_message_profanity(str(feedback), content_label="Feedback")

            if _mcp_enabled():
                async def _mcp_update_grade() -> dict[str, Any]:
                    mcp_result = await _call_mcp_tool(
                        user,
                        course.canvas_url,
                        "update_grade",
                        {
                            "course_id": int(course.canvas_course_id),
                            "assignment_id": assignment_id,
                            "user_id": student_id,
                            "posted_grade": new_grade or None,
                            "comment": feedback,
                        },
                    )
                    if not mcp_result.get("success"):
                        raise ToolExecutionError(
                            "Canvas did not update the grade via MCP.",
                            log_detail=f"MCP update_grade response: {mcp_result!r}",
                        )
                    submission = mcp_result.get("submission") or {}
                    if not isinstance(submission, dict):
                        submission = {}
                    return submission

                submission = await _run_guarded_write(
                    db,
                    user=user,
                    action_name="update_grade",
                    local_course_id=course.id,
                    operation="update_grade",
                    idempotency_parts=(
                        "update_grade",
                        user.id,
                        course.id,
                        assignment_id,
                        student_id,
                        new_grade,
                        (feedback or "").strip(),
                    ),
                    write=_mcp_update_grade,
                    exclude_workflow_id=exclude_workflow_id,
                )
                grade_mcp_write = CanvasWriteResult(
                    action="update_grade",
                    data=submission,
                    reversible=is_reversible("update_grade"),
                    affected_resources=[
                        {
                            "type": "course",
                            "id": course.id,
                            "name": course.name,
                            "status": "unchanged",
                        },
                        {
                            "type": "submission",
                            "id": submission.get("id"),
                            "name": getattr(action, "student_reference", None)
                            or "Student grade",
                            "status": "modified",
                            "changed_fields": [
                                *(["grade"] if new_grade else []),
                                *(["feedback"] if feedback else []),
                            ],
                        },
                    ],
                )
                out = grade_mcp_write.to_dict()
                out["via_mcp"] = True
                return out

            grade_result = await submit_grade_update(
                course.id,
                GradeUpdateRequest(
                    assignment_id=assignment_id,
                    user_id=student_id,
                    posted_grade=new_grade,
                    reason=feedback,
                ),
                user,
                course.canvas_url,
                db,
                record_workflow_audit=False,
                exclude_workflow_id=exclude_workflow_id,
            )
            grade_write = CanvasWriteResult(
                action="update_grade",
                data=grade_result.canvas_submission,
                reversible=is_reversible("update_grade"),
                affected_resources=grade_result.affected_resources,
                previous_data=grade_result.current,
            )
            return grade_write.to_dict()

        case "send_message":
            course = await _resolve_course(db, user, action.local_course_id)

            await validate_message_for_send(
                action.local_course_id,
                user,
                action.subject,
                action.body,
                db,
                canvas_url=course.canvas_url,
                recipient_canvas_user_ids=action.recipient_canvas_user_ids,
            )

            recipients = list(action.recipient_canvas_user_ids or [])
            if _mcp_enabled():
                async def _mcp_send_message() -> dict[str, Any]:
                    if recipients:
                        mcp_result = await _call_mcp_tool(
                            user,
                            course.canvas_url,
                            "send_message_to_students",
                            {
                                "course_id": int(course.canvas_course_id),
                                "subject": action.subject,
                                "body": action.body,
                                "recipient_ids": recipients,
                            },
                        )
                        delivery_mode = "conversation"
                    else:
                        mcp_result = await _call_mcp_tool(
                            user,
                            course.canvas_url,
                            "create_announcement",
                            {
                                "course_id": int(course.canvas_course_id),
                                "subject": action.subject,
                                "body": action.body,
                            },
                        )
                        delivery_mode = "announcement"
                    if not mcp_result.get("success"):
                        raise ToolExecutionError(
                            "Canvas did not send the message via MCP.",
                            log_detail=f"MCP send_message response: {mcp_result!r}",
                        )
                    return {
                        "delivery_mode": delivery_mode,
                        "subject": action.subject,
                        "recipient_count": mcp_result.get("recipient_count")
                        or len(recipients),
                    }

                message_payload = await _run_guarded_write(
                    db,
                    user=user,
                    action_name="send_message",
                    local_course_id=course.id,
                    operation="send_message",
                    idempotency_parts=(
                        "send_message",
                        user.id,
                        course.id,
                        action.subject,
                        action.body,
                        recipients,
                    ),
                    write=_mcp_send_message,
                    exclude_workflow_id=exclude_workflow_id,
                )
                message_result: Any = SimpleNamespace(**message_payload)
            else:
                message_result = await send_course_message(
                    course.id,
                    action.subject,
                    action.body,
                    user,
                    course.canvas_url,
                    db,
                    recipient_canvas_user_ids=action.recipient_canvas_user_ids,
                    exclude_workflow_id=exclude_workflow_id,
                )
            resource_type = (
                "conversation"
                if message_result.delivery_mode == "conversation"
                else "announcement"
            )
            message_write = CanvasWriteResult(
                action="send_message",
                data=message_result,
                reversible=is_reversible("send_message"),
                affected_resources=[
                    {"type": "course", "id": course.id, "name": course.name, "status": "unchanged"},
                    {
                        "type": resource_type,
                        "id": None,
                        "name": action.subject,
                        "status": "created",
                    },
                ],
            )
            out = message_write.to_dict()
            if _mcp_enabled():
                out["via_mcp"] = True
            return out

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

            # proposed_action.action must itself be a real, executable action
            # (or a read action) — not "clarify"/"intent_preview"/etc. This
            # has been observed in practice: a modify turn confused about
            # merging its edit with an existing plan can nest {"action":
            # "clarify", ...} inside proposed_action, which the frontend
            # then renders as a bogus confirmable "Clarify" action card
            # instead of a real clarifying question.
            nested_action_name = proposed.get("action")
            if nested_action_name not in ACTION_SCHEMAS or nested_action_name in {
                "out_of_scope", "clarify", "intent_preview", "respond",
            }:
                raise ToolExecutionError(
                    "The assistant's response could not be understood. Please try rephrasing.",
                    log_detail=f"intent_preview wrapped a non-action proposed_action.action "
                    f"{nested_action_name!r}. proposed_action: {proposed!r}",
                )

            if proposed.get("action") == "create_assignment":
                missing_field = _create_assignment_missing_field(proposed)
                if missing_field:
                    partial_plan = {
                        key: value
                        for key, value in proposed.items()
                        if key not in ("action", missing_field)
                    }
                    return {
                        "action": "clarify",
                        "clarify": True,
                        "question": _CREATE_ASSIGNMENT_FIELD_QUESTIONS[missing_field],
                        "partial_plan": partial_plan,
                    }

                if _create_assignment_due_date_in_past(proposed["due_date"]):
                    partial_plan = {
                        key: value for key, value in proposed.items() if key not in ("action", "due_date")
                    }
                    return {
                        "action": "clarify",
                        "clarify": True,
                        "question": (
                            f"The due date you gave ({proposed['due_date']}) has already "
                            "passed — what date would you like instead?"
                        ),
                        "partial_plan": partial_plan,
                    }

            if proposed.get("action") == "create_quiz":
                # Always hand off to the quiz creation form — do not clarify
                # for missing fields or past due dates here. The form's
                # review schema and validate_quiz_for_create own that.
                # Helpers retained (always-empty / always-None) so call sites
                # and docs stay stable if clarification is reintroduced later.
                _ = (
                    _create_quiz_missing_field(proposed),
                    _CREATE_QUIZ_FIELD_QUESTIONS,
                )

            if proposed.get("action") == "send_message":
                missing_field = _send_message_missing_field(proposed)
                if missing_field:
                    partial_plan = {
                        key: value
                        for key, value in proposed.items()
                        if key not in ("action", missing_field)
                    }
                    question = (
                        "What should the message subject be?"
                        if missing_field == "subject"
                        else "What should the message say?"
                    )
                    return {
                        "action": "clarify",
                        "clarify": True,
                        "question": question,
                        "partial_plan": partial_plan,
                    }

            if proposed.get("action") == "update_assignment":
                editable_fields = (
                    "title",
                    "description",
                    "due_date",
                    "points_possible",
                )
                if not any(proposed.get(field) is not None for field in editable_fields):
                    return {
                        "action": "clarify",
                        "clarify": True,
                        "question": "What would you like to change about this assignment?",
                        "partial_plan": {
                            key: value
                            for key, value in proposed.items()
                            if key != "action"
                        },
                    }

            if proposed.get("action") == "update_grade":
                required_grade_fields = (
                    (
                        "assignment",
                        proposed.get("assignment_id")
                        or proposed.get("assignment_reference"),
                        "Which assignment should I update the grade for?",
                    ),
                    (
                        "student",
                        proposed.get("student_id")
                        or proposed.get("student_reference"),
                        "Which student should receive this grade?",
                    ),
                    (
                        "new_grade",
                        proposed.get("new_grade"),
                        "What grade should I enter?",
                    ),
                )
                for field_name, value, question in required_grade_fields:
                    if value is None or (
                        isinstance(value, str) and not value.strip()
                    ):
                        return {
                            "action": "clarify",
                            "clarify": True,
                            "question": question,
                            "partial_plan": {
                                key: item
                                for key, item in proposed.items()
                                if key not in ("action", field_name)
                            },
                        }

            if proposed.get("action") in WRITE_ACTIONS:
                # proposed_action is a raw, unvalidated dict from the LLM's
                # own JSON (IntentPreviewAction.proposed_action is typed as
                # plain `dict`, not a specific write schema) — a model can
                # write local_course_id as a numeric string ("612") instead
                # of an int, which previously crashed as an unhandled
                # Postgres type error ("integer = character varying") rather
                # than a safe message. Coerce explicitly instead of trusting
                # the LLM's JSON typing.
                try:
                    local_course_id = int(proposed.get("local_course_id", 0))
                except (TypeError, ValueError):
                    raise ToolExecutionError(
                        "The assistant's response was missing a valid course reference. Please try again.",
                        log_detail=f"Non-numeric local_course_id in proposed_action: {proposed!r}",
                    )
                # resolve the course for preview metadata (not for writing)
                course = await _resolve_course(db, user, local_course_id)
                preview_metadata = generate_write_preview(proposed, course)
            else:
                # Read-action previews don't need the richer write-preview
                # metadata, but still resolve a real course name when the
                # action is course-scoped — otherwise the UI has nothing to
                # show but a generic "Active course" placeholder.
                preview_metadata = {"action": proposed.get("action")}
                preview_metadata["risk_metadata"] = classify_action_risk(
                    nested_action_name, proposed
                )
                try:
                    read_local_course_id = int(proposed.get("local_course_id", 0))
                except (TypeError, ValueError):
                    read_local_course_id = 0
                if read_local_course_id:
                    try:
                        read_course = await _resolve_course(db, user, read_local_course_id)
                    except ToolExecutionError:
                        read_course = None
                    if read_course is not None:
                        preview_metadata["course"] = read_course.name

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
