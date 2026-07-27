"""Direct unit tests for services/audit.py."""
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services.audit import _session_row_to_response, list_audit_logs


def _workflow_row(id, timestamp, user_id=1):
    return SimpleNamespace(
        id=id,
        user_id=user_id,
        workflow_id=100,
        course_id=5,
        action="update_grade",
        resource_type="submission",
        resource_id="42",
        operation="update",
        status="success",
        timestamp=timestamp,
        user=SimpleNamespace(email="instructor@example.com", role="instructor"),
    )


def _session_row(id, timestamp, action="admin_login", details=None, user_id=1):
    return SimpleNamespace(
        id=id,
        user_id=user_id,
        workflow_id=None,
        action=action,
        details=details or {},
        timestamp=timestamp,
        user=SimpleNamespace(email="admin@example.com", role="admin"),
    )


def _db(scalar_results, scalars_results):
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=scalar_results)
    db.scalars = AsyncMock(side_effect=scalars_results)
    return db


@pytest.mark.asyncio
async def test_list_audit_logs_merges_and_sorts_both_sources():
    older = datetime(2026, 1, 1, tzinfo=UTC)
    newer = datetime(2026, 1, 2, tzinfo=UTC)
    db = _db(
        scalar_results=[1, 1],
        scalars_results=[[_workflow_row(1, older)], [_session_row(1, newer)]],
    )

    result = await list_audit_logs(db, limit=10, offset=0)

    assert [item.action for item in result.items] == ["admin_login", "update_grade"]
    assert result.total == 2


@pytest.mark.asyncio
async def test_list_audit_logs_negates_session_ids_to_avoid_collision():
    ts = datetime(2026, 1, 1, tzinfo=UTC)
    db = _db(
        scalar_results=[1, 1],
        scalars_results=[[_workflow_row(1, ts)], [_session_row(1, ts)]],
    )

    result = await list_audit_logs(db, limit=10, offset=0)

    ids = {item.id for item in result.items}
    assert ids == {1, -1}


@pytest.mark.asyncio
async def test_list_audit_logs_paginates_across_merged_sources():
    t1, t2, t3 = (datetime(2026, 1, d, tzinfo=UTC) for d in (1, 2, 3))
    db = _db(
        scalar_results=[1, 2],
        scalars_results=[
            [_workflow_row(1, t3)],
            [_session_row(1, t2), _session_row(2, t1)],
        ],
    )

    result = await list_audit_logs(db, limit=1, offset=1)

    assert len(result.items) == 1
    assert result.items[0].timestamp == t2
    assert result.total == 3


@pytest.mark.asyncio
async def test_list_audit_logs_sort_direction_asc_returns_oldest_first():
    older = datetime(2026, 1, 1, tzinfo=UTC)
    newer = datetime(2026, 1, 2, tzinfo=UTC)
    db = _db(
        scalar_results=[1, 1],
        scalars_results=[[_workflow_row(1, older)], [_session_row(1, newer)]],
    )

    result = await list_audit_logs(db, limit=10, offset=0, sort_direction="asc")

    assert [item.timestamp for item in result.items] == [older, newer]


@pytest.mark.asyncio
async def test_list_audit_logs_sorts_by_user_field_globally():
    """A non-timestamp sort must be correct across the *whole* filtered set,
    not just whatever a timestamp-ordered fetch happened to return first —
    the whole point of closing the "page-local, not a true global sort" gap."""
    ts = datetime(2026, 1, 1, tzinfo=UTC)
    row_bravo = _workflow_row(1, ts)
    row_bravo.user = SimpleNamespace(email="bravo@example.com", role="instructor")
    row_alpha = _session_row(2, ts)
    row_alpha.user = SimpleNamespace(email="alpha@example.com", role="admin")
    db = _db(scalar_results=[1, 1], scalars_results=[[row_bravo], [row_alpha]])

    result = await list_audit_logs(db, limit=10, offset=0, sort_field="user", sort_direction="asc")

    assert [item.user_email for item in result.items] == [
        "alpha@example.com",
        "bravo@example.com",
    ]


@pytest.mark.asyncio
async def test_list_audit_logs_sorts_by_action_field():
    ts = datetime(2026, 1, 1, tzinfo=UTC)
    zeta_row = _workflow_row(1, ts)
    zeta_row.action = "zeta_action"
    db = _db(
        scalar_results=[1, 1],
        scalars_results=[[zeta_row], [_session_row(2, ts, action="admin_login")]],
    )

    result = await list_audit_logs(db, limit=10, offset=0, sort_field="action", sort_direction="asc")

    assert [item.action for item in result.items] == ["admin_login", "zeta_action"]


@pytest.mark.asyncio
async def test_list_audit_logs_sorts_by_result_field_descending():
    ts = datetime(2026, 1, 1, tzinfo=UTC)
    failed_row = _workflow_row(1, ts)
    failed_row.status = "failed"
    success_row = _workflow_row(2, ts)
    success_row.status = "success"
    db = _db(scalar_results=[2, 0], scalars_results=[[failed_row, success_row], []])

    result = await list_audit_logs(db, limit=10, offset=0, sort_field="result", sort_direction="desc")

    assert [item.status for item in result.items] == ["success", "failed"]


def test_session_row_to_response_unmapped_action_falls_back_to_default():
    row = _session_row(1, datetime(2026, 1, 1, tzinfo=UTC), action="some_future_action")

    response = _session_row_to_response(row)

    assert response.resource_type == "account"
    assert response.operation == "update"
    assert response.status == "success"


def test_session_row_to_response_maps_admin_seeded():
    row = _session_row(1, datetime(2026, 1, 1, tzinfo=UTC), action="admin_seeded")

    response = _session_row_to_response(row)

    assert response.resource_type == "admin_account"
    assert response.operation == "create"


def test_session_row_to_response_extracts_resource_id_from_details():
    row = _session_row(
        1,
        datetime(2026, 1, 1, tzinfo=UTC),
        action="instructor_account_updated",
        details={"instructor_id": 42, "changes": {"name": "New Name"}},
    )

    response = _session_row_to_response(row)

    assert response.resource_id == "42"
    assert response.details == row.details
