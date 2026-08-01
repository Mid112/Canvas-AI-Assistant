import asyncio
import logging
import time
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.canvas_url import resolve_server_canvas_url
from app.models.health_check import HealthCheck
from app.schemas.health import (
    HealthCheckResponse,
    HealthHistoryEntry,
    HealthHistoryResponse,
    HealthStatus,
    LatestHealthResponse,
    ServiceHealth,
)
from app.services.llm.llm_setting import get_llm_adapter
from app.services.llm.provider_registry import get_active_llm_config

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
# Bounds the history sparkline. Every run_health_checks call inserts exactly
# one row per monitored service in lockstep, so capping total rows (instead
# of a per-service window-function query) still keeps services balanced.
_MAX_HISTORY_ROWS_PER_SERVICE = 200
_MONITORED_SERVICE_COUNT = 4


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
    # Per-instructor Canvas connectivity is a separate signal, surfaced only
    # in the Troubleshooting dashboard (services/troubleshoot.py) — it's
    # deep-dive detail, not part of the at-a-glance platform status.
    if not settings.CANVAS_API_URL:
        return ServiceHealth(
            status="degraded",
            error_detail="No system Canvas URL configured.",
        )

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


async def check_ai(db: AsyncSession) -> ServiceHealth:
    start = time.monotonic()
    try:
        # Health-check whatever provider the admin actually has active
        # (Feature 8), not the .env DEFAULT_LLM_PROVIDER -- after an admin
        # switches providers, monitoring the old default would silently
        # check the wrong service.
        llm_config = await get_active_llm_config(db)
        adapter = get_llm_adapter({"provider": llm_config.provider, "model": llm_config.model})
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


async def run_health_checks(db: AsyncSession, backend_started_at: float) -> HealthCheckResponse:
    # Only check_backend and check_canvas touch nothing but the network, so
    # only those two are safe to run concurrently. check_database and
    # check_ai (needs db to resolve the admin's active provider) both use
    # this request's AsyncSession, and SQLAlchemy's asyncio docs are explicit
    # that one AsyncSession is not safe for concurrent tasks -- gathering
    # those together caused intermittent failures/corrupted results under
    # load. Run them sequentially instead.
    backend, canvas = await asyncio.gather(
        check_backend(backend_started_at),
        check_canvas(),
    )
    database = await check_database(db)
    ai = await check_ai(db)
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

    return HealthCheckResponse(
        overall_status=_overall_status([health.status for health in services.values()]),
        checked_at=datetime.now(UTC),
        services=services,
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
        # "Never checked" (fresh deploy, or every row pruned) is a distinct
        # state from "confirmed healthy" -- claiming "healthy" here let a
        # deploy with a broken health-check loop look calm indefinitely.
        return LatestHealthResponse(overall_status="unknown", checked_at=None, services={})

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
    rows = list(
        await db.scalars(
            select(HealthCheck)
            .where(HealthCheck.checked_at >= since)
            .order_by(HealthCheck.checked_at.desc())
            .limit(_MAX_HISTORY_ROWS_PER_SERVICE * _MONITORED_SERVICE_COUNT)
        )
    )
    rows.reverse()  # back to chronological order for the sparkline

    services: dict[str, list[HealthHistoryEntry]] = {
        "backend": [], "database": [], "canvas": [], "ai": [],
    }
    for row in rows:
        services.setdefault(row.service, []).append(
            HealthHistoryEntry(status=row.status, latency_ms=row.latency_ms, checked_at=row.checked_at)
        )
    return HealthHistoryResponse(services=services)
