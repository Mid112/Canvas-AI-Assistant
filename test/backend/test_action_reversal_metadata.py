"""Test note: covers the test action reversal metadata behavior so future changes can preserve the expected Canvas workflow contract."""

from datetime import UTC, datetime

from app.models.user import User
from app.models.workflow import Workflow
from app.schemas.history import WorkflowHistoryItem, build_reversal_metadata


def _workflow(action_name: str, status: str = "executed", undone_at=None) -> Workflow:
    return Workflow(
        id=1,
        conversation_id=None,
        user_id=1,
        course_id=1,
        action_name=action_name,
        user_prompt="Please make this Canvas change.",
        proposed_action={"action": action_name},
        affected_resources=[],
        status=status,
        executed_at=datetime(2026, 5, 1, 12, 0, tzinfo=UTC)
        if status == "executed"
        else None,
        undone_at=undone_at,
        created_at=datetime(2026, 5, 1, 11, 55, tzinfo=UTC),
        user=User(id=1, name="Dr. Jane Doe", email="jane@example.com"),
    )


# Verifies: Supported executed Canvas writes return an available reversal option.
def test_reversal_metadata_marks_supported_action_available():
    metadata = build_reversal_metadata(_workflow("update_assignment"))

    assert metadata.status == "available"
    assert metadata.available is True
    assert metadata.option_label == "Restore previous assignment state"
    assert "stored rollback" in metadata.recovery_instructions


# Verifies: Irreversible operations explain why rollback is unavailable and how to recover.
def test_reversal_metadata_explains_irreversible_action():
    metadata = build_reversal_metadata(_workflow("send_message"))

    assert metadata.status == "unavailable"
    assert metadata.available is False
    assert "one-click reversal" in metadata.unavailable_reason
    assert "follow-up Canvas message" in metadata.recovery_instructions


# Verifies: Already reversed workflows expose reversal history and result messaging.
def test_reversal_metadata_reports_completed_reversal_history():
    reversed_at = datetime(2026, 5, 1, 13, 0, tzinfo=UTC)
    metadata = build_reversal_metadata(_workflow("create_assignment", undone_at=reversed_at))

    assert metadata.status == "reversed"
    assert metadata.reversed_at == reversed_at
    assert metadata.result_message == "The created assignment was deleted from Canvas."


# Verifies: Workflow history responses include the reversal metadata contract.
def test_workflow_history_item_returns_reversal_metadata():
    item = WorkflowHistoryItem.from_workflow(_workflow("create_quiz"))

    assert item.reversal.available is True
    assert item.reversal.option_label == "Delete created quiz"
    assert item.undoable is True
