"""Tests for the Canvas token fingerprint backfill (app/core/token_backfill.py).

The backfill exists because uq_canvas_token_fingerprint cannot be satisfied by
a naive UPDATE: a database written before the uniqueness rule can legitimately
contain two connections holding the same token, and fingerprinting both would
violate the index. What matters here is that it picks exactly one keeper per
token and reports the rest instead of failing or silently dropping them.
"""
import asyncio
import uuid

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import encrypt_canvas_token, fingerprint_canvas_token
from app.core.token_backfill import plan_backfill
from app.models.canvas_connection import CanvasConnection
from app.models.user import User


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@pytest.fixture
def seeded_connections():
    """Create an isolated instructor plus connections, and clean up after.

    Each row uses its own canvas_url because uq_user_canvas_url forbids two
    rows per (user, url) — the duplicate we care about here is the *token*,
    not the URL.
    """
    created_user_ids: list[int] = []

    def _seed(tokens: list[str], *, fingerprinted: list[bool] | None = None):
        flags = fingerprinted or [False] * len(tokens)

        async def _insert():
            engine = create_async_engine(settings.DATABASE_URL)
            try:
                async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                    user = User(
                        name="Backfill Fixture",
                        email=f"backfill_{uuid.uuid4()}@example.com",
                        hashed_password="x",
                        role="instructor",
                    )
                    db.add(user)
                    await db.flush()
                    created_user_ids.append(user.id)
                    ids = []
                    for index, (token, has_fp) in enumerate(zip(tokens, flags)):
                        connection = CanvasConnection(
                            user_id=user.id,
                            canvas_url=f"https://canvas-{uuid.uuid4()}.example.edu",
                            encrypted_token=encrypt_canvas_token(token),
                            token_fingerprint=(
                                fingerprint_canvas_token(token) if has_fp else None
                            ),
                        )
                        db.add(connection)
                        await db.flush()
                        ids.append(connection.id)
                    await db.commit()
                    return ids
            finally:
                await engine.dispose()

        return _run(_insert())

    yield _seed

    async def _cleanup():
        engine = create_async_engine(settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                await db.execute(
                    delete(CanvasConnection).where(
                        CanvasConnection.user_id.in_(created_user_ids)
                    )
                )
                await db.execute(delete(User).where(User.id.in_(created_user_ids)))
                await db.commit()
        finally:
            await engine.dispose()

    _run(_cleanup())


def _plan_for(ids: list[int]):
    """Run the planner and narrow its results to the rows this test made."""

    async def _go():
        engine = create_async_engine(settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                return await plan_backfill(db)
        finally:
            await engine.dispose()

    report = _run(_go())
    mine = set(ids)
    writes = [(i, fp) for i, fp in report.to_write if i in mine]
    conflicts = [
        [i for i in rows if i in mine]
        for rows in report.conflicts.values()
        if mine & set(rows)
    ]
    return writes, conflicts, report


# Verifies: a token held by only one row is fingerprinted outright.
@pytest.mark.requirement("FR1.9")
def test_unique_token_is_planned_for_write(seeded_connections):
    token = f"unique-{uuid.uuid4()}"
    (row_id,) = seeded_connections([token])

    writes, conflicts, _ = _plan_for([row_id])

    assert writes == [(row_id, fingerprint_canvas_token(token))]
    assert conflicts == []


# Verifies the case that makes this a command rather than an UPDATE: two rows
# share a token, so only the older may be fingerprinted. Writing both would
# violate uq_canvas_token_fingerprint and abort the whole backfill.
@pytest.mark.requirement("FR1.9")
def test_duplicate_token_keeps_the_oldest_and_reports_the_rest(seeded_connections):
    token = f"duplicated-{uuid.uuid4()}"
    older, newer = seeded_connections([token, token])

    writes, conflicts, _ = _plan_for([older, newer])

    assert writes == [(older, fingerprint_canvas_token(token))]
    assert conflicts == [[newer]]


# Verifies an existing owner outranks an un-fingerprinted row of the same
# token, whichever is older — otherwise the backfill would hand the
# fingerprint to a second row and collide with the one already holding it.
@pytest.mark.requirement("FR1.9")
def test_row_matching_an_existing_fingerprint_is_a_conflict(seeded_connections):
    token = f"claimed-{uuid.uuid4()}"
    claimed, unclaimed = seeded_connections([token, token], fingerprinted=[True, False])

    writes, conflicts, _ = _plan_for([claimed, unclaimed])

    assert writes == []
    assert conflicts == [[unclaimed]]


# Verifies re-running is a no-op. The command is meant to be safe to run again
# after resolving conflicts by hand.
def test_already_fingerprinted_rows_are_left_alone(seeded_connections):
    token = f"done-{uuid.uuid4()}"
    (row_id,) = seeded_connections([token], fingerprinted=[True])

    writes, conflicts, report = _plan_for([row_id])

    assert writes == []
    assert conflicts == []
    assert report.already_done >= 1
