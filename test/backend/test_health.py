"""Tests for Feature 9 (System Health Monitoring): app/services/health.py's
four per-service checks plus the aggregate GET /api/v1/admin/health endpoint.

Service-layer checks are unit tested with mocks (no real DB/network, mirrors
test_dashboard_service_unit.py); the endpoint itself gets a real-Postgres
TestClient integration test (mirrors test_admin_management.py), since it
mainly needs to prove auth/role wiring and response shape, not re-test the
check logic.
"""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.main import app
from app.services.health import (
    _status_for_latency,
    check_ai,
    check_backend,
    check_canvas,
    check_database,
    get_health_history,
    get_latest_health_status,
    run_health_checks,
)


def _client_raising(exc: Exception) -> MagicMock:
    """A mock httpx.AsyncClient() context manager whose GET raises `exc`."""
    client = AsyncMock()
    client.get = AsyncMock(side_effect=exc)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


def _client_returning(response: MagicMock) -> MagicMock:
    client = AsyncMock()
    client.get = AsyncMock(return_value=response)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


# ---------------------------------------------------------------------------
# check_backend
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_check_backend_always_healthy_with_nonnegative_uptime():
    import time

    result = await check_backend(time.monotonic() - 5)
    assert result.status == "healthy"
    assert result.uptime_seconds is not None
    assert result.uptime_seconds >= 0


# ---------------------------------------------------------------------------
# _status_for_latency — the healthy/degraded boundary shared by every
# network-backed check
# ---------------------------------------------------------------------------

def test_status_for_latency_fast_is_healthy():
    assert _status_for_latency(latency_ms=100, timeout_seconds=5.0) == "healthy"


def test_status_for_latency_exactly_at_ratio_is_healthy():
    # 5.0s timeout * 0.5 ratio = 2500ms boundary; exactly at it is not "over".
    assert _status_for_latency(latency_ms=2500, timeout_seconds=5.0) == "healthy"


def test_status_for_latency_just_over_ratio_is_degraded():
    assert _status_for_latency(latency_ms=2501, timeout_seconds=5.0) == "degraded"


# ---------------------------------------------------------------------------
# check_database
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_check_database_healthy_when_query_succeeds():
    db = AsyncMock()
    db.execute = AsyncMock(return_value=None)

    result = await check_database(db)

    assert result.status == "healthy"
    assert result.error_detail is None


@pytest.mark.asyncio
async def test_check_database_down_when_query_raises():
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=RuntimeError("connection refused"))

    result = await check_database(db)

    assert result.status == "down"
    assert "connection refused" in result.error_detail


@pytest.mark.asyncio
async def test_check_database_degraded_when_status_helper_says_so():
    # A slow-but-successful query defers its healthy/degraded decision to
    # _status_for_latency (already covered directly above) -- confirm
    # check_database actually uses that verdict rather than hardcoding
    # "healthy" for any successful query.
    db = AsyncMock()
    db.execute = AsyncMock(return_value=None)

    with patch("app.services.health._status_for_latency", return_value="degraded"):
        result = await check_database(db)

    assert result.status == "degraded"


# ---------------------------------------------------------------------------
# check_canvas
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_check_canvas_healthy_on_200():
    response = MagicMock()
    response.is_server_error = False
    response.status_code = 200

    with patch(
        "app.services.health.httpx.AsyncClient",
        return_value=_client_returning(response),
    ):
        result = await check_canvas()

    assert result.status in ("healthy", "degraded")


@pytest.mark.asyncio
async def test_check_canvas_healthy_without_any_canvas_token_configured():
    """Canvas connectivity is deliberately unauthenticated -- there is no
    single shared Canvas credential representing "the platform" (every
    instructor connects their own token to their own Canvas instance), so
    this check must not depend on CANVAS_API_TOKEN being set at all."""
    response = MagicMock()
    response.is_server_error = False
    response.status_code = 200

    with (
        patch.object(settings, "CANVAS_API_TOKEN", ""),
        patch(
            "app.services.health.httpx.AsyncClient",
            return_value=_client_returning(response),
        ),
    ):
        result = await check_canvas()

    assert result.status in ("healthy", "degraded")


@pytest.mark.asyncio
async def test_check_canvas_down_on_timeout():
    with (
        patch.object(settings, "CANVAS_API_URL", "https://canvas.example.edu"),
        patch(
            "app.services.health.httpx.AsyncClient",
            return_value=_client_raising(httpx.TimeoutException("timed out")),
        ),
    ):
        result = await check_canvas()

    assert result.status == "down"


@pytest.mark.asyncio
async def test_check_canvas_down_on_request_error():
    with (
        patch.object(settings, "CANVAS_API_URL", "https://canvas.example.edu"),
        patch(
            "app.services.health.httpx.AsyncClient",
            return_value=_client_raising(httpx.RequestError("unreachable")),
        ),
    ):
        result = await check_canvas()

    assert result.status == "down"


@pytest.mark.asyncio
async def test_check_canvas_down_on_server_error():
    # A 5xx (Canvas itself broken) is not an httpx exception -- check_canvas
    # must inspect response.is_server_error itself, not just the except
    # clauses.
    response = MagicMock()
    response.is_server_error = True
    response.status_code = 500

    with (
        patch.object(settings, "CANVAS_API_URL", "https://canvas.example.edu"),
        patch(
            "app.services.health.httpx.AsyncClient",
            return_value=_client_returning(response),
        ),
    ):
        result = await check_canvas()

    assert result.status == "down"
    assert "500" in result.error_detail


@pytest.mark.asyncio
async def test_check_canvas_healthy_on_non_server_error_response():
    # Any non-5xx response (even a 401/404, e.g. from an unexpected /login
    # redirect chain) proves the host is reachable -- "connectivity" is
    # about the network/host being up, not about any specific status code.
    response = MagicMock()
    response.is_server_error = False
    response.status_code = 404

    with patch(
        "app.services.health.httpx.AsyncClient",
        return_value=_client_returning(response),
    ):
        result = await check_canvas()

    assert result.status in ("healthy", "degraded")


@pytest.mark.asyncio
async def test_check_canvas_degraded_when_status_helper_says_so():
    response = MagicMock()
    response.is_server_error = False
    response.status_code = 200

    with (
        patch(
            "app.services.health.httpx.AsyncClient",
            return_value=_client_returning(response),
        ),
        patch("app.services.health._status_for_latency", return_value="degraded"),
    ):
        result = await check_canvas()

    assert result.status == "degraded"


# ---------------------------------------------------------------------------
# check_ai
# ---------------------------------------------------------------------------

class SimpleAdapter:
    """Minimal LLMAdapter stand-in so check_ai's tests don't need a real
    provider config -- just a generate() that returns or raises on demand."""

    def __init__(self, result: str | None = None, exc: Exception | None = None):
        self._result = result
        self._exc = exc

    async def generate(self, system_prompt, user_message, timeout=30.0, history=None):
        if self._exc:
            raise self._exc
        return self._result


def _mock_active_llm_config(provider: str = "groq"):
    """check_ai now resolves the admin's active provider (Feature 8) before
    building an adapter -- these tests don't exercise that resolution
    itself (see test_check_ai_uses_admin_configured_provider below), just
    the generate()/status-mapping logic, so this is patched to a fixed,
    known-good config."""
    from app.services.llm.provider_registry import ActiveLlmConfig

    return patch(
        "app.services.health.get_active_llm_config",
        new=AsyncMock(
            return_value=ActiveLlmConfig(
                provider=provider,
                model="test-model",
                fallback_provider=None,
                fallback_model=None,
                cache_enabled=False,
                cache_ttl_seconds=300,
            )
        ),
    )


@pytest.mark.asyncio
async def test_check_ai_healthy_when_generate_succeeds():
    with (
        _mock_active_llm_config(),
        patch(
            "app.services.health.get_llm_adapter",
            return_value=SimpleAdapter(result="OK"),
        ),
    ):
        result = await check_ai(AsyncMock())

    assert result.status in ("healthy", "degraded")


@pytest.mark.asyncio
async def test_check_ai_uses_admin_configured_provider():
    """The whole point of the fix: check_ai must monitor whatever provider
    the admin actually set active, not settings.DEFAULT_LLM_PROVIDER."""
    with (
        _mock_active_llm_config(provider="openai"),
        patch(
            "app.services.health.get_llm_adapter",
            return_value=SimpleAdapter(result="OK"),
        ) as mock_get_adapter,
    ):
        await check_ai(AsyncMock())

    called_settings = mock_get_adapter.call_args.args[0]
    assert called_settings["provider"] == "openai"


@pytest.mark.asyncio
async def test_check_ai_degraded_when_status_helper_says_so():
    with (
        _mock_active_llm_config(),
        patch(
            "app.services.health.get_llm_adapter",
            return_value=SimpleAdapter(result="OK"),
        ),
        patch("app.services.health._status_for_latency", return_value="degraded"),
    ):
        result = await check_ai(AsyncMock())

    assert result.status == "degraded"


@pytest.mark.asyncio
async def test_check_ai_degraded_on_auth_or_billing_rejection():
    # 401 (bad key), 402 (out of credits), and 429 (rate-limited) all mean
    # the provider responded normally -- it's our credential/quota that
    # needs attention, not a real outage, so these are "degraded" not "down".
    for status_code in (401, 402, 429):
        request = httpx.Request("POST", "https://example.com/chat/completions")
        response = httpx.Response(status_code, request=request)
        error = httpx.HTTPStatusError("rejected", request=request, response=response)

        with (
            _mock_active_llm_config(),
            patch(
                "app.services.health.get_llm_adapter",
                return_value=SimpleAdapter(exc=error),
            ),
        ):
            result = await check_ai(AsyncMock())

        assert result.status == "degraded", f"status_code={status_code}"
        assert str(status_code) in result.error_detail


@pytest.mark.asyncio
async def test_check_ai_down_on_server_error():
    request = httpx.Request("POST", "https://example.com/chat/completions")
    response = httpx.Response(503, request=request)
    error = httpx.HTTPStatusError("service unavailable", request=request, response=response)

    with (
        _mock_active_llm_config(),
        patch(
            "app.services.health.get_llm_adapter",
            return_value=SimpleAdapter(exc=error),
        ),
    ):
        result = await check_ai(AsyncMock())

    assert result.status == "down"
    assert "503" in result.error_detail


@pytest.mark.asyncio
async def test_check_ai_down_on_timeout():
    with (
        _mock_active_llm_config(),
        patch(
            "app.services.health.get_llm_adapter",
            return_value=SimpleAdapter(exc=httpx.TimeoutException("timed out")),
        ),
    ):
        result = await check_ai(AsyncMock())

    assert result.status == "down"


@pytest.mark.asyncio
async def test_check_ai_down_on_misconfiguration():
    """get_llm_adapter/generate raising a plain (non-httpx) exception -- e.g.
    an unknown provider or missing api_key -- must still resolve to "down",
    not propagate and 500 the whole aggregate endpoint."""
    with (
        _mock_active_llm_config(),
        patch(
            "app.services.health.get_llm_adapter",
            side_effect=ValueError("Unknown LLM provider: bogus"),
        ),
    ):
        result = await check_ai(AsyncMock())

    assert result.status == "down"


# ---------------------------------------------------------------------------
# run_health_checks — overall status + persistence
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_run_health_checks_overall_status_is_worst_of_four():
    from app.schemas.health import ServiceHealth

    db = AsyncMock()
    db.add = MagicMock()  # session.add() is sync in real SQLAlchemy, not a coroutine
    with (
        patch(
            "app.services.health.check_backend",
            new=AsyncMock(return_value=ServiceHealth(status="healthy", latency_ms=0, uptime_seconds=1)),
        ),
        patch(
            "app.services.health.check_database",
            new=AsyncMock(return_value=ServiceHealth(status="degraded", latency_ms=100)),
        ),
        patch(
            "app.services.health.check_canvas",
            new=AsyncMock(return_value=ServiceHealth(status="healthy", latency_ms=50)),
        ),
        patch(
            "app.services.health.check_ai",
            new=AsyncMock(return_value=ServiceHealth(status="down", error_detail="boom")),
        ),
    ):
        result = await run_health_checks(db, backend_started_at=0.0)

    assert result.overall_status == "down"
    assert set(result.services.keys()) == {"backend", "database", "canvas", "ai"}
    # One HealthCheck row added per service.
    assert db.add.call_count == 4
    # Once for the 4 new rows, once for the retention prune (Phase 2).
    assert db.commit.await_count == 2


@pytest.mark.asyncio
async def test_run_health_checks_overall_status_healthy_when_all_healthy():
    from app.schemas.health import ServiceHealth

    db = AsyncMock()
    db.add = MagicMock()
    healthy = ServiceHealth(status="healthy", latency_ms=10)
    with (
        patch("app.services.health.check_backend", new=AsyncMock(return_value=healthy)),
        patch("app.services.health.check_database", new=AsyncMock(return_value=healthy)),
        patch("app.services.health.check_canvas", new=AsyncMock(return_value=healthy)),
        patch("app.services.health.check_ai", new=AsyncMock(return_value=healthy)),
    ):
        result = await run_health_checks(db, backend_started_at=0.0)

    assert result.overall_status == "healthy"


@pytest.mark.asyncio
async def test_run_health_checks_overall_status_degraded_when_no_service_is_down():
    from app.schemas.health import ServiceHealth

    db = AsyncMock()
    db.add = MagicMock()
    with (
        patch(
            "app.services.health.check_backend",
            new=AsyncMock(return_value=ServiceHealth(status="healthy", latency_ms=0, uptime_seconds=1)),
        ),
        patch(
            "app.services.health.check_database",
            new=AsyncMock(return_value=ServiceHealth(status="degraded", latency_ms=3000)),
        ),
        patch(
            "app.services.health.check_canvas",
            new=AsyncMock(return_value=ServiceHealth(status="healthy", latency_ms=50)),
        ),
        patch(
            "app.services.health.check_ai",
            new=AsyncMock(return_value=ServiceHealth(status="healthy", latency_ms=500)),
        ),
    ):
        result = await run_health_checks(db, backend_started_at=0.0)

    assert result.overall_status == "degraded"


@pytest.mark.asyncio
async def test_run_health_checks_real_session_does_not_share_across_concurrent_tasks():
    """Regression test for the fixed concurrent-AsyncSession bug: exercises
    the real aggregate path (check_database) against a real session instead
    of mocking it away. check_canvas/check_ai are still mocked so this
    doesn't make real outbound network calls in CI."""
    from app.schemas.health import ServiceHealth

    engine, Session = _make_session()
    try:
        async with Session() as db:
            with (
                patch(
                    "app.services.health.check_canvas",
                    new=AsyncMock(return_value=ServiceHealth(status="healthy", latency_ms=10)),
                ),
                patch(
                    "app.services.health.check_ai",
                    new=AsyncMock(return_value=ServiceHealth(status="healthy", latency_ms=10)),
                ),
            ):
                result = await run_health_checks(db, backend_started_at=0.0)

            assert result.services["database"].status in ("healthy", "degraded", "down")
    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# get_latest_health_status — "unknown" empty state
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_latest_health_status_unknown_when_never_checked():
    """A fresh deploy (or every row pruned) must not be reported as
    "healthy" -- that's a confirmed-good claim this endpoint has no basis
    for making when nothing has ever been checked."""
    db = AsyncMock()
    db.scalars = AsyncMock(return_value=iter([]))

    result = await get_latest_health_status(db)

    assert result.overall_status == "unknown"
    assert result.checked_at is None
    assert result.services == {}


# ---------------------------------------------------------------------------
# GET /api/v1/admin/health — HTTP integration (real Postgres, real auth)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def admin_token(client, admin_credentials):
    resp = client.post("/api/v1/auth/admin/login", json=admin_credentials)
    assert resp.status_code == 200, resp.json()
    return resp.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


async def _get_recent_health_check_services(since) -> set[str]:
    from app.models.health_check import HealthCheck

    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            result = await db.scalars(
                select(HealthCheck.service).where(HealthCheck.checked_at >= since)
            )
            return set(result)
    finally:
        await engine.dispose()


def test_admin_health_persists_one_row_per_service(client, admin_headers):
    """Directly verifies the "Verify monitoring" requirement: each call to
    GET /admin/health must leave a real, queryable audit trail behind, not
    just return a response."""
    import asyncio
    from datetime import UTC, datetime, timedelta

    before = datetime.now(UTC) - timedelta(seconds=5)

    resp = client.get("/api/v1/admin/health", headers=admin_headers)
    assert resp.status_code == 200

    services = asyncio.run(_get_recent_health_check_services(before))
    assert {"backend", "database", "canvas", "ai"} <= services


def test_admin_health_returns_200_with_all_four_services(client, admin_headers):
    resp = client.get("/api/v1/admin/health", headers=admin_headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["overall_status"] in ("healthy", "degraded", "down")
    assert set(body["services"].keys()) == {"backend", "database", "canvas", "ai"}
    assert body["services"]["backend"]["status"] == "healthy"


def test_admin_health_rejects_instructor_token(client):
    email = f"inst_{uuid.uuid4()}@example.com"
    token = client.post(
        "/api/v1/auth/register",
        json={"name": "I", "email": email, "password": "Secret123!"},
    ).json()["access_token"]

    resp = client.get(
        "/api/v1/admin/health",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 403


def test_admin_health_requires_auth(client):
    resp = client.get("/api/v1/admin/health")

    assert resp.status_code == 401


def _make_session():
    engine = create_async_engine(settings.DATABASE_URL)
    return engine, async_sessionmaker(engine, expire_on_commit=False)


# ---------------------------------------------------------------------------
# Phase 2: GET /admin/health/latest and /admin/health/history
# ---------------------------------------------------------------------------

async def _count_health_checks() -> int:
    from app.models.health_check import HealthCheck
    from sqlalchemy import func

    engine, Session = _make_session()
    try:
        async with Session() as db:
            return await db.scalar(select(func.count()).select_from(HealthCheck)) or 0
    finally:
        await engine.dispose()


def test_admin_health_latest_does_not_insert_new_rows(client, admin_headers):
    import asyncio

    before = asyncio.run(_count_health_checks())
    resp = client.get("/api/v1/admin/health/latest", headers=admin_headers)
    after = asyncio.run(_count_health_checks())

    assert resp.status_code == 200
    assert after == before


def test_admin_health_latest_reflects_persisted_state(client, admin_headers):
    # Ensure at least one real run has happened so /latest has something to read.
    client.get("/api/v1/admin/health", headers=admin_headers)

    resp = client.get("/api/v1/admin/health/latest", headers=admin_headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["overall_status"] in ("healthy", "degraded", "down")
    assert set(body["services"].keys()) <= {"backend", "database", "canvas", "ai"}
    assert body["checked_at"] is not None


def test_admin_health_history_returns_recent_entries(client, admin_headers):
    client.get("/api/v1/admin/health", headers=admin_headers)

    resp = client.get("/api/v1/admin/health/history?hours=24", headers=admin_headers)

    assert resp.status_code == 200
    body = resp.json()
    assert set(body["services"].keys()) == {"backend", "database", "canvas", "ai"}
    assert len(body["services"]["backend"]) >= 1


def test_admin_health_latest_and_history_require_admin(client):
    email = f"inst_{uuid.uuid4()}@example.com"
    token = client.post(
        "/api/v1/auth/register",
        json={"name": "I", "email": email, "password": "Secret123!"},
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    assert client.get("/api/v1/admin/health/latest", headers=headers).status_code == 403
    assert client.get("/api/v1/admin/health/history", headers=headers).status_code == 403


def test_admin_health_latest_and_history_require_auth(client):
    assert client.get("/api/v1/admin/health/latest").status_code == 401
    assert client.get("/api/v1/admin/health/history").status_code == 401


# ---------------------------------------------------------------------------
# Phase 2: get_health_history row cap
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_health_history_caps_total_rows():
    """Each live check writes one row per service in lockstep, so a global
    row cap (rather than a per-service window-function query) still keeps
    services balanced. Patches the cap down to a small number so the test
    doesn't need to insert hundreds of rows to exercise it."""
    from datetime import UTC, datetime, timedelta

    from app.models.health_check import HealthCheck

    engine, Session = _make_session()
    try:
        async with Session() as db:
            now = datetime.now(UTC)
            # 3 runs * 4 services = 12 rows, newest last.
            for i in range(3):
                for service in ("backend", "database", "canvas", "ai"):
                    db.add(
                        HealthCheck(
                            service=service,
                            status="healthy",
                            latency_ms=i,
                            checked_at=now - timedelta(minutes=3 - i),
                        )
                    )
            await db.commit()

            with patch("app.services.health._MAX_HISTORY_ROWS_PER_SERVICE", 1):
                result = await get_health_history(db, hours=24)

            total_entries = sum(len(entries) for entries in result.services.values())
            # Cap is 1 row/service * 4 services = 4, but the shared dev/test
            # DB may hold other recent rows too -- assert the cap is
            # actually enforced (well under the uncapped 12+), not an exact
            # count.
            assert total_entries <= 4
    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# Phase 2: health_checks retention
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_run_health_checks_prunes_rows_older_than_retention_window():
    from datetime import UTC, datetime, timedelta

    from app.models.health_check import HealthCheck
    from app.schemas.health import ServiceHealth

    engine, Session = _make_session()
    try:
        async with Session() as db:
            old_row = HealthCheck(
                service="backend",
                status="healthy",
                latency_ms=1,
                checked_at=datetime.now(UTC) - timedelta(days=31),
            )
            db.add(old_row)
            await db.commit()
            await db.refresh(old_row)
            old_row_id = old_row.id

            healthy = ServiceHealth(status="healthy", latency_ms=1)
            with (
                patch("app.services.health.check_backend", new=AsyncMock(return_value=healthy)),
                patch("app.services.health.check_database", new=AsyncMock(return_value=healthy)),
                patch("app.services.health.check_canvas", new=AsyncMock(return_value=healthy)),
                patch("app.services.health.check_ai", new=AsyncMock(return_value=healthy)),
            ):
                await run_health_checks(db, backend_started_at=0.0)

            still_there = await db.get(HealthCheck, old_row_id)
            assert still_there is None
    finally:
        await engine.dispose()
