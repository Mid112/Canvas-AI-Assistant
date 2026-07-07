from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CourseResponse(BaseModel):
    # extra="ignore" — Canvas returns many fields we don't need; populate_by_name lets
    # us also construct this with canvas_id= directly (not just via the alias "id")
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    # validation_alias="id" parses Canvas JSON {"id": N} into canvas_id during input;
    # serialization uses the field name canvas_id so the frontend never sees a bare "id"
    canvas_id: int = Field(validation_alias="id")
    local_id: int | None = None

    name: str
    course_code: str
    workflow_state: str

    enrollment_term_id: int | None = None
    term_name: str | None = None

    start_at: datetime | None = None
    end_at: datetime | None = None

    # Only present when Canvas request includes include[]=total_students
    total_students: int | None = None


class AssignmentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int           # Canvas assignment ID — kept for frontend compatibility
    local_id: int | None = None
    name: str
    description: str | None = None
    due_at: datetime | None = None
    points_possible: float | None = None
    course_id: int


class SubmissionStatus(StrEnum):
    graded = "graded"
    submitted = "submitted"
    late = "late"
    missing = "missing"
    unsubmitted = "unsubmitted"
    excused = "excused"
class AssignmentCreate(BaseModel):
    name: str
    description: str | None = None
    due_at: datetime | None = None
    points_possible: float | None = None


class AssignmentUpdate(BaseModel):
    name: str
    description: str | None = None
    due_at: datetime | None = None
    points_possible: float | None = None


class MessageSendResult(BaseModel):
    course_id: int         # Canvas course ID — matches AssignmentResponse.course_id convention, not the local DB id
    subject: str
    body: str
    audience_size: int     # enrolled-class size or targeted recipient count
    delivery_mode: Literal["announcement", "conversation"] = "announcement"
    recipient_canvas_user_ids: list[int] = Field(default_factory=list)


class SubmissionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    assignment_id: int
    user_id: int
    student_name: str | None = None
    submitted_at: datetime | None = None
    # Raw Canvas state — kept for debugging. API consumers should use `status` instead.
    workflow_state: str

    # Parsed status (#547) — one of: graded, submitted, late, missing, unsubmitted, excused
    status: SubmissionStatus

    # Grading info (#548)
    score: float | None = None
    grade: str | None = None
    graded_at: datetime | None = None


class ActiveCourseSet(BaseModel):
    local_course_id: int


class ActiveCourseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    local_id: int
    canvas_course_id: str
    # canvas_url tells the AI layer which Canvas instance to call for assignments/submissions
    canvas_url: str
    name: str
    term: str | None = None
