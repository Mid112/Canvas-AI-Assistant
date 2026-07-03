from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


async def list_audit_logs(
    db: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    user_id: int | None = None,
) -> tuple[list[AuditLog], int]:
    query = select(AuditLog)
    count_query = select(func.count()).select_from(AuditLog)

    if user_id is not None:
        query = query.where(AuditLog.user_id == user_id)
        count_query = count_query.where(AuditLog.user_id == user_id)

    total = await db.scalar(count_query) or 0
    rows = await db.scalars(
        query.order_by(desc(AuditLog.timestamp)).offset(offset).limit(limit)
    )
    return list(rows), int(total)
