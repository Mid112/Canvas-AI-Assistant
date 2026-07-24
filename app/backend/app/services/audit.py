import logging

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.audit_log import AuditLog
from app.models.audit_log_session import AuditLogSession
from app.schemas.audit import AuditLogListResponse, AuditLogResponse

logger = logging.getLogger(__name__)

# AuditLogSession.action -> (resource_type, operation, status), so session
# rows render through the same AuditLogResponse shape as audit_logs rows.
# Every action written anywhere via `AuditLogSession(...)` must be listed
# here (services/auth.py, services/admin.py, core/seeder.py) — an omission
# doesn't error, it just falls back to _DEFAULT_SESSION_META (with a log
# warning), so check the logs after adding a new action string.
SESSION_ACTION_META: dict[str, tuple[str, str, str]] = {
    "admin_login": ("session", "login", "success"),
    "admin_logout": ("session", "logout", "success"),
    "instructor_login": ("session", "login", "success"),
    "instructor_logout": ("session", "logout", "success"),
    "login_failed": ("session", "login", "failed"),
    "instructor_registered": ("instructor_account", "create", "success"),
    "admin_seeded": ("admin_account", "create", "success"),
    "profile_updated": ("account", "update", "success"),
    "password_changed": ("account", "update", "success"),
    "password_reset": ("account", "update", "success"),
    "password_reset_requested": ("account", "update", "success"),
    "account_deleted": ("account", "delete", "success"),
    "canvas_connection_added": ("canvas_connection", "create", "success"),
    "canvas_connection_updated": ("canvas_connection", "update", "success"),
    "canvas_connection_removed": ("canvas_connection", "delete", "success"),
    "admin_created": ("admin_account", "create", "success"),
    "instructor_account_created": ("instructor_account", "create", "success"),
    "instructor_account_updated": ("instructor_account", "update", "success"),
    "instructor_account_enabled": ("instructor_account", "enable", "success"),
    "instructor_account_disabled": ("instructor_account", "disable", "success"),
    "instructor_access_revoked": ("instructor_account", "revoke", "success"),
    "llm_provider_configuration_updated": ("system_setting", "update", "success"),
    "admin_settings_updated": ("system_setting", "update", "success"),
}
_DEFAULT_SESSION_META: tuple[str, str, str] = ("account", "update", "success")

_SESSION_RESOURCE_ID_KEYS = ("instructor_id", "new_admin_id")


def _session_row_to_response(row: AuditLogSession) -> AuditLogResponse:
    meta = SESSION_ACTION_META.get(row.action)
    if meta is None:
        logger.warning("Unmapped audit_logs_session action %r; add it to SESSION_ACTION_META", row.action)
        meta = _DEFAULT_SESSION_META
    resource_type, operation, row_status = meta
    details = row.details or {}
    resource_id = next(
        (str(details[key]) for key in _SESSION_RESOURCE_ID_KEYS if key in details),
        None,
    )

    return AuditLogResponse(
        # Negate: audit_logs and audit_logs_session are independent id
        # sequences, and the frontend uses this as a React list key.
        id=-row.id,
        user_id=row.user_id,
        workflow_id=row.workflow_id,
        course_id=None,
        action=row.action,
        resource_type=resource_type,
        resource_id=resource_id,
        operation=operation,
        status=row_status,
        timestamp=row.timestamp,
        user_email=row.user.email,
        user_role=row.user.role,
        details=row.details,
    )


async def list_audit_logs(
    db: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    user_id: int | None = None,
) -> AuditLogListResponse:
    workflow_query = select(AuditLog).options(joinedload(AuditLog.user))
    workflow_count_query = select(func.count()).select_from(AuditLog)
    session_query = select(AuditLogSession).options(joinedload(AuditLogSession.user))
    session_count_query = select(func.count()).select_from(AuditLogSession)

    if user_id is not None:
        workflow_query = workflow_query.where(AuditLog.user_id == user_id)
        workflow_count_query = workflow_count_query.where(AuditLog.user_id == user_id)
        session_query = session_query.where(AuditLogSession.user_id == user_id)
        session_count_query = session_count_query.where(AuditLogSession.user_id == user_id)

    workflow_total = int(await db.scalar(workflow_count_query) or 0)
    session_total = int(await db.scalar(session_count_query) or 0)

    # Both sources are already sorted desc by timestamp, so the top
    # (offset + limit) rows from each is enough to merge-sort and slice the
    # correct global window below — a simple fetch-then-merge rather than a
    # SQL UNION ALL, fine at this app's scale.
    fetch_cap = offset + limit
    workflow_rows = await db.scalars(
        workflow_query.order_by(desc(AuditLog.timestamp)).limit(fetch_cap)
    )
    session_rows = await db.scalars(
        session_query.order_by(desc(AuditLogSession.timestamp)).limit(fetch_cap)
    )

    workflow_items = [
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
        for row in workflow_rows
    ]
    session_items = [_session_row_to_response(row) for row in session_rows]

    merged = sorted(workflow_items + session_items, key=lambda item: item.timestamp, reverse=True)
    items = merged[offset : offset + limit]

    return AuditLogListResponse(items=items, total=workflow_total + session_total)
