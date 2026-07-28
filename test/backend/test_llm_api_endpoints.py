"""API coverage for instructor LLM connections and chat provider enforcement."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.security import decrypt_llm_api_key
from app.main import app
from app.models.instructor_llm_connection import InstructorLlmConnection


@pytest.fixture(scope="module")
def client():
    app.state.limiter.enabled = False
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


def _register(client: TestClient) -> dict:
    email = f"llm_api_{uuid.uuid4()}@example.com"
    resp = client.post(
        "/api/v1/auth/register",
        json={"name": "LLM API Test", "email": email, "password": "secret123"},
    )
    assert resp.status_code == 201, resp.json()
    token = resp.json()["access_token"]
    return {
        "email": email,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"},
    }


def _user_id_from_me(client: TestClient, headers: dict) -> int:
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200, me.json()
    return me.json()["id"]


def test_llm_providers_requires_auth(client):
    resp = client.get("/api/v1/llm/providers")
    assert resp.status_code == 401


def test_llm_providers_returns_catalog_for_instructor(client):
    reg = _register(client)
    with patch(
        "app.services.llm.llm_connections.check_provider_health",
        new_callable=AsyncMock,
    ) as health:
        health.return_value = {
            "status": "unconfigured",
            "models": [],
            "detail": "not configured",
        }
        resp = client.get("/api/v1/llm/providers", headers=reg["headers"])

    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert "default_provider" in body
    assert "default_model" in body
    assert isinstance(body["providers"], list)
    assert body["providers"], "expected at least one provider"
    ids = {provider["id"] for provider in body["providers"]}
    assert "openai" in ids
    assert "openai_compatible_custom" in ids
    sample = next(provider for provider in body["providers"] if provider["id"] == "openai")
    assert "connected" in sample
    assert "requires_api_key" in sample
    assert "accepts_api_key" in sample
    assert "has_api_key" in sample
    assert "api_key" not in sample


def test_save_llm_connection_stores_encrypted_key_and_never_returns_it(client):
    reg = _register(client)
    headers = reg["headers"]
    user_id = _user_id_from_me(client, headers)

    with patch(
        "app.services.llm.llm_connections.validate_api_key",
        new_callable=AsyncMock,
        return_value=(True, None),
    ):
        resp = client.put(
            "/api/v1/llm/connections/openai",
            headers=headers,
            json={"api_key": "sk-test-secret", "model": "gpt-4o-mini"},
        )
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["provider_id"] == "openai"
    assert body["model"] == "gpt-4o-mini"
    assert body["has_api_key"] is True
    assert "api_key" not in body
    assert "encrypted_api_key" not in body
    assert "sk-test-secret" not in resp.text

    async def _read_row():
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

        from app.config import settings

        engine = create_async_engine(settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                row = await db.get(
                    InstructorLlmConnection,
                    {"user_id": user_id, "provider_id": "openai"},
                )
                assert row is not None
                assert row.encrypted_api_key
                assert row.encrypted_api_key != "sk-test-secret"
                assert decrypt_llm_api_key(row.encrypted_api_key) == "sk-test-secret"
        finally:
            await engine.dispose()

    import asyncio

    asyncio.run(_read_row())

    with (
        patch(
            "app.services.llm.llm_connections.validate_api_key",
            new_callable=AsyncMock,
            return_value=(True, None),
        ),
        patch(
            "app.services.llm.llm_connections.check_provider_health",
            new_callable=AsyncMock,
        ) as health,
    ):
        health.return_value = {
            "status": "unconfigured",
            "models": ["gpt-4o-mini"],
            "detail": None,
        }
        catalog = client.get("/api/v1/llm/providers", headers=headers)

    assert catalog.status_code == 200
    openai = next(
        provider
        for provider in catalog.json()["providers"]
        if provider["id"] == "openai"
    )
    assert openai["connected"] is True
    assert openai["has_api_key"] is True


def test_save_llm_connection_rejects_key_the_provider_does_not_recognize(client):
    reg = _register(client)
    headers = reg["headers"]

    with patch(
        "app.services.llm.llm_connections.validate_api_key",
        new_callable=AsyncMock,
        return_value=(False, "The provider rejected this API key."),
    ) as validate:
        resp = client.put(
            "/api/v1/llm/connections/openai",
            headers=headers,
            json={"api_key": "sk-invalid", "model": "gpt-4o-mini"},
        )

    assert resp.status_code == 422, resp.json()
    assert "rejected" in resp.json()["detail"].lower()
    validate.assert_called()


def test_delete_llm_connection_removes_stored_key(client):
    reg = _register(client)
    headers = reg["headers"]

    with patch(
        "app.services.llm.llm_connections.validate_api_key",
        new_callable=AsyncMock,
        return_value=(True, None),
    ):
        save = client.put(
            "/api/v1/llm/connections/openai",
            headers=headers,
            json={"api_key": "sk-to-delete", "model": "gpt-4o-mini"},
        )
    assert save.status_code == 200, save.json()

    deleted = client.delete("/api/v1/llm/connections/openai", headers=headers)
    assert deleted.status_code == 204

    missing = client.delete("/api/v1/llm/connections/openai", headers=headers)
    assert missing.status_code == 404


def test_save_unknown_provider_is_rejected(client):
    reg = _register(client)
    resp = client.put(
        "/api/v1/llm/connections/not-a-real-provider",
        headers=reg["headers"],
        json={"api_key": "x", "model": "y"},
    )
    assert resp.status_code == 422


def test_openai_requires_api_key_when_unconfigured(client):
    reg = _register(client)
    with patch(
        "app.services.llm.llm_connections.get_provider_definition"
    ) as get_def:
        from app.services.llm.provider_registry import ProviderDefinition

        get_def.return_value = ProviderDefinition(
            id="openai",
            name="OpenAI",
            hosting="internet",
            default_model="gpt-4o-mini",
            base_url="https://api.openai.com/v1",
            api_key="",
        )
        resp = client.put(
            "/api/v1/llm/connections/openai",
            headers=reg["headers"],
            json={"model": "gpt-4o-mini"},
        )
    assert resp.status_code == 422
    assert "API key" in resp.json()["detail"]


def test_custom_provider_requires_base_url_and_key(client):
    reg = _register(client)
    headers = reg["headers"]

    missing_url = client.put(
        "/api/v1/llm/connections/openai_compatible_custom",
        headers=headers,
        json={"api_key": "sk-custom", "model": "custom-model"},
    )
    assert missing_url.status_code == 422

    with patch(
        "app.services.llm.llm_connections.validate_api_key",
        new_callable=AsyncMock,
        return_value=(True, None),
    ):
        created = client.put(
            "/api/v1/llm/connections/openai_compatible_custom",
            headers=headers,
            json={
                "api_key": "sk-custom",
                "model": "custom-model",
                "base_url": "https://api.example.com/v1",
            },
        )
    assert created.status_code == 200, created.json()
    assert created.json()["base_url"] == "https://api.example.com/v1"
    assert created.json()["has_api_key"] is True

    # Model-only update keeps existing base URL.
    updated = client.put(
        "/api/v1/llm/connections/openai_compatible_custom",
        headers=headers,
        json={"model": "custom-model-v2"},
    )
    assert updated.status_code == 200, updated.json()
    assert updated.json()["model"] == "custom-model-v2"
    assert updated.json()["base_url"] == "https://api.example.com/v1"


def test_chat_rejects_disconnected_custom_provider(client):
    reg = _register(client)
    resp = client.post(
        "/api/v1/chat/",
        headers=reg["headers"],
        json={
            "message": "hello",
            "model_settings": {
                "provider": "openai_compatible_custom",
                "model": "anything",
            },
        },
    )
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["is_error"] is True
    assert "not connected" in body["reply"]["error"].lower()


def test_chat_uses_connected_provider_with_stored_instructor_key(client):
    reg = _register(client)
    headers = reg["headers"]

    with patch(
        "app.services.llm.llm_connections.validate_api_key",
        new_callable=AsyncMock,
        return_value=(True, None),
    ):
        save = client.put(
            "/api/v1/llm/connections/openai",
            headers=headers,
            json={"api_key": "sk-chat-test", "model": "gpt-4o-mini"},
        )
    assert save.status_code == 200, save.json()

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = "Hello from the connected provider."

    with (
        patch(
            "app.services.llm.llm_connections.validate_api_key",
            new_callable=AsyncMock,
            return_value=(True, None),
        ),
        patch(
            "app.services.llm.llm_connections.check_provider_health",
            new_callable=AsyncMock,
        ) as health,
        patch("app.services.chat.get_llm_adapter", return_value=mock_adapter) as get_adapter,
    ):
        health.return_value = {
            "status": "unconfigured",
            "models": ["gpt-4o-mini"],
            "detail": None,
        }
        resp = client.post(
            "/api/v1/chat/",
            headers=headers,
            json={
                "message": "Say hi",
                "model_settings": {
                    "provider": "openai",
                    "model": "gpt-4o-mini",
                },
            },
        )

    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["is_error"] is False
    get_adapter.assert_called()
    adapter_settings = get_adapter.call_args[0][0]
    assert adapter_settings["provider"] == "openai"
    assert adapter_settings["model"] == "gpt-4o-mini"
    assert adapter_settings["api_key"] == "sk-chat-test"
    mock_adapter.generate.assert_called()


def test_admin_llm_defaults_require_admin(client):
    reg = _register(client)
    resp = client.get("/api/v1/admin/llm/providers", headers=reg["headers"])
    assert resp.status_code == 403


def test_admin_can_update_llm_defaults(client, admin_credentials):
    login = client.post("/api/v1/auth/admin/login", json=admin_credentials)
    assert login.status_code == 200, login.json()
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    current = client.get("/api/v1/admin/llm/providers", headers=headers)
    assert current.status_code == 200, current.json()
    original = current.json()["config"]

    payload = {
        **original,
        "provider": "ollama",
        "model": "llama3.2",
        "fallback_provider": None,
        "fallback_model": None,
        "cache_enabled": True,
        "cache_ttl_seconds": 300,
    }
    try:
        updated = client.put(
            "/api/v1/admin/llm/providers",
            headers=headers,
            json=payload,
        )
        assert updated.status_code == 200, updated.json()
        assert updated.json()["config"]["provider"] == "ollama"
        assert updated.json()["config"]["model"] == "llama3.2"
    finally:
        # Restore so later chat tests keep a connected default provider.
        client.put(
            "/api/v1/admin/llm/providers",
            headers=headers,
            json=original,
        )


def test_admin_update_rejects_unknown_provider(client, admin_credentials):
    login = client.post("/api/v1/auth/admin/login", json=admin_credentials)
    assert login.status_code == 200, login.json()
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    current = client.get("/api/v1/admin/llm/providers", headers=headers)
    assert current.status_code == 200, current.json()
    original = current.json()["config"]

    invalid_provider = client.put(
        "/api/v1/admin/llm/providers",
        headers=headers,
        json={
            **original,
            "provider": "not-a-real-provider",
            "model": "whatever",
        },
    )
    assert invalid_provider.status_code == 422, invalid_provider.json()
    assert "Unknown LLM provider" in invalid_provider.json()["detail"]

    invalid_fallback = client.put(
        "/api/v1/admin/llm/providers",
        headers=headers,
        json={
            **original,
            "fallback_provider": "also-not-real",
            "fallback_model": "whatever",
        },
    )
    assert invalid_fallback.status_code == 422, invalid_fallback.json()
    assert "Unknown LLM provider" in invalid_fallback.json()["detail"]
