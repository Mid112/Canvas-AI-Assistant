from datetime import UTC, datetime, timedelta
from typing import Any, cast

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.secret_redaction import redact_secrets
from app.core.security import hash_password
from app.models.audit_log import AuditLog
from app.models.audit_log_session import AuditLogSession
from app.models.canvas_connection import CanvasConnection
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.models.workflow import Workflow
from app.schemas.admin import (
    AdminCanvasConnectionResponse,
    CreateAdminRequest,
    CreateInstructorRequest,
    UpdateInstructorRequest,
)
from app.schemas.llm_provider import LlmProviderConfig
from app.services.llm.provider_registry import (
    ACTIVE_MODEL_KEY,
    ACTIVE_PROVIDER_KEY,
    CACHE_ENABLED_KEY,
    CACHE_TTL_KEY,
    FALLBACK_MODEL_KEY,
    FALLBACK_PROVIDER_KEY,
    KNOWN_PROVIDER_IDS,
    LLM_SETTING_KEYS,
    get_active_llm_config,
    get_provider_definition,
)

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
    # Two independent tables back the audit viewer (see services/audit.py's
    # list_audit_logs): AuditLog for workflow events, AuditLogSession for
    # session/security/admin events. Both count as audit events in the
    # viewer, so both must count here too, or this undercounts relative to
    # what the admin sees when they open the audit log page.
    workflow_audit_events = await db.scalar(
        select(func.count()).select_from(AuditLog).where(AuditLog.timestamp >= week_ago)
    )
    session_audit_events = await db.scalar(
        select(func.count()).select_from(AuditLogSession).where(AuditLogSession.timestamp >= week_ago)
    )

    return {
        "instructor_count": instructor_count or 0,
        "admin_count": admin_count or 0,
        "active_workflows": active_workflows or 0,
        "audit_events_last_7_days": (workflow_audit_events or 0) + (session_audit_events or 0),
    }


async def get_admin_settings(db: AsyncSession) -> dict:
    rows = await db.scalars(select(SystemSetting))
    settings = dict(DEFAULT_ADMIN_SETTINGS)
    for row in rows:
        # key is the setting name and value is that setting's own value
        # (whatever JSON-compatible shape it is) — no wrapping needed, since
        # JSONB stores scalars natively.
        if row.key not in LLM_SETTING_KEYS:
            settings[row.key] = row.value
    return settings


async def update_admin_settings(db: AsyncSession, new_settings: dict, admin: User) -> dict:
    protected_keys = LLM_SETTING_KEYS.intersection(new_settings)
    if protected_keys:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="LLM settings must be updated through the provider configuration endpoint.",
        )
    for key, value in new_settings.items():
        existing = await db.get(SystemSetting, key)
        if existing:
            existing.value = value
            existing.updated_at = datetime.now(UTC)
        else:
            db.add(SystemSetting(key=key, value=value))

    # changed_keys only, deliberately not the values themselves — LLM keys
    # are blocked above, but a future admin setting could hold something
    # sensitive, and persisting whatever's passed in verbatim would leak it
    # into the audit trail (which admins can view/export) the moment that
    # happens. The keys alone are enough for an audit record.
    db.add(AuditLogSession(
        user_id=admin.id,
        action="admin_settings_updated",
        details={"changed_keys": list(new_settings.keys())},
    ))
    await db.commit()
    return await get_admin_settings(db)


async def get_llm_provider_config(db: AsyncSession) -> LlmProviderConfig:
    config = await get_active_llm_config(db)
    return LlmProviderConfig(
        provider=config.provider,
        model=config.model,
        fallback_provider=config.fallback_provider,
        fallback_model=config.fallback_model,
        cache_enabled=config.cache_enabled,
        cache_ttl_seconds=config.cache_ttl_seconds,
    )


async def update_llm_provider_config(
    db: AsyncSession,
    config: LlmProviderConfig,
    admin: User,
) -> LlmProviderConfig:
    if config.provider not in KNOWN_PROVIDER_IDS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Unknown LLM provider: {config.provider}",
        )
    if config.fallback_provider and config.fallback_provider not in KNOWN_PROVIDER_IDS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Unknown LLM provider: {config.fallback_provider}",
        )

    get_provider_definition(config.provider)
    if config.fallback_provider:
        get_provider_definition(config.fallback_provider)

    values: dict[str, Any] = {
        ACTIVE_PROVIDER_KEY: config.provider,
        ACTIVE_MODEL_KEY: config.model.strip(),
        FALLBACK_PROVIDER_KEY: config.fallback_provider or "",
        FALLBACK_MODEL_KEY: config.fallback_model or "",
        CACHE_ENABLED_KEY: config.cache_enabled,
        CACHE_TTL_KEY: config.cache_ttl_seconds,
    }
    if not values[ACTIVE_MODEL_KEY]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="A default model is required.",
        )

    for key, value in values.items():
        existing = await db.get(SystemSetting, key)
        if existing:
            existing.value = cast(dict | list | str | int | float | bool, value)
            existing.updated_at = datetime.now(UTC)
        else:
            db.add(SystemSetting(key=key, value=cast(dict | list | str | int | float | bool, value)))

    db.add(AuditLogSession(
        user_id=admin.id,
        action="llm_provider_configuration_updated",
        details={
            "provider": config.provider,
            "model": config.model,
            "fallback_provider": config.fallback_provider,
            "cache_enabled": config.cache_enabled,
            "cache_ttl_seconds": config.cache_ttl_seconds,
        },
    ))
    await db.commit()
    return await get_llm_provider_config(db)


async def list_instructors(
    db: AsyncSession, *, canvas_status: str | None = None
) -> list[User]:
    """canvas_status="failing" scopes to instructors with at least one
    CanvasConnection.last_sync_error set — the same live data source
    Troubleshooting's failing-connections list reads from (services/
    troubleshoot.py::list_failing_canvas_connections), so "Manage
    instructors" from that page lands on exactly the instructors it named,
    not the full roster."""
    query = select(User).where(User.role == "instructor")
    if canvas_status == "failing":
        query = query.join(CanvasConnection, CanvasConnection.user_id == User.id).where(
            CanvasConnection.last_sync_error.is_not(None)
        )
    query = query.order_by(User.created_at.desc()).distinct()
    result = await db.scalars(query)
    return list(result)


async def create_admin_user(
    db: AsyncSession, body: CreateAdminRequest, created_by: User
) -> User:
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    user = User(
        name=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
        role="admin",
    )
    db.add(user)
    await db.flush()
    db.add(AuditLogSession(
        user_id=created_by.id,
        action="admin_created",
        details={"email": body.email, "new_admin_id": user.id},
    ))
    await db.commit()
    await db.refresh(user)
    return user


async def create_instructor(db: AsyncSession, body: CreateInstructorRequest, admin: User) -> User:
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    instructor = User(
        name=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
        role="instructor",
    )
    db.add(instructor)
    await db.flush()

    db.add(AuditLogSession(
        user_id=admin.id,
        action="instructor_account_created",
        details={"instructor_id": instructor.id, "email": instructor.email},
    ))
    await db.commit()
    await db.refresh(instructor)
    return instructor


async def update_instructor(
    db: AsyncSession, instructor_id: int, body: UpdateInstructorRequest, admin: User
) -> User:
    instructor = await _get_instructor(db, instructor_id)

    changes: dict = {}
    if body.name is not None:
        instructor.name = body.name
        changes["name"] = body.name
    if body.email is not None:
        conflict = await db.scalar(
            select(User).where(User.email == body.email, User.id != instructor_id)
        )
        if conflict:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")
        instructor.email = body.email
        changes["email"] = body.email

    db.add(AuditLogSession(
        user_id=admin.id,
        action="instructor_account_updated",
        details={"instructor_id": instructor_id, "changes": changes},
    ))
    await db.commit()
    await db.refresh(instructor)
    return instructor


async def enable_instructor(db: AsyncSession, instructor_id: int, admin: User) -> User:
    instructor = await _get_instructor(db, instructor_id)
    instructor.is_active = True
    db.add(AuditLogSession(
        user_id=admin.id,
        action="instructor_account_enabled",
        details={"instructor_id": instructor_id},
    ))
    await db.commit()
    await db.refresh(instructor)
    return instructor


async def disable_instructor(db: AsyncSession, instructor_id: int, admin: User) -> User:
    instructor = await _get_instructor(db, instructor_id)
    instructor.is_active = False
    db.add(AuditLogSession(
        user_id=admin.id,
        action="instructor_account_disabled",
        details={"instructor_id": instructor_id},
    ))
    await db.commit()
    await db.refresh(instructor)
    return instructor


async def revoke_instructor_access(db: AsyncSession, instructor_id: int, admin: User) -> None:
    instructor = await _get_instructor(db, instructor_id)  # noqa: F841 — validates existence

    connections = (await db.scalars(
        select(CanvasConnection).where(CanvasConnection.user_id == instructor_id)
    )).all()
    for conn in connections:
        await db.delete(conn)

    db.add(AuditLogSession(
        user_id=admin.id,
        action="instructor_access_revoked",
        details={"instructor_id": instructor_id, "connections_removed": len(connections)},
    ))
    await db.commit()


def _to_connection_response(conn: CanvasConnection) -> AdminCanvasConnectionResponse:
    return AdminCanvasConnectionResponse(
        id=conn.id,
        canvas_url=conn.canvas_url,
        # last_sync_error is free-form text from an HTTP client failure -- it
        # could echo a bearer token/API key back from a raw request error,
        # so scrub before this ever reaches an admin-facing response (same
        # treatment as services/troubleshoot.py's failing-connections list).
        last_sync_error=redact_secrets(conn.last_sync_error) if conn.last_sync_error else None,
        courses_synced_at=conn.courses_synced_at,
        created_at=conn.created_at,
    )


async def list_instructor_canvas_connections(
    db: AsyncSession, instructor_id: int
) -> list[AdminCanvasConnectionResponse]:
    """Every Canvas connection for one instructor, by (user_id, canvas_url) —
    an instructor can have more than one (see uq_user_canvas_url), so a
    support request needs the specific canvas_url identified before an admin
    can act on it (see reset_instructor_canvas_token)."""
    await _get_instructor(db, instructor_id)  # validates existence
    rows = (
        await db.scalars(
            select(CanvasConnection)
            .where(CanvasConnection.user_id == instructor_id)
            .order_by(CanvasConnection.canvas_url)
        )
    ).all()
    return [_to_connection_response(row) for row in rows]


async def reset_instructor_canvas_token(
    db: AsyncSession,
    instructor_id: int,
    *,
    canvas_token: str,
    canvas_url: str,
    admin: User,
) -> list[AdminCanvasConnectionResponse]:
    """Admin-initiated equivalent of the instructor's own PATCH
    /auth/me/canvas-token (services/auth.py::update_canvas_token) — same
    live-validate-then-encrypt-then-upsert flow, scoped to one instructor's
    (user_id, canvas_url) pair so a multi-connection instructor's other
    schools are untouched. Clears last_sync_error immediately on success so
    the Troubleshooting page reflects the fix without waiting on the next
    ~60s sync sweep."""
    await _get_instructor(db, instructor_id)  # validates existence

    from app.core.security import encrypt_canvas_token
    from app.integrations.canvas import validate_token

    await validate_token(canvas_token, canvas_url)
    encrypted = encrypt_canvas_token(canvas_token)

    existing = await db.scalar(
        select(CanvasConnection).where(
            CanvasConnection.user_id == instructor_id,
            CanvasConnection.canvas_url == canvas_url,
        )
    )
    if existing:
        existing.encrypted_token = encrypted
        existing.last_sync_error = None
    else:
        db.add(
            CanvasConnection(user_id=instructor_id, canvas_url=canvas_url, encrypted_token=encrypted)
        )

    db.add(AuditLogSession(
        user_id=admin.id,
        action="instructor_canvas_token_reset",
        details={"instructor_id": instructor_id, "canvas_url": canvas_url},
    ))
    await db.commit()

    return await list_instructor_canvas_connections(db, instructor_id)


async def _get_instructor(db: AsyncSession, instructor_id: int) -> User:
    user = await db.scalar(
        select(User).where(User.id == instructor_id, User.role == "instructor")
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Instructor not found")
    return user
