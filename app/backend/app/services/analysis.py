import asyncio
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.canvas import fetch_enrollments, fetch_submissions
from app.models.user import User
from app.schemas.analysis import MissingStudent, MissingSubmissionAnalysis, SubmissionSummary
from app.schemas.canvas import SubmissionStatus
from app.services.canvas import _parse_submission_status, get_owned_course, require_canvas_token

# A student counts as missing when they have no real submission and are not excused
MISSING_STATUSES = (SubmissionStatus.missing, SubmissionStatus.unsubmitted)
SUBMITTED_STATUSES = (SubmissionStatus.graded, SubmissionStatus.submitted, SubmissionStatus.late)


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
