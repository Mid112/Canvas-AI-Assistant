from datetime import datetime

from pydantic import BaseModel


class CourseResponse(BaseModel):
    id: int
    name: str
    course_code: str
    enrollment_term_id: int | None = None
    workflow_state: str

class AssignmentResponse(BaseModel):
    id: int
    name: str
    description: str | None = None
    due_at: datetime | None = None
    points_possible: float | None = None
    course_id: int


class SubmissionResponse(BaseModel):
    id: int
    assignment_id: int
    user_id: int
    score: float | None = None
    grade: str | None = None
    submitted_at: datetime | None = None
    workflow_state: str
