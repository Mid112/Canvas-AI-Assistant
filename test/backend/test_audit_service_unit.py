"""Direct unit tests for services/audit.py."""
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, Mock

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.models.audit_log import AuditLog
from app.models.audit_log_session import AuditLogSession
from app.models.user import User
from app.models.workflow import Workflow
from app.services.audit import list_audit_logs


def _response_row(
    *,
    id,
    timestamp,
    user_id=1,
    workflow_id=100,
    course_id=5,
    action="update_grade",
    resource_type="submission",
    resource_id="42",
    operation="update",
    status="success",
    user_email="instructor@example.com",
    user_role="instructor",
    details=None,
):
    return {
        "id": id,
        "user_id": user_id,
        "workflow_id": workflow_id,
        "course_id": course_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "operation": operation,
        "status": status,
        "timestamp": timestamp,
        "user_email": user_email,
        "user_role": user_role,
        "details": details,
    }


def _workflow_response_row(id, timestamp, user_id=1):
    return _response_row(id=id, timestamp=timestamp, user_id=user_id)


def _session_response_row(id, timestamp, action="admin_login", details=None, user_id=1, **overrides):
    row = _response_row(
        id=-id,
        timestamp=timestamp,
        user_id=user_id,
        workflow_id=None,
        course_id=None,
        action=action,
        resource_type="session",
        resource_id=None,
        operation="login",
        status="success",
        user_email="admin@example.com",
        user_role="admin",
        details=details or {},
    )
    row.update(overrides)
    return row


def _db(scalar_results, execute_rows):
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=scalar_results)
    execute_result = Mock()
    execute_result.mappings.return_value = execute_rows
    db.execute = AsyncMock(return_value=execute_result)
    return db


@pytest.mark.asyncio
async def test_list_audit_logs_merges_and_sorts_both_sources():
    older = datetime(2026, 1, 1, tzinfo=UTC)
    newer = datetime(2026, 1, 2, tzinfo=UTC)
    db = _db(
        scalar_results=[1, 1],
        execute_rows=[_session_response_row(1, newer), _workflow_response_row(1, older)],
    )

    result = await list_audit_logs(db, limit=10, offset=0)

    assert [item.action for item in result.items] == ["admin_login", "update_grade"]
    assert result.total == 2


@pytest.mark.asyncio
async def test_list_audit_logs_negates_session_ids_to_avoid_collision():
    ts = datetime(2026, 1, 1, tzinfo=UTC)
    db = _db(
        scalar_results=[1, 1],
        execute_rows=[_workflow_response_row(1, ts), _session_response_row(1, ts)],
    )

    result = await list_audit_logs(db, limit=10, offset=0)

    ids = {item.id for item in result.items}
    assert ids == {1, -1}


@pytest.mark.asyncio
async def test_list_audit_logs_maps_anonymous_session_rows():
    """A failed login against an unknown email has no matching user
    (audit_logs_session.user_id nullable, see
    036_audit_log_session_nullable_user.sql) — must still render, with the
    attempted email and an "unknown" role rather than crashing or being
    silently dropped by the join."""
    ts = datetime(2026, 1, 1, tzinfo=UTC)
    db = _db(
        scalar_results=[0, 1],
        execute_rows=[
            _session_response_row(
                1,
                ts,
                action="login_failed",
                user_id=None,
                user_email="nobody@example.com",
                user_role="unknown",
                details={"email": "nobody@example.com", "reason": "unknown_email"},
            )
        ],
    )

    result = await list_audit_logs(db, limit=10, offset=0)

    assert len(result.items) == 1
    assert result.items[0].user_id is None
    assert result.items[0].user_email == "nobody@example.com"
    assert result.items[0].user_role == "unknown"


@pytest.mark.asyncio
async def test_list_audit_logs_paginates_across_merged_sources():
    t2 = datetime(2026, 1, 2, tzinfo=UTC)
    db = _db(
        scalar_results=[1, 2],
        execute_rows=[_session_response_row(1, t2)],
    )

    result = await list_audit_logs(db, limit=1, offset=1)

    assert len(result.items) == 1
    assert result.items[0].timestamp == t2
    assert result.total == 3


@pytest.mark.asyncio
async def test_list_audit_logs_uses_a_single_sql_union_for_pagination():
    """Pagination is computed by the database over a single UNION ALL of
    both sources with one ORDER BY/LIMIT/OFFSET, for every sort field --
    not a fetch-N-per-source-then-sort-in-Python approach, which either
    relied on a subtle correctness argument (timestamp sort) or silently
    dropped rows past a fixed cap once a source's filtered total exceeded
    it (non-timestamp sort; see services/audit.py::list_audit_logs
    docstring). One SQL query has no such cap regardless of sort field. See
    test_admin_audit_logs_pagination_is_correct_across_sources in
    test_integration_admin_workflows.py for the end-to-end proof against a
    real database."""
    db = _db(scalar_results=[500, 500], execute_rows=[])

    await list_audit_logs(db, limit=50, offset=100)

    assert db.execute.call_count == 1
    query = str(db.execute.call_args_list[0].args[0])
    assert "UNION ALL" in query
    assert "LIMIT" in query and "OFFSET" in query


@pytest.mark.asyncio
async def test_list_audit_logs_applies_filters_to_both_sources_and_their_counts():
    db = _db(scalar_results=[0, 0], execute_rows=[])
    since = datetime(2026, 1, 1, tzinfo=UTC)
    until = datetime(2026, 2, 1, tzinfo=UTC)

    await list_audit_logs(
        db,
        limit=10,
        offset=0,
        action="login",
        user_search="alice",
        result="failed",
        start_time=since,
        end_time=until,
        search="canvas",
    )

    scalar_queries = [str(call.args[0]) for call in db.scalar.call_args_list]
    execute_query = str(db.execute.call_args_list[0].args[0])
    assert len(scalar_queries) == 2
    for query in [*scalar_queries, execute_query]:
        assert "audit_logs.action) LIKE" in query or "audit_logs_session.action) LIKE" in query
        assert "timestamp >=" in query
        assert "timestamp <" in query


@pytest.mark.asyncio
async def test_list_audit_logs_omits_filters_when_not_given():
    db = _db(scalar_results=[0, 0], execute_rows=[])

    await list_audit_logs(db, limit=10, offset=0)

    scalar_queries = [str(call.args[0]) for call in db.scalar.call_args_list]
    execute_query = str(db.execute.call_args_list[0].args[0])
    for query in [*scalar_queries, execute_query]:
        assert "timestamp >=" not in query
        assert "timestamp <" not in query


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("sort_field", "column"),
    [
        ("timestamp", "timestamp"),
        ("user", "user_email"),
        ("action", "action"),
        ("resource", "resource_type"),
        ("result", "status"),
    ],
)
async def test_list_audit_logs_orders_by_the_requested_field(sort_field, column):
    db = _db(scalar_results=[0, 0], execute_rows=[])

    await list_audit_logs(db, limit=10, offset=0, sort_field=sort_field, sort_direction="asc")

    query = str(db.execute.call_args_list[0].args[0])
    assert f"ORDER BY anon_1.{column} ASC" in query


@pytest.mark.asyncio
async def test_list_audit_logs_warns_on_unmapped_session_action(caplog):
    ts = datetime(2026, 1, 1, tzinfo=UTC)
    db = _db(
        scalar_results=[0, 1],
        execute_rows=[_session_response_row(1, ts, action="some_future_action")],
    )

    with caplog.at_level("WARNING"):
        await list_audit_logs(db, limit=10, offset=0)

    assert any("some_future_action" in message for message in caplog.messages)


@pytest.mark.asyncio
async def test_admin_audit_logs_pagination_is_correct_across_sources():
    """End-to-end proof against real Postgres (not mocks): paginating page
    by page through a mix of audit_logs (workflow) and audit_logs_session
    (session) rows with interleaved timestamps visits every matching row
    exactly once -- no gaps, no duplicates -- for both the default
    (timestamp) sort and a non-timestamp sort. The latter is the one that
    actually used to be capped (see services/audit.py::list_audit_logs)."""
    marker = f"pagtest_{uuid.uuid4()}"
    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as db:
            user = User(
                name="Pagination Test User",
                email=f"{marker}@example.com",
                hashed_password="x",
                role="instructor",
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

            workflow = Workflow(
                user_id=user.id,
                action_name=marker,
                user_prompt="test",
                proposed_action={},
                status="executed",
            )
            db.add(workflow)
            await db.commit()
            await db.refresh(workflow)

            base = datetime(2026, 1, 1, tzinfo=UTC)
            expected_ids = set()
            for i in range(6):
                row = AuditLog(
                    user_id=user.id,
                    workflow_id=workflow.id,
                    action=marker,
                    resource_type="submission",
                    resource_id=str(i),
                    operation="update",
                    status="success",
                    timestamp=base + timedelta(minutes=2 * i),
                )
                db.add(row)
                await db.flush()
                expected_ids.add(row.id)
            for i in range(6):
                row = AuditLogSession(
                    user_id=user.id,
                    action="admin_login",
                    details={"marker": marker},
                    timestamp=base + timedelta(minutes=2 * i + 1),
                )
                db.add(row)
                await db.flush()
                expected_ids.add(-row.id)
            await db.commit()

            for sort_field, sort_direction in [
                ("timestamp", "asc"),
                ("action", "asc"),
                ("result", "desc"),
            ]:
                seen_ids: set[int] = set()
                offset = 0
                page_size = 4
                total = None
                for _ in range(10):  # safety cap against an infinite loop on a real bug
                    page = await list_audit_logs(
                        db,
                        limit=page_size,
                        offset=offset,
                        search=marker,
                        sort_field=sort_field,
                        sort_direction=sort_direction,
                    )
                    total = page.total
                    if not page.items:
                        break
                    seen_ids.update(item.id for item in page.items)
                    offset += page_size

                assert total == 12, f"sort_field={sort_field}"
                assert seen_ids == expected_ids, f"sort_field={sort_field}"
    finally:
        await engine.dispose()
