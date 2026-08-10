"""Tests for Feature 9 Phase 2's per-instructor Canvas connectivity signal:
run_course_sync_sweep (services/canvas.py) persisting/clearing
CanvasConnection.last_sync_error on its existing ~60s per-connection sweep.

The sweep opens its own fresh per-connection session internally
(AsyncSessionLocal, not the passed-in `db`), so these are real-Postgres
integration tests rather than fully mocked unit tests — the top-level
`db.scalars(select(User)...)` call is mocked to return exactly one test
user/connection pair, so the sweep never touches unrelated rows already
sitting in the shared dev/test database.
"""
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.models.canvas_connection import CanvasConnection
from app.models.user import User
from app.services.canvas import run_course_sync_sweep


def _make_session():
    engine = create_async_engine(settings.DATABASE_URL)
    return engine, async_sessionmaker(engine, expire_on_commit=False)


async def _create_user_and_connection(Session, *, last_sync_error: str | None = None):
    async with Session() as db:
        user = User(
            name="Canvas Sweep Test User",
            email=f"canvassweep_{uuid.uuid4()}@example.com",
            hashed_password="x",
            role="instructor",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        connection = CanvasConnection(
            user_id=user.id,
            canvas_url="https://canvas.example.test",
            encrypted_token="dummy-encrypted-token",
            last_sync_error=last_sync_error,
        )
        db.add(connection)
        await db.commit()
        await db.refresh(connection)
        return user.id, connection.id


def _sweep_db_scoped_to(user_id: int, connection_id: int) -> AsyncMock:
    """A mock for the outer `db` param that restricts run_course_sync_sweep's
    top-level user query to exactly one (user, connection) pair, so the
    sweep's real per-connection Canvas calls never touch unrelated rows
    already in the shared dev database."""
    db = AsyncMock()
    db.scalars = AsyncMock(
        return_value=[
            SimpleNamespace(
                id=user_id,
                canvas_connections=[SimpleNamespace(id=connection_id)],
            )
        ]
    )
    return db


@pytest.mark.asyncio
async def test_sweep_persists_last_sync_error_on_failure():
    engine, Session = _make_session()
    try:
        user_id, connection_id = await _create_user_and_connection(Session)

        with (
            patch("app.services.canvas.AsyncSessionLocal", new=Session),
            patch(
                "app.services.canvas.sync_courses_if_stale",
                new=AsyncMock(side_effect=RuntimeError("bad token")),
            ),
        ):
            await run_course_sync_sweep(_sweep_db_scoped_to(user_id, connection_id))

        async with Session() as check_db:
            refreshed = await check_db.get(CanvasConnection, connection_id)
            assert refreshed.last_sync_error is not None
            assert "bad token" in refreshed.last_sync_error
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_sweep_clears_last_sync_error_on_success():
    engine, Session = _make_session()
    try:
        user_id, connection_id = await _create_user_and_connection(
            Session, last_sync_error="previous failure"
        )

        with (
            patch("app.services.canvas.AsyncSessionLocal", new=Session),
            patch(
                "app.services.canvas.sync_courses_if_stale",
                new=AsyncMock(return_value=True),
            ),
        ):
            await run_course_sync_sweep(_sweep_db_scoped_to(user_id, connection_id))

        async with Session() as check_db:
            refreshed = await check_db.get(CanvasConnection, connection_id)
            assert refreshed.last_sync_error is None
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_sweep_cooldown_skip_does_not_clear_last_sync_error():
    """A cooldown skip is not a health check — clearing last_sync_error here
    re-opened failed_operations spam on the next failing tick."""
    engine, Session = _make_session()
    try:
        user_id, connection_id = await _create_user_and_connection(
            Session, last_sync_error="previous failure"
        )

        with (
            patch("app.services.canvas.AsyncSessionLocal", new=Session),
            patch(
                "app.services.canvas.sync_courses_if_stale",
                new=AsyncMock(return_value=False),
            ),
        ):
            await run_course_sync_sweep(_sweep_db_scoped_to(user_id, connection_id))

        async with Session() as check_db:
            refreshed = await check_db.get(CanvasConnection, connection_id)
            assert refreshed.last_sync_error == "previous failure"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_sweep_invalid_canvas_token_does_not_append_failed_operations():
    from fastapi import HTTPException, status
    from sqlalchemy import func, select

    from app.models.failed_operation import FailedOperation

    engine, Session = _make_session()
    try:
        user_id, connection_id = await _create_user_and_connection(Session)

        async with Session() as db:
            before = int(
                await db.scalar(
                    select(func.count()).select_from(FailedOperation).where(
                        FailedOperation.operation == "course_sync",
                        FailedOperation.user_id == user_id,
                    )
                )
                or 0
            )

        with (
            patch("app.services.canvas.AsyncSessionLocal", new=Session),
            patch(
                "app.services.canvas.sync_courses_if_stale",
                new=AsyncMock(
                    side_effect=HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail="Invalid Canvas API token",
                    )
                ),
            ),
            patch(
                "app.services.failed_operations.record_failed_operation",
                new=AsyncMock(),
            ) as mock_record,
        ):
            await run_course_sync_sweep(_sweep_db_scoped_to(user_id, connection_id))
            mock_record.assert_not_awaited()

        async with Session() as db:
            after = int(
                await db.scalar(
                    select(func.count()).select_from(FailedOperation).where(
                        FailedOperation.operation == "course_sync",
                        FailedOperation.user_id == user_id,
                    )
                )
                or 0
            )
            assert after == before
            refreshed = await db.get(CanvasConnection, connection_id)
            assert refreshed.last_sync_error is not None
            assert "Invalid Canvas API token" in refreshed.last_sync_error
    finally:
        await engine.dispose()
