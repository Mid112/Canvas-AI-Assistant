from datetime import datetime
from typing import Literal

from pydantic import BaseModel

HealthStatus = Literal["healthy", "degraded", "down"]
# Only ever returned by GET /admin/health/latest, for a fresh deploy (or
# after retention pruning) with no persisted health_checks rows yet -- a
# distinct state from a confirmed "healthy" run.
LatestOverallStatus = Literal["healthy", "degraded", "down", "unknown"]


class ServiceHealth(BaseModel):
    status: HealthStatus
    latency_ms: int | None = None
    error_detail: str | None = None
    uptime_seconds: int | None = None  # backend only


class HealthCheckResponse(BaseModel):
    overall_status: HealthStatus
    checked_at: datetime
    services: dict[str, ServiceHealth]


class LatestHealthResponse(BaseModel):
    overall_status: LatestOverallStatus
    checked_at: datetime | None
    services: dict[str, ServiceHealth]


class HealthHistoryEntry(BaseModel):
    status: HealthStatus
    latency_ms: int | None = None
    checked_at: datetime


class HealthHistoryResponse(BaseModel):
    services: dict[str, list[HealthHistoryEntry]]
