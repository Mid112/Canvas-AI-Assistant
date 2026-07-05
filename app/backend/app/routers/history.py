from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.dependencies import get_admin_user, get_current_user
from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.workflow import Workflow
from app.schemas.history import AuditLogResponse, WorkflowHistoryResponse

router = APIRouter(tags=["history"])


@router.get("/workflows/history", response_model=list[WorkflowHistoryResponse])
async def list_workflow_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    result = await db.scalars(
        select(Workflow)
        .where(Workflow.user_id == current_user.id)
        .order_by(Workflow.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(result)


@router.get("/audit/logs", response_model=list[AuditLogResponse])
async def list_my_audit_logs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    result = await db.scalars(
        select(AuditLog)
        .where(AuditLog.user_id == current_user.id)
        .options(selectinload(AuditLog.user))
        .order_by(AuditLog.timestamp.desc())
        .offset(offset)
        .limit(limit)
    )
    return [_audit_log_response(log) for log in result]


@router.get("/admin/audit/logs", response_model=list[AuditLogResponse])
async def list_admin_audit_logs(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    result = await db.scalars(
        select(AuditLog)
        .options(selectinload(AuditLog.user))
        .order_by(AuditLog.timestamp.desc())
        .offset(offset)
        .limit(limit)
    )
    return [_audit_log_response(log) for log in result]


def _audit_log_response(log: AuditLog) -> AuditLogResponse:
    return AuditLogResponse(
        id=log.id,
        user_id=log.user_id,
        user_email=log.user.email,
        user_role=log.user.role,
        workflow_id=log.workflow_id,
        course_id=log.course_id,
        action=log.action,
        resource_type=log.resource_type,
        resource_id=log.resource_id,
        operation=log.operation,
        status=log.status,
        before_data=log.before_data,
        after_data=log.after_data,
        request_payload=log.request_payload,
        timestamp=log.timestamp,
    )
