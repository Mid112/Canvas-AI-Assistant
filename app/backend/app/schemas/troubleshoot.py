from pydantic import BaseModel

from app.schemas.health import LatestHealthResponse
from app.schemas.llm_provider import LlmProviderStatus


class FailingCanvasConnection(BaseModel):
    user_id: int
    user_name: str
    user_email: str
    canvas_url: str
    # Plain-language description for the admin dashboard's default view —
    # see summarize_connection_error() in services/troubleshoot.py.
    human_summary: str
    error_detail: str | None = None


class InstructorCanvasSummary(BaseModel):
    total: int
    healthy: int
    failing: int


class FailingCanvasConnectionListResponse(BaseModel):
    items: list[FailingCanvasConnection]
    total: int


class DiagnosticsResponse(BaseModel):
    canvas_api_url: str
    backend_uptime_seconds: int
    health: LatestHealthResponse
    instructor_canvas: InstructorCanvasSummary
    llm_providers: list[LlmProviderStatus]
    recent_failed_operations_count: int
