"""Unit tests for Feature Reliability idempotency helpers (#1188 / #1189)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services.canvas_idempotency import (
    build_idempotency_key,
    duplicate_in_flight_http_exception,
    run_idempotent_canvas_write,
)


def test_build_idempotency_key_is_stable():
    first = build_idempotency_key("create_assignment", 1, {"title": "A"})
    second = build_idempotency_key("create_assignment", 1, {"title": "A"})
    third = build_idempotency_key("create_assignment", 1, {"title": "B"})
    assert first == second
    assert first != third
    assert len(first) == 64


@pytest.mark.requirement("FR11.4")
def test_duplicate_in_flight_is_409():
    exc = duplicate_in_flight_http_exception()
    assert isinstance(exc, HTTPException)
    assert exc.status_code == 409


@pytest.mark.asyncio
@pytest.mark.requirement("FR11.4")
async def test_run_idempotent_skips_write_on_cache_hit():
    db = MagicMock()
    write = AsyncMock(return_value={"id": 99})
    with (
        patch(
            "app.services.canvas_idempotency.prune_expired_idempotency_keys",
            AsyncMock(),
        ),
        patch(
            "app.services.canvas_idempotency.get_cached_canvas_write",
            AsyncMock(return_value={"id": 42, "name": "cached"}),
        ) as get_cached,
        patch(
            "app.services.canvas_idempotency._try_claim_canvas_write",
            AsyncMock(),
        ) as claim,
    ):
        result = await run_idempotent_canvas_write(
            db,
            user_id=7,
            operation="create_assignment",
            idempotency_key="abc123",
            write=write,
        )
    assert result == {"id": 42, "name": "cached"}
    write.assert_not_awaited()
    get_cached.assert_awaited_once()
    claim.assert_not_awaited()


@pytest.mark.asyncio
async def test_run_idempotent_claims_then_completes_after_write():
    db = MagicMock()
    write = AsyncMock(return_value={"id": 5, "name": "Homework"})
    with (
        patch(
            "app.services.canvas_idempotency.prune_expired_idempotency_keys",
            AsyncMock(),
        ),
        patch(
            "app.services.canvas_idempotency.get_cached_canvas_write",
            AsyncMock(return_value=None),
        ),
        patch(
            "app.services.canvas_idempotency._try_claim_canvas_write",
            AsyncMock(return_value=True),
        ) as claim,
        patch(
            "app.services.canvas_idempotency._complete_canvas_write",
            AsyncMock(),
        ) as complete,
        patch(
            "app.services.canvas_idempotency._release_canvas_write_claim",
            AsyncMock(),
        ) as release,
    ):
        result = await run_idempotent_canvas_write(
            db,
            user_id=3,
            operation="create_assignment",
            idempotency_key="key-1",
            write=write,
        )
    assert result == {"id": 5, "name": "Homework"}
    write.assert_awaited_once()
    claim.assert_awaited_once()
    complete.assert_awaited_once()
    release.assert_not_awaited()


@pytest.mark.asyncio
async def test_run_idempotent_releases_claim_when_write_fails():
    db = MagicMock()
    write = AsyncMock(side_effect=RuntimeError("canvas down"))
    with (
        patch(
            "app.services.canvas_idempotency.prune_expired_idempotency_keys",
            AsyncMock(),
        ),
        patch(
            "app.services.canvas_idempotency.get_cached_canvas_write",
            AsyncMock(return_value=None),
        ),
        patch(
            "app.services.canvas_idempotency._try_claim_canvas_write",
            AsyncMock(return_value=True),
        ),
        patch(
            "app.services.canvas_idempotency._release_canvas_write_claim",
            AsyncMock(),
        ) as release,
    ):
        with pytest.raises(RuntimeError, match="canvas down"):
            await run_idempotent_canvas_write(
                db,
                user_id=3,
                operation="create_assignment",
                idempotency_key="key-fail",
                write=write,
            )
    release.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.requirement("FR11.4")
async def test_run_idempotent_loser_returns_winner_result():
    db = MagicMock()
    write = AsyncMock(return_value={"id": 1})
    with (
        patch(
            "app.services.canvas_idempotency.prune_expired_idempotency_keys",
            AsyncMock(),
        ),
        patch(
            "app.services.canvas_idempotency.get_cached_canvas_write",
            AsyncMock(return_value=None),
        ),
        patch(
            "app.services.canvas_idempotency._try_claim_canvas_write",
            AsyncMock(return_value=False),
        ),
        patch(
            "app.services.canvas_idempotency._resolve_existing_claim",
            AsyncMock(return_value={"id": 99, "name": "winner"}),
        ),
    ):
        result = await run_idempotent_canvas_write(
            db,
            user_id=3,
            operation="create_assignment",
            idempotency_key="key-race",
            write=write,
        )
    assert result == {"id": 99, "name": "winner"}
    write.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.requirement("FR11.4")
async def test_run_idempotent_loser_raises_409_while_pending():
    db = MagicMock()
    write = AsyncMock(return_value={"id": 1})
    with (
        patch(
            "app.services.canvas_idempotency.prune_expired_idempotency_keys",
            AsyncMock(),
        ),
        patch(
            "app.services.canvas_idempotency.get_cached_canvas_write",
            AsyncMock(return_value=None),
        ),
        patch(
            "app.services.canvas_idempotency._try_claim_canvas_write",
            AsyncMock(return_value=False),
        ),
        patch(
            "app.services.canvas_idempotency._resolve_existing_claim",
            AsyncMock(side_effect=duplicate_in_flight_http_exception()),
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await run_idempotent_canvas_write(
                db,
                user_id=3,
                operation="create_assignment",
                idempotency_key="key-pending",
                write=write,
            )
    assert exc_info.value.status_code == 409
    write.assert_not_awaited()


@pytest.mark.asyncio
async def test_run_idempotent_without_key_runs_write_directly():
    write = AsyncMock(return_value={"ok": True})
    result = await run_idempotent_canvas_write(
        None,
        user_id=None,
        operation="create_assignment",
        idempotency_key=None,
        write=write,
    )
    assert result == {"ok": True}
    write.assert_awaited_once()
