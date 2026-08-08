"""Integration verification for Feature 15 idempotency (#1188 / #1189).

Uses the real Postgres session against canvas_idempotency_keys while mocking
only the outbound Canvas/MCP HTTP calls — covers the review checklist items:

- concurrent create_course_assignment with identical payload → one Canvas write
- MCP create_assignment twice with the same identity → one MCP mutation; second
  returns the cached payload
"""

from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import hash_password
from app.mcp_tools.dispatcher import execute_tool
from app.mcp_tools.schemas import CreateAssignmentAction
from app.models.canvas_idempotency_key import CanvasIdempotencyKey
from app.models.user import User
from app.schemas.canvas import AssignmentCreate
from app.services.canvas import create_course_assignment
from app.services.canvas_idempotency import build_idempotency_key


def _assignment_raw(*, assignment_id: int = 4242, name: str = "Idempotent HW") -> dict:
    return {
        "id": assignment_id,
        "name": name,
        "description": "Shared payload for concurrent writes.",
        "due_at": "2030-06-01T00:00:00Z",
        "points_possible": 10.0,
        "course_id": 100,
        "published": False,
    }


@pytest.fixture
async def db_engine():
    engine = create_async_engine(settings.DATABASE_URL)
    yield engine
    await engine.dispose()


@pytest.fixture
async def instructor_id(db_engine):
    email = f"idempotency_{uuid.uuid4()}@example.com"
    Session = async_sessionmaker(db_engine, expire_on_commit=False)
    async with Session() as db:
        user = User(
            name="Idempotency Instructor",
            email=email,
            hashed_password=hash_password("Secret123!"),
            role="instructor",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user.id


@pytest.mark.asyncio
async def test_migrations_028_through_034_are_applied(db_engine):
    """Suggested verification: migrations apply cleanly after health 028–030."""
    from app.core.migrations import run_pending_migrations

    await run_pending_migrations(db_engine)

    required = {
        "028_health_checks.sql",
        "029_canvas_connection_last_sync_error.sql",
        "030_ai_call_health.sql",
        "031_canvas_idempotency_keys.sql",
        "032_conversation_field_memory.sql",
        "033_workflow_paused_status.sql",
        "034_canvas_idempotency_claim_and_retention.sql",
    }
    async with db_engine.connect() as conn:
        rows = await conn.execute(text("SELECT filename FROM schema_migrations"))
        applied = {row[0] for row in rows}
        status_col = await conn.scalar(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'canvas_idempotency_keys'
                  AND column_name = 'status'
                """
            )
        )
        health = await conn.scalar(text("SELECT to_regclass('public.health_checks')"))
        paused_ok = await conn.scalar(
            text(
                """
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'workflows_status_check'
                  AND pg_get_constraintdef(oid) LIKE '%paused%'
                """
            )
        )

    missing = required - applied
    assert not missing, f"migrations not stamped: {sorted(missing)}"
    assert health is not None
    assert status_col == 1
    assert paused_ok == 1


@pytest.mark.asyncio
async def test_concurrent_create_course_assignment_writes_canvas_once(
    db_engine, instructor_id
):
    """Identical payload racing on two sessions → one Canvas mutation."""
    Session = async_sessionmaker(db_engine, expire_on_commit=False)
    course = SimpleNamespace(
        id=1,
        canvas_course_id="100",
        canvas_url="https://canvas.example.edu",
        workflow_state="available",
        name="COSC 111",
    )
    user = SimpleNamespace(
        id=instructor_id,
        canvas_connections=[
            SimpleNamespace(
                canvas_url="https://canvas.example.edu",
                encrypted_token="enc",
            )
        ],
    )
    payload = AssignmentCreate(
        name=f"Concurrent HW {uuid.uuid4().hex[:8]}",
        description="Shared concurrent create payload.",
        due_at="2030-06-01T00:00:00Z",
        points_possible=10,
    )
    raw = _assignment_raw(name=payload.name)

    started = asyncio.Event()
    release = asyncio.Event()
    call_count = 0

    async def slow_create(*_args, **_kwargs):
        nonlocal call_count
        call_count += 1
        started.set()
        await release.wait()
        return raw

    key = build_idempotency_key(
        "create_assignment",
        instructor_id,
        course.id,
        payload.model_dump(mode="json"),
    )

    async def _one_call():
        async with Session() as db:
            result = await create_course_assignment(
                course.id,
                payload,
                user,
                course.canvas_url,
                db,
                idempotency_key=key,
            )
            await db.commit()
            return result

    # Patch once around both racers — concurrent nested ``with patch(...)``
    # in parallel tasks leaves get_owned_course / decrypt_canvas_token mocked
    # for later TestClient suites (course overview then 403s on example.edu).
    with (
        patch(
            "app.services.canvas.get_owned_course",
            new=AsyncMock(return_value=course),
        ),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch(
            "app.services.canvas._assert_no_executing_write",
            new=AsyncMock(),
        ),
        patch(
            "app.services.canvas.create_assignment",
            new=AsyncMock(side_effect=slow_create),
        ),
    ):
        first_task = asyncio.create_task(_one_call())
        await started.wait()
        # Second caller starts while the first still holds the pending claim.
        second_task = asyncio.create_task(_one_call())
        await asyncio.sleep(0.05)
        release.set()

        results = await asyncio.gather(first_task, second_task, return_exceptions=True)
    successes = [r for r in results if not isinstance(r, BaseException)]
    conflicts = [
        r
        for r in results
        if isinstance(r, Exception) and getattr(r, "status_code", None) == 409
    ]

    assert call_count == 1
    assert len(successes) >= 1
    assert all(r.id == raw["id"] for r in successes)
    # Either the loser waited for the completed cache, or it saw in-flight 409.
    assert len(successes) + len(conflicts) == 2

    async with Session() as db:
        row = await db.get(CanvasIdempotencyKey, key)
        assert row is not None
        assert row.status == "completed"
        assert row.response_json["id"] == raw["id"]


@pytest.mark.asyncio
async def test_mcp_create_assignment_second_call_returns_cached(
    db_engine, instructor_id
):
    """MCP_ENABLED path: same identity twice → one MCP tool call."""
    Session = async_sessionmaker(db_engine, expire_on_commit=False)
    course = SimpleNamespace(
        id=7,
        canvas_url="https://canvas.example.edu",
        name="COSC 111",
        canvas_course_id="100",
    )
    user = SimpleNamespace(id=instructor_id)
    title = f"MCP Idempotent {uuid.uuid4().hex[:8]}"
    action = CreateAssignmentAction(
        local_course_id=course.id,
        title=title,
        description="MCP guarded create assignment payload.",
        due_date="2030-06-01T00:00:00",
        points_possible=10,
    )
    mcp_assignment = {
        "id": 777,
        "name": title,
        "due_at": "2030-06-01T00:00:00Z",
        "points_possible": 10,
        "published": False,
    }

    async with Session() as db:
        with (
            patch("app.mcp_tools.dispatcher.settings.MCP_ENABLED", True),
            patch(
                "app.mcp_tools.dispatcher._resolve_course",
                new=AsyncMock(return_value=course),
            ),
            patch(
                "app.mcp_tools.dispatcher.validate_assignment_for_create",
                new=AsyncMock(),
            ),
            patch(
                "app.mcp_tools.dispatcher._assert_no_executing_write",
                new=AsyncMock(),
            ),
            patch(
                "app.mcp_tools.dispatcher._call_mcp_tool",
                new=AsyncMock(
                    return_value={"success": True, "assignment": mcp_assignment}
                ),
            ) as call_mcp,
            patch(
                "app.mcp_tools.dispatcher.create_course_assignment",
                new=AsyncMock(),
            ) as create_direct,
        ):
            first = await execute_tool(db, user, action)
            await db.commit()
            second = await execute_tool(db, user, action)
            await db.commit()

    assert call_mcp.await_count == 1
    create_direct.assert_not_awaited()
    assert first["via_mcp"] is True
    assert second["via_mcp"] is True
    assert first["data"]["id"] == 777
    assert second["data"]["id"] == 777

    async with Session() as db:
        rows = list(
            await db.scalars(
                select(CanvasIdempotencyKey).where(
                    CanvasIdempotencyKey.user_id == instructor_id,
                    CanvasIdempotencyKey.operation == "create_assignment",
                    CanvasIdempotencyKey.status == "completed",
                )
            )
        )
        assert any(
            isinstance(row.response_json, dict) and row.response_json.get("id") == 777
            for row in rows
        )
