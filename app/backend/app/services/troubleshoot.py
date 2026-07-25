import time

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.secret_redaction import redact_secrets
from app.models.canvas_connection import CanvasConnection
from app.models.user import User
from app.schemas.troubleshoot import (
    DiagnosticsResponse,
    FailingCanvasConnection,
    InstructorCanvasSummary,
)
from app.services.failed_operations import get_failed_operations_summary
from app.services.health import get_latest_health_status
from app.services.llm.provider_registry import get_provider_statuses

# Failed operations older than this don't count toward the diagnostics
# summary's "recent" count -- an outage from last week shouldn't still read
# as an active problem today.
_RECENT_FAILURE_HOURS = 24
# Bounded so the admin page never renders an unbounded list of instructors.
_FAILING_CANVAS_CONNECTIONS_LIMIT = 10


async def get_instructor_canvas_summary(db: AsyncSession) -> InstructorCanvasSummary:
    """Real per-instructor Canvas connectivity, derived from
    run_course_sync_sweep's already-happening ~60s sweep (services/canvas.py)
    -- no new Canvas calls. Distinct from health.check_canvas(), which only
    tests whether the Canvas host itself is reachable. This is deep-dive,
    admin-only detail -- it belongs in Troubleshooting, not the at-a-glance
    System Health status board."""
    total = await db.scalar(select(func.count()).select_from(CanvasConnection)) or 0
    failing = (
        await db.scalar(
            select(func.count())
            .select_from(CanvasConnection)
            .where(CanvasConnection.last_sync_error.is_not(None))
        )
        or 0
    )
    rows = await db.execute(
        select(
            User.name, User.email, CanvasConnection.canvas_url, CanvasConnection.last_sync_error
        )
        .join(User, User.id == CanvasConnection.user_id)
        .where(CanvasConnection.last_sync_error.is_not(None))
        .limit(_FAILING_CANVAS_CONNECTIONS_LIMIT)
    )
    failing_connections = [
        FailingCanvasConnection(
            user_name=name,
            user_email=email,
            canvas_url=canvas_url,
            # last_sync_error is free-form text from an HTTP client failure --
            # it could echo a bearer token/API key back from a raw request
            # error, so scrub before this ever reaches an admin-facing response.
            error_detail=redact_secrets(error_detail) if error_detail else None,
        )
        for name, email, canvas_url, error_detail in rows
    ]
    return InstructorCanvasSummary(
        total=total,
        healthy=total - failing,
        failing=failing,
        failing_connections=failing_connections,
    )


async def get_diagnostics(db: AsyncSession, backend_started_at: float) -> DiagnosticsResponse:
    health = await get_latest_health_status(db)
    instructor_canvas = await get_instructor_canvas_summary(db)
    llm_providers = await get_provider_statuses()
    # Failed operations (Canvas + AI) are Feature 11's append-only log --
    # Troubleshooting reuses it rather than keeping its own separate query,
    # so there's exactly one "what failed" data source across the admin UI.
    failed_ops_summary = await get_failed_operations_summary(db, hours=_RECENT_FAILURE_HOURS)

    return DiagnosticsResponse(
        canvas_api_url=settings.CANVAS_API_URL,
        backend_uptime_seconds=int(time.monotonic() - backend_started_at),
        health=health,
        instructor_canvas=instructor_canvas,
        # get_provider_statuses() returns plain dicts shaped like
        # LlmProviderStatus -- pydantic validates/coerces them on assignment.
        llm_providers=llm_providers,
        recent_failed_operations_count=failed_ops_summary.total,
    )
