import time
from datetime import UTC, datetime, timedelta

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.config import settings
from app.core.secret_redaction import redact_secrets
from app.models.canvas_connection import CanvasConnection
from app.models.user import User
from app.models.workflow import Workflow
from app.schemas.troubleshoot import (
    DiagnosticsResponse,
    FailedOperation,
    FailedOperationListResponse,
    FailingCanvasConnection,
    InstructorCanvasSummary,
)
from app.services.health import get_latest_health_status
from app.services.llm.provider_registry import get_provider_statuses

# Failed workflows older than this don't count toward the diagnostics
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


def _to_failed_operation(row: Workflow) -> FailedOperation:
    return FailedOperation(
        id=row.id,
        action_name=row.action_name,
        user_name=row.user.name,
        user_email=row.user.email,
        course_name=row.course.name if row.course else None,
        # error_detail is surfaced from tool/HTTP failures and could echo a
        # credential back from a raw request error -- scrub before this ever
        # reaches an admin-facing response.
        error_detail=redact_secrets(row.error_detail) if row.error_detail else None,
        created_at=row.created_at,
        executed_at=row.executed_at,
    )


async def list_failed_operations(
    db: AsyncSession, *, limit: int = 50, offset: int = 0
) -> FailedOperationListResponse:
    total = int(
        await db.scalar(
            select(func.count()).select_from(Workflow).where(Workflow.status == "failed")
        )
        or 0
    )

    rows = await db.scalars(
        select(Workflow)
        .options(joinedload(Workflow.user), joinedload(Workflow.course))
        .where(Workflow.status == "failed")
        .order_by(desc(Workflow.created_at))
        .limit(limit)
        .offset(offset)
    )

    return FailedOperationListResponse(
        items=[_to_failed_operation(row) for row in rows], total=total
    )


async def get_diagnostics(db: AsyncSession, backend_started_at: float) -> DiagnosticsResponse:
    health = await get_latest_health_status(db)
    instructor_canvas = await get_instructor_canvas_summary(db)
    llm_providers = await get_provider_statuses()

    recent_cutoff = datetime.now(UTC) - timedelta(hours=_RECENT_FAILURE_HOURS)
    recent_failed_operations_count = int(
        await db.scalar(
            select(func.count())
            .select_from(Workflow)
            .where(Workflow.status == "failed", Workflow.created_at >= recent_cutoff)
        )
        or 0
    )

    return DiagnosticsResponse(
        canvas_api_url=settings.CANVAS_API_URL,
        backend_uptime_seconds=int(time.monotonic() - backend_started_at),
        health=health,
        instructor_canvas=instructor_canvas,
        # get_provider_statuses() returns plain dicts shaped like
        # LlmProviderStatus -- pydantic validates/coerces them on assignment.
        llm_providers=llm_providers,
        recent_failed_operations_count=recent_failed_operations_count,
    )
