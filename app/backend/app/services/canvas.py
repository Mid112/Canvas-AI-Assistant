import logging
from datetime import UTC, datetime
from html import escape
from uuid import uuid4

from cryptography.fernet import InvalidToken
from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.config import settings
from app.core.canvas_url import canvas_urls_equivalent, normalize_canvas_url
from app.core.database import AsyncSessionLocal
from app.core.security import decrypt_canvas_token
from app.integrations.canvas import (
    create_announcement,
    create_assignment,
    create_course,
    create_new_quiz,
    create_new_quiz_item,
    create_quiz,
    create_quiz_question,
    create_quiz_question_group,
    delete_assignment,
    delete_new_quiz,
    delete_quiz,
    fetch_accounts,
    fetch_assignment,
    fetch_assignments,
    fetch_courses,
    fetch_submissions,
    fetch_user_profile,
    list_question_banks,
    list_quizzes,
    probe_new_quizzes,
    send_conversation,
    update_assignment,
    update_course,
    update_submission_grade,
)
from app.models.assignment import Assignment
from app.models.canvas_connection import CanvasConnection
from app.models.canvas_course_name import CanvasCourseName
from app.models.course import Course
from app.models.user import User
from app.models.user_preference import UserPreference
from app.models.workflow import Workflow
from app.schemas.canvas import (
    ActiveCourseResponse,
    AssignmentCreate,
    AssignmentResponse,
    AssignmentUpdate,
    CourseCreate,
    CoursePublishUpdate,
    CourseResponse,
    MessageSendResult,
    QuestionBankSummary,
    QuizCapabilities,
    QuizCreate,
    QuizResponse,
    SubmissionResponse,
    SubmissionStatus,
)
from app.services.canvas_idempotency import (
    build_idempotency_key,
    duplicate_in_flight_http_exception,
    run_idempotent_canvas_write,
)
from app.services.quiz_validation import short_answer_new_quiz_warnings

logger = logging.getLogger(__name__)

# The only Canvas workflow_state that allows Canvas-content writes (create/update
# assignment, send message) — a concluded course is read-only even though it can
# still be the active course (see SELECTABLE_WORKFLOW_STATES below). Mirrored on
# the frontend in mapCanvasCourse.ts's WRITABLE_WORKFLOW_STATE — keep in sync.
WRITABLE_WORKFLOW_STATE = "available"

# Canvas workflow_states that count as "selectable as the active course" — an
# instructor can still review/analyze a concluded ("completed") course, just not
# write to it (see WRITABLE_WORKFLOW_STATE and require_writable_course below).
# Shared between get_courses()'s flip-detection and set_active_course()'s
# rejection check so the two can't drift apart. Mirrored on the frontend in
# mapCanvasCourse.ts's SELECTABLE_WORKFLOW_STATES — keep both in sync.
SELECTABLE_WORKFLOW_STATES = frozenset({WRITABLE_WORKFLOW_STATE, "completed"})


async def _assert_no_executing_write(
    db: AsyncSession,
    *,
    user_id: int,
    action_name: str,
    local_course_id: int,
    exclude_workflow_id: int | None = None,
) -> None:
    """Refuse a second Canvas write while any approved write is already
    executing for this instructor (Feature Reliability #1188 / #1237).

    ``action_name`` and ``local_course_id`` remain in the signature for call
    sites / logging, but the mutex is user-scoped so only one confirmed
    Canvas write runs at a time.

    ``exclude_workflow_id`` skips the caller's own row: ``handle_confirmed_action``
    commits the workflow as ``executing`` *before* ``execute_tool``, so without
    this exclusion the guard self-deadlocks on that same row.
    """
    del action_name, local_course_id
    stmt = select(Workflow).where(
        Workflow.user_id == user_id,
        Workflow.status == "executing",
    )
    if exclude_workflow_id is not None:
        stmt = stmt.where(Workflow.id != exclude_workflow_id)
    executing = list(await db.scalars(stmt))
    if executing:
        raise duplicate_in_flight_http_exception()


def require_writable_course(course: Course) -> None:
    """Raises if this course is read-only (concluded) — call before any Canvas
    write (assignment create/update, message send). Selecting a concluded
    course as active or reading its data is still fine; only mutating it isn't.
    None is treated as writable — an unpersisted Course instance (e.g. built
    directly in a test, not yet flushed) reads back as None in Python even
    though the column's DB default is "available"."""
    if course.workflow_state is not None and course.workflow_state != WRITABLE_WORKFLOW_STATE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This course has concluded and is read-only — writes are disabled.",
        )


class CanvasTokenRequiredError(HTTPException):
    """Raised in place of a bare HTTPException when a Canvas action is
    attempted with no connected token, so callers (services/chat.py) can
    special-case this into an actionable, non-technical chat message instead
    of surfacing an internal API patch path."""

    def __init__(self, canvas_url: str):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"No Canvas token for {canvas_url}. "
                "Reconnect Canvas in Settings, then try again."
            ),
        )


def require_canvas_token(user: User, canvas_url: str) -> str:
    """Return the decrypted token for one Canvas URL, or raise a user-facing
    403 that tells the caller whether the token is missing or unreadable."""
    canvas_url = normalize_canvas_url(canvas_url)
    conn = next(
        (c for c in user.canvas_connections if canvas_urls_equivalent(c.canvas_url, canvas_url)),
        None,
    )
    if not conn:
        raise CanvasTokenRequiredError(canvas_url)
    try:
        return decrypt_canvas_token(conn.encrypted_token)
    except InvalidToken:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Canvas token is corrupted — please reconnect Canvas.",
        )


def resolve_institution_canvas_url(user: User, canvas_url: str | None) -> str:
    """Resolve Canvas URL for institution-level workflows.

    Course-scoped workflows should use the Course.canvas_url instead. This
    helper is for routes such as course sync/create that operate before a local
    course exists.
    """
    if canvas_url:
        return normalize_canvas_url(canvas_url)

    connections = getattr(user, "canvas_connections", []) or []
    if len(connections) == 1:
        return normalize_canvas_url(connections[0].canvas_url)

    if not connections:
        detail = "Connect Canvas and provide a Canvas URL before loading courses."
    else:
        detail = "Select a Canvas institution before loading courses."
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=detail,
    )


def _is_expected_canvas_token_sync_error(exc: Exception) -> bool:
    """Background sync treats missing/invalid/corrupted Canvas tokens as
    expected account state, not infrastructure failure. Interactive endpoints
    still raise the original status, but sweeps should only log a concise
    reconnect warning — and must not append failed_operations rows — so one
    sweep over many stale connections cannot flood admin monitoring.
    """
    if not isinstance(exc, HTTPException) or not isinstance(exc.detail, str):
        return False
    detail = exc.detail
    if exc.status_code == status.HTTP_403_FORBIDDEN and (
        detail.startswith("No Canvas token")
        or detail.startswith("Canvas token is corrupted")
    ):
        return True
    # Canvas 401 is remapped to 422 by integrations/canvas.py.
    if (
        exc.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
        and detail.startswith("Invalid Canvas API token")
    ):
        return True
    return False


def _exception_text_for_canvas_classifier(exc: BaseException) -> str:
    log_detail = getattr(exc, "log_detail", None)
    user_message = getattr(exc, "user_message", None)
    if isinstance(log_detail, str) or isinstance(user_message, str):
        return (log_detail or "") or (user_message or "")
    if isinstance(exc, HTTPException) and isinstance(exc.detail, str):
        return exc.detail
    return str(exc)


def _text_has_gateway_status_with_context(text: str) -> bool:
    """True when 502/503/504 appears with Canvas/HTTP/upstream context.

    Bare numeric matches alone are too broad for quiet-fallback logging —
    e.g. ``RuntimeError("order 502 failed")`` must not look like a Canvas
    outage (#1295 review).
    """
    if not any(code in text for code in ("502", "503", "504")):
        return False
    lowered = text.lower()
    return (
        "canvas" in lowered
        or "upstream" in lowered
        or "http" in lowered
        or "gateway" in lowered
        or "bad gateway" in lowered
        or "service unavailable" in lowered
        or "server error" in lowered
        or "timed out" in lowered
        or "timeout" in lowered
    )


def _is_transient_canvas_outage(exc: BaseException) -> bool:
    """Canvas 5xx / timeouts / reachability — expected when falling back to
    last-synced local data (dashboard mirror refresh, chat monitoring).

    Shared by dashboard + chat so classifiers do not drift (#1295). Accepts
    ToolExecutionError-shaped exceptions via ``log_detail`` / ``user_message``
    without importing the MCP dispatcher (avoids circular imports).
    """
    if isinstance(exc, HTTPException) and exc.status_code in {502, 503, 504}:
        return True

    text = _exception_text_for_canvas_classifier(exc)
    lowered = text.lower()
    return (
        "canvas server error" in lowered
        or "canvas api timed out" in lowered
        or "could not reach canvas" in lowered
        or "timed out" in lowered
        or _text_has_gateway_status_with_context(text)
    )


async def get_owned_course(
    local_course_id: int,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
) -> Course:
    course = await db.scalar(
        select(Course).where(
            Course.id == local_course_id,
            Course.instructor_id == user.id,
        )
    )
    normalized = normalize_canvas_url(canvas_url or course.canvas_url) if course else None
    if not course or not canvas_urls_equivalent(course.canvas_url, normalized):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found or does not belong to you.",
        )

    if course.canvas_url != normalized:
        course.canvas_url = normalized

    return course


async def _resolve_course_create_account_id(token: str, canvas_url: str) -> int:
    """Pick a Canvas account the token can create courses under.

    Prefer the root account when present; otherwise the first manageable
    account. Teachers without account-manage permission get a clear 403 —
    institutional Canvas often blocks course creation for instructor tokens.
    """
    accounts = await fetch_accounts(token, canvas_url)
    if not accounts:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your Canvas token cannot create courses on any account. "
                "Ask an admin to grant course-creation permission, or create "
                "the course in Canvas and sync it here."
            ),
        )

    for account in accounts:
        parent = account.get("parent_account_id")
        # Canvas usually returns null for the root; some installs use 0 / "0".
        if parent in (None, "", 0, "0"):
            return int(account["id"])
    return int(accounts[0]["id"])


async def create_canvas_course(
    payload: CourseCreate,
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> CourseResponse:
    """Create a course in Canvas and upsert the local Course row (#1285)."""
    token = require_canvas_token(user, canvas_url)
    normalized_sync_url = normalize_canvas_url(canvas_url)
    account_id = await _resolve_course_create_account_id(token, canvas_url)

    course_payload: dict = {"name": payload.name.strip()}
    if payload.course_code and payload.course_code.strip():
        course_payload["course_code"] = payload.course_code.strip()

    data = await create_course(
        account_id,
        course_payload,
        token,
        canvas_url,
        offer=payload.publish,
        enroll_me=True,
    )

    cid = str(data["id"])
    term_name: str | None = (data.get("term") or {}).get("name")
    workflow_state = data.get("workflow_state") or (
        WRITABLE_WORKFLOW_STATE if payload.publish else "unpublished"
    )

    # Canvas course IDs are only unique within one Canvas instance — an instructor
    # with multiple connections must not have institution B's create rewrite the
    # local row for the same numeric id on institution A (see get_courses sync).
    rows = await db.scalars(
        select(Course).where(
            Course.canvas_course_id == cid,
            Course.instructor_id == user.id,
        )
    )
    existing = next(
        (
            course
            for course in rows
            if canvas_urls_equivalent(course.canvas_url, normalized_sync_url)
        ),
        None,
    )
    if existing:
        existing.name = data["name"]
        existing.term = term_name
        existing.canvas_url = normalized_sync_url
        existing.workflow_state = workflow_state
        existing.course_code = data.get("course_code")
        existing.total_students = data.get("total_students")
        existing.synced_at = datetime.now(UTC)
        course = existing
    else:
        course = Course(
            canvas_course_id=cid,
            canvas_url=normalized_sync_url,
            name=data["name"],
            term=term_name,
            workflow_state=workflow_state,
            course_code=data.get("course_code"),
            total_students=data.get("total_students"),
            instructor_id=user.id,
            synced_at=datetime.now(UTC),
        )
        db.add(course)

    await db.commit()

    return CourseResponse.model_validate(
        {
            **data,
            "local_id": course.id,
            "term_name": term_name,
            "workflow_state": workflow_state,
            "course_code": data.get("course_code") or "",
        }
    )


async def set_course_published(
    local_course_id: int,
    payload: CoursePublishUpdate,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
) -> CourseResponse:
    """Publish or unpublish a course via Canvas course[event] offer/claim."""
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    resolved_canvas_url = course.canvas_url
    token = require_canvas_token(user, resolved_canvas_url)

    if course.workflow_state == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Completed courses can't be published or unpublished.",
        )
    if course.workflow_state == "deleted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deleted courses can't be published or unpublished.",
        )

    currently_published = course.workflow_state == WRITABLE_WORKFLOW_STATE
    if payload.published == currently_published and course.workflow_state in {
        WRITABLE_WORKFLOW_STATE,
        "unpublished",
    }:
        # Already in the requested state — return current row without a Canvas write.
        return CourseResponse(
            canvas_id=int(course.canvas_course_id),
            local_id=course.id,
            name=course.name,
            course_code=course.course_code or "",
            workflow_state=course.workflow_state or "unpublished",
            term_name=course.term,
            total_students=course.total_students,
        )

    event = "offer" if payload.published else "claim"
    data = await update_course(
        int(course.canvas_course_id),
        {"event": event},
        token,
        resolved_canvas_url,
    )

    workflow_state = data.get("workflow_state") or (
        WRITABLE_WORKFLOW_STATE if payload.published else "unpublished"
    )
    # Capture selectability from the local row *before* we overwrite it with
    # Canvas's response — used only to decide whether to clear the active-course
    # preference when this write removes selectability.
    was_selectable = course.workflow_state in SELECTABLE_WORKFLOW_STATES
    course.name = data.get("name") or course.name
    course.course_code = data.get("course_code", course.course_code)
    course.workflow_state = workflow_state
    course.total_students = data.get("total_students", course.total_students)
    course.synced_at = datetime.now(UTC)

    # Unpublishing removes selectability — clear active-course preference if needed.
    if was_selectable and workflow_state not in SELECTABLE_WORKFLOW_STATES:
        pref = await db.scalar(select(UserPreference).where(UserPreference.user_id == user.id))
        if pref and pref.active_course_id == course.id:
            pref.active_course_id = None
            pref.updated_at = datetime.now(UTC)

    await db.commit()

    return CourseResponse.model_validate(
        {
            **data,
            "local_id": course.id,
            "term_name": course.term,
            "workflow_state": workflow_state,
            "course_code": course.course_code or "",
        }
    )


async def get_courses(user: User, canvas_url: str, db: AsyncSession) -> list[CourseResponse]:
    token = require_canvas_token(user, canvas_url)
    data = await fetch_courses(token, canvas_url)
    normalized_sync_url = normalize_canvas_url(canvas_url)

    # Batch fetch ALL existing courses for this instructor (not just ones Canvas
    # still returns) so a course Canvas no longer returns AT ALL this sync — deleted,
    # or this instructor lost teacher access — can be reconciled below instead of
    # being left with a stale workflow_state and a never-cleared active preference.
    # instructor_id filter ensures we never touch another instructor's rows.
    # Further filtered to courses on the SAME Canvas instance being synced — an
    # instructor with multiple Canvas connections (different institutions) must
    # not have this sync mark or reconcile courses that belong to a different
    # canvas_url, since Canvas course ids are only unique within one instance.
    # Known limitation: canvas_course_id is globally UNIQUE, so two co-instructors
    # on the same Canvas course will conflict on INSERT — tracked for follow-up.
    rows = await db.scalars(select(Course).where(Course.instructor_id == user.id))
    course_map: dict[str, Course] = {
        c.canvas_course_id: c
        for c in rows
        if canvas_urls_equivalent(c.canvas_url, normalized_sync_url)
    }

    canvas_ids = {str(item["id"]) for item in data}

    # Courses that flip from selectable ("available") to not on this sync, so the
    # active-course preference can be cleared below if one of them is currently active.
    newly_unselectable_ids: set[int] = set()

    for item in data:
        cid = str(item["id"])
        term_name: str | None = (item.get("term") or {}).get("name")
        workflow_state = item.get("workflow_state", WRITABLE_WORKFLOW_STATE)

        if cid in course_map:
            course = course_map[cid]
            if course.workflow_state in SELECTABLE_WORKFLOW_STATES and workflow_state not in SELECTABLE_WORKFLOW_STATES:
                newly_unselectable_ids.add(course.id)
            course.name = item["name"]
            course.term = term_name
            course.canvas_url = normalized_sync_url
            course.workflow_state = workflow_state
            course.course_code = item.get("course_code")
            course.total_students = item.get("total_students")
            course.synced_at = datetime.now(UTC)
        else:
            course = Course(
                canvas_course_id=cid,
                canvas_url=normalized_sync_url,
                name=item["name"],
                term=term_name,
                workflow_state=workflow_state,
                course_code=item.get("course_code"),
                total_students=item.get("total_students"),
                instructor_id=user.id,
                synced_at=datetime.now(UTC),
            )
            db.add(course)
            course_map[cid] = course

    # Reconcile disappearances: a course Canvas didn't return at all this sync is no
    # longer selectable either — "deleted" here means "no longer visible to us,"
    # not necessarily deleted on Canvas (could also be lost teacher access).
    for cid, course in course_map.items():
        if cid not in canvas_ids and course.workflow_state != "deleted":
            if course.workflow_state in SELECTABLE_WORKFLOW_STATES:
                newly_unselectable_ids.add(course.id)
            course.workflow_state = "deleted"

    # flush() sends all INSERTs in one round-trip and populates auto-generated IDs
    # before we build the response — commit() finalises the transaction after
    await db.flush()

    if newly_unselectable_ids:
        pref = await db.scalar(select(UserPreference).where(UserPreference.user_id == user.id))
        if pref and pref.active_course_id in newly_unselectable_ids:
            pref.active_course_id = None
            pref.updated_at = datetime.now(UTC)

    await db.commit()

    return [
        CourseResponse.model_validate(
            {
                **item,
                "local_id": course_map[str(item["id"])].id,
                "term_name": (item.get("term") or {}).get("name"),
            }
        )
        for item in data
    ]


async def get_cached_courses(user: User, canvas_url: str, db: AsyncSession) -> list[CourseResponse]:
    """Returns this instructor's last-synced courses straight from the local
    DB — no Canvas call. Lets the dashboard paint instantly from whatever
    get_courses() persisted on a previous sync, instead of always blocking
    on a live Canvas round-trip; callers are expected to also call
    get_courses() in the background to revalidate.

    Rows with workflow_state == "deleted" are excluded, matching
    get_courses()'s reconciliation. A course that has never been synced has
    no local row at all, so this simply returns fewer/no entries — never an
    error — and the caller falls back to a live get_courses() call."""
    normalized_sync_url = normalize_canvas_url(canvas_url)
    rows = await db.scalars(select(Course).where(Course.instructor_id == user.id))
    return [
        CourseResponse(
            canvas_id=int(course.canvas_course_id),
            local_id=course.id,
            name=course.name,
            course_code=course.course_code or "",
            workflow_state=course.workflow_state,
            term_name=course.term,
            total_students=course.total_students,
        )
        for course in rows
        if course.workflow_state != "deleted"
        and canvas_urls_equivalent(course.canvas_url, normalized_sync_url)
    ]


async def get_assignments(
    local_course_id: int,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
) -> list[AssignmentResponse]:
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    resolved_canvas_url = course.canvas_url
    token = require_canvas_token(user, resolved_canvas_url)
    data = await fetch_assignments(int(course.canvas_course_id), token, resolved_canvas_url)

    # Batch-fetch ALL local assignment rows for this course (not just ones Canvas
    # still returns) so rows Canvas no longer returns (deleted assignment) can be
    # reconciled to is_active=False below instead of being left stale and counted.
    rows = await db.scalars(select(Assignment).where(Assignment.course_id == course.id))
    assignment_map: dict[str, Assignment] = {a.canvas_assignment_id: a for a in rows}

    # Deliberately no `if not data:` special case here — the reconciliation loop
    # below already marks every existing row inactive when canvas_ids is empty,
    # producing the identical result without a separate, redundant branch.
    canvas_ids = {str(item["id"]) for item in data}

    for item in data:
        aid = str(item["id"])
        title = item.get("name") or "Untitled"
        description = item.get("description")
        due_date = _parse_dt(item.get("due_at"))
        points_possible = item.get("points_possible")
        published = item.get("published", True)

        if aid in assignment_map:
            assignment_map[aid].title = title
            assignment_map[aid].description = description
            assignment_map[aid].due_date = due_date
            assignment_map[aid].points_possible = points_possible
            assignment_map[aid].is_active = True
            assignment_map[aid].published = published
        else:
            assignment = Assignment(
                canvas_assignment_id=aid,
                course_id=course.id,
                title=title,
                description=description,
                due_date=due_date,
                points_possible=points_possible,
                published=published,
            )
            db.add(assignment)
            assignment_map[aid] = assignment

    # Reconcile deletions: any local row Canvas didn't return this time is no
    # longer on Canvas — mark inactive rather than leaving it counted as active.
    for aid, assignment in assignment_map.items():
        if aid not in canvas_ids:
            assignment.is_active = False

    await db.flush()
    await db.commit()

    return [
        AssignmentResponse.model_validate({
            **item,
            "local_id": assignment_map[str(item["id"])].id,
        })
        for item in data
    ]


def _parse_dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


async def get_assignment(
    local_course_id: int,
    assignment_id: int,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
) -> AssignmentResponse:
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    resolved_canvas_url = course.canvas_url
    token = require_canvas_token(user, resolved_canvas_url)
    data = await fetch_assignment(
        int(course.canvas_course_id),
        assignment_id,
        token,
        resolved_canvas_url,
    )
    return AssignmentResponse(**data)


async def create_course_assignment(
    local_course_id: int,
    payload: AssignmentCreate,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
    *,
    idempotency_key: str | None = None,
    exclude_workflow_id: int | None = None,
) -> AssignmentResponse:
    from app.services.assignment_validation import validate_assignment_for_create

    # Semantic validation (required fields, future due date, points > 0 or
    # intentional null for ungraded) before any Canvas write — same rules as
    # chat/MCP confirm. Profanity is checked inside the validators.
    await validate_assignment_for_create(
        local_course_id,
        user,
        payload.name,
        payload.description,
        payload.due_at.isoformat() if payload.due_at else None,
        payload.points_possible,
        db,
    )

    course = await get_owned_course(local_course_id, user, canvas_url, db)
    resolved_canvas_url = course.canvas_url
    token = require_canvas_token(user, resolved_canvas_url)
    require_writable_course(course)
    await _assert_no_executing_write(
        db,
        user_id=user.id,
        action_name="create_assignment",
        local_course_id=course.id,
        exclude_workflow_id=exclude_workflow_id,
    )

    key = idempotency_key or build_idempotency_key(
        "create_assignment",
        user.id,
        course.id,
        payload.model_dump(mode="json"),
    )

    async def _write() -> dict:
        return await create_assignment(
            int(course.canvas_course_id),
            payload.model_dump(mode="json"),
            token,
            resolved_canvas_url,
        )

    data = await run_idempotent_canvas_write(
        db,
        user_id=user.id,
        operation="create_assignment",
        idempotency_key=key,
        write=_write,
    )
    return AssignmentResponse(**data)


def _quiz_payload_for_canvas(payload: QuizCreate) -> dict:
    """Map our QuizCreate schema to Canvas's quiz object (no questions —
    questions are created via a separate endpoint after the quiz exists)."""
    body = {
        "title": payload.title,
        "description": payload.description,
        "quiz_type": payload.quiz_type,
        "due_at": payload.due_at.isoformat() if payload.due_at else None,
        "points_possible": payload.points_possible,
        "allowed_attempts": payload.allowed_attempts,
        "time_limit": payload.time_limit,
        "published": payload.published,
    }
    # Keep published=False, but never send description:null — Canvas treats
    # an omitted description as "leave unset", while null can 400 or clear it.
    return {
        key: value
        for key, value in body.items()
        if value is not None or key == "published"
    }


def _unique_correct_answer(answers: list[dict], *, label: str) -> dict:
    correct = [
        answer
        for answer in answers
        if float(answer.get("weight", answer.get("answer_weight", 0)) or 0)
        == 100.0
    ]
    if len(correct) != 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"{label} must mark exactly one correct answer "
                "(weight 100) before creating a New Quiz item."
            ),
        )
    return correct[0]


def _new_quiz_payload_for_canvas(payload: QuizCreate) -> dict:
    attempts_enabled = payload.allowed_attempts is None or payload.allowed_attempts > 1
    body = {
        "title": payload.title,
        "instructions": payload.description or "",
        "due_at": payload.due_at.isoformat() if payload.due_at else None,
        "points_possible": payload.points_possible,
        "grading_type": "points",
        "quiz_settings": {
            "multiple_attempts": {
                "multiple_attempts_enabled": attempts_enabled,
                "attempt_limit": payload.allowed_attempts is not None,
                "max_attempts": payload.allowed_attempts,
                "score_to_keep": "highest",
            },
            "has_time_limit": payload.time_limit is not None,
            "session_time_limit_in_seconds": (
                payload.time_limit * 60 if payload.time_limit is not None else None
            ),
        },
    }
    return {key: value for key, value in body.items() if value is not None}


def _new_quiz_item_payload(question, position: int) -> dict:
    question_type = question.question_type
    answers = list(question.answers or [])
    entry: dict = {
        "title": question.question_text[:255],
        "item_body": f"<p>{escape(question.question_text)}</p>",
        "calculator_type": "none",
    }

    if question_type == "multiple_choice_question":
        if len(answers) < 2:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Question {position} multiple-choice items need at least "
                    "2 answers."
                ),
            )
        choices = []
        choice_ids_by_answer: list[str] = []
        for answer_position, answer in enumerate(answers, start=1):
            choice_id = str(uuid4())
            text = str(answer.get("text") or answer.get("answer_text") or "")
            choices.append(
                {
                    "id": choice_id,
                    "position": answer_position,
                    "itemBody": f"<p>{escape(text)}</p>",
                }
            )
            choice_ids_by_answer.append(choice_id)
        _unique_correct_answer(answers, label=f"Question {position}")
        correct_index = next(
            index
            for index, answer in enumerate(answers)
            if float(answer.get("weight", answer.get("answer_weight", 0)) or 0)
            == 100.0
        )
        entry.update(
            {
                "interaction_type_slug": "choice",
                "interaction_data": {"choices": choices},
                "scoring_data": {"value": choice_ids_by_answer[correct_index]},
                "scoring_algorithm": "Equivalence",
            }
        )
    elif question_type == "true_false_question":
        if len(answers) != 2:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Question {position} true/false items must have exactly "
                    "2 answers."
                ),
            )
        correct_answer = _unique_correct_answer(
            answers, label=f"Question {position}"
        )
        correct_value = str(
            correct_answer.get("text")
            or correct_answer.get("answer_text")
            or "True"
        ).strip().lower() == "true"
        entry.update(
            {
                "interaction_type_slug": "true-false",
                "interaction_data": {
                    "true_choice": "True",
                    "false_choice": "False",
                },
                "scoring_data": {"value": correct_value},
                "scoring_algorithm": "Equivalence",
            }
        )
    else:
        # Canvas New Quizzes has no direct Classic short-answer equivalent.
        # Preserve the prompt as an instructor-scored essay instead of
        # inventing a brittle rich-fill-blank expression. The review UI
        # warns instructors when short_answer_question is remapped this way.
        entry.update(
            {
                "interaction_type_slug": "essay",
                "interaction_data": {"word_limit_enabled": False},
                "scoring_data": {"value": ""},
                "scoring_algorithm": "None",
            }
        )

    return {
        "position": position,
        "points_possible": question.points_possible,
        "entry_type": "Item",
        "entry": entry,
    }


async def get_course_quiz_capabilities(
    local_course_id: int,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
) -> QuizCapabilities:
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    resolved_canvas_url = course.canvas_url
    token = require_canvas_token(user, resolved_canvas_url)
    available, reason = await probe_new_quizzes(
        int(course.canvas_course_id), token, resolved_canvas_url
    )
    return QuizCapabilities(
        new_quizzes=available,
        preferred_engine="new_quizzes" if available else "classic",
        new_quizzes_unavailable_reason=reason,
    )


async def get_course_question_banks(
    local_course_id: int,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
) -> list[QuestionBankSummary]:
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    resolved_canvas_url = course.canvas_url
    token = require_canvas_token(user, resolved_canvas_url)
    banks = await list_question_banks(
        int(course.canvas_course_id), token, resolved_canvas_url
    )
    return [
        QuestionBankSummary(
            id=int(bank["id"]),
            title=bank.get("title") or bank.get("name") or "Untitled bank",
            question_count=int(bank.get("assessment_question_count") or 0),
        )
        for bank in banks
    ]


async def get_course_quizzes(
    local_course_id: int,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
) -> list[QuizResponse]:
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    resolved = course.canvas_url
    token = require_canvas_token(user, resolved)
    raw = await list_quizzes(int(course.canvas_course_id), token, resolved)
    quizzes: list[QuizResponse] = []
    for item in raw:
        quizzes.append(
            QuizResponse(
                id=item["id"],
                title=item.get("title") or "Untitled Quiz",
                description=item.get("description"),
                due_at=item.get("due_at"),
                points_possible=item.get("points_possible"),
                course_id=int(course.canvas_course_id),
                quiz_type=item.get("quiz_type"),
                allowed_attempts=item.get("allowed_attempts"),
                time_limit=item.get("time_limit"),
                published=bool(item.get("published", False)),
                question_count=item.get("question_count"),
                html_url=item.get("html_url"),
                quiz_engine="classic",
            )
        )
    return quizzes


async def create_course_quiz(
    local_course_id: int,
    payload: QuizCreate,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
    *,
    idempotency_key: str | None = None,
    exclude_workflow_id: int | None = None,
) -> QuizResponse:
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    resolved_canvas_url = course.canvas_url
    token = require_canvas_token(user, resolved_canvas_url)
    require_writable_course(course)
    await _assert_no_executing_write(
        db,
        user_id=user.id,
        action_name="create_quiz",
        local_course_id=course.id,
        exclude_workflow_id=exclude_workflow_id,
    )

    key = idempotency_key or build_idempotency_key(
        "create_quiz",
        user.id,
        course.id,
        payload.model_dump(mode="json"),
    )

    async def _write() -> dict:
        quiz = await _create_course_quiz_uncached(
            course=course,
            payload=payload,
            token=token,
            canvas_url=resolved_canvas_url,
        )
        return quiz.model_dump(mode="json")

    data = await run_idempotent_canvas_write(
        db,
        user_id=user.id,
        operation="create_quiz",
        idempotency_key=key,
        write=_write,
    )
    return QuizResponse(**data)


async def _create_course_quiz_uncached(
    *,
    course: Course,
    payload: QuizCreate,
    token: str,
    canvas_url: str,
) -> QuizResponse:
    canvas_course_id = int(course.canvas_course_id)

    if payload.quiz_engine == "new_quizzes":
        if payload.question_bank_groups:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Classic question banks cannot be linked to New Quizzes. "
                    "Choose Classic Quiz or remove the bank groups."
                ),
            )
        new_quizzes_available, reason = await probe_new_quizzes(
            canvas_course_id, token, canvas_url
        )
        if not new_quizzes_available:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=reason or "New Quizzes is not available for this course.",
            )
        data = await create_new_quiz(
            canvas_course_id,
            _new_quiz_payload_for_canvas(payload),
            token,
            canvas_url,
        )
        assignment_id = int(data.get("assignment_id") or data["id"])
        try:
            for position, question in enumerate(payload.questions, start=1):
                await create_new_quiz_item(
                    canvas_course_id,
                    assignment_id,
                    _new_quiz_item_payload(question, position),
                    token,
                    canvas_url,
                )
        except Exception as item_error:
            cleanup_failed = False
            try:
                await delete_new_quiz(
                    canvas_course_id, assignment_id, token, canvas_url
                )
            except Exception:
                cleanup_failed = True
                logger.exception(
                    "Failed to clean up incomplete New Quiz assignment_id=%s",
                    assignment_id,
                )
            if cleanup_failed:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=(
                        "Quiz item creation failed after the New Quiz shell "
                        f"was created (Canvas assignment id {assignment_id}). "
                        "Automatic cleanup also failed; delete the incomplete "
                        "quiz in Canvas, then try again."
                    ),
                ) from item_error
            raise
        return QuizResponse(
            id=assignment_id,
            title=data.get("title") or payload.title,
            description=data.get("instructions") or payload.description,
            due_at=data.get("due_at") or payload.due_at,
            points_possible=data.get("points_possible") or payload.points_possible,
            course_id=canvas_course_id,
            quiz_type="new_quizzes",
            allowed_attempts=payload.allowed_attempts,
            time_limit=payload.time_limit,
            published=bool(data.get("published", False)),
            question_count=len(payload.questions),
            html_url=data.get("html_url"),
            quiz_engine="new_quizzes",
            warnings=short_answer_new_quiz_warnings(
                "new_quizzes",
                [question.model_dump() for question in payload.questions],
            ),
        )

    data = await create_quiz(
        canvas_course_id,
        _quiz_payload_for_canvas(payload),
        token,
        canvas_url,
    )
    quiz_id = int(data["id"])
    try:
        for group in payload.question_bank_groups:
            await create_quiz_question_group(
                canvas_course_id,
                quiz_id,
                {
                    "name": group.bank_name or "Question bank",
                    "pick_count": group.pick_count,
                    "question_points": group.question_points,
                    "assessment_question_bank_id": group.bank_id,
                },
                token,
                canvas_url,
            )
        for question in payload.questions:
            question_body = {
                "question_name": question.question_text[:255],
                "question_text": question.question_text,
                "question_type": question.question_type,
                "points_possible": question.points_possible,
            }
            if question.answers:
                question_body["answers"] = [
                    {
                        "answer_text": str(
                            answer.get("text")
                            or answer.get("answer_text")
                            or ""
                        ),
                        "answer_weight": float(
                            answer.get("weight", answer.get("answer_weight", 0))
                        ),
                    }
                    for answer in question.answers
                    if str(
                        answer.get("text")
                        or answer.get("answer_text")
                        or ""
                    ).strip()
                ]
            await create_quiz_question(
                canvas_course_id,
                quiz_id,
                question_body,
                token,
                canvas_url,
            )
    except Exception as question_error:
        # Canvas creates the quiz before its questions. If any question
        # fails, remove the incomplete draft so the instructor is not left
        # with an orphan that the failed request claimed was never created.
        cleanup_failed = False
        try:
            await delete_quiz(
                canvas_course_id, quiz_id, token, canvas_url
            )
        except Exception:
            cleanup_failed = True
            logger.exception(
                "Failed to clean up incomplete quiz_id=%s after question error",
                quiz_id,
            )
        if cleanup_failed:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "Question creation failed after the quiz shell was created "
                    f"(Canvas quiz id {quiz_id}). Automatic cleanup also "
                    "failed; delete the incomplete quiz in Canvas, then try "
                    "again."
                ),
            ) from question_error
        raise
    return QuizResponse(
        id=quiz_id,
        title=data.get("title") or payload.title,
        description=data.get("description") or payload.description,
        due_at=data.get("due_at") or payload.due_at,
        points_possible=data.get("points_possible") or payload.points_possible,
        course_id=canvas_course_id,
        quiz_type=data.get("quiz_type") or payload.quiz_type,
        allowed_attempts=data.get("allowed_attempts")
        if data.get("allowed_attempts") is not None
        else payload.allowed_attempts,
        time_limit=data.get("time_limit") if data.get("time_limit") is not None else payload.time_limit,
        published=bool(data.get("published", payload.published)),
        question_count=(
            len(payload.questions)
            + sum(group.pick_count for group in payload.question_bank_groups)
        )
        or data.get("question_count"),
        html_url=data.get("html_url"),
        quiz_engine="classic",
    )


async def delete_course_quiz(
    local_course_id: int,
    quiz_id: int,
    user: User,
    canvas_url: str,
    db: AsyncSession,
    *,
    quiz_engine: str = "classic",
) -> None:
    """Only ever called from undo_workflow to revert create_quiz."""
    token = require_canvas_token(user, canvas_url)
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    require_writable_course(course)
    if quiz_engine == "new_quizzes":
        await delete_new_quiz(
            int(course.canvas_course_id), quiz_id, token, canvas_url
        )
    else:
        await delete_quiz(int(course.canvas_course_id), quiz_id, token, canvas_url)


async def update_course_assignment(
    local_course_id: int,
    assignment_id: int,
    payload: AssignmentUpdate,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
    *,
    idempotency_key: str | None = None,
    exclude_workflow_id: int | None = None,
) -> AssignmentResponse:
    from app.services.assignment_validation import validate_assignment_for_update

    # Validate only fields being changed; blank description is sent as null
    # (intentional clear / leave optional), empty strings are rejected with
    # fix-it messages before Canvas sees them.
    await validate_assignment_for_update(
        local_course_id,
        user,
        payload.name,
        payload.description,
        payload.due_at.isoformat() if payload.due_at else None,
        payload.points_possible,
        db,
    )

    course = await get_owned_course(local_course_id, user, canvas_url, db)
    resolved_canvas_url = course.canvas_url
    token = require_canvas_token(user, resolved_canvas_url)
    require_writable_course(course)
    await _assert_no_executing_write(
        db,
        user_id=user.id,
        action_name="update_assignment",
        local_course_id=course.id,
        exclude_workflow_id=exclude_workflow_id,
    )

    key = idempotency_key or build_idempotency_key(
        "update_assignment",
        user.id,
        course.id,
        assignment_id,
        payload.model_dump(mode="json"),
    )

    async def _write() -> dict:
        return await update_assignment(
            int(course.canvas_course_id),
            assignment_id,
            payload.model_dump(mode="json"),
            token,
            resolved_canvas_url,
        )

    data = await run_idempotent_canvas_write(
        db,
        user_id=user.id,
        operation="update_assignment",
        idempotency_key=key,
        write=_write,
    )
    return AssignmentResponse(**data)


async def update_course_grade(
    local_course_id: int,
    assignment_id: int,
    student_id: int,
    posted_grade: str,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
    *,
    feedback: str | None = None,
) -> dict:
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    resolved_canvas_url = course.canvas_url
    token = require_canvas_token(user, resolved_canvas_url)
    require_writable_course(course)
    return await update_submission_grade(
        int(course.canvas_course_id),
        assignment_id,
        student_id,
        posted_grade,
        token,
        resolved_canvas_url,
        feedback=feedback,
    )


async def delete_course_assignment(
    local_course_id: int,
    assignment_id: int,
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> None:
    """Only ever called from undo_workflow, to revert a create_assignment
    action — there is no standalone user-facing "delete assignment" chat
    action. Also marks the local mirror row inactive immediately, rather
    than waiting for the next get_assignments sync to notice Canvas no
    longer returns it."""
    token = require_canvas_token(user, canvas_url)
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    require_writable_course(course)
    await delete_assignment(int(course.canvas_course_id), assignment_id, token, canvas_url)

    local = await db.scalar(
        select(Assignment).where(
            Assignment.canvas_assignment_id == str(assignment_id),
            Assignment.course_id == course.id,
        )
    )
    if local is not None:
        local.is_active = False
        await db.commit()


async def send_course_message(
    local_course_id: int,
    subject: str,
    body: str,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
    recipient_canvas_user_ids: list[int] | None = None,
    *,
    idempotency_key: str | None = None,
    exclude_workflow_id: int | None = None,
) -> MessageSendResult:
    # Local import — services/student.py imports require_canvas_token from
    # this module, so importing get_students at module level here would
    # create a circular import. Safe as a function-local import since both
    # modules are fully loaded by the time this actually runs.
    from app.services.student import get_students

    course = await get_owned_course(local_course_id, user, canvas_url, db)
    resolved_canvas_url = course.canvas_url
    token = require_canvas_token(user, resolved_canvas_url)
    require_writable_course(course)
    await _assert_no_executing_write(
        db,
        user_id=user.id,
        action_name="send_message",
        local_course_id=course.id,
        exclude_workflow_id=exclude_workflow_id,
    )
    canvas_course_id = int(course.canvas_course_id)
    recipients = list(recipient_canvas_user_ids or [])

    key = idempotency_key or build_idempotency_key(
        "send_message",
        user.id,
        course.id,
        subject,
        body,
        recipients,
    )

    async def _write() -> dict:
        if recipients:
            await send_conversation(
                canvas_course_id,
                recipients,
                subject,
                body,
                token,
                resolved_canvas_url,
            )
            result = MessageSendResult(
                course_id=canvas_course_id,
                subject=subject,
                body=body,
                audience_size=len(recipients),
                delivery_mode="conversation",
                recipient_canvas_user_ids=recipients,
            )
            return result.model_dump(mode="json")

        await create_announcement(canvas_course_id, subject, body, token, resolved_canvas_url)
        roster = await get_students(local_course_id, user, resolved_canvas_url, db)
        result = MessageSendResult(
            course_id=canvas_course_id,
            subject=subject,
            body=body,
            audience_size=len(roster),
            delivery_mode="announcement",
            recipient_canvas_user_ids=[],
        )
        return result.model_dump(mode="json")

    data = await run_idempotent_canvas_write(
        db,
        user_id=user.id,
        operation="send_message",
        idempotency_key=key,
        write=_write,
    )
    return MessageSendResult(**data)


def _parse_submission_status(raw: dict) -> SubmissionStatus:
    # Priority: excused > missing > graded > late > submitted > unsubmitted
    if raw.get("excused"):
        return SubmissionStatus.excused
    if raw.get("missing"):
        return SubmissionStatus.missing
    state = raw.get("workflow_state", "unsubmitted")
    if state == "graded":
        return SubmissionStatus.graded
    if state in ("submitted", "pending_review"):
        return SubmissionStatus.late if raw.get("late") else SubmissionStatus.submitted
    return SubmissionStatus.unsubmitted


def _parse_submission(raw: dict) -> SubmissionResponse:
    # Canvas returns user data when include[]=user is set; fall back to None if absent
    user = raw.get("user") or {}
    return SubmissionResponse(
        id=raw["id"],
        assignment_id=raw["assignment_id"],
        user_id=raw["user_id"],
        student_name=user.get("name"),
        student_email=user.get("email") or user.get("primary_email"),
        student_login_id=user.get("login_id"),
        submitted_at=raw.get("submitted_at"),
        workflow_state=raw.get("workflow_state", "unsubmitted"),
        status=_parse_submission_status(raw),
        score=raw.get("score"),
        grade=raw.get("grade"),
        graded_at=raw.get("graded_at"),
    )


async def _fill_submission_contact_fields(
    submissions: list[SubmissionResponse],
    token: str,
    canvas_url: str,
) -> None:
    # Canvas's submissions include[]=user payload can include a display name
    # without email/login_id. Pull /users/{id}/profile only for those sparse
    # rows so the Students/Messages UI can show an email without adding extra
    # requests for already-complete submissions.
    missing_contact = [
        submission
        for submission in submissions
        if submission.student_name
        and not submission.student_email
        and not submission.student_login_id
    ]

    for submission in missing_contact:
        try:
            profile = await fetch_user_profile(submission.user_id, token, canvas_url)
        except HTTPException as error:
            # Email is only needed for display/diagnostics; losing it should not
            # make the submissions or analytics views fail.
            logger.info(
                "Could not enrich Canvas user %s profile for submissions: %s",
                submission.user_id,
                error.detail,
            )
            continue

        submission.student_email = (
            profile.get("primary_email")
            or profile.get("email")
            or profile.get("login_id")
        )
        submission.student_login_id = profile.get("login_id")


async def get_submissions(
    local_course_id: int,
    assignment_id: int,
    user: User,
    canvas_url: str | None,
    db: AsyncSession,
) -> list[SubmissionResponse]:
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    resolved_canvas_url = course.canvas_url
    token = require_canvas_token(user, resolved_canvas_url)
    data = await fetch_submissions(
        int(course.canvas_course_id),
        assignment_id,
        token,
        resolved_canvas_url,
    )
    parsed = [_parse_submission(raw) for raw in data]
    await _fill_submission_contact_fields(parsed, token, resolved_canvas_url)
    await _cache_submissions_safely(course.id, assignment_id, parsed)

    return parsed


async def _cache_submissions_safely(
    local_course_id: int,
    assignment_id: int,
    submissions: list[SubmissionResponse],
) -> None:
    """Persist analytics cache rows without touching the caller's session."""
    try:
        async with AsyncSessionLocal() as cache_db:
            await _cache_submissions(cache_db, local_course_id, assignment_id, submissions)
    except Exception as error:
        logger.warning(
            "Could not cache Canvas submissions for course %s assignment %s: %s",
            local_course_id,
            assignment_id,
            error,
            exc_info=True,
        )


async def _cache_submissions(
    db: AsyncSession,
    local_course_id: int,
    assignment_id: int,
    submissions: list[SubmissionResponse],
) -> None:
    from app.models.submission import Submission

    try:
        # The API response is authoritative; this write only refreshes the
        # local analytics cache and runs in its own session so failures cannot
        # rollback chat/workflow state owned by the caller.
        assignment = await db.scalar(
            select(Assignment).where(
                Assignment.canvas_assignment_id == str(assignment_id),
                Assignment.course_id == local_course_id,
            )
        )
        if not assignment:
            assignment = Assignment(
                canvas_assignment_id=str(assignment_id),
                course_id=local_course_id,
                title=f"Assignment {assignment_id}",
            )
            db.add(assignment)
            await db.flush()

        canvas_ids = [str(item.id) for item in submissions]
        # Canvas submission ids are unique in our schema, but scoping by the
        # local assignment makes the intent explicit and protects this upsert if
        # the uniqueness model changes later.
        existing_rows = await db.scalars(
            select(Submission).where(
                Submission.assignment_id == assignment.id,
                Submission.canvas_submission_id.in_(canvas_ids),
            )
        )
        submission_map = {s.canvas_submission_id: s for s in existing_rows}

        for item in submissions:
            cid = str(item.id)
            if cid in submission_map:
                row = submission_map[cid]
                row.status = item.status.value
                row.score = item.score
                row.grade = item.grade
                row.graded_at = item.graded_at
                row.submitted_at = item.submitted_at
                row.student_name = item.student_name
            else:
                db.add(
                    Submission(
                        canvas_submission_id=cid,
                        assignment_id=assignment.id,
                        student_canvas_id=str(item.user_id),
                        student_name=item.student_name,
                        status=item.status.value,
                        score=item.score,
                        grade=item.grade,
                        graded_at=item.graded_at,
                        submitted_at=item.submitted_at,
                    )
                )

        await db.commit()
    except Exception:
        await db.rollback()
        raise


async def sync_courses_if_stale(user: User, connection: CanvasConnection, db: AsyncSession) -> bool:
    """Refreshes this connection's course list from Canvas, gated by
    CANVAS_COURSE_SYNC_COOLDOWN_SECONDS so a real Canvas round-trip only
    happens once per window. Callers: the periodic sweep
    (run_course_sync_sweep, below — ticks every
    CANVAS_COURSE_SYNC_COOLDOWN_SECONDS on its own, see app.main's
    lifespan), set_active_course (the button), and handle_confirmed_action
    (right after a successful write). Deliberately NOT called from the
    chat message path itself — services/chat.py only ever reads
    canvas_course_names, never fetches it live, so a slow/broken Canvas
    connection can never fail a chat turn that doesn't even need fresh
    course data.

    Also upserts canvas_course_names — the small, connection-scoped,
    write-once canvas_course_id -> name index services/chat.py uses to
    resolve a course by name without ever exposing a numeric ID to the
    LLM. Rows there are inserted once and never overwritten
    (ON CONFLICT DO NOTHING) — see CanvasCourseName's docstring for why.

    get_courses() itself is unmodified; this wrapper only adds the
    cooldown gate and the name-index upsert around it.

    Returns True when a real Canvas sync ran and committed, False when
    skipped due to cooldown. Callers must not treat a cooldown skip as
    proof the connection is healthy (e.g. clearing last_sync_error).
    """
    now = datetime.now(UTC)
    if (
        connection.courses_synced_at is not None
        and (now - connection.courses_synced_at).total_seconds() < settings.CANVAS_COURSE_SYNC_COOLDOWN_SECONDS
    ):
        return False

    courses = await get_courses(user, connection.canvas_url, db)
    if courses:
        await db.execute(
            pg_insert(CanvasCourseName)
            .values(
                [
                    {
                        "canvas_connection_id": connection.id,
                        "canvas_course_id": str(course.canvas_id),
                        "local_course_id": course.local_id,
                        "name": course.name,
                        "workflow_state": course.workflow_state,
                    }
                    for course in courses
                ]
            )
            .on_conflict_do_nothing(index_elements=["canvas_connection_id", "canvas_course_id"])
        )

    connection.courses_synced_at = now
    await db.commit()
    return True


async def run_course_sync_sweep(db: AsyncSession) -> None:
    """One pass over every Canvas connection on the server, refreshing
    canvas_course_names for each (still cooldown-gated per-connection by
    sync_courses_if_stale, so this is cheap to call often). One
    connection's failure — a bad/expired token, a Canvas outage — is
    logged and skipped, never allowed to abort the sweep for everyone
    else. Called on a timer by app.main's lifespan; also safe to call
    directly (e.g. from a test or a manual trigger).

    Each connection is synced in its own freshly opened session rather
    than the shared `db` passed in here. Session.rollback() expires every
    object already loaded in that session, not just the ones touched by
    the failed operation — reusing `db` across iterations meant one
    connection's failure (e.g. an expired token) would expire the
    `User`/`CanvasConnection` objects still needed by every later
    iteration too, and the next plain attribute access on those expired
    objects (e.g. `user.canvas_connections`, a synchronous read) would
    raise MissingGreenlet since it falls outside AsyncSession's
    greenlet-bridged call path. An isolated session per connection means a
    failure (and its rollback) can never leak into any other iteration."""
    users = list(
        await db.scalars(select(User).options(selectinload(User.canvas_connections)))
    )
    connection_ids = [
        (user.id, connection.id) for user in users for connection in user.canvas_connections
    ]

    for user_id, connection_id in connection_ids:
        async with AsyncSessionLocal() as conn_db:
            # require_canvas_token (called via get_courses, inside
            # sync_courses_if_stale) synchronously reads
            # user.canvas_connections — without eager-loading it here too,
            # that access is an un-awaited lazy load on an AsyncSession,
            # which SQLAlchemy always raises MissingGreenlet on, eager
            # load or not the object's freshness.
            user = await conn_db.scalar(
                select(User).options(selectinload(User.canvas_connections)).where(User.id == user_id)
            )
            connection = await conn_db.scalar(
                select(CanvasConnection).where(CanvasConnection.id == connection_id)
            )
            if user is None or connection is None:
                continue
            try:
                did_sync = await sync_courses_if_stale(user, connection, conn_db)
                # Only clear last_sync_error after a real successful Canvas
                # round-trip. A cooldown skip means we did not re-verify the
                # token — clearing here used to reopen the failed_operations
                # flood on the next failing tick (previous_error became NULL).
                if did_sync:
                    # Reload by id: the in-memory connection may be stale
                    # relative to last_sync_error written on a prior failure.
                    previous_error = await conn_db.scalar(
                        select(CanvasConnection.last_sync_error).where(
                            CanvasConnection.id == connection_id
                        )
                    )
                    if previous_error is not None:
                        await conn_db.execute(
                            update(CanvasConnection)
                            .where(CanvasConnection.id == connection_id)
                            .values(last_sync_error=None)
                        )
                        await conn_db.commit()
            except Exception as exc:
                expected_token_issue = _is_expected_canvas_token_sync_error(exc)
                if expected_token_issue:
                    logger.warning(
                        "course sync sweep skipped canvas_connection_id=%s user_id=%s: %s",
                        connection_id, user_id, exc.detail,
                    )
                else:
                    logger.warning(
                        "course sync sweep failed for canvas_connection_id=%s user_id=%s",
                        connection_id, user_id, exc_info=True,
                    )
                await conn_db.rollback()
                # rollback() expires every object tracked by this session --
                # writing through the (now-expired) `connection` ORM object
                # would need an implicit reload of its current state first.
                # Update by id directly instead, so this doesn't depend on
                # SQLAlchemy's expire-on-rollback internals at all.
                from app.core.secret_redaction import redact_secrets

                # Normalize before compare/store so minor formatting noise and
                # secrets cannot re-open a failed_operations row every tick.
                error_detail = redact_secrets(str(exc))[:500]
                previous_error = await conn_db.scalar(
                    select(CanvasConnection.last_sync_error).where(
                        CanvasConnection.id == connection_id
                    )
                )
                await conn_db.execute(
                    update(CanvasConnection)
                    .where(CanvasConnection.id == connection_id)
                    .values(last_sync_error=error_detail)
                )
                # Background sweeps run every ~60s. Do not append a failed_operations
                # row for expected missing/corrupted tokens (Feature 9 already
                # surfaces those), or for the same ongoing unexpected failure —
                # otherwise admin monitoring floods with duplicate course_sync rows.
                from app.services.failed_operations import (
                    record_failed_operation,
                    should_record_course_sync_failure,
                )

                if should_record_course_sync_failure(
                    expected_token_issue=expected_token_issue,
                    previous_error=previous_error,
                    error_detail=error_detail,
                ):
                    await record_failed_operation(
                        conn_db,
                        source="canvas",
                        operation="course_sync",
                        error_detail=error_detail,
                        user_id=user_id,
                        context_json={"canvas_connection_id": connection_id},
                    )
                await conn_db.commit()


async def get_active_course(user: User, db: AsyncSession) -> ActiveCourseResponse | None:
    # joinedload fetches preference + course in a single JOIN query
    pref = await db.scalar(
        select(UserPreference).where(UserPreference.user_id == user.id).options(joinedload(UserPreference.active_course))
    )
    if not pref or not pref.active_course:
        return None
    c = pref.active_course
    return ActiveCourseResponse(
        local_id=c.id,
        canvas_course_id=c.canvas_course_id,
        canvas_url=c.canvas_url,
        name=c.name,
        term=c.term,
    )


async def set_active_course(user: User, local_course_id: int, db: AsyncSession) -> ActiveCourseResponse:
    course = await db.scalar(select(Course).where(Course.id == local_course_id, Course.instructor_id == user.id))
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found or does not belong to you.",
        )

    # Keep the chat pipeline's name index (canvas_course_names) fresh for
    # the just-activated course too, not just on chat messages — queried
    # directly rather than via user.canvas_connections to avoid depending
    # on that relationship being eager-loaded in this session context.
    # Best-effort, run in an ISOLATED session (mirrors
    # run_course_sync_sweep/handle_confirmed_action's post-write refresh —
    # see either docstring for why): this used to be a pure local
    # preference write, so a Canvas timeout or a revoked token must never
    # turn "click to set active course" into a 502/504/403, and a partial
    # failure inside sync_courses_if_stale must never touch the `db`
    # session this function still needs for the UserPreference write below.
    connections = await db.scalars(select(CanvasConnection).where(CanvasConnection.user_id == user.id))
    connection = next(
        (c for c in connections if canvas_urls_equivalent(c.canvas_url, course.canvas_url)),
        None,
    )
    if connection is not None:
        async with AsyncSessionLocal() as sync_db:
            sync_connection = await sync_db.scalar(
                select(CanvasConnection).where(CanvasConnection.id == connection.id)
            )
            # require_canvas_token (called via get_courses, inside
            # sync_courses_if_stale) synchronously reads
            # user.canvas_connections — without eager-loading it here,
            # that's an un-awaited lazy load on an AsyncSession, which
            # SQLAlchemy always raises MissingGreenlet on (see
            # run_course_sync_sweep's identical note above).
            sync_user = await sync_db.scalar(
                select(User).where(User.id == user.id).options(selectinload(User.canvas_connections))
            )
            if sync_connection is not None and sync_user is not None:
                try:
                    did_sync = await sync_courses_if_stale(
                        sync_user, sync_connection, sync_db
                    )
                    # Mirror run_course_sync_sweep: only clear after a real
                    # Canvas round-trip so a cooldown skip cannot hide a
                    # still-unverified last_sync_error on Troubleshooting.
                    if did_sync:
                        previous_error = await sync_db.scalar(
                            select(CanvasConnection.last_sync_error).where(
                                CanvasConnection.id == connection.id
                            )
                        )
                        if previous_error is not None:
                            await sync_db.execute(
                                update(CanvasConnection)
                                .where(CanvasConnection.id == connection.id)
                                .values(last_sync_error=None)
                            )
                            await sync_db.commit()
                except Exception as exc:
                    if _is_expected_canvas_token_sync_error(exc):
                        logger.warning(
                            "set_active_course sync skipped canvas_connection_id=%s user_id=%s: %s",
                            connection.id, user.id, exc.detail,
                        )
                    else:
                        logger.warning(
                            "set_active_course sync_courses_if_stale failed for canvas_connection_id=%s user_id=%s",
                            connection.id, user.id, exc_info=True,
                        )
                    await sync_db.rollback()
        # The isolated session above may have just committed a Canvas
        # rename onto this same Course row (get_courses upserts Course.name,
        # not just canvas_course_names) — `course`, loaded earlier on `db`,
        # has no way to know that happened (separate session, separate
        # identity map), so without this refresh the response below would
        # return whatever stale name `course` already had in memory.
        # Read-only and always safe on `db` — never touched by the
        # isolated session's rollback, unlike the sync attempt itself.
        await db.refresh(course)

    # Upsert: update if a preference row already exists, otherwise insert a new one
    pref = await db.scalar(select(UserPreference).where(UserPreference.user_id == user.id))
    if pref:
        pref.active_course_id = course.id
        pref.updated_at = datetime.now(UTC)
    else:
        db.add(UserPreference(user_id=user.id, active_course_id=course.id))

    await db.commit()
    return ActiveCourseResponse(
        local_id=course.id,
        canvas_course_id=course.canvas_course_id,
        canvas_url=course.canvas_url,
        name=course.name,
        term=course.term,
    )
