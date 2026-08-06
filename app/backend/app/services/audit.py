"""Service note: owns backend audit business logic behind routers, tests, and assistant tool execution."""

import logging
from datetime import datetime

from sqlalchemy import Integer, String, asc, case, cast, desc, func, literal, or_, select, union_all
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
# doesn't error, it just falls back to _DEFAULT_SESSION_META (flagged after
# the fact via the unmapped-action warning below), so check the logs after
# adding a new action string.
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
    # Written by services/failed_operations.py::get_failed_operation on every
    # call — the audit trail of the audit tool: who looked at a failed
    # operation's raw (potentially FERPA-sensitive) error_detail/context_json.
    "failed_operation_viewed": ("failed_operation", "view", "success"),
    # Written by services/admin.py::reset_instructor_canvas_token — an admin
    # replacing an instructor's Canvas token on their behalf (support flow).
    "instructor_canvas_token_reset": ("canvas_connection", "update", "success"),
}
_DEFAULT_SESSION_META: tuple[str, str, str] = ("account", "update", "success")

_SESSION_RESOURCE_ID_KEYS = ("instructor_id", "new_admin_id")

# audit_logs_session has no `status` column -- its status is derived from
# SESSION_ACTION_META at read time (see _session_meta_case below), so
# filtering/searching by result needs the reverse mapping: which actions
# produce a given status.
_SESSION_ACTIONS_BY_STATUS: dict[str, set[str]] = {}
for _action_name, (_resource_type, _operation, _status) in SESSION_ACTION_META.items():
    _SESSION_ACTIONS_BY_STATUS.setdefault(_status, set()).add(_action_name)

# sort_field (validated by the router's Literal) -> the merged subquery
# column it corresponds to.
_SORT_COLUMNS: dict[str, str] = {
    "timestamp": "timestamp",
    "user": "user_email",
    "action": "action",
    "resource": "resource_type",
    "result": "status",
}


def _session_meta_case(index: int, label: str):
    return case(
        {action: meta[index] for action, meta in SESSION_ACTION_META.items()},
        value=AuditLogSession.action,
        else_=_DEFAULT_SESSION_META[index],
    ).label(label)


async def list_audit_logs(
    db: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    user_id: int | None = None,
    search: str | None = None,
    action: str | None = None,
    user_search: str | None = None,
    result: str | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    sort_field: str = "timestamp",
    sort_direction: str = "desc",
) -> AuditLogListResponse:
    """Server-side search/filter/sort over both audit sources, merged via a
    single SQL UNION ALL with one ORDER BY/LIMIT/OFFSET over the combined
    result.

    A prior version fetched the top (offset + limit) rows from each source
    by timestamp and merged/sliced in Python for the timestamp-sort case —
    that's actually correct (any row within the global top K must be within
    its own source's top K too, so the two per-source top-K lists always
    contain every candidate for a [0, K) window), just an optimization over
    a real UNION ALL. The real gap was the *other* branch, for non-timestamp
    sorts: it fetched up to `_MAX_SORT_ROWS` (5000) full rows per source and
    sorted in Python, silently omitting anything beyond that cap once a
    source's filtered total passed it. A single UNION ALL/ORDER BY/LIMIT/
    OFFSET is correct for every sort field with no such cap, and replaces
    both branches with one simpler, cheaper-per-request query.
    """
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
    workflow_count_query = select(func.count()).select_from(AuditLog).join(User, AuditLog.user_id == User.id)

    session_resource_id = func.coalesce(
        AuditLogSession.details["instructor_id"].as_string(),
        AuditLogSession.details["new_admin_id"].as_string(),
    )
    # Outer join: audit_logs_session.user_id is nullable for anonymous
    # failed-login attempts against unknown emails (see
    # 036_audit_log_session_nullable_user.sql) — an inner join would
    # silently drop those rows from the audit trail entirely. user_email/
    # user_role fall back to the attempted email (from details) and
    # "unknown" so those rows still render.
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
            func.coalesce(
                User.email, AuditLogSession.details["email"].as_string(), literal("unknown")
            ).label("user_email"),
            func.coalesce(User.role, literal("unknown")).label("user_role"),
            AuditLogSession.details.label("details"),
        )
        .outerjoin(User, AuditLogSession.user_id == User.id)
    )
    session_count_query = (
        select(func.count()).select_from(AuditLogSession).outerjoin(User, AuditLogSession.user_id == User.id)
    )

    if user_id is not None:
        workflow_query = workflow_query.where(AuditLog.user_id == user_id)
        workflow_count_query = workflow_count_query.where(AuditLog.user_id == user_id)
        session_query = session_query.where(AuditLogSession.user_id == user_id)
        session_count_query = session_count_query.where(AuditLogSession.user_id == user_id)

    if action:
        term = f"%{action}%"
        workflow_query = workflow_query.where(AuditLog.action.ilike(term))
        workflow_count_query = workflow_count_query.where(AuditLog.action.ilike(term))
        session_query = session_query.where(AuditLogSession.action.ilike(term))
        session_count_query = session_count_query.where(AuditLogSession.action.ilike(term))

    if user_search:
        term = f"%{user_search}%"
        user_clause = or_(User.email.ilike(term), User.role.ilike(term))
        workflow_query = workflow_query.where(user_clause)
        workflow_count_query = workflow_count_query.where(user_clause)
        session_query = session_query.where(user_clause)
        session_count_query = session_count_query.where(user_clause)

    if result:
        workflow_query = workflow_query.where(AuditLog.status == result)
        workflow_count_query = workflow_count_query.where(AuditLog.status == result)
        matching_actions = _SESSION_ACTIONS_BY_STATUS.get(result, set())
        session_query = session_query.where(AuditLogSession.action.in_(matching_actions))
        session_count_query = session_count_query.where(AuditLogSession.action.in_(matching_actions))

    if start_time is not None:
        workflow_query = workflow_query.where(AuditLog.timestamp >= start_time)
        workflow_count_query = workflow_count_query.where(AuditLog.timestamp >= start_time)
        session_query = session_query.where(AuditLogSession.timestamp >= start_time)
        session_count_query = session_count_query.where(AuditLogSession.timestamp >= start_time)

    if end_time is not None:
        workflow_query = workflow_query.where(AuditLog.timestamp < end_time)
        workflow_count_query = workflow_count_query.where(AuditLog.timestamp < end_time)
        session_query = session_query.where(AuditLogSession.timestamp < end_time)
        session_count_query = session_count_query.where(AuditLogSession.timestamp < end_time)

    if search:
        term = f"%{search}%"
        workflow_search_clause = or_(
            AuditLog.action.ilike(term),
            AuditLog.resource_type.ilike(term),
            AuditLog.resource_id.ilike(term),
            User.email.ilike(term),
        )
        session_search_clause = or_(
            AuditLogSession.action.ilike(term),
            User.email.ilike(term),
            cast(AuditLogSession.details, String).ilike(term),
        )
        workflow_query = workflow_query.where(workflow_search_clause)
        workflow_count_query = workflow_count_query.where(workflow_search_clause)
        session_query = session_query.where(session_search_clause)
        session_count_query = session_count_query.where(session_search_clause)

    workflow_total = int(await db.scalar(workflow_count_query) or 0)
    session_total = int(await db.scalar(session_count_query) or 0)

    combined = union_all(workflow_query, session_query).subquery()
    sort_column = combined.c[_SORT_COLUMNS.get(sort_field, "timestamp")]
    order = desc if sort_direction != "asc" else asc
    rows = (
        await db.execute(
            select(combined)
            .order_by(order(sort_column), order(combined.c.id))
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
        item.action for item in items if item.id < 0 and item.action not in SESSION_ACTION_META
    }
    for unmapped_action in unmapped_actions:
        logger.warning("Unmapped audit_logs_session action %r; add it to SESSION_ACTION_META", unmapped_action)

    return AuditLogListResponse(items=items, total=workflow_total + session_total)
