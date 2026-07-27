"""Direct unit tests for services/audit.py."""
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

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


def _anonymous_session_row(id, timestamp, details=None):
    row = _session_row(id, timestamp, action="login_failed", details=details, user_id=None)
    row.user = None
    return row


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


def _session_response_row(id, timestamp, action="admin_login", details=None, user_id=1):
    return _response_row(
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
async def test_list_audit_logs_applies_since_to_both_sources_and_their_counts():
    """The range filter (Audit Logs page's 7d/30d/3mo selector) must be
    applied to audit_logs AND audit_logs_session, and to their count queries
    too — otherwise the merged feed's rows would be in-range but its `total`
    (used for pagination and the "N of M" label) would still be the all-time
    count, or the two sources would disagree about what's in range."""
    since = datetime(2026, 1, 1, tzinfo=UTC)
    db = _db(scalar_results=[0, 0], execute_rows=[])

    await list_audit_logs(db, limit=10, offset=0, since=since)

    scalar_queries = [str(call.args[0]) for call in db.scalar.call_args_list]
    execute_queries = [str(call.args[0]) for call in db.execute.call_args_list]
    assert all("timestamp >=" in q for q in scalar_queries)
    assert all("timestamp >=" in q for q in execute_queries)


@pytest.mark.asyncio
async def test_list_audit_logs_omits_range_filter_when_since_not_given():
    db = _db(scalar_results=[0, 0], execute_rows=[])

    await list_audit_logs(db, limit=10, offset=0)

    scalar_queries = [str(call.args[0]) for call in db.scalar.call_args_list]
    execute_queries = [str(call.args[0]) for call in db.execute.call_args_list]
    assert not any("timestamp >=" in q for q in scalar_queries)
    assert not any("timestamp >=" in q for q in execute_queries)


@pytest.mark.asyncio
async def test_list_audit_logs_paginates_across_merged_sources():
    t1, t2, t3 = (datetime(2026, 1, d, tzinfo=UTC) for d in (1, 2, 3))
    db = _db(
        scalar_results=[1, 2],
        execute_rows=[_session_response_row(1, t2)],
    )

    result = await list_audit_logs(db, limit=1, offset=1)

    assert len(result.items) == 1
    assert result.items[0].timestamp == t2
    assert result.total == 3


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


def test_session_row_to_response_handles_anonymous_failed_login():
    row = _anonymous_session_row(
        1,
        datetime(2026, 1, 1, tzinfo=UTC),
        details={"email": "missing@example.com", "reason": "unknown_email"},
    )

    response = _session_row_to_response(row)

    assert response.user_id is None
    assert response.user_email == "missing@example.com"
    assert response.user_role == "unknown"
    assert response.status == "failed"
