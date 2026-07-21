import asyncio
import logging
import time
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.canvas_url import resolve_server_canvas_url
from app.models.ai_call_health import AiCallHealth
from app.models.canvas_connection import CanvasConnection
from app.models.health_check import HealthCheck
from app.models.user import User
from app.schemas.health import (
    FailingCanvasConnection,
    HealthCheckResponse,
    HealthHistoryEntry,
    HealthHistoryResponse,
    HealthStatus,
    InstructorAiSummary,
    InstructorCanvasSummary,
    LatestHealthResponse,
    ServiceHealth,
)
from app.services.llm.llm_setting import get_llm_adapter

logger = logging.getLogger(__name__)

_STATUS_SEVERITY: dict[HealthStatus, int] = {"healthy": 0, "degraded": 1, "down": 2}
# A check that succeeds but takes longer than this fraction of its own
# timeout is reported "degraded" rather than "healthy" — slow-but-working
# is still worth flagging on the dashboard.
_DEGRADED_LATENCY_RATIO = 0.5
# health_checks rows older than this are pruned on every live-check run —
# it's an audit trail for "verify monitoring" + the history sparkline, not
# something that needs unbounded retention.
_HEALTH_CHECK_RETENTION_DAYS = 30
# AI instructor failures are only counted as "recent" within this window —
# an outage from last week shouldn't still show as an active problem today.
_AI_FAILURE_RECENT_HOURS = 1
# Bounded so the admin page never renders an unbounded list of instructors.
_FAILING_CANVAS_CONNECTIONS_LIMIT = 10


def _status_for_latency(latency_ms: int, timeout_seconds: float) -> HealthStatus:
    if latency_ms > timeout_seconds * 1000 * _DEGRADED_LATENCY_RATIO:
        return "degraded"
    return "healthy"


def _overall_status(statuses: list[HealthStatus]) -> HealthStatus:
    return max(statuses, key=lambda status: _STATUS_SEVERITY[status])


async def check_backend(started_at: float) -> ServiceHealth:
    # The backend IS the process serving this request -- if this code runs
    # at all, the backend is up by definition. There is no separate failure
    # mode to catch here (a dead process wouldn't respond in the first
    # place), so unlike the other three checks this one never reports
    # "down" or "degraded".
    uptime_seconds = int(time.monotonic() - started_at)
    return ServiceHealth(status="healthy", latency_ms=0, uptime_seconds=uptime_seconds)


async def check_database(db: AsyncSession) -> ServiceHealth:
    start = time.monotonic()
    try:
        await asyncio.wait_for(
            db.execute(select(1)), timeout=settings.HEALTH_CHECK_TIMEOUT_SECONDS
        )
    except Exception as e:
        logger.warning("Database health check failed: %s", e)
        return ServiceHealth(status="down", error_detail=str(e)[:500])

    latency_ms = int((time.monotonic() - start) * 1000)
    return ServiceHealth(
        status=_status_for_latency(latency_ms, settings.HEALTH_CHECK_TIMEOUT_SECONDS),
        latency_ms=latency_ms,
    )


async def check_canvas() -> ServiceHealth:
    # Pure network reachability of the configured Canvas host -- deliberately
    # unauthenticated. There is no single shared Canvas credential that
    # represents "the platform": every instructor connects their own token
    # to their own (possibly different) Canvas instance via CanvasConnection,
    # so pinging one arbitrary system-level token would only ever tell an
    # admin whether that one credential still works, not whether Canvas
    # itself is reachable for real users. /login is Canvas's public,
    # unauthenticated landing page -- any response proves the host is up;
    # only a timeout/connection error or a 5xx means it's actually down.
    # Per-instructor Canvas connectivity is a separate signal — see
    # get_instructor_canvas_summary below.
    canvas_url = resolve_server_canvas_url(settings.CANVAS_API_URL)
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=settings.HEALTH_CHECK_TIMEOUT_SECONDS) as client:
            response = await client.get(f"{canvas_url}/login")
    except httpx.TimeoutException:
        return ServiceHealth(status="down", error_detail="Canvas API timed out")
    except httpx.RequestError as e:
        logger.warning("Could not reach Canvas at %s: %s", canvas_url, e)
        return ServiceHealth(status="down", error_detail="Could not reach Canvas")

    latency_ms = int((time.monotonic() - start) * 1000)
    if response.is_server_error:
        return ServiceHealth(
            status="down",
            latency_ms=latency_ms,
            error_detail=f"Canvas returned {response.status_code}",
        )
    return ServiceHealth(
        status=_status_for_latency(latency_ms, settings.HEALTH_CHECK_TIMEOUT_SECONDS),
        latency_ms=latency_ms,
    )


async def check_ai() -> ServiceHealth:
    start = time.monotonic()
    try:
        adapter = get_llm_adapter({"provider": settings.DEFAULT_LLM_PROVIDER})
        await adapter.generate(
            "You are a health check.",
            "Reply with OK.",
            timeout=settings.HEALTH_CHECK_AI_TIMEOUT_SECONDS,
        )
    except httpx.TimeoutException:
        return ServiceHealth(status="down", error_detail="AI service timed out")
    except httpx.HTTPStatusError as e:
        # A 5xx means the provider itself is broken -- that's a real outage.
        # A 4xx (401 bad key, 402 out of credits, 429 rate-limited, ...)
        # means the provider responded normally -- it's our credential/quota
        # that needs attention, not the service itself, so it's "degraded"
        # rather than "down".
        status = "down" if e.response.is_server_error else "degraded"
        return ServiceHealth(
            status=status,
            error_detail=f"AI service returned {e.response.status_code}",
        )
    except httpx.RequestError as e:
        logger.warning("Could not reach AI service: %s", e)
        return ServiceHealth(status="down", error_detail="Could not reach AI service")
    except Exception as e:
        # Misconfiguration (unknown provider, missing api_key/model settings)
        # surfaces here as a plain exception, not an httpx one -- still a
        # health-check failure, not a 500 for the whole aggregate endpoint.
        logger.warning("AI health check failed: %s", e)
        return ServiceHealth(status="down", error_detail=str(e)[:500])

    latency_ms = int((time.monotonic() - start) * 1000)
    return ServiceHealth(
        status=_status_for_latency(latency_ms, settings.HEALTH_CHECK_AI_TIMEOUT_SECONDS),
        latency_ms=latency_ms,
    )


async def get_instructor_canvas_summary(db: AsyncSession) -> InstructorCanvasSummary:
    """Real per-instructor Canvas connectivity, derived from
    run_course_sync_sweep's already-happening ~60s sweep (services/canvas.py)
    -- no new Canvas calls. Distinct from check_canvas() above, which only
    tests whether the Canvas host itself is reachable."""
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
            user_name=name, user_email=email, canvas_url=canvas_url, error_detail=error_detail
        )
        for name, email, canvas_url, error_detail in rows
    ]
    return InstructorCanvasSummary(
        total=total,
        healthy=total - failing,
        failing=failing,
        failing_connections=failing_connections,
    )


async def get_instructor_ai_summary(db: AsyncSession) -> InstructorAiSummary:
    """Real per-instructor AI usage, passively observed from message-draft
    and assignment-draft generation (services/messages.py,
    services/assignment_draft.py) — not a synthetic ping. The main chat
    assistant isn't instrumented yet (see PR description)."""
    total = await db.scalar(select(func.count()).select_from(AiCallHealth)) or 0
    recent_cutoff = datetime.now(UTC) - timedelta(hours=_AI_FAILURE_RECENT_HOURS)
    failing_recent = (
        await db.scalar(
            select(func.count())
            .select_from(AiCallHealth)
            .where(AiCallHealth.status == "failed", AiCallHealth.last_called_at >= recent_cutoff)
        )
        or 0
    )
    return InstructorAiSummary(total=total, failing_recent=failing_recent)


async def run_health_checks(db: AsyncSession, backend_started_at: float) -> HealthCheckResponse:
    backend, database, canvas, ai, instructor_canvas, instructor_ai = await asyncio.gather(
        check_backend(backend_started_at),
        check_database(db),
        check_canvas(),
        check_ai(),
        get_instructor_canvas_summary(db),
        get_instructor_ai_summary(db),
    )
    services = {"backend": backend, "database": database, "canvas": canvas, "ai": ai}

    for service_name, health in services.items():
        db.add(
            HealthCheck(
                service=service_name,
                status=health.status,
                latency_ms=health.latency_ms,
                error_detail=health.error_detail,
            )
        )
    await db.commit()

    # Cheap, indexed prune -- health_checks is an audit trail / history
    # source, not something that needs unbounded retention.
    await db.execute(
        delete(HealthCheck).where(
            HealthCheck.checked_at < datetime.now(UTC) - timedelta(days=_HEALTH_CHECK_RETENTION_DAYS)
        )
    )
    await db.commit()

    overall_status = _overall_status([health.status for health in services.values()])
    return HealthCheckResponse(
        overall_status=overall_status,
        checked_at=datetime.now(UTC),
        services=services,
        instructor_canvas=instructor_canvas,
        instructor_ai=instructor_ai,
    )


async def get_latest_health_status(db: AsyncSession) -> LatestHealthResponse:
    """Cheap: reads the most recent persisted health_checks row per service,
    triggers no live checks (no Canvas ping, no AI generate() call). Powers
    the admin nav badge, which fetches on every admin page load and must
    stay fast — the expensive, live GET /admin/health above is reserved for
    the System Health page's own visit/refresh."""
    rows = list(
        await db.scalars(
            select(HealthCheck)
            .distinct(HealthCheck.service)
            .order_by(HealthCheck.service, HealthCheck.checked_at.desc())
        )
    )
    if not rows:
        return LatestHealthResponse(overall_status="healthy", checked_at=None, services={})

    services = {
        row.service: ServiceHealth(
            status=row.status, latency_ms=row.latency_ms, error_detail=row.error_detail
        )
        for row in rows
    }
    return LatestHealthResponse(
        overall_status=_overall_status([row.status for row in rows]),
        checked_at=max(row.checked_at for row in rows),
        services=services,
    )


async def get_health_history(db: AsyncSession, hours: int = 24) -> HealthHistoryResponse:
    since = datetime.now(UTC) - timedelta(hours=hours)
    rows = await db.scalars(
        select(HealthCheck)
        .where(HealthCheck.checked_at >= since)
        .order_by(HealthCheck.checked_at.asc())
    )

    services: dict[str, list[HealthHistoryEntry]] = {
        "backend": [], "database": [], "canvas": [], "ai": [],
    }
    for row in rows:
        services.setdefault(row.service, []).append(
            HealthHistoryEntry(status=row.status, latency_ms=row.latency_ms, checked_at=row.checked_at)
        )
    return HealthHistoryResponse(services=services)
