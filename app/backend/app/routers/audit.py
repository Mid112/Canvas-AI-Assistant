from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_admin_user, get_current_user
from app.models.user import User
from app.schemas.audit import AuditLogListResponse
from app.services.audit import list_audit_logs

router = APIRouter(prefix="/audit", tags=["audit"])
admin_router = APIRouter(prefix="/admin/audit", tags=["audit"])


AuditLogSortField = Literal["timestamp", "user", "action", "resource", "result"]
AuditLogSortDirection = Literal["asc", "desc"]


@router.get("/logs", response_model=AuditLogListResponse)
async def get_audit_logs(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None, max_length=200),
    action: str | None = Query(default=None, max_length=200),
    user: str | None = Query(default=None, max_length=200),
    result: Literal["success", "failed", "unknown"] | None = Query(default=None),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
    sort_field: AuditLogSortField = Query(default="timestamp"),
    sort_direction: AuditLogSortDirection = Query(default="desc"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = None if current_user.role == "admin" else current_user.id
    return await list_audit_logs(
        db,
        limit=limit,
        offset=offset,
        user_id=user_id,
        search=search,
        action=action,
        user_search=user,
        result=result,
        start_time=start_time,
        end_time=end_time,
        sort_field=sort_field,
        sort_direction=sort_direction,
    )


@admin_router.get("/logs", response_model=AuditLogListResponse)
async def get_admin_audit_logs_alias(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None, max_length=200),
    action: str | None = Query(default=None, max_length=200),
    user: str | None = Query(default=None, max_length=200),
    result: Literal["success", "failed", "unknown"] | None = Query(default=None),
    start_time: datetime | None = Query(default=None),
    end_time: datetime | None = Query(default=None),
    sort_field: AuditLogSortField = Query(default="timestamp"),
    sort_direction: AuditLogSortDirection = Query(default="desc"),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_audit_logs(
        db,
        limit=limit,
        offset=offset,
        search=search,
        action=action,
        user_search=user,
        result=result,
        start_time=start_time,
        end_time=end_time,
        sort_field=sort_field,
        sort_direction=sort_direction,
    )
