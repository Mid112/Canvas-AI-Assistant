"""Server-side per-assignment submission-rate computation. Used by
find_assignment_by_submission_rate to resolve "the assignment with fewer
than X% submissions" without ever dumping raw submission lists into the
LLM's context — mirrors compute_missing_submissions in
services/resolved_set.py, but scans every assignment in a course rather
than filtering one assignment's roster, and resolves to a single
assignment (not a bulk recipient set), so it has no ResolvedSet/handle
involvement at all."""
from datetime import datetime
from typing import Literal, TypedDict

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.user import User
from app.schemas.canvas import SubmissionStatus
from app.services.canvas import get_submissions
from app.services.student import get_students

# Statuses that mean the student actually turned something in. "excused"
# and "missing"/"unsubmitted" all mean no work was delivered, for rate
# purposes — excused by design, the other two because nothing exists yet.
_SUBMITTED_STATUSES = {SubmissionStatus.graded, SubmissionStatus.submitted, SubmissionStatus.late}


class AssignmentRateMatch(TypedDict):
    id: int
    name: str
    due_at: datetime | None
    rate_percent: float


async def compute_submission_rate(
    course: Course, assignment_id: int, user: User, db: AsyncSession
) -> float:
    """Percentage of actively-enrolled students with an actual submission
    on this assignment, cross-referenced against the active roster the
    same way compute_missing_submissions is. 0.0 when the course has no
    active students, rather than dividing by zero."""
    submissions = await get_submissions(course.id, assignment_id, user, course.canvas_url, db)
    students = await get_students(course.id, user, course.canvas_url, db)
    active_ids = {int(s.canvas_user_id) for s in students if s.enrollment_state == "active"}
    if not active_ids:
        return 0.0
    submitted = sum(1 for s in submissions if s.user_id in active_ids and s.status in _SUBMITTED_STATUSES)
    return (submitted / len(active_ids)) * 100


async def find_assignments_by_submission_rate(
    course: Course,
    assignments: list[dict],
    comparator: Literal["below", "above"],
    threshold_percent: float,
    user: User,
    db: AsyncSession,
) -> list[AssignmentRateMatch]:
    """Scans every assignment in the course, computing each one's
    submission rate, and returns only those matching comparator against
    threshold_percent — the caller (_run_find_assignment_by_submission_rate_chain
    in services/chat.py) picks "the last" (latest due date) among matches.
    A real Canvas round-trip per assignment — same complexity class as
    get_submission_derived_students' full-course scan — tracked as one row
    in tool_call_logs by the caller, not one per assignment."""
    matches: list[AssignmentRateMatch] = []
    for assignment in assignments:
        rate = await compute_submission_rate(course, assignment["id"], user, db)
        qualifies = rate < threshold_percent if comparator == "below" else rate > threshold_percent
        if qualifies:
            matches.append({
                "id": assignment["id"],
                "name": assignment["name"],
                "due_at": assignment.get("due_at"),
                "rate_percent": rate,
            })
    return matches
