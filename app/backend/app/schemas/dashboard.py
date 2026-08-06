"""Schema note: defines API-facing dashboard request/response shapes; changes here affect frontend service contracts."""

from datetime import datetime

from pydantic import BaseModel

from app.schemas.canvas import ActiveCourseResponse


class CourseActivitySummary(BaseModel):
    local_id: int
    name: str
    student_count: int
    assignment_count: int
    missing_submissions: int
    late_submissions: int


class RecentWorkflowSummary(BaseModel):
    id: int
    action_name: str
    user_prompt: str
    status: str
    created_at: datetime


class InstructorDashboardResponse(BaseModel):
    course_count: int
    student_count: int
    assignment_count: int
    missing_submissions: int
    late_submissions: int
    pending_workflows: int
    active_course: ActiveCourseResponse | None
    courses: list[CourseActivitySummary]
    recent_workflows: list[RecentWorkflowSummary]
