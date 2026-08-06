"""
Unit tests for remaining pure service helpers (#708).
"""
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
