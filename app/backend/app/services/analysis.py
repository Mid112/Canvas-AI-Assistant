import asyncio
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.canvas import fetch_enrollments, fetch_submissions
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.user import User
from app.schemas.analysis import (
    LateStudent,
    LateSubmissionAnalysis,
    LateSubmissionSummary,
    MissingStudent,
    MissingSubmissionAnalysis,
    SubmissionSummary,
)
from app.schemas.canvas import SubmissionStatus
from app.services.canvas import _parse_submission_status, get_owned_course, require_canvas_token

# A student counts as missing when they have no real submission and are not excused
MISSING_STATUSES = (SubmissionStatus.missing, SubmissionStatus.unsubmitted)
SUBMITTED_STATUSES = (SubmissionStatus.graded, SubmissionStatus.submitted, SubmissionStatus.late)

_SECONDS_PER_DAY = 86400


async def _resolve_assignment_published(course: Course, assignment_id: int, db: AsyncSession) -> bool:
    """Looks up whether this assignment is published from the local mirror
    (kept in sync by get_assignments whenever the assignments list is
    fetched — the normal path to picking an assignment_id here). Defaults to
    True (not a draft) when the assignment was never synced locally rather
    than making an extra live Canvas call for what's only ever a hint, not
    something this analysis is authoritative about."""
    local = await db.scalar(
        select(Assignment).where(
            Assignment.canvas_assignment_id == str(assignment_id),
            Assignment.course_id == course.id,
        )
    )
    return local.published if local is not None else True


async def _fetch_roster_and_submissions(
    course: Course,
    assignment_id: int,
    token: str,
    canvas_url: str,
) -> tuple[dict[str, dict], list[dict]]:
    """Fetch the active roster and the assignment's submissions concurrently.
    The roster is deduped by Canvas user id — a student enrolled in multiple
    sections has one enrollment record per section but is analyzed once."""
    canvas_course_id = int(course.canvas_course_id)
    enrollments, submissions = await asyncio.gather(
        fetch_enrollments(canvas_course_id, token, canvas_url),
        fetch_submissions(canvas_course_id, assignment_id, token, canvas_url),
    )

    roster: dict[str, dict] = {}
    for item in enrollments:
        roster.setdefault(str(item["user_id"]), item)
    return roster, submissions


async def analyze_missing_submissions(
    local_course_id: int,
    assignment_id: int,
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> MissingSubmissionAnalysis:
    token = require_canvas_token(user, canvas_url)
    course = await get_owned_course(local_course_id, user, canvas_url, db)

    canvas_course_id = int(course.canvas_course_id)
    # Roster and submissions are independent Canvas calls — fetch them concurrently
    enrollments, submissions = await asyncio.gather(
        fetch_enrollments(canvas_course_id, token, canvas_url),
        fetch_submissions(canvas_course_id, assignment_id, token, canvas_url),
    )
    assignment_published = await _resolve_assignment_published(course, assignment_id, db)

    # Dedupe by Canvas user id — a student enrolled in multiple sections has one
    # enrollment record per section but should be analyzed once
    roster: dict[str, dict] = {}
    for item in enrollments:
        roster.setdefault(str(item["user_id"]), item)

    # #550: compare enrolled students to submissions, keyed by Canvas user id.
    # Submissions from users no longer enrolled are ignored — the active roster
    # is the source of truth for who should have submitted.
    status_by_user = {str(raw["user_id"]): _parse_submission_status(raw) for raw in submissions}

    status_counts: dict[SubmissionStatus, int] = {s: 0 for s in SubmissionStatus}
    missing_students: list[MissingStudent] = []
    for uid, enrollment in roster.items():
        # Canvas usually creates unsubmitted placeholder submissions, but a student
        # can also have no submission record at all — treat both as unsubmitted
        student_status = status_by_user.get(uid, SubmissionStatus.unsubmitted)
        status_counts[student_status] += 1

        # #551: build the missing student list from enrollment user data
        if student_status in MISSING_STATUSES:
            user_obj = enrollment.get("user") or {}
            missing_students.append(
                MissingStudent(
                    canvas_user_id=uid,
                    name=user_obj.get("name") or "Unknown",
                    sortable_name=user_obj.get("sortable_name"),
                    login_id=user_obj.get("login_id"),
                )
            )

    missing_students.sort(key=lambda s: (s.sortable_name or s.name).lower())

    # #552: summary statistics over the enrolled roster
    total_enrolled = len(roster)
    submitted_count = sum(status_counts[s] for s in SUBMITTED_STATUSES)
    submission_rate = round(submitted_count / total_enrolled * 100, 1) if total_enrolled else 0.0

    # #553: structured response with course/assignment context and a generation timestamp
    return MissingSubmissionAnalysis(
        local_course_id=course.id,
        canvas_course_id=course.canvas_course_id,
        assignment_id=assignment_id,
        canvas_url=course.canvas_url,
        generated_at=datetime.now(UTC),
        assignment_published=assignment_published,
        summary=SubmissionSummary(
            total_enrolled=total_enrolled,
            submitted_count=submitted_count,
            missing_count=len(missing_students),
            excused_count=status_counts[SubmissionStatus.excused],
            submission_rate=submission_rate,
            status_counts=status_counts,
        ),
        missing_students=missing_students,
    )


async def analyze_late_submissions(
    local_course_id: int,
    assignment_id: int,
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> LateSubmissionAnalysis:
    token = require_canvas_token(user, canvas_url)
    course = await get_owned_course(local_course_id, user, canvas_url, db)
    roster, submissions = await _fetch_roster_and_submissions(course, assignment_id, token, canvas_url)
    assignment_published = await _resolve_assignment_published(course, assignment_id, db)

    submission_by_user = {str(raw["user_id"]): raw for raw in submissions}

    submitted_count = 0
    late_students: list[LateStudent] = []
    for uid, enrollment in roster.items():
        raw = submission_by_user.get(uid)
        if raw is None:
            continue

        # Submissions from users no longer enrolled are ignored — the active roster
        # is the source of truth, same rule as the missing submission analysis
        student_status = _parse_submission_status(raw)
        if student_status not in SUBMITTED_STATUSES:
            continue
        submitted_count += 1

        # #554: detect late submissions from Canvas's raw `late` flag, not the parsed
        # status — a late submission that has since been graded reports status "graded"
        # and would be invisible to a status-based check. Requiring a submitted status
        # first keeps excused students out and guarantees late_count <= submitted_count.
        if not raw.get("late"):
            continue

        seconds_late = int(raw.get("seconds_late") or 0)
        user_obj = enrollment.get("user") or {}
        # #557: build the late student list from enrollment identity + submission timing
        late_students.append(
            LateStudent(
                canvas_user_id=uid,
                name=user_obj.get("name") or "Unknown",
                sortable_name=user_obj.get("sortable_name"),
                login_id=user_obj.get("login_id"),
                submitted_at=raw.get("submitted_at"),
                seconds_late=seconds_late,
                days_late=round(seconds_late / _SECONDS_PER_DAY, 1),
                status=student_status,
                score=raw.get("score"),
                grade=raw.get("grade"),
            )
        )

    # Most late first — the students an instructor most likely needs to act on
    late_students.sort(key=lambda s: s.seconds_late, reverse=True)

    # #555: summary statistics — rate is relative to submissions received, day
    # figures are computed over late submissions only
    late_count = len(late_students)
    late_rate = round(late_count / submitted_count * 100, 1) if submitted_count else 0.0
    avg_days_late = round(sum(s.seconds_late for s in late_students) / late_count / _SECONDS_PER_DAY, 1) if late_count else 0.0
    max_days_late = late_students[0].days_late if late_count else 0.0

    # #556: structured response with course/assignment context and a generation timestamp
    return LateSubmissionAnalysis(
        local_course_id=course.id,
        canvas_course_id=course.canvas_course_id,
        assignment_id=assignment_id,
        canvas_url=course.canvas_url,
        generated_at=datetime.now(UTC),
        assignment_published=assignment_published,
        summary=LateSubmissionSummary(
            total_enrolled=len(roster),
            submitted_count=submitted_count,
            on_time_count=submitted_count - late_count,
            late_count=late_count,
            late_rate=late_rate,
            avg_days_late=avg_days_late,
            max_days_late=max_days_late,
        ),
        late_students=late_students,
    )
