import asyncio
import os
import sys
import uuid
from pathlib import Path

import pytest
from dotenv import load_dotenv

backend_path = Path(__file__).parent.parent.parent / "app" / "backend"
sys.path.insert(0, str(backend_path))

# Load app/backend/.env so DATABASE_URL and other settings are correct
# regardless of which directory pytest is run from
load_dotenv(backend_path / ".env")

# Chat tests mock the LLM adapter but still resolve a connected provider.
# CI and bare local envs may have no HF_TOKEN; give tests a dummy so the
# default huggingface provider counts as server-configured/connected.
if not os.environ.get("HF_TOKEN"):
    os.environ["HF_TOKEN"] = "test-hf-token-for-pytest"

# Settings validates CANVAS_TOKEN_ENCRYPTION_KEY at import time. An empty
# value in .env (common before first setup) still lands in os.environ as "",
# which fails collection — same default Fernet key as make e2e-up / local
# Makefile test targets so bare `pytest` matches CI/make test.
if not os.environ.get("CANVAS_TOKEN_ENCRYPTION_KEY"):
    os.environ["CANVAS_TOKEN_ENCRYPTION_KEY"] = (
        "ebcquOyeXkl8geXIi5sS4BYEeh1mYSdWHiSuBkXr9T4="
    )
if not os.environ.get("SECRET_KEY"):
    os.environ["SECRET_KEY"] = "localdevsecret"

# ---------------------------------------------------------------------------
# Shared fixtures (available to all test modules)
# ---------------------------------------------------------------------------


def _reset_llm_system_settings() -> None:
    """Clear persisted admin LLM defaults so tests share a clean baseline.

    Chat resolution requires a connected provider. Admin tests that change the
    institution default must not leave ollama/other unconfigured providers
    sticky for later chat suites sharing the same database.

    On a fresh CI database the tables do not exist until the first TestClient
    lifespan runs create_all(), so missing-table errors are ignored here.
    """
    from sqlalchemy import inspect
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.config import settings as _settings
    from app.models.system_setting import SystemSetting
    from app.services.llm.provider_registry import (
        ACTIVE_MODEL_KEY,
        ACTIVE_PROVIDER_KEY,
        CACHE_ENABLED_KEY,
        CACHE_TTL_KEY,
        FALLBACK_MODEL_KEY,
        FALLBACK_PROVIDER_KEY,
    )

    keys = (
        ACTIVE_PROVIDER_KEY,
        ACTIVE_MODEL_KEY,
        FALLBACK_PROVIDER_KEY,
        FALLBACK_MODEL_KEY,
        CACHE_ENABLED_KEY,
        CACHE_TTL_KEY,
    )

    async def _clear() -> None:
        engine = create_async_engine(_settings.DATABASE_URL)
        try:
            async with engine.connect() as conn:
                has_table = await conn.run_sync(
                    lambda sync_conn: inspect(sync_conn).has_table("system_settings")
                )
            if not has_table:
                return

            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                for key in keys:
                    row = await db.get(SystemSetting, key)
                    if row is not None:
                        await db.delete(row)
                await db.commit()
        finally:
            await engine.dispose()

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_clear())
    finally:
        loop.close()


@pytest.fixture(scope="module", autouse=True)
def reset_llm_system_settings_module():
    _reset_llm_system_settings()
    yield
    _reset_llm_system_settings()


@pytest.fixture(scope="module")
def admin_credentials():
    """Create a fresh admin user directly in the DB and return its credentials.

    Using scope="module" means each test module gets its own isolated admin,
    so tests in different modules don't share or pollute each other's sessions.
    """
    from app.core.security import hash_password
    from app.models.user import User

    email = f"admin_{uuid.uuid4()}@test.com"
    password = "AdminTestPass123!"

    async def _create():
        # Fresh engine so the global engine's asyncpg pool is never touched here.
        # asyncpg pools are bound to the event loop they're created in; sharing
        # the global engine across loops causes "Future attached to a different loop".
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
        from app.config import settings as _settings
        _engine = create_async_engine(_settings.DATABASE_URL)
        try:
            async with async_sessionmaker(_engine, expire_on_commit=False)() as db:
                db.add(User(
                    name="Test Administrator",
                    email=email,
                    hashed_password=hash_password(password),
                    role="admin",
                ))
                await db.commit()
        finally:
            await _engine.dispose()

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_create())
    finally:
        loop.close()

    return {"email": email, "password": password}
