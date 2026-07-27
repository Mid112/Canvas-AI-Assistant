import logging
from datetime import datetime

from sqlalchemy import String, asc, cast, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager

from app.models.audit_log import AuditLog
from app.models.audit_log_session import AuditLogSession
from app.models.user import User
from app.schemas.audit import AuditLogListResponse, AuditLogResponse

logger = logging.getLogger(__name__)

# Safety cap on per-source rows fetched when sorting by a field other than
# timestamp (see list_audit_logs) — a non-timestamp global sort needs the
# full filtered result set fetched before it can be sorted/sliced correctly
# (unlike timestamp, which both tables are already indexed/ordered by), so
# this bounds how large that single query can get when few/no filters are
# active. Fine at this app's scale; revisit with a real per-field SQL sort
# if this ever becomes a bottleneck.
_MAX_SORT_ROWS = 5000


def _sort_key(item: AuditLogResponse, field: str) -> tuple[str, str] | str | datetime:
    if field == "user":
        return (item.user_email, item.user_role)
    if field == "action":
        return item.action
    if field == "resource":
        return item.resource_type
    if field == "result":
        return item.status
    return item.timestamp

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
# SESSION_ACTION_META at read time (see _session_row_to_response above), so
# filtering/searching by result needs the reverse mapping: which actions
# produce a given status.
_SESSION_ACTIONS_BY_STATUS: dict[str, set[str]] = {}
for _action_name, (_resource_type, _operation, _status) in SESSION_ACTION_META.items():
    _SESSION_ACTIONS_BY_STATUS.setdefault(_status, set()).add(_action_name)


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
    search: str | None = None,
    action: str | None = None,
    user_search: str | None = None,
    result: str | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    sort_field: str = "timestamp",
    sort_direction: str = "desc",
) -> AuditLogListResponse:
    """Server-side search/filter over both audit sources, so results are
    correct against the full table rather than whatever page happened to be
    loaded client-side (audit_logs/audit_logs_session can run into the tens
    or hundreds of thousands of rows)."""
    # Joined (not joinedload'd) so User columns are available to filter on;
    # contains_eager reuses that same join for eager-loading .user instead
    # of adding a second one.
    workflow_query = select(AuditLog).join(AuditLog.user).options(contains_eager(AuditLog.user))
    workflow_count_query = select(func.count()).select_from(AuditLog).join(AuditLog.user)
    session_query = (
        select(AuditLogSession).join(AuditLogSession.user).options(contains_eager(AuditLogSession.user))
    )
    session_count_query = select(func.count()).select_from(AuditLogSession).join(AuditLogSession.user)

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

    descending = sort_direction != "asc"

    if sort_field == "timestamp":
        # Both sources are already indexed/ordered by timestamp, so the top
        # (offset + limit) rows from each in the requested direction is
        # enough to merge-sort and slice the correct global window below —
        # a simple fetch-then-merge rather than a SQL UNION ALL, fine at
        # this app's scale.
        fetch_cap = offset + limit
        order = desc if descending else asc
        workflow_rows = await db.scalars(
            workflow_query.order_by(order(AuditLog.timestamp)).limit(fetch_cap)
        )
        session_rows = await db.scalars(
            session_query.order_by(order(AuditLogSession.timestamp)).limit(fetch_cap)
        )
    else:
        # A non-timestamp global sort can't be answered from a
        # timestamp-ordered prefix — the row that belongs at a given offset
        # depends on every filtered row, not just the most recent ones — so
        # fetch the full filtered set from each source (capped defensively,
        # see _MAX_SORT_ROWS) and sort in Python below instead.
        workflow_rows = await db.scalars(workflow_query.limit(_MAX_SORT_ROWS))
        session_rows = await db.scalars(session_query.limit(_MAX_SORT_ROWS))
        if workflow_total > _MAX_SORT_ROWS or session_total > _MAX_SORT_ROWS:
            logger.warning(
                "audit log non-timestamp sort capped at %s rows per source "
                "(workflow_total=%s session_total=%s sort_field=%s); "
                "results may omit rows beyond the cap",
                _MAX_SORT_ROWS,
                workflow_total,
                session_total,
                sort_field,
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

    merged = sorted(
        workflow_items + session_items,
        key=lambda item: _sort_key(item, sort_field),
        reverse=descending,
    )
    items = merged[offset : offset + limit]

    return AuditLogListResponse(items=items, total=workflow_total + session_total)
