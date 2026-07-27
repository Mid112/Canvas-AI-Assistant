"""Append-only log of failed Canvas and AI operations for admin monitoring (Feature 11)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.secret_redaction import redact_secrets
from app.models.audit_log_session import AuditLogSession
from app.models.failed_operation import FailedOperation
from app.models.user import User
from app.schemas.failed_operations import (
    FailedOperationDetailResponse,
    FailedOperationListResponse,
    FailedOperationResponse,
    FailedOperationSummaryResponse,
)

_VALID_SOURCES = frozenset({"canvas", "ai"})
_MAX_ERROR_DETAIL_LEN = 2000
_MAX_CONTEXT_STRING_LEN = 500
_MAX_CONTEXT_KEYS = 40
_MAX_CONTEXT_LIST_ITEMS = 20
_MAX_CONTEXT_DEPTH = 4


def should_record_course_sync_failure(
    *,
    expected_token_issue: bool,
    previous_error: str | None,
    error_detail: str,
) -> bool:
    """Background sweeps tick ~60s. Skip expected token issues and unchanged errors
    so admin monitoring is not flooded with duplicate course_sync rows."""
    if expected_token_issue:
        return False
    return previous_error != error_detail


# Substring match — safe for long secret-ish tokens (e.g. "canvas_access_token").
_SENSITIVE_CONTEXT_KEYS = (
    "token",
    "access_token",
    "refresh_token",
    "api_key",
    "apikey",
    "authorization",
    "password",
    "secret",
    "credential",
)

# Exact key match only — short free-text / PII fields (substring would false-
# positive on keys like "context" matching "text").
_SENSITIVE_EXACT_CONTEXT_KEYS = frozenset({
    "body",
    "subject",
    "message",
    "content",
    "text",
    "prompt",
    "description",
    "admin_notes",
    "reason",
})


def _is_sensitive_context_key(key: str) -> bool:
    lowered = key.lower()
    if lowered in _SENSITIVE_EXACT_CONTEXT_KEYS:
        return True
    return any(part in lowered for part in _SENSITIVE_CONTEXT_KEYS)


def _json_safe_value(value: Any, *, depth: int = 0, sensitive: bool = False) -> Any:
    if depth > _MAX_CONTEXT_DEPTH:
        return "[truncated]"
    if value is None or isinstance(value, bool | int | float):
        return "[REDACTED]" if sensitive else value
    if isinstance(value, str):
        if sensitive:
            return "[REDACTED]"
        redacted = redact_secrets(value)
        if len(redacted) > _MAX_CONTEXT_STRING_LEN:
            return redacted[:_MAX_CONTEXT_STRING_LEN] + "…"
        return redacted
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for i, (key, item) in enumerate(value.items()):
            if i >= _MAX_CONTEXT_KEYS:
                out["…"] = f"{len(value) - _MAX_CONTEXT_KEYS} more keys"
                break
            key_str = str(key)[:80]
            out[key_str] = _json_safe_value(
                item,
                depth=depth + 1,
                sensitive=sensitive or _is_sensitive_context_key(key_str),
            )
        return out
    if isinstance(value, list | tuple):
        items = [
            _json_safe_value(item, depth=depth + 1, sensitive=sensitive)
            for item in value[:_MAX_CONTEXT_LIST_ITEMS]
        ]
        if len(value) > _MAX_CONTEXT_LIST_ITEMS:
            items.append(f"…{len(value) - _MAX_CONTEXT_LIST_ITEMS} more")
        return items
    return "[REDACTED]" if sensitive else str(value)[:_MAX_CONTEXT_STRING_LEN]


def _sanitize_context(context_json: dict[str, Any] | None) -> dict[str, Any]:
    if not context_json:
        return {}
    sanitized = _json_safe_value(context_json)
    return sanitized if isinstance(sanitized, dict) else {"value": sanitized}


# Known (source, operation) pairs get a tailored plain-language summary;
# anything else (mostly dynamic workflow.action_name values like
# "update_assignment"/"create_quiz") falls back to a humanized generic
# phrase in summarize_failure() below.
_KNOWN_OPERATION_SUMMARIES: dict[tuple[str, str], str] = {
    ("canvas", "course_sync"): "This course couldn't be synced from Canvas.",
    ("ai", "assistant_chat"): "The AI assistant couldn't complete this request.",
    ("ai", "ai_draft"): "The AI assistant couldn't generate a draft.",
}


def summarize_failure(source: str, operation: str) -> str:
    """Plain-language description generated at write time (point of
    failure), so the admin dashboard's default view never has to translate
    raw error text/operation codes at render time. See _KNOWN_OPERATION_SUMMARIES
    for the tailored cases; everything else (chiefly dynamic Canvas workflow
    action names) gets a humanized generic phrase."""
    known = _KNOWN_OPERATION_SUMMARIES.get((source, operation))
    if known:
        return known

    phrase = operation.replace("_", " ").strip() or "operation"
    if source == "canvas":
        return f"Canvas couldn't {phrase}."
    return f"The AI assistant couldn't {phrase}."


def _to_response(row: FailedOperation) -> FailedOperationResponse:
    user_name = None
    if row.context_json:
        raw_name = row.context_json.get("user_name")
        if isinstance(raw_name, str):
            user_name = raw_name
    if user_name is None and row.user is not None:
        user_name = row.user.name

    return FailedOperationResponse(
        id=row.id,
        source=row.source,  # type: ignore[arg-type]
        operation=row.operation,
        user_id=row.user_id,
        user_name=user_name,
        course_id=row.course_id,
        conversation_id=row.conversation_id,
        workflow_id=row.workflow_id,
        tool_call_id=row.tool_call_id,
        provider=row.provider,
        human_summary=row.human_summary,
        created_at=row.created_at,
    )


def _to_detail_response(row: FailedOperation) -> FailedOperationDetailResponse:
    summary = _to_response(row)
    return FailedOperationDetailResponse(
        **summary.model_dump(),
        error_detail=row.error_detail,
        context_json=row.context_json or {},
    )


async def record_failed_operation(
    db: AsyncSession,
    *,
    source: str,
    operation: str,
    error_detail: str,
    user_id: int | None = None,
    course_id: int | None = None,
    conversation_id: int | None = None,
    workflow_id: int | None = None,
    tool_call_id: int | None = None,
    provider: str | None = None,
    context_json: dict[str, Any] | None = None,
) -> FailedOperation:
    """Persist one failed-operation row. Flushes only — caller commits."""
    if source not in _VALID_SOURCES:
        raise ValueError(f"source must be one of {sorted(_VALID_SOURCES)}, got {source!r}")

    op = (operation or "").strip()[:120] or "unknown"
    detail = (
        redact_secrets(error_detail or "").strip()[:_MAX_ERROR_DETAIL_LEN] or "Unknown error"
    )
    context = _sanitize_context(context_json)
    if user_id is not None:
        user = await db.get(User, user_id)
        if user is not None and user.name:
            context["user_name"] = user.name[:200]

    row = FailedOperation(
        source=source,
        operation=op,
        user_id=user_id,
        course_id=course_id,
        conversation_id=conversation_id,
        workflow_id=workflow_id,
        tool_call_id=tool_call_id,
        provider=(provider.strip()[:64] if isinstance(provider, str) and provider.strip() else None),
        error_detail=detail,
        context_json=context,
        human_summary=summarize_failure(source, op),
    )
    db.add(row)
    await db.flush()
    return row


def _apply_filters(
    query,
    *,
    source: str | None,
    operation: str | None,
    user_id: int | None,
    since: datetime | None,
):
    if source is not None:
        query = query.where(FailedOperation.source == source)
    if operation is not None:
        query = query.where(FailedOperation.operation == operation)
    if user_id is not None:
        query = query.where(FailedOperation.user_id == user_id)
    if since is not None:
        query = query.where(FailedOperation.created_at >= since)
    return query


async def list_failed_operations(
    db: AsyncSession,
    *,
    source: str | None = None,
    operation: str | None = None,
    user_id: int | None = None,
    hours: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> FailedOperationListResponse:
    since = None
    if hours is not None:
        since = datetime.now(UTC) - timedelta(hours=hours)

    base_query = select(FailedOperation).options(selectinload(FailedOperation.user))
    count_query = select(func.count()).select_from(FailedOperation)
    canvas_count_query = (
        select(func.count())
        .select_from(FailedOperation)
        .where(FailedOperation.source == "canvas")
    )
    ai_count_query = (
        select(func.count())
        .select_from(FailedOperation)
        .where(FailedOperation.source == "ai")
    )

    base_query = _apply_filters(
        base_query,
        source=source,
        operation=operation,
        user_id=user_id,
        since=since,
    )
    count_query = _apply_filters(
        count_query,
        source=source,
        operation=operation,
        user_id=user_id,
        since=since,
    )
    canvas_count_query = _apply_filters(
        canvas_count_query,
        source=source,
        operation=operation,
        user_id=user_id,
        since=since,
    )
    ai_count_query = _apply_filters(
        ai_count_query,
        source=source,
        operation=operation,
        user_id=user_id,
        since=since,
    )

    total = int(await db.scalar(count_query) or 0)
    canvas_count = int(await db.scalar(canvas_count_query) or 0)
    ai_count = int(await db.scalar(ai_count_query) or 0)

    rows = await db.scalars(
        base_query.order_by(desc(FailedOperation.created_at)).offset(offset).limit(limit)
    )

    return FailedOperationListResponse(
        items=[_to_response(row) for row in rows],
        total=total,
        canvas_count=canvas_count,
        ai_count=ai_count,
    )


async def get_failed_operation(
    db: AsyncSession,
    failed_operation_id: int,
    *,
    viewer: User,
) -> FailedOperationDetailResponse:
    """Returns the full detail (raw error_detail/context_json), which can
    contain FERPA-sensitive course/user data. Every call writes an
    AuditLogSession "failed_operation_viewed" row first — an audit trail of
    who looked at raw failure detail and when (see SESSION_ACTION_META in
    services/audit.py, which is what surfaces this row in the Audit Logs
    page)."""
    row = await db.scalar(
        select(FailedOperation)
        .options(selectinload(FailedOperation.user))
        .where(FailedOperation.id == failed_operation_id)
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Failed operation not found.",
        )

    # Build the response before committing the view audit so a serialization
    # failure cannot leave a "viewed" row for a detail that never rendered.
    response = _to_detail_response(row)
    db.add(
        AuditLogSession(
            user_id=viewer.id,
            workflow_id=row.workflow_id,
            action="failed_operation_viewed",
            details={"failed_operation_id": row.id},
        )
    )
    await db.commit()
    return response


async def get_failed_operations_summary(
    db: AsyncSession,
    *,
    hours: int = 24,
) -> FailedOperationSummaryResponse:
    since = datetime.now(UTC) - timedelta(hours=hours)
    total = int(
        await db.scalar(
            select(func.count())
            .select_from(FailedOperation)
            .where(FailedOperation.created_at >= since)
        )
        or 0
    )
    canvas_count = int(
        await db.scalar(
            select(func.count())
            .select_from(FailedOperation)
            .where(
                FailedOperation.created_at >= since,
                FailedOperation.source == "canvas",
            )
        )
        or 0
    )
    ai_count = int(
        await db.scalar(
            select(func.count())
            .select_from(FailedOperation)
            .where(
                FailedOperation.created_at >= since,
                FailedOperation.source == "ai",
            )
        )
        or 0
    )
    return FailedOperationSummaryResponse(
        total=total,
        canvas_count=canvas_count,
        ai_count=ai_count,
        hours=hours,
    )
