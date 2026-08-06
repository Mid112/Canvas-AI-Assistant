"""Schema note: defines API-facing message template request/response shapes; changes here affect frontend service contracts."""

from datetime import datetime

from pydantic import BaseModel, Field


class MessageTemplateCreate(BaseModel):
    title: str = Field(min_length=1)
    content: str = Field(min_length=1)
    course_id: int | None = None


class MessageTemplateUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    content: str | None = Field(default=None, min_length=1)
    course_id: int | None = None


class MessageTemplateResponse(BaseModel):
    id: int
    title: str
    content: str
    course_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}
