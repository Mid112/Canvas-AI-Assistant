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
    FailingCanvasConnectionListResponse,
    InstructorCanvasSummary,
)
from app.services.failed_operations import get_failed_operations_summary
from app.services.health import get_latest_health_status
from app.services.llm.provider_registry import get_provider_statuses

# Failed operations older than this don't count toward the diagnostics
# summary's "recent" count -- an outage from last week shouldn't still read
# as an active problem today.
_RECENT_FAILURE_HOURS = 24

# Matches the same reconnect-vs-token-corrupted prefixes
# _is_expected_canvas_token_sync_error (services/canvas.py) checks for —
# these are the cases an instructor can fix themselves by reconnecting.
_TOKEN_ISSUE_PREFIXES = ("No Canvas token", "Canvas token is corrupted", "Invalid Canvas API token")


def summarize_connection_error(error_detail: str | None) -> str:
    """Plain-language description for the admin dashboard's default view —
    last_sync_error is a raw HTTP client failure message (e.g. "422: Invalid
    Canvas API token" or a bare Canvas 5xx), not something an admin should
    have to parse at render time."""
    if error_detail is None:
        return "This instructor's Canvas connection is healthy."
    if any(prefix in error_detail for prefix in _TOKEN_ISSUE_PREFIXES):
        return "This instructor needs to reconnect their Canvas account."
    return "Canvas isn't responding for this instructor right now."


async def get_instructor_canvas_summary(db: AsyncSession) -> InstructorCanvasSummary:
    """Real per-instructor Canvas connectivity, derived from
    run_course_sync_sweep's already-happening ~60s sweep (services/canvas.py)
    -- no new Canvas calls. Distinct from health.check_canvas(), which only
    tests whether the Canvas host itself is reachable. This is deep-dive,
    admin-only detail -- it belongs in Troubleshooting, not the at-a-glance
    System Health status board. Counts only -- see
    list_failing_canvas_connections for the paginated detail list."""
    total = await db.scalar(select(func.count()).select_from(CanvasConnection)) or 0
    failing = (
        await db.scalar(
            select(func.count())
            .select_from(CanvasConnection)
            .where(CanvasConnection.last_sync_error.is_not(None))
        )
        or 0
    )
    return InstructorCanvasSummary(total=total, healthy=total - failing, failing=failing)


async def list_failing_canvas_connections(
    db: AsyncSession, *, limit: int = 10, offset: int = 0
) -> FailingCanvasConnectionListResponse:
    """Paginated detail behind InstructorCanvasSummary.failing -- kept as its
    own query (rather than embedded in get_diagnostics) so paging through
    failing connections doesn't re-run the health/LLM-provider checks that
    live alongside it on the Troubleshooting page."""
    total = (
        await db.scalar(
            select(func.count())
            .select_from(CanvasConnection)
            .where(CanvasConnection.last_sync_error.is_not(None))
        )
        or 0
    )
    rows = await db.execute(
        select(
            User.id,
            User.name,
            User.email,
            CanvasConnection.canvas_url,
            CanvasConnection.last_sync_error,
        )
        .join(User, User.id == CanvasConnection.user_id)
        .where(CanvasConnection.last_sync_error.is_not(None))
        # Stable order so paging doesn't reshuffle rows between pages.
        .order_by(CanvasConnection.id)
        .offset(offset)
        .limit(limit)
    )
    items = [
        FailingCanvasConnection(
            user_id=user_id,
            user_name=name,
            user_email=email,
            canvas_url=canvas_url,
            human_summary=summarize_connection_error(error_detail),
            # last_sync_error is free-form text from an HTTP client failure --
            # it could echo a bearer token/API key back from a raw request
            # error, so scrub before this ever reaches an admin-facing response.
            error_detail=redact_secrets(error_detail) if error_detail else None,
        )
        for user_id, name, email, canvas_url, error_detail in rows
    ]
    return FailingCanvasConnectionListResponse(items=items, total=total)


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
