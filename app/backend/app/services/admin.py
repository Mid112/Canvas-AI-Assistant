from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.audit_log import AuditLog
from app.models.audit_log_session import AuditLogSession
from app.models.canvas_connection import CanvasConnection
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.models.workflow import Workflow
from app.schemas.admin import CreateAdminRequest, CreateInstructorRequest, UpdateInstructorRequest
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

    db.add(AuditLogSession(
        user_id=admin.id,
        action="admin_settings_updated",
        details={"changed_keys": list(new_settings.keys()), "values": new_settings},
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

    values = {
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
            existing.value = value
            existing.updated_at = datetime.now(UTC)
        else:
            db.add(SystemSetting(key=key, value=value))

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


async def list_instructors(db: AsyncSession) -> list[User]:
    result = await db.scalars(
        select(User).where(User.role == "instructor").order_by(User.created_at.desc())
    )
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


async def _get_instructor(db: AsyncSession, instructor_id: int) -> User:
    user = await db.scalar(
        select(User).where(User.id == instructor_id, User.role == "instructor")
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Instructor not found")
    return user
