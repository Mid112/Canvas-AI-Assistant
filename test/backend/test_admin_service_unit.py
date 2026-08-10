"""Direct unit tests for services/admin.py."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException

from app.schemas.admin import CreateAdminRequest, CreateInstructorRequest, UpdateInstructorRequest
from app.services.admin import (
    _get_instructor,
    create_admin_user,
    create_instructor,
    disable_instructor,
    enable_instructor,
    get_admin_settings,
    get_dashboard_stats,
    list_instructors,
    revoke_instructor_access,
    update_admin_settings,
    update_instructor,
)


def _db_assigning_ids() -> AsyncMock:
    db = AsyncMock()
    created: list = []
    db.add = Mock(side_effect=created.append)

    async def _refresh(obj):
        if getattr(obj, "id", None) is None:
            obj.id = 1

    db.refresh = AsyncMock(side_effect=_refresh)
    return db


# ---------------------------------------------------------------------------
# get_dashboard_stats
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_dashboard_stats_sums_audit_logs_and_audit_logs_session():
    """The audit viewer (services/audit.py's list_audit_logs) merges rows from
    both audit_logs (workflow events) and audit_logs_session (session/admin/
    security events) into one feed. The dashboard's audit_events_last_7_days
    must count both, or it undercounts relative to what the admin sees when
    they actually open the audit log page."""
    db = AsyncMock()
    # Order matches get_dashboard_stats: instructor_count, admin_count,
    # active_workflows, workflow (audit_logs) events, session
    # (audit_logs_session) events.
    db.scalar = AsyncMock(side_effect=[5, 2, 3, 4, 6])

    stats = await get_dashboard_stats(db)

    assert stats["audit_events_last_7_days"] == 10


# ---------------------------------------------------------------------------
# get_admin_settings / update_admin_settings
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_admin_settings_merges_stored_over_defaults():
    db = AsyncMock()
    db.scalars = AsyncMock(
        return_value=[SimpleNamespace(key="organization_name", value="UBCO")]
    )

    settings = await get_admin_settings(db)

    assert settings["organization_name"] == "UBCO"
    assert settings["session_timeout_minutes"] == 30  # untouched default


@pytest.mark.asyncio
async def test_update_admin_settings_updates_existing_key():
    db = _db_assigning_ids()
    existing = SimpleNamespace(key="organization_name", value="Old Org", updated_at=None)
    db.get = AsyncMock(return_value=existing)
    db.scalars = AsyncMock(return_value=[])
    admin = SimpleNamespace(id=1)

    await update_admin_settings(db, {"organization_name": "New Org"}, admin)

    assert existing.value == "New Org"
    assert existing.updated_at is not None
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_admin_settings_inserts_new_key():
    db = _db_assigning_ids()
    db.get = AsyncMock(return_value=None)
    db.scalars = AsyncMock(return_value=[])
    admin = SimpleNamespace(id=1)

    await update_admin_settings(db, {"new_setting": "value"}, admin)

    # One add() for the new SystemSetting row, one for the audit log entry.
    assert db.add.call_count == 2
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_admin_settings_writes_audit_log():
    db = _db_assigning_ids()
    db.get = AsyncMock(return_value=None)
    db.scalars = AsyncMock(return_value=[])
    admin = SimpleNamespace(id=7)

    await update_admin_settings(db, {"organization_name": "New Org"}, admin)

    audit_entry = next(
        c.args[0] for c in db.add.call_args_list if getattr(c.args[0], "action", None) == "admin_settings_updated"
    )
    assert audit_entry.user_id == 7
    assert audit_entry.details["changed_keys"] == ["organization_name"]
    assert "values" not in audit_entry.details


# ---------------------------------------------------------------------------
# list_instructors
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_instructors_returns_scalars_as_list():
    db = AsyncMock()
    instructors = [SimpleNamespace(id=1, role="instructor"), SimpleNamespace(id=2, role="instructor")]
    db.scalars = AsyncMock(return_value=instructors)

    result = await list_instructors(db)

    assert result == instructors


# ---------------------------------------------------------------------------
# create_admin_user / create_instructor
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_admin_user_rejects_duplicate_email():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=SimpleNamespace(id=1))
    admin = SimpleNamespace(id=1)
    body = CreateAdminRequest(name="New Admin", email="dup@example.com", password="Secret123!")

    with pytest.raises(HTTPException) as exc_info:
        await create_admin_user(db, body, admin)

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_create_admin_user_success_writes_audit_log():
    db = _db_assigning_ids()
    db.scalar = AsyncMock(return_value=None)
    admin = SimpleNamespace(id=1)
    body = CreateAdminRequest(name="New Admin", email="new@example.com", password="Secret123!")

    user = await create_admin_user(db, body, admin)

    assert user.role == "admin"
    assert user.email == "new@example.com"
    assert db.add.call_count == 2  # the User row and the AuditLogSession row
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_instructor_rejects_duplicate_email():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=SimpleNamespace(id=1))
    admin = SimpleNamespace(id=1)
    body = CreateInstructorRequest(name="New Instructor", email="dup@example.com", password="Secret123!")

    with pytest.raises(HTTPException) as exc_info:
        await create_instructor(db, body, admin)

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_create_instructor_success():
    db = _db_assigning_ids()
    db.scalar = AsyncMock(return_value=None)
    admin = SimpleNamespace(id=1)
    body = CreateInstructorRequest(name="New Instructor", email="new@example.com", password="Secret123!")

    instructor = await create_instructor(db, body, admin)

    assert instructor.role == "instructor"
    assert instructor.email == "new@example.com"


# ---------------------------------------------------------------------------
# _get_instructor / update_instructor / enable / disable / revoke
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_instructor_not_found_raises_404():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as exc_info:
        await _get_instructor(db, 999)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_update_instructor_updates_name_only():
    db = AsyncMock()
    db.add = Mock()
    instructor = SimpleNamespace(id=5, name="Old Name", email="old@example.com", role="instructor")
    db.scalar = AsyncMock(return_value=instructor)
    db.refresh = AsyncMock()
    admin = SimpleNamespace(id=1)

    result = await update_instructor(db, 5, UpdateInstructorRequest(name="New Name"), admin)

    assert result.name == "New Name"
    assert result.email == "old@example.com"


@pytest.mark.asyncio
async def test_update_instructor_rejects_conflicting_email():
    db = AsyncMock()
    instructor = SimpleNamespace(id=5, name="Old Name", email="old@example.com", role="instructor")
    # First db.scalar call is _get_instructor's lookup, second is the email conflict check.
    db.scalar = AsyncMock(side_effect=[instructor, SimpleNamespace(id=6)])
    admin = SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as exc_info:
        await update_instructor(
            db, 5, UpdateInstructorRequest(email="taken@example.com"), admin
        )

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_update_instructor_updates_email_when_available():
    db = AsyncMock()
    db.add = Mock()
    instructor = SimpleNamespace(id=5, name="Old Name", email="old@example.com", role="instructor")
    db.scalar = AsyncMock(side_effect=[instructor, None])
    db.refresh = AsyncMock()
    admin = SimpleNamespace(id=1)

    result = await update_instructor(
        db, 5, UpdateInstructorRequest(email="new@example.com"), admin
    )

    assert result.email == "new@example.com"


@pytest.mark.asyncio
async def test_enable_instructor_sets_active_true():
    db = AsyncMock()
    db.add = Mock()
    instructor = SimpleNamespace(id=5, is_active=False, role="instructor")
    db.scalar = AsyncMock(return_value=instructor)
    db.refresh = AsyncMock()
    admin = SimpleNamespace(id=1)

    result = await enable_instructor(db, 5, admin)

    assert result.is_active is True


@pytest.mark.asyncio
async def test_disable_instructor_sets_active_false():
    db = AsyncMock()
    db.add = Mock()
    instructor = SimpleNamespace(id=5, is_active=True, role="instructor")
    db.scalar = AsyncMock(return_value=instructor)
    db.refresh = AsyncMock()
    admin = SimpleNamespace(id=1)

    result = await disable_instructor(db, 5, admin)

    assert result.is_active is False


@pytest.mark.asyncio
async def test_revoke_instructor_access_removes_all_canvas_connections():
    db = AsyncMock()
    db.add = Mock()
    instructor = SimpleNamespace(id=5, role="instructor")
    db.scalar = AsyncMock(return_value=instructor)
    connections = [SimpleNamespace(id=10), SimpleNamespace(id=11)]
    db.scalars = AsyncMock(return_value=SimpleNamespace(all=lambda: connections))
    admin = SimpleNamespace(id=1)

    await revoke_instructor_access(db, 5, admin)

    assert db.delete.await_count == 2
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_revoke_instructor_access_missing_instructor_raises_404():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    admin = SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as exc_info:
        await revoke_instructor_access(db, 999, admin)

    assert exc_info.value.status_code == 404
