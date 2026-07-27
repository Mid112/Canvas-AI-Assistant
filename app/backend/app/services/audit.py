import logging
from datetime import datetime

from sqlalchemy import Integer, case, cast, desc, func, literal, select, union_all
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.audit_log_session import AuditLogSession
from app.models.user import User
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


def _session_meta_case(index: int, label: str):
    return case(
        {action: meta[index] for action, meta in SESSION_ACTION_META.items()},
        value=AuditLogSession.action,
        else_=_DEFAULT_SESSION_META[index],
    ).label(label)


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
        user_email=row.user.email if row.user else str(details.get("email", "unknown")),
        user_role=row.user.role if row.user else "unknown",
        details=row.details,
    )


async def list_audit_logs(
    db: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    user_id: int | None = None,
    since: datetime | None = None,
) -> AuditLogListResponse:
    workflow_query = (
        select(
            AuditLog.id.label("id"),
            AuditLog.user_id.label("user_id"),
            AuditLog.workflow_id.label("workflow_id"),
            AuditLog.course_id.label("course_id"),
            AuditLog.action.label("action"),
            AuditLog.resource_type.label("resource_type"),
            AuditLog.resource_id.label("resource_id"),
            AuditLog.operation.label("operation"),
            AuditLog.status.label("status"),
            AuditLog.timestamp.label("timestamp"),
            User.email.label("user_email"),
            User.role.label("user_role"),
            cast(literal(None), JSONB).label("details"),
        )
        .join(User, AuditLog.user_id == User.id)
    )
    workflow_count_query = select(func.count()).select_from(AuditLog)
    session_resource_id = func.coalesce(
        AuditLogSession.details["instructor_id"].as_string(),
        AuditLogSession.details["new_admin_id"].as_string(),
    )
    session_query = (
        select(
            (-AuditLogSession.id).label("id"),
            AuditLogSession.user_id.label("user_id"),
            AuditLogSession.workflow_id.label("workflow_id"),
            cast(literal(None), Integer).label("course_id"),
            AuditLogSession.action.label("action"),
            _session_meta_case(0, "resource_type"),
            session_resource_id.label("resource_id"),
            _session_meta_case(1, "operation"),
            _session_meta_case(2, "status"),
            AuditLogSession.timestamp.label("timestamp"),
            func.coalesce(User.email, AuditLogSession.details["email"].as_string(), literal("unknown")).label(
                "user_email"
            ),
            func.coalesce(User.role, literal("unknown")).label("user_role"),
            AuditLogSession.details.label("details"),
        )
        .outerjoin(User, AuditLogSession.user_id == User.id)
    )
    session_count_query = select(func.count()).select_from(AuditLogSession)

    if user_id is not None:
        workflow_query = workflow_query.where(AuditLog.user_id == user_id)
        workflow_count_query = workflow_count_query.where(AuditLog.user_id == user_id)
        session_query = session_query.where(AuditLogSession.user_id == user_id)
        session_count_query = session_count_query.where(AuditLogSession.user_id == user_id)

    # Applied to both sources so the merged feed, its total, and its
    # pagination all agree — the point of doing this server-side rather than
    # in the frontend's client-side filterAuditLogs is that "total" is then
    # actually the total *within the selected range*, not the all-time total.
    if since is not None:
        workflow_query = workflow_query.where(AuditLog.timestamp >= since)
        workflow_count_query = workflow_count_query.where(AuditLog.timestamp >= since)
        session_query = session_query.where(AuditLogSession.timestamp >= since)
        session_count_query = session_count_query.where(AuditLogSession.timestamp >= since)

    workflow_total = int(await db.scalar(workflow_count_query) or 0)
    session_total = int(await db.scalar(session_count_query) or 0)

    combined = union_all(workflow_query, session_query).subquery()
    rows = (
        await db.execute(
            select(combined)
            .order_by(desc(combined.c.timestamp))
            .offset(offset)
            .limit(limit)
        )
    ).mappings()

    items = [
        AuditLogResponse(
            id=row["id"],
            user_id=row["user_id"],
            workflow_id=row["workflow_id"],
            course_id=row["course_id"],
            action=row["action"],
            resource_type=row["resource_type"],
            resource_id=row["resource_id"],
            operation=row["operation"],
            status=row["status"],
            timestamp=row["timestamp"],
            user_email=row["user_email"],
            user_role=row["user_role"],
            details=row["details"],
        )
        for row in rows
    ]

    unmapped_actions = {
        item.action
        for item in items
        if item.id < 0 and item.action not in SESSION_ACTION_META
    }
    for action in unmapped_actions:
        logger.warning("Unmapped audit_logs_session action %r; add it to SESSION_ACTION_META", action)

    return AuditLogListResponse(items=items, total=workflow_total + session_total)
