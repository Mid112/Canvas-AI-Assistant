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


def pytest_collection_modifyitems(config, items):
    """Optionally select a deterministic CI shard without changing test behavior.

    CI sets both variables when it fans the backend suite out across isolated
    PostgreSQL containers. Local runs remain unchanged when they are absent.
    Sorting by node id keeps the partition stable as long as the collected
    suite is unchanged, while round-robin assignment avoids putting all of the
    large parametrized modules in one shard.
    """
    del config
    raw_index = os.environ.get("PYTEST_SHARD_INDEX")
    raw_count = os.environ.get("PYTEST_SHARD_COUNT")
    if raw_index is None and raw_count is None:
        return
    if raw_index is None or raw_count is None:
        raise pytest.UsageError(
            "PYTEST_SHARD_INDEX and PYTEST_SHARD_COUNT must be set together"
        )

    try:
        shard_index = int(raw_index)
        shard_count = int(raw_count)
    except ValueError as exc:
        raise pytest.UsageError("pytest shard values must be integers") from exc
    if shard_count < 1 or shard_index < 0 or shard_index >= shard_count:
        raise pytest.UsageError("pytest shard index must be within the shard count")

    ordered = sorted(items, key=lambda item: item.nodeid)
    items[:] = [
        item
        for position, item in enumerate(ordered)
        if position % shard_count == shard_index
    ]


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


@pytest.fixture(autouse=True)
def reset_rate_limiter_state():
    """Keep in-memory SlowAPI counters from leaking across test cases.

    Individual tests can still exercise rate limits within one request burst;
    this only prevents unrelated modules from inheriting a saturated
    ``testclient`` bucket.
    """
    from app.main import app

    app.state.limiter.reset()
    yield
    app.state.limiter.reset()


@pytest.fixture
def create_local_course_for_user_email():
    """Create an owned local course without requiring a Canvas token.

    Use this for route tests that need to isolate token lookup behavior from
    course ownership lookup.
    """
    from app.config import settings as _settings
    from app.models.course import Course
    from app.models.user import User
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    def _factory(email: str, *, canvas_url: str, canvas_course_id: str | None = None) -> int:
        async def _create() -> int:
            engine = create_async_engine(_settings.DATABASE_URL)
            try:
                async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                    user = await db.scalar(select(User).where(User.email == email))
                    assert user is not None
                    course = Course(
                        canvas_course_id=canvas_course_id or str(uuid.uuid4().int % 10_000_000),
                        canvas_url=canvas_url,
                        name="CPSC 310",
                        course_code="CPSC310",
                        workflow_state="available",
                        instructor_id=user.id,
                    )
                    db.add(course)
                    await db.commit()
                    await db.refresh(course)
                    return course.id
            finally:
                await engine.dispose()

        return asyncio.run(_create())

    return _factory


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


# ── Requirement traceability ─────────────────────────────────────────────
# Records which UR/FR each @pytest.mark.requirement test demonstrates and
# whether it passed, so the traceability report is generated from the tests
# that actually ran rather than from a hand-maintained list that goes stale.
# Writes nothing unless --requirements-json is passed.

def pytest_addoption(parser):
    parser.addoption(
        "--requirements-json",
        action="store",
        default=None,
        help="write requirement->test results to this path (see tools/requirements_report.py)",
    )


def pytest_configure(config):
    config._requirement_results = {}


def pytest_runtest_logreport(report):
    # Only the call phase decides pass/fail; setup/teardown would double-count
    # and would report a passing test as failed on a teardown error.
    if report.when != "call":
        return
    config = getattr(report, "_config", None)
    store = getattr(config, "_requirement_results", None) if config else None
    if store is None:
        return
    for requirement_id in getattr(report, "_requirement_ids", ()):
        store.setdefault(requirement_id, []).append(
            {"test": report.nodeid, "outcome": report.outcome}
        )


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    # The marker lives on the item, not the report — carry it across, along
    # with the config the logreport hook needs to find the store.
    report._requirement_ids = [
        mark.args[0]
        for mark in item.iter_markers(name="requirement")
        if mark.args
    ]
    report._config = item.config


def pytest_sessionfinish(session, exitstatus):
    path = session.config.getoption("--requirements-json")
    if not path:
        return
    import json
    from pathlib import Path

    Path(path).write_text(
        json.dumps(session.config._requirement_results, indent=2, sort_keys=True)
    )
