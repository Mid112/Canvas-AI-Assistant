from datetime import datetime

from pydantic import BaseModel

from app.schemas.health import InstructorCanvasSummary, LatestHealthResponse
from app.schemas.llm_provider import LlmProviderStatus


class FailedOperation(BaseModel):
    id: int
    action_name: str
    user_name: str
    user_email: str
    course_name: str | None = None
    error_detail: str | None = None
    created_at: datetime
    executed_at: datetime | None = None


class FailedOperationListResponse(BaseModel):
    items: list[FailedOperation]
    total: int


class DiagnosticsResponse(BaseModel):
    canvas_api_url: str
    backend_uptime_seconds: int
    health: LatestHealthResponse
    instructor_canvas: InstructorCanvasSummary
    llm_providers: list[LlmProviderStatus]
    recent_failed_operations_count: int
