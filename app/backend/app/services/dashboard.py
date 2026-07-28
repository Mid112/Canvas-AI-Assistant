import asyncio
import logging

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.core.secret_redaction import redact_secrets
from app.models.course import Course
from app.models.submission import Submission
from app.models.user import User
from app.models.workflow import Workflow
from app.schemas.dashboard import (
    CourseActivitySummary,
    InstructorDashboardResponse,
    RecentWorkflowSummary,
)
from app.services.canvas import (
    SELECTABLE_WORKFLOW_STATES,
    _is_expected_canvas_token_sync_error,
    _is_transient_canvas_outage,
    get_active_course,
    get_assignments,
)
from app.services.student import get_students

logger = logging.getLogger(__name__)

# Caps how many courses' Canvas mirrors refresh at once per dashboard load —
# an instructor with many courses shouldn't fire off dozens of simultaneous
# Canvas calls (each course costs 2: assignments + students).
_MAX_CONCURRENT_COURSE_REFRESHES = 4


async def _refresh_course_mirror(
    course_id: int,
    canvas_url: str,
    user: User,
    semaphore: asyncio.Semaphore,
) -> None:
    """Refreshes one course's assignment/student mirror on its own DB
    session. A single AsyncSession cannot safely run concurrent operations,
    so this opens (and commits/closes) an independent session per course —
    get_assignments/get_students each commit internally, so by the time
    asyncio.gather below returns, the caller's own session will see all of
    these commits on its next query (standard READ COMMITTED visibility).

    Errors are caught and logged rather than raised: one course's Canvas
    call timing out or failing must not take down the whole dashboard — the
    dashboard falls back to that course's last-synced local data instead."""
    async with semaphore, AsyncSessionLocal() as session:
        try:
            await get_assignments(course_id, user, canvas_url, session)
            await get_students(course_id, user, canvas_url, session)
        except Exception as exc:
            # Token reconnect / transient Canvas outages are expected: keep the
            # cached mirror and log one quiet line (no traceback flood).
            if _is_expected_canvas_token_sync_error(exc) or _is_transient_canvas_outage(
                exc
            ):
                detail = getattr(exc, "detail", None) or str(exc)
                if not isinstance(detail, str):
                    detail = str(detail)
                logger.info(
                    "Dashboard refresh skipped for course_id=%s (%s); "
                    "showing last-synced data for this course.",
                    course_id,
                    redact_secrets(detail),
                )
            else:
                logger.warning(
                    "Dashboard refresh failed for course_id=%s; "
                    "showing last-synced data for this course.",
                    course_id,
                    exc_info=True,
                )


async def get_instructor_dashboard(
    user: User,
    db: AsyncSession,
) -> InstructorDashboardResponse:
    # Refresh each course's assignment/student mirror from Canvas before
    # reading the aggregate stats below — otherwise a course whose roster or
    # assignment list changed on Canvas since the last sync would silently
    # show stale counts here. Bounded to 2 Canvas calls per course; submission
    # counts are intentionally left sourced from the local mirror (refreshing
    # those live would mean one Canvas call per assignment per course).
    # Runs one refresh per course concurrently (each on its own DB session —
    # see _refresh_course_mirror) rather than serially, since an instructor
    # with many courses would otherwise pay each course's Canvas round-trip
    # one after another.
    # Deleted/non-selectable courses are excluded up front — there's no
    # archived-course view yet, so refreshing or aggregating a course Canvas no
    # longer returns would just keep stale data visible indefinitely instead of
    # letting it drop off the dashboard once get_courses() reconciles it away.
    own_courses = list(
        await db.scalars(
            select(Course).where(
                Course.instructor_id == user.id,
                Course.workflow_state.in_(SELECTABLE_WORKFLOW_STATES),
            )
        )
    )
    refresh_semaphore = asyncio.Semaphore(_MAX_CONCURRENT_COURSE_REFRESHES)
    await asyncio.gather(
        *(
            _refresh_course_mirror(
                own_course.id, own_course.canvas_url, user, refresh_semaphore
            )
            for own_course in own_courses
        )
    )

    courses = list(
        await db.scalars(
            select(Course)
            .where(
                Course.instructor_id == user.id,
                Course.workflow_state.in_(SELECTABLE_WORKFLOW_STATES),
            )
            .options(selectinload(Course.assignments), selectinload(Course.students))
            .order_by(Course.name)
        )
    )

    course_summaries: list[CourseActivitySummary] = []
    total_students = 0
    total_assignments = 0
    total_missing = 0
    total_late = 0

    for course in courses:
        active_assignments = [a for a in course.assignments if a.is_active]
        active_students = [s for s in course.students if s.enrollment_state != "inactive"]
        # assignment_count includes drafts (for instructor visibility); missing/late
        # counts are scoped to published assignments only — a draft is invisible to
        # students and can't have real submissions, so it would otherwise register
        # every enrolled student as "missing" something they were never assigned.
        assignment_ids = [a.id for a in active_assignments if a.published]
        missing_count = 0
        late_count = 0

        if assignment_ids:
            missing_count = int(
                await db.scalar(
                    select(func.count())
                    .select_from(Submission)
                    .where(
                        Submission.assignment_id.in_(assignment_ids),
                        Submission.status == "missing",
                    )
                )
                or 0
            )
            late_count = int(
                await db.scalar(
                    select(func.count())
                    .select_from(Submission)
                    .where(
                        Submission.assignment_id.in_(assignment_ids),
                        Submission.status == "late",
                    )
                )
                or 0
            )

        student_count = len(active_students)
        assignment_count = len(active_assignments)

        total_students += student_count
        total_assignments += assignment_count
        total_missing += missing_count
        total_late += late_count

        course_summaries.append(
            CourseActivitySummary(
                local_id=course.id,
                name=course.name,
                student_count=student_count,
                assignment_count=assignment_count,
                missing_submissions=missing_count,
                late_submissions=late_count,
            )
        )

    pending_workflows = int(
        await db.scalar(
            select(func.count())
            .select_from(Workflow)
            .where(Workflow.user_id == user.id, Workflow.status == "pending")
        )
        or 0
    )

    recent_rows = await db.scalars(
        select(Workflow)
        .where(Workflow.user_id == user.id)
        .order_by(desc(Workflow.created_at))
        .limit(5)
    )

    active_course = await get_active_course(user, db)

    return InstructorDashboardResponse(
        course_count=len(courses),
        student_count=total_students,
        assignment_count=total_assignments,
        missing_submissions=total_missing,
        late_submissions=total_late,
        pending_workflows=pending_workflows,
        active_course=active_course,
        courses=course_summaries,
        recent_workflows=[
            RecentWorkflowSummary(
                id=workflow.id,
                action_name=workflow.action_name,
                user_prompt=workflow.user_prompt,
                status=workflow.status,
                created_at=workflow.created_at,
            )
            for workflow in recent_rows
        ],
    )
