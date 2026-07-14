import logging
from datetime import UTC, datetime

from cryptography.fernet import InvalidToken
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.canvas_url import canvas_urls_equivalent, normalize_canvas_url
from app.core.security import decrypt_canvas_token
from app.integrations.canvas import (
    create_announcement,
    create_assignment,
    delete_assignment,
    fetch_assignment,
    fetch_assignments,
    fetch_courses,
    fetch_submissions,
    fetch_user_profile,
    send_conversation,
    update_assignment,
)
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.user import User
from app.models.user_preference import UserPreference
from app.schemas.canvas import (
    ActiveCourseResponse,
    AssignmentCreate,
    AssignmentResponse,
    AssignmentUpdate,
    CourseResponse,
    MessageSendResult,
    SubmissionResponse,
    SubmissionStatus,
)

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
    of surfacing the raw 'PATCH to /api/v1/auth/me/canvas-token' detail."""

    def __init__(self, canvas_url: str):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"No Canvas token for {canvas_url}. PATCH to /api/v1/auth/me/canvas-token first.",
        )


def require_canvas_token(user: User, canvas_url: str) -> str:
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
            course.synced_at = datetime.now(UTC)
        else:
            course = Course(
                canvas_course_id=cid,
                canvas_url=normalized_sync_url,
                name=item["name"],
                term=term_name,
                workflow_state=workflow_state,
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
    canvas_url: str,
    db: AsyncSession,
) -> AssignmentResponse:
    token = require_canvas_token(user, canvas_url)
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    data = await fetch_assignment(
        int(course.canvas_course_id),
        assignment_id,
        token,
        canvas_url,
    )
    return AssignmentResponse(**data)


async def create_course_assignment(
    local_course_id: int,
    payload: AssignmentCreate,
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> AssignmentResponse:
    token = require_canvas_token(user, canvas_url)
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    require_writable_course(course)
    data = await create_assignment(
        int(course.canvas_course_id),
        payload.model_dump(mode="json"),
        token,
        canvas_url,
    )
    return AssignmentResponse(**data)


async def update_course_assignment(
    local_course_id: int,
    assignment_id: int,
    payload: AssignmentUpdate,
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> AssignmentResponse:
    token = require_canvas_token(user, canvas_url)
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    require_writable_course(course)
    data = await update_assignment(
        int(course.canvas_course_id),
        assignment_id,
        payload.model_dump(mode="json"),
        token,
        canvas_url,
    )
    return AssignmentResponse(**data)


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
    canvas_url: str,
    db: AsyncSession,
    recipient_canvas_user_ids: list[int] | None = None,
) -> MessageSendResult:
    # Local import — services/student.py imports require_canvas_token from
    # this module, so importing get_students at module level here would
    # create a circular import. Safe as a function-local import since both
    # modules are fully loaded by the time this actually runs.
    from app.services.student import get_students

    token = require_canvas_token(user, canvas_url)
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    require_writable_course(course)
    canvas_course_id = int(course.canvas_course_id)

    if recipient_canvas_user_ids:
        # A non-empty recipient list means a private Canvas Conversation.
        # No recipient list falls through to the public course announcement path.
        await send_conversation(
            canvas_course_id,
            recipient_canvas_user_ids,
            subject,
            body,
            token,
            canvas_url,
        )
        return MessageSendResult(
            course_id=canvas_course_id,
            subject=subject,
            body=body,
            audience_size=len(recipient_canvas_user_ids),
            delivery_mode="conversation",
            recipient_canvas_user_ids=recipient_canvas_user_ids,
        )

    await create_announcement(canvas_course_id, subject, body, token, canvas_url)
    roster = await get_students(local_course_id, user, canvas_url, db)
    return MessageSendResult(
        course_id=canvas_course_id,
        subject=subject,
        body=body,
        audience_size=len(roster),
        delivery_mode="announcement",
        recipient_canvas_user_ids=[],
    )


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
    canvas_url: str,
    db: AsyncSession,
) -> list[SubmissionResponse]:
    from app.models.submission import Submission

    token = require_canvas_token(user, canvas_url)
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    data = await fetch_submissions(
        int(course.canvas_course_id),
        assignment_id,
        token,
        canvas_url,
    )
    parsed = [_parse_submission(raw) for raw in data]
    await _fill_submission_contact_fields(parsed, token, canvas_url)

    try:
        # The API response is authoritative even if the local analytics cache
        # write fails below, so keep cache persistence isolated from the return
        # value. This prevents a DB cache hiccup from breaking the live Canvas view.
        assignment = await db.scalar(
            select(Assignment).where(
                Assignment.canvas_assignment_id == str(assignment_id),
                Assignment.course_id == course.id,
            )
        )
        if not assignment:
            assignment = Assignment(
                canvas_assignment_id=str(assignment_id),
                course_id=course.id,
                title=f"Assignment {assignment_id}",
            )
            db.add(assignment)
            await db.flush()

        canvas_ids = [str(item.id) for item in parsed]
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

        for item in parsed:
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
    except Exception as error:
        await db.rollback()
        logger.warning(
            "Could not cache Canvas submissions for course %s assignment %s: %s",
            local_course_id,
            assignment_id,
            error,
            exc_info=True,
        )

    return parsed


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

    # synced_at is only ever set from a real Canvas response (see get_courses()
    # above) — a row with synced_at=None never went through that path and is
    # trusting whatever workflow_state migration 011 backfilled it to
    # ('available' for every pre-existing row), which may no longer be true on
    # Canvas. Refuse to select it until a real sync has confirmed its state,
    # rather than silently trusting stale, unverified data as a backend invariant.
    if course.synced_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Course data has not been synced from Canvas yet — refresh courses before selecting this one as active.",
        )

    if course.workflow_state not in SELECTABLE_WORKFLOW_STATES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot set an unpublished or non-selectable course as active.",
        )

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
