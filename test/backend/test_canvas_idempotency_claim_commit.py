"""Postgres integration: committed reserve-first claims (#1189 / PR #1271).

Verifies concurrent ``run_idempotent_canvas_write`` calls with the same key:
the winner's pending claim is committed before the external write, so the
loser observes ``status='pending'`` and gets HTTP 409 without running write.
"""

from __future__ import annotations

import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import hash_password
from app.models.user import User
from app.services.canvas_idempotency import run_idempotent_canvas_write


@pytest.fixture
async def db_engine():
    from app.core.migrations import run_pending_migrations

    engine = create_async_engine(settings.DATABASE_URL)
    await run_pending_migrations(engine)
    yield engine
    await engine.dispose()


@pytest.fixture
async def instructor_id(db_engine):
    email = f"idempotency_claim_{uuid.uuid4()}@example.com"
    Session = async_sessionmaker(db_engine, expire_on_commit=False)
    async with Session() as db:
        user = User(
            name="Idempotency Claim Instructor",
            email=email,
            hashed_password=hash_password("secret123"),
            role="instructor",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user.id


@pytest.mark.asyncio
async def test_concurrent_claim_returns_409_while_write_in_flight(
    db_engine, instructor_id
):
    """Second caller must 409 quickly while the first write is still open."""
    Session = async_sessionmaker(db_engine, expire_on_commit=False)
    key = f"claim-race-{uuid.uuid4().hex}"

    started = asyncio.Event()
    release = asyncio.Event()
    call_count = 0

    async def slow_write() -> dict:
        nonlocal call_count
        call_count += 1
        started.set()
        await release.wait()
        return {"id": 99, "name": "Held open"}

    async def _one_call():
        async with Session() as db:
            return await run_idempotent_canvas_write(
                db,
                user_id=instructor_id,
                operation="create_assignment",
                idempotency_key=key,
                write=slow_write,
            )

    first_task = asyncio.create_task(_one_call())
    await asyncio.wait_for(started.wait(), timeout=5.0)

    # Claim is already committed; second call must not block on unique index.
    second_task = asyncio.create_task(_one_call())
    done, pending = await asyncio.wait({second_task}, timeout=2.0)
    assert second_task in done, "loser blocked instead of returning 409 promptly"
    assert not pending

    with pytest.raises(HTTPException) as exc_info:
        second_task.result()
    assert exc_info.value.status_code == 409
    assert call_count == 1

    release.set()
    first_result = await first_task
    assert first_result == {"id": 99, "name": "Held open"}
    assert call_count == 1
