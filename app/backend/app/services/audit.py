from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.audit_log import AuditLog
from app.schemas.audit import AuditLogListResponse, AuditLogResponse


async def list_audit_logs(
    db: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    user_id: int | None = None,
) -> AuditLogListResponse:
    query = select(AuditLog).options(joinedload(AuditLog.user))
    count_query = select(func.count()).select_from(AuditLog)

    if user_id is not None:
        query = query.where(AuditLog.user_id == user_id)
        count_query = count_query.where(AuditLog.user_id == user_id)

    total = int(await db.scalar(count_query) or 0)
    rows = await db.scalars(
        query.order_by(desc(AuditLog.timestamp)).offset(offset).limit(limit)
    )

    items = [
        AuditLogResponse(
            id=row.id,
            user_id=row.user_id,
            workflow_id=row.workflow_id,
            course_id=row.course_id,
            action=row.action,
            resource_type=row.resource_type,
            resource_id=row.resource_id,
            operation=row.operation,
            status=row.status,
            timestamp=row.timestamp,
            user_email=row.user.email,
            user_role=row.user.role,
        )
        for row in rows
    ]

    return AuditLogListResponse(items=items, total=total)
