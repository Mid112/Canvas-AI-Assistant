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
    # Canvas's draft/published distinction — defaults true so assignments from
    # older Canvas payloads that omit the field aren't misread as drafts.
    published: bool = True


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


class QuizQuestionCreate(BaseModel):
    question_text: str
    question_type: Literal[
        "multiple_choice_question",
        "true_false_question",
        "short_answer_question",
        "essay_question",
    ] = "essay_question"
    points_possible: float = 1.0
    answers: list[dict] = Field(default_factory=list)


class QuizQuestionBankGroupCreate(BaseModel):
    bank_id: int
    bank_name: str | None = None
    pick_count: int = Field(ge=1)
    question_points: float = Field(gt=0)


class QuizCreate(BaseModel):
    title: str
    description: str | None = None
    due_at: datetime | None = None
    points_possible: float | None = None
    quiz_type: Literal["assignment", "practice_quiz", "graded_survey", "survey"] = "assignment"
    allowed_attempts: int | None = 1
    time_limit: int | None = None
    published: bool = False
    quiz_engine: Literal["classic", "new_quizzes"] = "classic"
    questions: list[QuizQuestionCreate] = Field(default_factory=list)
    question_bank_groups: list[QuizQuestionBankGroupCreate] = Field(
        default_factory=list
    )


class QuizResponse(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    id: int
    title: str
    description: str | None = None
    due_at: datetime | None = None
    points_possible: float | None = None
    course_id: int
    quiz_type: str | None = None
    allowed_attempts: int | None = None
    time_limit: int | None = None
    published: bool = False
    question_count: int | None = None
    html_url: str | None = None
    quiz_engine: Literal["classic", "new_quizzes"] = "classic"
    warnings: list[str] = Field(default_factory=list)


class QuizCapabilities(BaseModel):
    classic_quizzes: bool = True
    new_quizzes: bool = False
    question_banks: bool = True
    preferred_engine: Literal["classic", "new_quizzes"] = "classic"
    new_quizzes_unavailable_reason: str | None = None


class QuestionBankSummary(BaseModel):
    id: int
    title: str
    question_count: int = 0


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
    student_email: str | None = None
    student_login_id: str | None = None
    submitted_at: datetime | None = None
    # Raw Canvas state — kept for debugging. API consumers should use `status` instead.
    workflow_state: str

    # Parsed status (#547) — one of: graded, submitted, late, missing, unsubmitted, excused
    status: SubmissionStatus

    # Grading info (#548)
    score: float | None = None
    grade: str | None = None
    graded_at: datetime | None = None


class GradeUpdateRequest(BaseModel):
    assignment_id: int
    user_id: int
    posted_grade: str = Field(min_length=1, max_length=32)
    reason: str | None = Field(default=None, max_length=500)
    current_submission: dict | None = None


class GradePreviewResponse(BaseModel):
    action: Literal["update_grade"] = "update_grade"
    risk_level: Literal["high"] = "high"
    requires_approval: bool = True
    irreversible_warning: str
    rollback_available: bool
    rollback_message: str
    summary: str
    current: dict
    proposed: dict
    affected_resources: list[dict]


class GradeUpdateResponse(GradePreviewResponse):
    submitted: bool
    history_id: int | None = None
    canvas_submission: SubmissionResponse


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
