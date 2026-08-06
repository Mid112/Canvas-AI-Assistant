"""Schema note: defines API-facing course overview request/response shapes; changes here affect frontend service contracts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class RecentAssignmentSummary(BaseModel):
    local_id: int
    title: str
    due_date: datetime | None
    submitted_count: int
    total_students: int
    status: Literal["active", "upcoming", "completed"]
    # Canvas's draft/published distinction — a draft is still listed here for
    # instructor visibility, but submitted_count/status reflect that it can't
    # have real submissions yet (see get_course_overview).
    published: bool = True


class StudentActivityItem(BaseModel):
    student_name: str
    action: str
    occurred_at: datetime


class CourseOverviewResponse(BaseModel):
    local_id: int
    canvas_course_id: str
    name: str
    term: str | None
    is_active: bool
    student_count: int
    assignment_count: int
    missing_submissions: int
    late_submissions: int
    average_grade: float | None
    completion_rate: float | None
    recent_assignments: list[RecentAssignmentSummary]
    recent_activity: list[StudentActivityItem]
