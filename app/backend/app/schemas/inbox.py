"""Schema note: defines API-facing inbox request/response shapes; changes here affect frontend service contracts."""

from datetime import datetime

from pydantic import BaseModel, Field


class InboxParticipant(BaseModel):
    id: str
    name: str
    # "instructor" for the current user, "student" for everyone else in the thread
    role: str


class InboxMessage(BaseModel):
    id: str
    author: InboxParticipant
    body: str
    sent_at: datetime


class InboxThreadSummary(BaseModel):
    id: str
    # Local course id when the inbox is scoped to a course; None in "all" mode
    course_id: int | None = None
    course_name: str
    subject: str
    preview: str
    participants: list[InboxParticipant] = Field(default_factory=list)
    unread_count: int = 0
    updated_at: datetime


class InboxThreadList(BaseModel):
    threads: list[InboxThreadSummary] = Field(default_factory=list)


class InboxThreadDetail(InboxThreadSummary):
    messages: list[InboxMessage] = Field(default_factory=list)


class InboxReplyRequest(BaseModel):
    body: str


class InboxReplyDraftRequest(BaseModel):
    prompt: str | None = None


class InboxReplyDraftResponse(BaseModel):
    body: str


class InboxReplyPreviewRequest(BaseModel):
    body: str


class InboxReplyPreviewResponse(BaseModel):
    summary: str
    recipient_count: int
    body_preview: str
