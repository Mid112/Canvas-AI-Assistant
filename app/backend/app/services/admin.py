from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.models.workflow import Workflow

DEFAULT_ADMIN_SETTINGS = {
    "organization_name": "Canvas Helper",
    "allow_instructor_self_registration": True,
    "session_timeout_minutes": 30,
}


async def get_dashboard_stats(db: AsyncSession) -> dict:
    instructor_count = await db.scalar(
        select(func.count()).select_from(User).where(User.role == "instructor")
    )
    admin_count = await db.scalar(
        select(func.count()).select_from(User).where(User.role == "admin")
    )
    active_workflows = await db.scalar(
        select(func.count()).select_from(Workflow).where(Workflow.status == "pending")
    )
    week_ago = datetime.now(UTC) - timedelta(days=7)
    audit_events = await db.scalar(
        select(func.count()).select_from(AuditLog).where(AuditLog.timestamp >= week_ago)
    )

    return {
        "instructor_count": instructor_count or 0,
        "admin_count": admin_count or 0,
        "active_workflows": active_workflows or 0,
        "audit_events_last_7_days": audit_events or 0,
    }


async def get_admin_settings(db: AsyncSession) -> dict:
    rows = await db.scalars(select(SystemSetting))
    settings = dict(DEFAULT_ADMIN_SETTINGS)
    for row in rows:
        if isinstance(row.value, dict):
            settings.update(row.value)
        else:
            settings[row.key] = row.value
    return settings


async def update_admin_settings(db: AsyncSession, new_settings: dict) -> dict:
    for key, value in new_settings.items():
        existing = await db.get(SystemSetting, key)
        if existing:
            existing.value = value if isinstance(value, dict) else {"value": value}
            existing.updated_at = datetime.now(UTC)
        else:
            db.add(SystemSetting(key=key, value=value if isinstance(value, dict) else {"value": value}))

    await db.commit()
    return await get_admin_settings(db)
