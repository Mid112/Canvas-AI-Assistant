from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class FailedOperationResponse(BaseModel):
    """Summary shape returned by the list endpoint — metadata + a
    plain-language `human_summary` only. Raw `error_detail`/`context_json`
    are FERPA-sensitive (may echo student data) and are only ever returned
    by the single-item detail endpoint, which access-logs the view (see
    FailedOperationDetailResponse and routers/failed_operations.py)."""

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
    human_summary: str
    created_at: datetime


class FailedOperationDetailResponse(FailedOperationResponse):
    """Full detail shape — only returned by GET /admin/failed-operations/{id},
    which writes an access-log row (AuditLogSession action
    "failed_operation_viewed") before responding."""

    error_detail: str
    context_json: dict[str, Any]


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
