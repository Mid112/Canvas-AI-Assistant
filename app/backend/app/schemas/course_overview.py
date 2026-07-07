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
