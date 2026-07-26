from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_admin_user, get_current_user
from app.models.user import User
from app.schemas.audit import AuditLogListResponse
from app.services.audit import list_audit_logs

router = APIRouter(prefix="/audit", tags=["audit"])
admin_router = APIRouter(prefix="/admin/audit", tags=["audit"])


def _since_from_range_days(range_days: int | None) -> datetime | None:
    if range_days is None:
        return None
    return datetime.now(UTC) - timedelta(days=range_days)


@router.get("/logs", response_model=AuditLogListResponse)
async def get_audit_logs(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    # Bounds how far back the audit feed looks (e.g. 7/30/90) — the Audit
    # Logs page's range filter. Omitted means all time.
    range_days: int | None = Query(default=None, ge=1, le=3650),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = None if current_user.role == "admin" else current_user.id
    return await list_audit_logs(
        db,
        limit=limit,
        offset=offset,
        user_id=user_id,
        since=_since_from_range_days(range_days),
    )


@admin_router.get("/logs", response_model=AuditLogListResponse)
async def get_admin_audit_logs_alias(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    range_days: int | None = Query(default=None, ge=1, le=3650),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_audit_logs(
        db, limit=limit, offset=offset, since=_since_from_range_days(range_days)
    )
