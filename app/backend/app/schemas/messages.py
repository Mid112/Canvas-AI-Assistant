"""Schema note: defines API-facing messages request/response shapes; changes here affect frontend service contracts."""

from datetime import datetime

from pydantic import BaseModel, Field


class MessageRecipient(BaseModel):
    id: str
    name: str
    email: str | None = None


class MessageDraftCreate(BaseModel):
    course_id: int | None = None
    template_id: str | None = None
    template_name: str | None = None
    prompt: str | None = None
    subject: str | None = None
    body: str | None = None
    recipients: list[MessageRecipient] = Field(default_factory=list)


class MessageDraftUpdate(BaseModel):
    subject: str | None = None
    body: str | None = None
    recipients: list[MessageRecipient] | None = None


class MessageDraftResponse(BaseModel):
    id: int
    course_id: int | None
    subject: str
    body: str
    template_id: str | None
    template_name: str | None
    recipients: list[MessageRecipient]
    status: str
    sent_at: datetime | None
    created_at: datetime
    updated_at: datetime
    # Inferred for sent drafts (empty recipients → announcement); not a DB column.
    delivery_mode: str | None = None

    model_config = {"from_attributes": True}


class MessageSendResponse(BaseModel):
    draft_id: int
    status: str
    canvas_topic_id: int | None = None
    delivery_mode: str | None = None
    recipient_count: int | None = None
