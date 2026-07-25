from pydantic import BaseModel

from app.schemas.health import LatestHealthResponse
from app.schemas.llm_provider import LlmProviderStatus


class FailingCanvasConnection(BaseModel):
    user_name: str
    user_email: str
    canvas_url: str
    error_detail: str | None = None


class InstructorCanvasSummary(BaseModel):
    total: int
    healthy: int
    failing: int
    failing_connections: list[FailingCanvasConnection]


class DiagnosticsResponse(BaseModel):
    canvas_api_url: str
    backend_uptime_seconds: int
    health: LatestHealthResponse
    instructor_canvas: InstructorCanvasSummary
    llm_providers: list[LlmProviderStatus]
    recent_failed_operations_count: int
