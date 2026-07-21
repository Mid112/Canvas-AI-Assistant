from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.system_setting import SystemSetting
from app.services.llm.base import LLMAdapter
from app.services.llm.llm_setting import get_llm_adapter

logger = logging.getLogger(__name__)

ACTIVE_PROVIDER_KEY = "active_llm_provider"
ACTIVE_MODEL_KEY = "active_llm_model"
FALLBACK_PROVIDER_KEY = "fallback_llm_provider"
FALLBACK_MODEL_KEY = "fallback_llm_model"
CACHE_ENABLED_KEY = "llm_cache_enabled"
CACHE_TTL_KEY = "llm_cache_ttl_seconds"
LLM_SETTING_KEYS = frozenset(
    {
        ACTIVE_PROVIDER_KEY,
        ACTIVE_MODEL_KEY,
        FALLBACK_PROVIDER_KEY,
        FALLBACK_MODEL_KEY,
        CACHE_ENABLED_KEY,
        CACHE_TTL_KEY,
    }
)

KNOWN_PROVIDER_IDS = frozenset(
    {
        "huggingface",
        "groq",
        "ollama",
        "vllm",
        "openai",
        "anthropic",
        "openai_compatible_custom",
    }
)


@dataclass(frozen=True)
class ProviderDefinition:
    id: str
    name: str
    hosting: str
    default_model: str
    base_url: str | None
    api_key: str | None
    supports_model_discovery: bool = True

    @property
    def configured(self) -> bool:
        if self.id == "openai_compatible_custom":
            return False
        if self.hosting == "local":
            return bool(self.base_url)
        return bool(self.base_url and self.api_key)


@dataclass(frozen=True)
class ActiveLlmConfig:
    provider: str
    model: str
    fallback_provider: str | None
    fallback_model: str | None
    cache_enabled: bool
    cache_ttl_seconds: int


def _definitions() -> dict[str, ProviderDefinition]:
    return {
        "huggingface": ProviderDefinition(
            id="huggingface",
            name="Hugging Face",
            hosting="internet",
            default_model=settings.HF_MODEL,
            base_url="https://router.huggingface.co/v1",
            api_key=settings.HF_TOKEN,
        ),
        "groq": ProviderDefinition(
            id="groq",
            name="Groq",
            hosting="internet",
            default_model=settings.GROQ_MODEL,
            base_url="https://api.groq.com/openai/v1",
            api_key=settings.GROQ_API_KEY,
        ),
        "ollama": ProviderDefinition(
            id="ollama",
            name="Ollama",
            hosting="local",
            default_model=settings.OLLAMA_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            api_key=None,
        ),
        "vllm": ProviderDefinition(
            id="vllm",
            name="vLLM",
            hosting="local",
            default_model=settings.VLLM_MODEL,
            base_url=settings.VLLM_BASE_URL,
            api_key=None,
        ),
        "openai": ProviderDefinition(
            id="openai",
            name="OpenAI",
            hosting="internet",
            default_model=settings.OPENAI_MODEL,
            base_url="https://api.openai.com/v1",
            api_key=settings.OPENAI_API_KEY,
        ),
        "anthropic": ProviderDefinition(
            id="anthropic",
            name="Anthropic",
            hosting="internet",
            default_model=settings.ANTHROPIC_MODEL,
            base_url="https://api.anthropic.com/v1",
            api_key=settings.ANTHROPIC_API_KEY,
            supports_model_discovery=False,
        ),
        "openai_compatible_custom": ProviderDefinition(
            id="openai_compatible_custom",
            name="Custom OpenAI-compatible",
            hosting="custom",
            default_model="",
            base_url=None,
            api_key=None,
            supports_model_discovery=False,
        ),
    }


def get_provider_definition(provider_id: str) -> ProviderDefinition:
    definition = _definitions().get(provider_id)
    if definition is None:
        raise ValueError(f"Unknown LLM provider: {provider_id}")
    return definition


def list_provider_definitions() -> list[ProviderDefinition]:
    return list(_definitions().values())


async def _setting_value(db: AsyncSession, key: str, default: Any) -> Any:
    row = await db.get(SystemSetting, key)
    return row.value if row is not None else default


async def get_active_llm_config(db: AsyncSession) -> ActiveLlmConfig:
    provider = str(
        await _setting_value(db, ACTIVE_PROVIDER_KEY, settings.DEFAULT_LLM_PROVIDER)
    )
    definition = get_provider_definition(provider)
    model = str(await _setting_value(db, ACTIVE_MODEL_KEY, definition.default_model))

    fallback_raw = await _setting_value(db, FALLBACK_PROVIDER_KEY, "")
    fallback_provider = str(fallback_raw).strip() or None
    fallback_model: str | None = None
    if fallback_provider:
        fallback_definition = get_provider_definition(fallback_provider)
        fallback_model = str(
            await _setting_value(
                db, FALLBACK_MODEL_KEY, fallback_definition.default_model
            )
        )

    cache_enabled = bool(await _setting_value(db, CACHE_ENABLED_KEY, True))
    cache_ttl = int(await _setting_value(db, CACHE_TTL_KEY, 300))
    return ActiveLlmConfig(
        provider=provider,
        model=model,
        fallback_provider=fallback_provider,
        fallback_model=fallback_model,
        cache_enabled=cache_enabled,
        cache_ttl_seconds=max(30, min(cache_ttl, 86_400)),
    )


def _adapter_settings(provider: str, model: str) -> dict[str, str]:
    definition = get_provider_definition(provider)
    if not definition.configured:
        requirement = (
            "a running local service"
            if definition.hosting == "local"
            else "a server API key"
        )
        raise ValueError(f"{definition.name} requires {requirement}")
    return {"provider": provider, "model": model}


class ObservableAdapter(LLMAdapter):
    """Runs one configured provider with optional, explicit failover."""

    def __init__(
        self,
        primary: tuple[str, LLMAdapter],
        fallback: tuple[str, LLMAdapter] | None = None,
    ):
        self.primary = primary
        self.fallback = fallback
        self.last_provider = primary[0]

    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        timeout: float = 30.0,
        history: list[dict] | None = None,
    ) -> str:
        started = time.monotonic()
        provider_id, adapter = self.primary
        try:
            result = await adapter.generate(
                system_prompt, user_message, timeout=timeout, history=history
            )
            self.last_provider = provider_id
            logger.info(
                "llm_execution provider=%s outcome=success duration_ms=%d",
                provider_id,
                int((time.monotonic() - started) * 1000),
            )
            return result
        except (httpx.RequestError, httpx.HTTPStatusError, TimeoutError):
            logger.warning(
                "llm_execution provider=%s outcome=failed duration_ms=%d",
                provider_id,
                int((time.monotonic() - started) * 1000),
            )
            if self.fallback is None:
                raise

        fallback_id, fallback_adapter = self.fallback
        fallback_started = time.monotonic()
        result = await fallback_adapter.generate(
            system_prompt, user_message, timeout=timeout, history=history
        )
        self.last_provider = fallback_id
        logger.info(
            "llm_execution provider=%s outcome=fallback_success duration_ms=%d",
            fallback_id,
            int((time.monotonic() - fallback_started) * 1000),
        )
        return result


async def get_active_llm_adapter(
    db: AsyncSession,
) -> tuple[ObservableAdapter, ActiveLlmConfig]:
    config = await get_active_llm_config(db)
    primary = (
        config.provider,
        get_llm_adapter(_adapter_settings(config.provider, config.model)),
    )
    fallback: tuple[str, LLMAdapter] | None = None
    if config.fallback_provider and config.fallback_model:
        fallback = (
            config.fallback_provider,
            get_llm_adapter(
                _adapter_settings(config.fallback_provider, config.fallback_model)
            ),
        )
    return ObservableAdapter(primary, fallback), config


async def check_provider_health(
    definition: ProviderDefinition,
    timeout: float = 3.0,
    api_key: str | None = None,
) -> dict[str, Any]:
    if definition.id == "openai_compatible_custom":
        return {
            "status": "unconfigured",
            "models": [],
            "detail": "Connect this provider with your own base URL and API key.",
        }

    effective_key = api_key or definition.api_key
    if definition.hosting != "local" and not effective_key:
        return {
            "status": "unconfigured",
            "models": [],
            "detail": "An API key is required to use this provider.",
        }
    if definition.hosting == "local" and not definition.base_url:
        return {
            "status": "unconfigured",
            "models": [],
            "detail": "Server credentials are not configured.",
        }
    if not definition.supports_model_discovery:
        return {
            "status": "configured" if effective_key or definition.hosting == "local" else "unconfigured",
            "models": [definition.default_model] if definition.default_model else [],
            "detail": "Credentials are configured; this provider has no discovery endpoint.",
        }

    headers: dict[str, str] = {}
    if effective_key:
        headers["Authorization"] = f"Bearer {effective_key}"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                f"{definition.base_url}/models", headers=headers
            )
            response.raise_for_status()
        data = response.json()
        models = [
            str(item["id"])
            for item in data.get("data", [])
            if isinstance(item, dict) and item.get("id")
        ]
        return {"status": "available", "models": models, "detail": None}
    except (httpx.HTTPError, ValueError, TypeError) as error:
        logger.info(
            "llm_health provider=%s outcome=unavailable error=%s",
            definition.id,
            type(error).__name__,
        )
        return {
            "status": "unavailable",
            "models": [],
            "detail": "Provider could not be reached.",
        }


async def get_provider_statuses() -> list[dict[str, Any]]:
    definitions = list_provider_definitions()
    health = await asyncio.gather(
        *(check_provider_health(definition) for definition in definitions)
    )
    return [
        {
            "id": definition.id,
            "name": definition.name,
            "hosting": definition.hosting,
            "default_model": definition.default_model,
            "configured": definition.configured,
            **status,
        }
        for definition, status in zip(definitions, health, strict=True)
    ]
