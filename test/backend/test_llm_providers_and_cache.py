import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.llm_provider import LlmProviderConfig
from app.services.admin import update_admin_settings
from app.core.security import decrypt_llm_api_key, encrypt_llm_api_key
from app.services.llm.anthropic_adapter import AnthropicAdapter
from app.services.llm.base import LLMAdapter
from app.services.llm.llm_connections import (
    build_adapter_settings,
    is_provider_connected,
    provider_accepts_user_key,
    provider_requires_user_key,
)
from app.services.llm.llm_setting import get_llm_adapter
from app.services.llm.openai_compatible import OpenAICompatibleAdapter
from app.services.llm.provider_registry import (
    ObservableAdapter,
    ProviderDefinition,
    check_provider_health,
    get_active_llm_config,
    validate_api_key,
)
from app.services.llm.response_cache import (
    build_cache_key,
    is_safe_cache_candidate,
    is_safe_cache_response,
)


class StubAdapter(LLMAdapter):
    def __init__(self, result: str = "ok", error: Exception | None = None, model: str = "stub-model"):
        self.result = result
        self.error = error
        self.model = model
        self.calls = 0

    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        timeout: float = 30.0,
        history: list[dict] | None = None,
    ) -> str:
        self.calls += 1
        if self.error:
            raise self.error
        return self.result


def test_local_adapter_honors_selected_model():
    adapter = get_llm_adapter({"provider": "ollama", "model": "qwen3:8b"})

    assert isinstance(adapter, OpenAICompatibleAdapter)
    assert adapter.model == "qwen3:8b"


def test_hosted_adapters_use_instructor_api_key_when_provided():
    openai = get_llm_adapter(
        {"provider": "openai", "model": "gpt-test", "api_key": "user-key"}
    )
    anthropic = get_llm_adapter(
        {"provider": "anthropic", "model": "claude-test", "api_key": "user-key"}
    )

    assert isinstance(openai, LLMAdapter)
    assert openai.api_key == "user-key"
    assert isinstance(anthropic, LLMAdapter)
    assert isinstance(anthropic, AnthropicAdapter)
    assert anthropic.api_key == "user-key"


def test_active_config_reads_persisted_provider_cache_and_fallback():
    values = {
        "active_llm_provider": "ollama",
        "active_llm_model": "llama3.2:latest",
        "fallback_llm_provider": "groq",
        "fallback_llm_model": "llama-3.1-8b-instant",
        "llm_cache_enabled": False,
        "llm_cache_ttl_seconds": 900,
    }
    db = AsyncMock()
    db.get = AsyncMock(
        side_effect=lambda _model, key: (
            type("Setting", (), {"value": values[key]})() if key in values else None
        )
    )

    config = asyncio.run(get_active_llm_config(db))

    assert config.provider == "ollama"
    assert config.model == "llama3.2:latest"
    assert config.fallback_provider == "groq"
    assert config.fallback_model == "llama-3.1-8b-instant"
    assert config.cache_enabled is False
    assert config.cache_ttl_seconds == 900


def test_observable_adapter_fails_over_on_provider_transport_error():
    request = httpx.Request("POST", "http://local.test/chat/completions")
    primary = StubAdapter(error=httpx.ConnectError("offline", request=request))
    fallback = StubAdapter(result="fallback response")
    adapter = ObservableAdapter(("ollama", primary), ("groq", fallback))

    result = asyncio.run(adapter.generate("system", "hello"))

    assert result == "fallback response"
    assert primary.calls == 1
    assert fallback.calls == 1
    assert adapter.last_provider == "groq"
    assert adapter.last_model == "stub-model"


def test_observable_adapter_does_not_fail_over_on_validation_error():
    primary = StubAdapter(error=ValueError("unsupported response"))
    fallback = StubAdapter(result="must not run")
    adapter = ObservableAdapter(("ollama", primary), ("groq", fallback))

    with pytest.raises(ValueError, match="unsupported response"):
        asyncio.run(adapter.generate("system", "hello"))

    assert fallback.calls == 0


def _client_returning(status_code: int) -> MagicMock:
    """A mock httpx.AsyncClient() context manager whose GET returns `status_code`."""
    response = MagicMock()
    response.status_code = status_code
    client = AsyncMock()
    client.get = AsyncMock(return_value=response)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


def _client_raising(exc: Exception) -> MagicMock:
    client = AsyncMock()
    client.get = AsyncMock(side_effect=exc)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


def test_validate_api_key_rejects_401_from_provider(monkeypatch):
    provider = ProviderDefinition(
        id="openai",
        name="OpenAI",
        hosting="internet",
        default_model="model",
        base_url="https://api.openai.com/v1",
        api_key="",
    )
    monkeypatch.setattr(
        "app.services.llm.provider_registry.httpx.AsyncClient",
        lambda **kwargs: _client_returning(401),
    )

    is_valid, detail = asyncio.run(validate_api_key(provider, "sk-bad"))

    assert is_valid is False
    assert detail


def test_validate_api_key_accepts_200_from_provider(monkeypatch):
    provider = ProviderDefinition(
        id="openai",
        name="OpenAI",
        hosting="internet",
        default_model="model",
        base_url="https://api.openai.com/v1",
        api_key="",
    )
    monkeypatch.setattr(
        "app.services.llm.provider_registry.httpx.AsyncClient",
        lambda **kwargs: _client_returning(200),
    )

    is_valid, detail = asyncio.run(validate_api_key(provider, "sk-good"))

    assert is_valid is True
    assert detail is None


def test_validate_api_key_uses_anthropic_headers_and_endpoint(monkeypatch):
    provider = ProviderDefinition(
        id="anthropic",
        name="Anthropic",
        hosting="internet",
        default_model="model",
        base_url="https://api.anthropic.com/v1",
        api_key="",
        supports_model_discovery=False,
    )
    captured = {}

    def _client_factory(**kwargs):
        client = AsyncMock()

        async def _get(url, headers=None):
            captured["url"] = url
            captured["headers"] = headers
            response = MagicMock()
            response.status_code = 200
            return response

        client.get = _get
        cm = MagicMock()
        cm.__aenter__ = AsyncMock(return_value=client)
        cm.__aexit__ = AsyncMock(return_value=False)
        return cm

    monkeypatch.setattr(
        "app.services.llm.provider_registry.httpx.AsyncClient", _client_factory
    )

    is_valid, _ = asyncio.run(validate_api_key(provider, "sk-ant-test"))

    assert is_valid is True
    assert captured["url"] == "https://api.anthropic.com/v1/models"
    assert captured["headers"]["x-api-key"] == "sk-ant-test"


def test_validate_api_key_treats_network_error_as_inconclusive(monkeypatch):
    provider = ProviderDefinition(
        id="openai",
        name="OpenAI",
        hosting="internet",
        default_model="model",
        base_url="https://api.openai.com/v1",
        api_key="",
    )
    request = httpx.Request("GET", "https://api.openai.com/v1/models")
    monkeypatch.setattr(
        "app.services.llm.provider_registry.httpx.AsyncClient",
        lambda **kwargs: _client_raising(httpx.ConnectError("offline", request=request)),
    )

    is_valid, detail = asyncio.run(validate_api_key(provider, "sk-unknown"))

    assert is_valid is True
    assert detail is None


def test_unconfigured_hosted_provider_health_does_not_make_request():
    provider = ProviderDefinition(
        id="hosted",
        name="Hosted",
        hosting="internet",
        default_model="model",
        base_url="https://example.test/v1",
        api_key="",
    )

    result = asyncio.run(check_provider_health(provider))

    assert result["status"] == "unconfigured"
    assert result["models"] == []


@pytest.mark.parametrize(
    "message",
    [
        "Email student@example.com about class",
        "My API key is secret",
        "Show Alice's grades",
        "Student 12345678 needs help",
    ],
)
def test_sensitive_requests_are_not_cache_candidates(message):
    assert not is_safe_cache_candidate(
        message,
        has_history=False,
        local_course_id=None,
        conversation_course_id=None,
        pending_message_id=None,
    )


def test_canvas_context_and_history_bypass_cache():
    assert not is_safe_cache_candidate(
        "What can you help me with?",
        has_history=True,
        local_course_id=None,
        conversation_course_id=None,
        pending_message_id=None,
    )
    assert not is_safe_cache_candidate(
        "What can you help me with?",
        has_history=False,
        local_course_id=42,
        conversation_course_id=None,
        pending_message_id=None,
    )


def test_sensitive_provider_response_is_not_cacheable():
    assert not is_safe_cache_response(
        '{"action":"respond","message":"Student alice@example.com has a grade of 70"}'
    )


def test_cache_key_is_scoped_by_user_provider_and_model():
    base = {
        "system_prompt": "system",
        "llm_message": "hello",
    }
    first = build_cache_key(user_id=1, provider="ollama", model="llama3.2", **base)

    assert first != build_cache_key(
        user_id=2, provider="ollama", model="llama3.2", **base
    )
    assert first != build_cache_key(
        user_id=1, provider="groq", model="llama3.2", **base
    )
    assert first != build_cache_key(user_id=1, provider="ollama", model="other", **base)


def test_generic_admin_settings_cannot_bypass_provider_validation():
    with pytest.raises(HTTPException) as error:
        asyncio.run(
            update_admin_settings(
                AsyncMock(),
                {"active_llm_provider": "attacker-controlled-provider"},
                SimpleNamespace(id=1),
            )
        )

    assert error.value.status_code == 422


def test_provider_config_rejects_same_provider_as_fallback():
    with pytest.raises(ValidationError, match="must differ"):
        LlmProviderConfig(
            provider="ollama",
            model="llama3.2",
            fallback_provider="ollama",
            fallback_model="llama3.2",
        )


def test_provider_requires_user_key_when_server_is_unconfigured():
    definition = ProviderDefinition(
        id="openai",
        name="OpenAI",
        hosting="internet",
        default_model="gpt-4o-mini",
        base_url="https://api.openai.com/v1",
        api_key="",
    )

    assert provider_requires_user_key(definition)
    assert provider_accepts_user_key(definition)


def test_configured_hosted_provider_still_accepts_personal_key():
    definition = ProviderDefinition(
        id="groq",
        name="Groq",
        hosting="internet",
        default_model="qwen/qwen3.6-27b",
        base_url="https://api.groq.com/openai/v1",
        api_key="server-key",
    )

    assert not provider_requires_user_key(definition)
    assert provider_accepts_user_key(definition)


def test_local_provider_is_connected_when_health_is_available():
    definition = ProviderDefinition(
        id="ollama",
        name="Ollama",
        hosting="local",
        default_model="llama3.2",
        base_url="http://localhost:11434/v1",
        api_key=None,
    )

    assert is_provider_connected(definition, None, "available")


def test_personal_key_marks_hosted_provider_connected_without_server_health():
    definition = ProviderDefinition(
        id="openai",
        name="OpenAI",
        hosting="internet",
        default_model="gpt-4o-mini",
        base_url="https://api.openai.com/v1",
        api_key="",
    )
    connection = type(
        "Conn",
        (),
        {"encrypted_api_key": "enc", "base_url": None, "model": None},
    )()

    assert is_provider_connected(definition, connection, "unavailable")


def test_personal_key_marked_disconnected_once_provider_rejects_it():
    definition = ProviderDefinition(
        id="openai",
        name="OpenAI",
        hosting="internet",
        default_model="gpt-4o-mini",
        base_url="https://api.openai.com/v1",
        api_key="",
    )
    connection = type(
        "Conn",
        (),
        {"encrypted_api_key": "enc", "base_url": None, "model": None},
    )()

    assert not is_provider_connected(definition, connection, "unauthorized")


def test_resolve_connection_health_flags_revoked_personal_key():
    from unittest.mock import patch

    from app.services.llm.llm_connections import _resolve_connection_health

    definition = ProviderDefinition(
        id="openai",
        name="OpenAI",
        hosting="internet",
        default_model="gpt-4o-mini",
        base_url="https://api.openai.com/v1",
        api_key="",
    )
    connection = type(
        "Conn",
        (),
        {
            "encrypted_api_key": encrypt_llm_api_key("sk-revoked"),
            "base_url": None,
            "model": "gpt-4o-mini",
        },
    )()

    with patch(
        "app.services.llm.llm_connections.validate_api_key",
        new_callable=AsyncMock,
        return_value=(False, "The provider rejected this API key."),
    ):
        result = asyncio.run(_resolve_connection_health(definition, connection))

    assert result["status"] == "unauthorized"
    assert result["detail"] == "The provider rejected this API key."


def test_server_configured_hosted_provider_connected_even_if_discovery_fails():
    definition = ProviderDefinition(
        id="groq",
        name="Groq",
        hosting="internet",
        default_model="qwen/qwen3.6-27b",
        base_url="https://api.groq.com/openai/v1",
        api_key="server-key",
    )

    assert definition.configured
    assert is_provider_connected(definition, None, "unavailable")
    assert is_provider_connected(definition, None, "available")


def test_custom_provider_upsert_keeps_existing_base_url():
    from unittest.mock import MagicMock, patch

    from app.services.llm.llm_connections import upsert_llm_connection

    existing = MagicMock()
    existing.base_url = "https://api.example.com/v1"
    existing.encrypted_api_key = "already-encrypted"
    existing.model = "old-model"

    db = AsyncMock()
    db.get = AsyncMock(return_value=existing)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    with patch(
        "app.services.llm.llm_connections.encrypt_llm_api_key",
        return_value="new-encrypted",
    ):
        result = asyncio.run(
            upsert_llm_connection(
                db,
                1,
                "openai_compatible_custom",
                model="new-model",
                # base_url intentionally omitted — should keep existing
            )
        )

    assert result is existing
    assert existing.base_url == "https://api.example.com/v1"
    assert existing.model == "new-model"


def test_build_adapter_settings_rejects_unconnected_provider():
    db = AsyncMock()
    db.scalars = AsyncMock(return_value=[])
    db.get = AsyncMock(return_value=None)

    with pytest.raises(ValueError, match="not connected"):
        asyncio.run(
            build_adapter_settings(db, 1, "openai", "gpt-4o-mini")
        )


def test_build_adapter_settings_rejects_revoked_personal_key():
    from unittest.mock import patch

    connection = type(
        "Conn",
        (),
        {
            "provider_id": "openai",
            "encrypted_api_key": encrypt_llm_api_key("sk-revoked"),
            "base_url": None,
            "model": "gpt-4o-mini",
        },
    )()
    db = AsyncMock()
    db.scalars = AsyncMock(return_value=[connection])

    with patch(
        "app.services.llm.llm_connections.validate_api_key",
        new_callable=AsyncMock,
        return_value=(False, "The provider rejected this API key."),
    ):
        with pytest.raises(ValueError, match="rejected your saved API key"):
            asyncio.run(build_adapter_settings(db, 1, "openai", "gpt-4o-mini"))


def test_llm_api_key_uses_same_fernet_roundtrip_as_canvas_tokens():
    encrypted = encrypt_llm_api_key("sk-test-key")
    assert encrypted != "sk-test-key"
    assert decrypt_llm_api_key(encrypted) == "sk-test-key"


def test_corrupted_llm_api_key_asks_instructor_to_reconnect():
    from unittest.mock import patch

    from cryptography.fernet import InvalidToken

    from app.services.llm.llm_connections import _decrypt_stored_api_key

    with patch(
        "app.services.llm.llm_connections.decrypt_llm_api_key",
        side_effect=InvalidToken,
    ):
        with pytest.raises(ValueError, match="reconnect"):
            _decrypt_stored_api_key("corrupted")


def test_custom_base_url_rejects_private_and_loopback_targets():
    from app.services.llm.base_url_validation import validate_llm_base_url

    assert (
        validate_llm_base_url("https://api.example.com/v1")
        == "https://api.example.com/v1"
    )

    with pytest.raises(HTTPException) as loopback:
        validate_llm_base_url("http://127.0.0.1:8000/v1")
    assert loopback.value.status_code == 422

    with pytest.raises(HTTPException) as private:
        validate_llm_base_url("http://10.0.0.5/v1")
    assert private.value.status_code == 422

    with pytest.raises(HTTPException) as with_creds:
        validate_llm_base_url("https://user:pass@api.example.com/v1")
    assert with_creds.value.status_code == 422


@pytest.mark.parametrize(
    "url",
    [
        "http://2130706433/v1",
        "http://017700000001/v1",
        "http://0x7f000001/v1",
        "http://127.1/v1",
        "http://0177.0.0.1/v1",
    ],
)
def test_custom_base_url_rejects_alternate_ip_encodings(url):
    from app.services.llm.base_url_validation import validate_llm_base_url

    with pytest.raises(HTTPException) as error:
        validate_llm_base_url(url)
    assert error.value.status_code == 422


def test_local_provider_upsert_rejects_api_keys():
    from app.services.llm.llm_connections import upsert_llm_connection

    db = AsyncMock()
    db.get = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as error:
        asyncio.run(
            upsert_llm_connection(
                db,
                1,
                "ollama",
                api_key="should-not-be-stored",
                model="llama3.2",
            )
        )

    assert error.value.status_code == 422
    assert "do not use API keys" in error.value.detail


def test_non_custom_provider_upsert_rejects_base_url():
    from app.services.llm.llm_connections import upsert_llm_connection

    db = AsyncMock()
    db.get = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as error:
        asyncio.run(
            upsert_llm_connection(
                db,
                1,
                "openai",
                api_key="sk-test",
                base_url="https://evil.example/v1",
                model="gpt-4o-mini",
            )
        )

    assert error.value.status_code == 422
    assert "only supported for custom" in error.value.detail


def test_redact_secrets_strips_common_api_key_shapes():
    from app.core.secret_redaction import redact_secrets, safe_exception_text

    raw = (
        "Authorization: Bearer sk-ant-secret12345678 "
        "api_key=gsk_abcdefghijklmnop "
        "hf_abcdefghijklmnopqrstuv "
        "x-api-key: top-secret-value"
    )
    cleaned = redact_secrets(raw)
    assert "sk-ant-secret12345678" not in cleaned
    assert "gsk_abcdefghijklmnop" not in cleaned
    assert "hf_abcdefghijklmnopqrstuv" not in cleaned
    assert "top-secret-value" not in cleaned
    assert "[REDACTED" in cleaned

    message = safe_exception_text(
        RuntimeError("upstream failed with api_key=sk-live-abcdefghijklmnopqrst")
    )
    assert "sk-live-abcdefghijklmnopqrst" not in message
    assert "RuntimeError" in message


def test_secret_redaction_logging_filter_scrubs_logger_output(caplog):
    # Feature 14 (#906): credentials must not survive ordinary logger.* calls,
    # not only the chat paths that call redact_secrets explicitly.
    import logging

    from app.core.secret_redaction import install_secret_redaction_logging

    install_secret_redaction_logging()
    logger = logging.getLogger("test.secret_redaction_filter")
    with caplog.at_level(logging.INFO, logger="test.secret_redaction_filter"):
        logger.info("upstream failed with api_key=%s", "sk-live-abcdefghijklmnopqrst")

    assert "sk-live-abcdefghijklmnopqrst" not in caplog.text
    assert "[REDACTED" in caplog.text or "REDACTED" in caplog.text


def test_secret_redaction_preserves_uvicorn_access_log_args_shape():
    # Uvicorn's AccessFormatter unpacks record.args directly, so the global
    # redaction hook must not collapse args after formatting.
    import logging

    from app.core.secret_redaction import _scrub_log_record

    record = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        __file__,
        1,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:54723", "POST", "/api/v1/auth/login", "1.1", 401),
        None,
    )

    scrubbed = _scrub_log_record(record)

    assert scrubbed.args == (
        "127.0.0.1:54723",
        "POST",
        "/api/v1/auth/login",
        "1.1",
        401,
    )
    assert scrubbed.getMessage() == '127.0.0.1:54723 - "POST /api/v1/auth/login HTTP/1.1" 401'


def test_secret_redaction_scrubs_literal_msg_with_args_without_breaking_placeholders():
    import logging

    from app.core.secret_redaction import _scrub_log_record

    record = logging.LogRecord(
        "test.secret_redaction",
        logging.INFO,
        __file__,
        1,
        "Auth failed for %s: Bearer token_abc123456",
        ("student@example.edu",),
        None,
    )

    scrubbed = _scrub_log_record(record)

    assert "token_abc123456" not in scrubbed.getMessage()
    assert "student@example.edu" in scrubbed.getMessage()

    placeholder_record = logging.LogRecord(
        "test.secret_redaction",
        logging.INFO,
        __file__,
        1,
        "upstream failed with api_key=%s",
        ("sk-live-abcdefghijklmnopqrst",),
        None,
    )

    scrubbed_placeholder = _scrub_log_record(placeholder_record)

    assert "sk-live-abcdefghijklmnopqrst" not in scrubbed_placeholder.getMessage()
    assert "api_key=[REDACTED" in scrubbed_placeholder.getMessage()


def test_secret_redaction_scrubs_nested_log_args():
    import logging

    from app.core.secret_redaction import _scrub_log_record

    record = logging.LogRecord(
        "test.secret_redaction",
        logging.INFO,
        __file__,
        1,
        "payload=%s",
        (({"token": "sk-live-abcdefghijklmnopqrst"},),),
        None,
    )

    scrubbed = _scrub_log_record(record)

    assert "sk-live-abcdefghijklmnopqrst" not in scrubbed.getMessage()
    assert "[REDACTED" in scrubbed.getMessage()


def test_chat_model_settings_reject_client_api_key():
    from pydantic import ValidationError

    from app.schemas.chat import ModelSettings

    with pytest.raises(ValidationError):
        ModelSettings(
            provider="groq",
            model="qwen/qwen3.6-27b",
            api_key="sk-should-never-be-accepted",
        )
