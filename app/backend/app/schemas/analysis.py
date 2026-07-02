from datetime import datetime

from pydantic import BaseModel

from app.schemas.canvas import SubmissionStatus


class MissingStudent(BaseModel):
    canvas_user_id: str
    name: str
    sortable_name: str | None = None
    # login_id is the institution-issued identifier (typically email); may be absent
    # when the Canvas instance restricts personal info visibility
    login_id: str | None = None


class SubmissionSummary(BaseModel):
    total_enrolled: int
    # Students with a real submission: graded, submitted, or late
    submitted_count: int
    # Students with no submission: missing or unsubmitted (excused students excluded)
    missing_count: int
    excused_count: int
    # Percentage 0–100 of enrolled students who submitted, rounded to 1 decimal
    submission_rate: float
    # Per-status breakdown — sums to total_enrolled (every enrolled student has exactly one status)
    status_counts: dict[SubmissionStatus, int]


class MissingSubmissionAnalysis(BaseModel):
    local_course_id: int
    canvas_course_id: str
    assignment_id: int
    canvas_url: str
    generated_at: datetime
    summary: SubmissionSummary
    missing_students: list[MissingStudent]
