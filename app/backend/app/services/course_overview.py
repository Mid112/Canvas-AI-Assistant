from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.assignment import Assignment
from app.models.course import Course
from app.models.submission import Submission
from app.models.user import User
from app.models.user_preference import UserPreference
from app.schemas.course_overview import (
    CourseOverviewResponse,
    RecentAssignmentSummary,
    StudentActivityItem,
)
from app.services.canvas import get_assignments
from app.services.student import get_students

_SUBMITTED_STATUSES = ("submitted", "graded", "late")


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _assignment_status(
    *,
    due_date: datetime | None,
    submitted_count: int,
    total_students: int,
) -> Literal["active", "upcoming", "completed"]:
    now = datetime.now(UTC)
    normalized_due_date = _as_utc(due_date)
    if total_students > 0 and submitted_count >= total_students:
        return "completed"
    if (
        normalized_due_date is not None
        and normalized_due_date > now
        and submitted_count == 0
    ):
        return "upcoming"
    return "active"


def _activity_action(status: str, assignment_title: str) -> str:
    if status == "late":
        return "Submitted late assignment"
    if status == "graded":
        return f"Received grade on {assignment_title}"
    return f"Submitted {assignment_title}"


async def get_course_overview(
    local_course_id: int,
    user: User,
    canvas_url: str,
    db: AsyncSession,
) -> CourseOverviewResponse:
    roster = await get_students(local_course_id, user, canvas_url, db)
    # Refresh the local assignment mirror from Canvas before reading it below —
    # get_assignments() upserts by canvas_assignment_id, so this must run before
    # the select() so a newly added/removed Canvas assignment is reflected in
    # the count and recent-assignments list rather than a stale prior sync.
    await get_assignments(local_course_id, user, canvas_url, db)

    course = await db.scalar(
        select(Course)
        .where(Course.id == local_course_id, Course.instructor_id == user.id)
        .options(
            selectinload(Course.assignments),
            selectinload(Course.students),
        )
    )
    if not course:
        raise ValueError("Course not found")

    student_count = len(roster)
    assignments = [a for a in course.assignments if a.is_active]
    # assignment_count/recent_assignments deliberately include drafts (unpublished
    # assignments) — instructors need visibility into their own WIP assignments.
    # Everything below that measures actual student progress (missing/late/
    # submitted counts, average grade, completion rate) is scoped to published
    # assignments only — a draft is invisible to students and can't have real
    # submissions, so counting it would understate completion rate and could
    # register every enrolled student as "missing" something they were never
    # actually assigned.
    assignment_count = len(assignments)
    published_assignments = [a for a in assignments if a.published]
    published_assignment_count = len(published_assignments)
    assignment_ids = [assignment.id for assignment in published_assignments]

    missing_count = 0
    late_count = 0
    submitted_count = 0
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
        submitted_count = int(
            await db.scalar(
                select(func.count())
                .select_from(Submission)
                .where(
                    Submission.assignment_id.in_(assignment_ids),
                    Submission.status.in_(_SUBMITTED_STATUSES),
                )
            )
            or 0
        )

    grade_rows = await db.execute(
        select(Submission.score, Assignment.points_possible)
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(
            Assignment.course_id == course.id,
            Assignment.is_active.is_(True),
            Assignment.published.is_(True),
            Submission.score.is_not(None),
            Assignment.points_possible.is_not(None),
            Assignment.points_possible > 0,
        )
    )
    percentages: list[float] = []
    for score, points_possible in grade_rows.all():
        if score is not None and points_possible:
            percentages.append((score / points_possible) * 100)

    average_grade = round(sum(percentages) / len(percentages), 1) if percentages else None

    total_slots = student_count * published_assignment_count
    completion_rate = (
        round((submitted_count / total_slots) * 100, 1) if total_slots > 0 else None
    )

    submitted_by_assignment: dict[int, int] = {}
    if assignment_ids:
        count_rows = await db.execute(
            select(Submission.assignment_id, func.count())
            .where(
                Submission.assignment_id.in_(assignment_ids),
                Submission.status.in_(_SUBMITTED_STATUSES),
            )
            .group_by(Submission.assignment_id)
        )
        submitted_by_assignment = {
            assignment_id: int(count) for assignment_id, count in count_rows.all()
        }

    recent_assignments: list[RecentAssignmentSummary] = []
    for assignment in sorted(
        assignments,
        key=lambda item: _as_utc(item.due_date) or datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )[:5]:
        assignment_submitted = submitted_by_assignment.get(assignment.id, 0)
        recent_assignments.append(
            RecentAssignmentSummary(
                local_id=assignment.id,
                title=assignment.title,
                due_date=assignment.due_date,
                submitted_count=assignment_submitted,
                total_students=student_count,
                status=_assignment_status(
                    due_date=assignment.due_date,
                    submitted_count=assignment_submitted,
                    total_students=student_count,
                ),
                published=assignment.published,
            )
        )

    activity_rows = await db.execute(
        select(
            Submission.student_name,
            Submission.status,
            Submission.submitted_at,
            Assignment.title,
        )
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .where(
            Assignment.course_id == course.id,
            Assignment.is_active.is_(True),
            Submission.submitted_at.is_not(None),
        )
        .order_by(desc(Submission.submitted_at))
        .limit(5)
    )

    recent_activity = [
        StudentActivityItem(
            student_name=student_name or "Unknown student",
            action=_activity_action(status, assignment_title),
            occurred_at=submitted_at,
        )
        for student_name, status, submitted_at, assignment_title in activity_rows.all()
        if submitted_at is not None
    ]

    active_course_id = await db.scalar(
        select(UserPreference.active_course_id).where(UserPreference.user_id == user.id)
    )
    is_active = active_course_id == course.id

    return CourseOverviewResponse(
        local_id=course.id,
        canvas_course_id=course.canvas_course_id,
        name=course.name,
        term=course.term,
        is_active=is_active,
        student_count=student_count,
        assignment_count=assignment_count,
        missing_submissions=missing_count,
        late_submissions=late_count,
        average_grade=average_grade,
        completion_rate=completion_rate,
        recent_assignments=recent_assignments,
        recent_activity=recent_activity,
    )
