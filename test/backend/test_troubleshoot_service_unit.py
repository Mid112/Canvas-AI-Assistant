"""Direct unit tests for services/troubleshoot.py."""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.services.troubleshoot import (
    get_diagnostics,
    get_instructor_canvas_summary,
    list_failing_canvas_connections,
)


def _make_session():
    engine = create_async_engine(settings.DATABASE_URL)
    return engine, async_sessionmaker(engine, expire_on_commit=False)


@pytest.mark.asyncio
async def test_get_diagnostics_composes_reused_services():
    """get_diagnostics is a thin composition over health.py/failed_operations.py/
    provider_registry -- assert it wires the reused calls through rather than
    reimplementing them, and appends its own uptime field. Failed-operation
    counts come from Feature 11's failed_operations table (services/
    failed_operations.py) -- there is exactly one "what failed" data source
    across System Health/Troubleshooting/the dedicated failed-ops views."""
    from app.schemas.failed_operations import FailedOperationSummaryResponse
    from app.schemas.health import LatestHealthResponse
    from app.schemas.troubleshoot import InstructorCanvasSummary

    fake_health = LatestHealthResponse(overall_status="healthy", checked_at=None, services={})
    fake_canvas = InstructorCanvasSummary(total=2, healthy=2, failing=0)
    fake_summary = FailedOperationSummaryResponse(total=4, canvas_count=3, ai_count=1, hours=24)
    fake_providers = [
        {
            "id": "openai",
            "name": "OpenAI",
            "hosting": "internet",
            "default_model": "gpt-4",
            "configured": True,
            "status": "available",
            "models": [],
            "detail": None,
        }
    ]

    db = AsyncMock()

    with (
        patch("app.services.troubleshoot.get_latest_health_status", AsyncMock(return_value=fake_health)),
        patch("app.services.troubleshoot.get_instructor_canvas_summary", AsyncMock(return_value=fake_canvas)),
        patch("app.services.troubleshoot.get_provider_statuses", AsyncMock(return_value=fake_providers)),
        patch(
            "app.services.troubleshoot.get_failed_operations_summary",
            AsyncMock(return_value=fake_summary),
        ),
    ):
        result = await get_diagnostics(db, backend_started_at=0.0)

    assert result.health == fake_health
    assert result.instructor_canvas == fake_canvas
    assert result.llm_providers[0].id == "openai"
    assert result.recent_failed_operations_count == 4
    assert result.backend_uptime_seconds >= 0


# ---------------------------------------------------------------------------
# get_instructor_canvas_summary — deep-dive detail, admin-only, lives here
# (not on System Health, which only shows the 4 core service tabs)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_instructor_canvas_summary_counts_reflect_a_new_failure():
    """The shared dev/test DB already has hundreds of failing connections
    left over from other test runs, and the admin-facing list is
    deliberately bounded (LIMIT 10) -- asserting our own row appears in that
    bounded list would be flaky (no guaranteed ordering, easily crowded out).
    Before/after deltas are robust regardless of pre-existing junk."""
    from app.models.canvas_connection import CanvasConnection
    from app.models.user import User

    engine, Session = _make_session()
    try:
        async with Session() as db:
            before = await get_instructor_canvas_summary(db)

            user = User(
                name="Broken Canvas Instructor",
                email=f"canvasfail_{uuid.uuid4()}@example.com",
                hashed_password="x",
                role="instructor",
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

            db.add(
                CanvasConnection(
                    user_id=user.id,
                    canvas_url="https://canvas.example.test",
                    encrypted_token="dummy",
                    last_sync_error="401 Unauthorized",
                )
            )
            await db.commit()

            after = await get_instructor_canvas_summary(db)

        assert after.total == before.total + 1
        assert after.failing == before.failing + 1
        assert after.healthy == before.healthy
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_list_failing_canvas_connections_maps_fields():
    """Direct unit test (mocked db) for the failing-connections list-building
    logic itself, isolated from the shared DB's real junk data."""
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=2)  # total failing
    db.execute = AsyncMock(
        return_value=[
            (7, "Jane Doe", "jane@example.com", "https://canvas.example.edu", "401 Unauthorized")
        ]
    )

    result = await list_failing_canvas_connections(db, limit=10, offset=0)

    assert result.total == 2
    assert len(result.items) == 1
    assert result.items[0].user_id == 7
    assert result.items[0].user_email == "jane@example.com"
    assert result.items[0].canvas_url == "https://canvas.example.edu"
    assert result.items[0].error_detail == "401 Unauthorized"


@pytest.mark.asyncio
async def test_list_failing_canvas_connections_redacts_secrets_in_error_detail():
    """last_sync_error is free-form text from an HTTP client failure and
    could echo a bearer token/API key back -- it must never reach an
    admin-facing response unredacted."""
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=1)  # total failing
    db.execute = AsyncMock(
        return_value=[
            (
                7,
                "Jane Doe",
                "jane@example.com",
                "https://canvas.example.edu",
                "401 Unauthorized: Authorization: Bearer sk-ant-abc12345secret",
            )
        ]
    )

    result = await list_failing_canvas_connections(db, limit=10, offset=0)

    error_detail = result.items[0].error_detail
    assert error_detail is not None
    assert "sk-ant-abc12345secret" not in error_detail
    assert "[REDACTED" in error_detail


@pytest.mark.asyncio
async def test_list_failing_canvas_connections_paginates_without_overlap():
    """Real-DB pagination test: seed 3 known failing connections, then page
    through them 1 at a time and assert every page is disjoint from the
    others and total reflects the increase -- robust against the shared
    dev/test DB's pre-existing junk rows since it only asserts our own IDs
    behave correctly relative to each other."""
    from app.models.canvas_connection import CanvasConnection
    from app.models.user import User

    engine, Session = _make_session()
    try:
        async with Session() as db:
            before = await get_instructor_canvas_summary(db)

            seeded_ids = []
            for _ in range(3):
                user = User(
                    name="Pagination Test Instructor",
                    email=f"pagetest_{uuid.uuid4()}@example.com",
                    hashed_password="x",
                    role="instructor",
                )
                db.add(user)
                await db.commit()
                await db.refresh(user)
                db.add(
                    CanvasConnection(
                        user_id=user.id,
                        canvas_url="https://canvas.example.test",
                        encrypted_token="dummy",
                        last_sync_error="401 Unauthorized",
                    )
                )
                await db.commit()
                seeded_ids.append(user.id)

            after = await get_instructor_canvas_summary(db)
            assert after.failing == before.failing + 3

            total = after.failing
            # (user_id, canvas_url) rather than bare user_id -- a user can
            # have more than one failing connection (uq_user_canvas_url is
            # per-URL, not per-user), so that pair is the real row identity.
            seen_connections: list[tuple[int, str]] = []
            offset = 0
            page_size = 1
            while offset < total:
                page = await list_failing_canvas_connections(db, limit=page_size, offset=offset)
                assert page.total == total
                assert len(page.items) == page_size
                seen_connections.extend((item.user_id, item.canvas_url) for item in page.items)
                offset += page_size

            # No duplicates across pages -- each connection appears exactly once.
            assert len(seen_connections) == len(set(seen_connections)) == total
            # Our 3 seeded rows are all accounted for somewhere in the pages.
            seen_user_ids = {user_id for user_id, _ in seen_connections}
            assert set(seeded_ids).issubset(seen_user_ids)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_get_instructor_canvas_summary_zero_failures():
    from app.models.canvas_connection import CanvasConnection
    from app.models.user import User

    engine, Session = _make_session()
    try:
        async with Session() as db:
            user = User(
                name="Healthy Canvas Instructor",
                email=f"canvasok_{uuid.uuid4()}@example.com",
                hashed_password="x",
                role="instructor",
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

            db.add(
                CanvasConnection(
                    user_id=user.id,
                    canvas_url="https://canvas.example.test",
                    encrypted_token="dummy",
                    last_sync_error=None,
                )
            )
            await db.commit()

            result = await list_failing_canvas_connections(db, limit=1000, offset=0)

        assert not any(c.user_email == user.email for c in result.items)
    finally:
        await engine.dispose()
