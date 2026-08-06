from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class AssignmentDraftRequest(BaseModel):
    prompt: str = Field(min_length=1)


class AssignmentDraftResponse(BaseModel):
    title: str
    description: str
    due_at: datetime | None = None
    points_possible: float | None = None


class AssignmentPreviewRequest(BaseModel):
    title: str
    description: str | None = None
    due_at: datetime | None = None
    points_possible: float | None = None


class QuizQuestionDraft(BaseModel):
    question_text: str
    question_type: Literal[
        "multiple_choice_question",
        "true_false_question",
        "short_answer_question",
        "essay_question",
    ] = "essay_question"
    # Canvas allows any positive points value — do not cap at 1 (Ticket 14).
    points_possible: float = Field(default=1.0, gt=0)
    answers: list[dict] = Field(default_factory=list)


class QuizDraftRequest(BaseModel):
    prompt: str = Field(min_length=20)


class QuizDraftResponse(BaseModel):
    title: str
    description: str
    due_at: datetime | None = None
    points_possible: float | None = None
    allowed_attempts: int | None = None
    time_limit: int | None = None
    questions: list[QuizQuestionDraft] = Field(default_factory=list)


class ActionPreviewResponse(BaseModel):
    action: str
    summary: str
    metadata: dict
    reversible: bool
    affected_resources: list[dict]
    risk_level: Literal["low", "medium", "high"] = "medium"


class FeedbackDraftRequest(BaseModel):
    prompt: str = Field(min_length=20)
    assignment_id: int
    student_id: int
    assignment_name: str = Field(min_length=1)
    student_name: str = Field(min_length=1)
    current_grade: str | None = None


class FeedbackDraftResponse(BaseModel):
    assignment_id: int
    student_id: int
    assignment_name: str
    student_name: str
    new_grade: str
    feedback: str
    current_grade: str | None = None


class FeedbackPostRequest(BaseModel):
    assignment_id: int
    student_id: int
    assignment_name: str = Field(min_length=1)
    student_name: str = Field(min_length=1)
    new_grade: str = Field(min_length=1)
    feedback: str = Field(min_length=1)
