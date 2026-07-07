from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_admin_user, get_current_user
from app.models.user import User
from app.schemas.audit import AuditLogResponse
from app.services.audit import list_audit_logs

router = APIRouter(prefix="/audit", tags=["audit"])
admin_router = APIRouter(prefix="/admin/audit", tags=["audit"])


@router.get("/logs", response_model=list[AuditLogResponse])
async def get_audit_logs(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = None if current_user.role == "admin" else current_user.id
    return (await list_audit_logs(db, limit=limit, offset=offset, user_id=user_id)).items


@admin_router.get("/logs", response_model=list[AuditLogResponse])
async def get_admin_audit_logs_alias(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return (await list_audit_logs(db, limit=limit, offset=offset)).items
