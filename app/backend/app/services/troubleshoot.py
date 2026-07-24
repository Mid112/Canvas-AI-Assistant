import time
from datetime import UTC, datetime, timedelta

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.config import settings
from app.core.secret_redaction import redact_secrets
from app.models.workflow import Workflow
from app.schemas.troubleshoot import DiagnosticsResponse, FailedOperation, FailedOperationListResponse
from app.services.health import get_instructor_canvas_summary, get_latest_health_status
from app.services.llm.provider_registry import get_provider_statuses

# Failed workflows older than this don't count toward the diagnostics
# summary's "recent" count -- an outage from last week shouldn't still read
# as an active problem today (mirrors _AI_FAILURE_RECENT_HOURS in health.py,
# just on a longer window since a failed write is rarer than an AI call).
_RECENT_FAILURE_HOURS = 24


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
