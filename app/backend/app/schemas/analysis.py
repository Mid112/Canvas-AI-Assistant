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


class LateStudent(BaseModel):
    canvas_user_id: str
    name: str
    sortable_name: str | None = None
    login_id: str | None = None
    submitted_at: datetime | None = None
    seconds_late: int
    # seconds_late converted to days, rounded to 1 decimal — the unit instructors think in
    days_late: float
    # Current parsed state of the late submission — a late submission that was since
    # graded reports "graded" here while still counting as late in the analysis
    status: SubmissionStatus
    score: float | None = None
    grade: str | None = None


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


class LateSubmissionSummary(BaseModel):
    total_enrolled: int
    # Students with a real submission: graded, submitted, or late
    submitted_count: int
    on_time_count: int
    late_count: int
    # Percentage 0–100 of submissions that were late, rounded to 1 decimal
    late_rate: float
    # Averages over late submissions only; 0.0 when nothing is late
    avg_days_late: float
    max_days_late: float


class LateSubmissionAnalysis(BaseModel):
    local_course_id: int
    canvas_course_id: str
    assignment_id: int
    canvas_url: str
    generated_at: datetime
    summary: LateSubmissionSummary
    late_students: list[LateStudent]
