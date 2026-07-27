"""
Unit tests for remaining pure service helpers (#708).
"""
from unittest.mock import AsyncMock

import pytest

from app.core.security import hash_token
from app.services.admin import DEFAULT_ADMIN_SETTINGS, get_dashboard_stats
from app.services.preview import build_action_preview


def test_build_action_preview_for_create_assignment():
    preview = build_action_preview(
        "create_assignment",
        "Create Midterm in CPSC 310",
        {"title": "Midterm", "due_date": "2030-01-01"},
        course_name="CPSC 310",
    )
    assert preview["action"] == "create_assignment"
    assert preview["reversible"] is True
    assert preview["metadata"]["title"] == "Midterm"
    types = [r["type"] for r in preview["affected_resources"]]
    assert types == ["course", "assignment"]


def test_build_action_preview_for_send_message_is_irreversible():
    preview = build_action_preview(
        "send_message",
        "Announce reminder",
        {"subject": "Reminder"},
        course_name="CPSC 310",
    )
    assert preview["reversible"] is False
    assert any(r["type"] == "announcement" for r in preview["affected_resources"])


@pytest.mark.asyncio
async def test_get_dashboard_stats_shape():
    db = AsyncMock()
    # scalar is awaited five times: instructor_count, admin_count,
    # active_workflows, then the audit_logs and audit_logs_session counts
    # that get summed into audit_events_last_7_days.
    db.scalar = AsyncMock(side_effect=[3, 2, 1, 4, 1])

    stats = await get_dashboard_stats(db)

    assert stats == {
        "instructor_count": 3,
        "admin_count": 2,
        "active_workflows": 1,
        "audit_events_last_7_days": 5,
    }
    assert db.scalar.await_count == 5


def test_default_admin_settings_keys():
    assert "organization_name" in DEFAULT_ADMIN_SETTINGS
    assert "allow_instructor_self_registration" in DEFAULT_ADMIN_SETTINGS
    assert DEFAULT_ADMIN_SETTINGS["session_timeout_minutes"] == 30


def test_hash_token_stable():
    assert hash_token("abc") == hash_token("abc")
    assert hash_token("abc") != hash_token("abd")
