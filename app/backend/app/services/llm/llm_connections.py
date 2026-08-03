from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from cryptography.fernet import InvalidToken
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decrypt_llm_api_key, encrypt_llm_api_key
from app.models.instructor_llm_connection import InstructorLlmConnection
from app.services.llm.base_url_validation import validate_llm_base_url
from app.services.llm.provider_registry import (
    KNOWN_PROVIDER_IDS,
    ProviderDefinition,
    check_provider_health,
    get_provider_definition,
    list_provider_definitions,
    validate_api_key,
)


async def get_user_connections(
    db: AsyncSession,
    user_id: int,
) -> dict[str, InstructorLlmConnection]:
    rows = await db.scalars(
        select(InstructorLlmConnection).where(
            InstructorLlmConnection.user_id == user_id
        )
    )
    return {row.provider_id: row for row in rows}


def _has_user_credentials(connection: InstructorLlmConnection | None) -> bool:
    return bool(connection and connection.encrypted_api_key)


def _has_custom_credentials(connection: InstructorLlmConnection | None) -> bool:
    return bool(
        connection
        and connection.base_url
        and connection.encrypted_api_key
    )


def _decrypt_stored_api_key(encrypted_api_key: str) -> str:
    try:
        return decrypt_llm_api_key(encrypted_api_key)
    except InvalidToken as exc:
        raise ValueError(
            "LLM API key is corrupted — please reconnect this provider in Settings."
        ) from exc


def provider_accepts_user_key(definition: ProviderDefinition) -> bool:
    """Hosted/custom providers can store an instructor API key (required or optional)."""
    return definition.hosting in {"internet", "custom"} or definition.id == "openai_compatible_custom"


def provider_requires_user_key(definition: ProviderDefinition) -> bool:
    """True when an instructor key is required because the server has no credential."""
    if definition.id == "openai_compatible_custom":
        return True
    if definition.hosting == "local":
        return False
    return not definition.configured


def is_provider_connected(
    definition: ProviderDefinition,
    connection: InstructorLlmConnection | None,
    health_status: str,
) -> bool:
    if definition.id == "openai_compatible_custom":
        return _has_custom_credentials(connection) and health_status != "unauthorized"

    # Instructor personal key counts as connected even if server health is down,
    # unless the provider has explicitly rejected the key (401/403).
    if _has_user_credentials(connection):
        return health_status != "unauthorized"

    if definition.hosting == "local":
        return health_status == "available"

    # Server-configured hosted providers are usable even when model discovery
    # fails. Discovery is UI convenience; chat completions may still work.
    if definition.configured:
        return True

    return False


async def _resolve_connection_health(
    definition: ProviderDefinition,
    connection: InstructorLlmConnection | None,
) -> dict:
    """Re-check the instructor's own stored key against the real provider.

    Called on every catalog fetch (Settings load, model switcher — which
    happens right after login) so a revoked or mistyped key is reflected
    immediately instead of only at the moment it was first saved.
    """
    has_key = (
        _has_custom_credentials(connection)
        if definition.id == "openai_compatible_custom"
        else _has_user_credentials(connection)
    )
    if not has_key:
        return await check_provider_health(definition)
    if connection is None or connection.encrypted_api_key is None:
        return {"status": "unauthorized", "models": [], "detail": "Provider is not connected."}

    try:
        user_key = _decrypt_stored_api_key(connection.encrypted_api_key)
    except ValueError as exc:
        return {"status": "unauthorized", "models": [], "detail": str(exc)}

    base_url = connection.base_url if definition.id == "openai_compatible_custom" else None
    is_valid, detail = await validate_api_key(definition, user_key, base_url=base_url)
    if not is_valid:
        return {"status": "unauthorized", "models": [], "detail": detail}

    if not definition.supports_model_discovery:
        return {
            "status": "configured",
            "models": [definition.default_model] if definition.default_model else [],
            "detail": None,
        }
    return await check_provider_health(definition, api_key=user_key)


async def build_instructor_provider_catalog(
    db: AsyncSession,
    user_id: int,
) -> list[dict]:
    connections = await get_user_connections(db, user_id)
    definitions = list_provider_definitions()
    health = await asyncio.gather(
        *[
            _resolve_connection_health(definition, connections.get(definition.id))
            for definition in definitions
        ]
    )

    catalog: list[dict] = []
    for definition, health_info in zip(definitions, health, strict=True):
        connection = connections.get(definition.id)
        connected = is_provider_connected(
            definition, connection, health_info["status"]
        )
        models = list(health_info["models"])
        saved_model = connection.model if connection and connection.model else None
        if saved_model and saved_model not in models:
            models.insert(0, saved_model)
        if not models:
            models = [saved_model or definition.default_model]

        catalog.append(
            {
                "id": definition.id,
                "name": definition.name,
                "hosting": definition.hosting,
                "default_model": definition.default_model,
                "configured": definition.configured,
                "status": health_info["status"],
                "models": models,
                "detail": health_info["detail"],
                "connected": connected,
                "requires_api_key": provider_requires_user_key(definition),
                "accepts_api_key": provider_accepts_user_key(definition),
                "has_api_key": _has_user_credentials(connection),
                "saved_model": saved_model,
                "saved_base_url": connection.base_url if connection else None,
            }
        )
    return catalog


async def build_adapter_settings(
    db: AsyncSession,
    user_id: int,
    provider: str,
    model: str | None,
) -> dict[str, str]:
    if provider not in KNOWN_PROVIDER_IDS:
        raise ValueError(f"Unknown LLM provider: {provider}")

    definition = get_provider_definition(provider)
    connections = await get_user_connections(db, user_id)
    connection = connections.get(provider)
    has_personal_key = (
        _has_custom_credentials(connection)
        if provider == "openai_compatible_custom"
        else _has_user_credentials(connection)
    )

    # Local runtimes need a live health check. Server-configured (non-personal)
    # hosted providers are credential-gated; probing /models on every chat turn
    # is unnecessary and can falsely mark a working server key as disconnected.
    # An instructor's own key is re-validated on every use so a revoked or
    # mistyped key is caught before dispatching the chat request.
    if definition.hosting == "local":
        health = await check_provider_health(definition)
        health_status = health["status"]
    elif has_personal_key:
        if connection is None or connection.encrypted_api_key is None:
            raise ValueError(f"{definition.name} is not connected")
        user_key = _decrypt_stored_api_key(connection.encrypted_api_key)
        base_url = connection.base_url if provider == "openai_compatible_custom" else None
        is_valid, _ = await validate_api_key(definition, user_key, base_url=base_url)
        health_status = "configured" if is_valid else "unauthorized"
    else:
        health_status = "configured" if definition.configured else "unconfigured"

    if not is_provider_connected(definition, connection, health_status):
        if health_status == "unauthorized":
            raise ValueError(
                f"{definition.name} rejected your saved API key. "
                "Reconnect it in Settings."
            )
        raise ValueError(f"{definition.name} is not connected")

    resolved_model = (
        (model or "").strip()
        or (connection.model if connection and connection.model else "")
        or definition.default_model
    )
    settings: dict[str, str] = {
        "provider": provider,
        "model": resolved_model,
    }

    if provider == "openai_compatible_custom":
        if not connection or not connection.base_url or not connection.encrypted_api_key:
            raise ValueError("Custom provider is not connected")
        settings["base_url"] = connection.base_url
        settings["api_key"] = _decrypt_stored_api_key(connection.encrypted_api_key)
        return settings

    if connection and connection.encrypted_api_key:
        settings["api_key"] = _decrypt_stored_api_key(connection.encrypted_api_key)

    return settings


async def resolve_instructor_llm_request(
    db: AsyncSession,
    user_id: int,
    default_provider: str,
    default_model: str,
    requested: dict | None,
) -> tuple[str, str, dict[str, str]]:
    provider = default_provider
    model = default_model
    if requested and requested.get("provider"):
        provider = str(requested["provider"])
        requested_model = str(requested.get("model") or "").strip()
        if requested_model:
            model = requested_model

    adapter_settings = await build_adapter_settings(db, user_id, provider, model)
    return provider, adapter_settings["model"], adapter_settings


async def upsert_llm_connection(
    db: AsyncSession,
    user_id: int,
    provider_id: str,
    *,
    api_key: str | None = None,
    model: str | None = None,
    base_url: str | None = None,
) -> InstructorLlmConnection:
    if provider_id not in KNOWN_PROVIDER_IDS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Unknown LLM provider: {provider_id}",
        )

    definition = get_provider_definition(provider_id)
    connection = await db.get(
        InstructorLlmConnection,
        {"user_id": user_id, "provider_id": provider_id},
    )

    normalized_model = (model or "").strip() or None
    normalized_base_url = (base_url or "").strip() or None
    normalized_api_key = (api_key or "").strip() or None

    if provider_id == "openai_compatible_custom":
        effective_base_url = normalized_base_url or (
            connection.base_url if connection else None
        )
        if not effective_base_url:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="A base URL is required for custom providers.",
            )
        if not normalized_api_key and not _has_user_credentials(connection):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="An API key is required to connect this provider.",
            )
        effective_model = normalized_model or (
            connection.model if connection and connection.model else None
        )
        if not effective_model:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="A model name is required for custom providers.",
            )
        normalized_base_url = validate_llm_base_url(effective_base_url)
        normalized_model = effective_model
    else:
        # Non-custom providers always use server-configured endpoints. Never
        # persist a client-supplied base_url that skipped SSRF validation.
        if normalized_base_url:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Base URL is only supported for custom OpenAI-compatible providers.",
            )
        if definition.hosting == "local" and normalized_api_key:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Local providers do not use API keys.",
            )
        if provider_requires_user_key(definition):
            if not normalized_api_key and not _has_user_credentials(connection):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="An API key is required to connect this provider.",
                )

    if normalized_api_key:
        is_valid, error_detail = await validate_api_key(
            definition,
            normalized_api_key,
            base_url=normalized_base_url if provider_id == "openai_compatible_custom" else None,
        )
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=error_detail or "The provider rejected this API key.",
            )

    if connection is None:
        connection = InstructorLlmConnection(
            user_id=user_id,
            provider_id=provider_id,
        )
        db.add(connection)

    if normalized_model:
        connection.model = normalized_model
    if normalized_base_url:
        connection.base_url = normalized_base_url
    if normalized_api_key:
        connection.encrypted_api_key = encrypt_llm_api_key(normalized_api_key)
    connection.updated_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(connection)
    return connection


async def delete_llm_connection(
    db: AsyncSession,
    user_id: int,
    provider_id: str,
) -> None:
    connection = await db.get(
        InstructorLlmConnection,
        {"user_id": user_id, "provider_id": provider_id},
    )
    if connection is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Provider connection not found.",
        )
    await db.delete(connection)
    await db.commit()
