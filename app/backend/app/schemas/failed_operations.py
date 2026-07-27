from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class FailedOperationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source: Literal["canvas", "ai"]
    operation: str
    user_id: int | None
    user_name: str | None = None
    course_id: int | None
    conversation_id: int | None
    workflow_id: int | None
    tool_call_id: int | None
    provider: str | None
    error_detail: str
    context_json: dict[str, Any]
    created_at: datetime


class FailedOperationListResponse(BaseModel):
    items: list[FailedOperationResponse]
    total: int
    canvas_count: int
    ai_count: int


class FailedOperationSummaryResponse(BaseModel):
    total: int
    canvas_count: int
    ai_count: int
    hours: int
