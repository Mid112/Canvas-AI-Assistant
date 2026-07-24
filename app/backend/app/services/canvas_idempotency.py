"""Idempotent Canvas write helpers (Feature Reliability #1188 / #1189).

Uses reserve-first claiming: a unique pending row is inserted before the Canvas
mutation so concurrent callers with the same key cannot both write. Losers see
the winner's completed payload or a 409 while a claim is still in flight.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.canvas_idempotency_key import CanvasIdempotencyKey

logger = logging.getLogger(__name__)

# Completed cache rows older than this are pruned opportunistically.
IDEMPOTENCY_RETENTION = timedelta(days=7)
# Abandoned pending claims (crash mid-write) become reclaimable after this.
PENDING_CLAIM_TTL = timedelta(minutes=5)

_STATUS_PENDING = "pending"
_STATUS_COMPLETED = "completed"


def build_idempotency_key(*parts: object) -> str:
    """Stable SHA-256 key from operation identity parts."""
    payload = json.dumps(parts, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def prune_expired_idempotency_keys(db: AsyncSession) -> None:
    """Drop completed rows past retention and abandoned pending claims."""
    now = datetime.now(UTC)
    await db.execute(
        delete(CanvasIdempotencyKey).where(
            CanvasIdempotencyKey.status == _STATUS_COMPLETED,
            CanvasIdempotencyKey.created_at < now - IDEMPOTENCY_RETENTION,
        )
    )
    await db.execute(
        delete(CanvasIdempotencyKey).where(
            CanvasIdempotencyKey.status == _STATUS_PENDING,
            CanvasIdempotencyKey.created_at < now - PENDING_CLAIM_TTL,
        )
    )
    await db.flush()


async def get_cached_canvas_write(
    db: AsyncSession, idempotency_key: str
) -> dict[str, Any] | None:
    row = await db.get(CanvasIdempotencyKey, idempotency_key)
    if row is None:
        return None
    # Unit tests often pass AsyncMock sessions whose .get() returns another
    # AsyncMock — treat anything without a real dict payload as a cache miss.
    response = getattr(row, "response_json", None)
    row_status = getattr(row, "status", _STATUS_COMPLETED)
    if row_status != _STATUS_COMPLETED or not isinstance(response, dict):
        return None
    logger.info(
        "canvas_idempotency outcome=hit key=%s operation=%s user_id=%s",
        idempotency_key[:12],
        getattr(row, "operation", None),
        getattr(row, "user_id", None),
    )
    return dict(response)


async def _try_claim_canvas_write(
    db: AsyncSession,
    *,
    idempotency_key: str,
    user_id: int,
    operation: str,
) -> bool:
    """Insert a pending claim. Returns True if this caller owns the write."""
    stmt = (
        pg_insert(CanvasIdempotencyKey)
        .values(
            idempotency_key=idempotency_key,
            user_id=user_id,
            operation=operation,
            response_json=None,
            status=_STATUS_PENDING,
        )
        .on_conflict_do_nothing(index_elements=["idempotency_key"])
        .returning(CanvasIdempotencyKey.idempotency_key)
    )
    result = await db.execute(stmt)
    claimed = result.scalar_one_or_none() is not None
    await db.flush()
    if claimed:
        logger.info(
            "canvas_idempotency outcome=claim key=%s operation=%s user_id=%s",
            idempotency_key[:12],
            operation,
            user_id,
        )
    return claimed


async def _complete_canvas_write(
    db: AsyncSession,
    *,
    idempotency_key: str,
    response_json: dict[str, Any],
) -> None:
    await db.execute(
        update(CanvasIdempotencyKey)
        .where(
            CanvasIdempotencyKey.idempotency_key == idempotency_key,
            CanvasIdempotencyKey.status == _STATUS_PENDING,
        )
        .values(response_json=response_json, status=_STATUS_COMPLETED)
    )
    await db.flush()
    logger.info(
        "canvas_idempotency outcome=complete key=%s",
        idempotency_key[:12],
    )


async def _release_canvas_write_claim(db: AsyncSession, idempotency_key: str) -> None:
    await db.execute(
        delete(CanvasIdempotencyKey).where(
            CanvasIdempotencyKey.idempotency_key == idempotency_key,
            CanvasIdempotencyKey.status == _STATUS_PENDING,
        )
    )
    await db.flush()
    logger.info(
        "canvas_idempotency outcome=release key=%s",
        idempotency_key[:12],
    )


async def _resolve_existing_claim(
    db: AsyncSession, idempotency_key: str
) -> dict[str, Any] | None:
    """Return a completed payload, expire stale pending claims, or raise 409."""
    row = await db.scalar(
        select(CanvasIdempotencyKey).where(
            CanvasIdempotencyKey.idempotency_key == idempotency_key
        )
    )
    if row is None:
        return None

    if row.status == _STATUS_COMPLETED and isinstance(row.response_json, dict):
        return dict(row.response_json)

    if row.status == _STATUS_PENDING:
        age = datetime.now(UTC) - row.created_at
        if age > PENDING_CLAIM_TTL:
            await _release_canvas_write_claim(db, idempotency_key)
            return None
        raise duplicate_in_flight_http_exception()

    return None


async def store_canvas_write(
    db: AsyncSession,
    *,
    idempotency_key: str,
    user_id: int,
    operation: str,
    response_json: dict[str, Any],
) -> None:
    """Upsert a completed cache row (compat helper for older call sites/tests)."""
    stmt = (
        pg_insert(CanvasIdempotencyKey)
        .values(
            idempotency_key=idempotency_key,
            user_id=user_id,
            operation=operation,
            response_json=response_json,
            status=_STATUS_COMPLETED,
        )
        .on_conflict_do_nothing(index_elements=["idempotency_key"])
    )
    await db.execute(stmt)
    await db.flush()
    logger.info(
        "canvas_idempotency outcome=store key=%s operation=%s user_id=%s",
        idempotency_key[:12],
        operation,
        user_id,
    )


async def run_idempotent_canvas_write(
    db: AsyncSession | None,
    *,
    user_id: int | None,
    operation: str,
    idempotency_key: str | None,
    write: Callable[[], Awaitable[dict[str, Any]]],
) -> dict[str, Any]:
    """Claim the key, run the Canvas write once, then store the result.

    Without db/user/key, runs write directly.
    """
    if db is None or user_id is None or not idempotency_key:
        return await write()

    try:
        await prune_expired_idempotency_keys(db)
    except Exception:
        logger.warning(
            "canvas_idempotency outcome=prune_failed operation=%s",
            operation,
            exc_info=True,
        )

    cached = await get_cached_canvas_write(db, idempotency_key)
    if cached is not None:
        return cached

    claimed = await _try_claim_canvas_write(
        db,
        idempotency_key=idempotency_key,
        user_id=user_id,
        operation=operation,
    )
    if not claimed:
        existing = await _resolve_existing_claim(db, idempotency_key)
        if existing is not None:
            return existing
        # Stale pending was released, or row vanished — try one more claim.
        claimed = await _try_claim_canvas_write(
            db,
            idempotency_key=idempotency_key,
            user_id=user_id,
            operation=operation,
        )
        if not claimed:
            existing = await _resolve_existing_claim(db, idempotency_key)
            if existing is not None:
                return existing
            raise duplicate_in_flight_http_exception()

    try:
        result = await write()
    except HTTPException:
        await _release_canvas_write_claim(db, idempotency_key)
        raise
    except Exception as exc:
        await _release_canvas_write_claim(db, idempotency_key)
        logger.warning(
            "canvas_idempotency outcome=write_failed operation=%s error=%s",
            operation,
            type(exc).__name__,
        )
        raise

    if not isinstance(result, dict):
        await _release_canvas_write_claim(db, idempotency_key)
        return result

    try:
        await _complete_canvas_write(
            db,
            idempotency_key=idempotency_key,
            response_json=result,
        )
    except Exception:
        # Write already succeeded on Canvas — do not fail the caller because
        # the cache row could not be finalized; leave the pending claim so a
        # concurrent loser still 409s rather than double-writing.
        logger.warning(
            "canvas_idempotency outcome=complete_failed key=%s operation=%s",
            idempotency_key[:12],
            operation,
            exc_info=True,
        )
    return result


def duplicate_in_flight_http_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="This Canvas write is already in progress. Wait for it to finish, then refresh.",
    )
