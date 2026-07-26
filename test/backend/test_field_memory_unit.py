from app.models.conversation import Conversation
from app.services.field_memory import (
    format_field_memory_for_prompt,
    merge_field_memory,
    trim_tool_dump_for_history,
)


def test_merge_field_memory_keeps_allowed_fields_only():
    conversation = Conversation(field_memory={"assignment_id": 10})
    merge_field_memory(
        conversation,
        {
            "assignment_id": 42,
            "student_id": 7,
            "email": "hidden@example.edu",
            "title": "  ",
            "subject": "Reminder",
        },
    )
    assert conversation.field_memory == {
        "assignment_id": 42,
        "student_id": 7,
        "subject": "Reminder",
    }


def test_format_field_memory_for_prompt():
    prompt = format_field_memory_for_prompt(
        {
            "assignment_id": 42,
            "student_reference": "Alex",
            "subject": "Missing work",
        }
    )
    assert "FIELD MEMORY" in prompt
    assert '"assignment_id": 42' in prompt
    assert '"student_reference": "Alex"' in prompt


def test_trim_tool_dump_for_history_truncates_large_payload():
    payload = {"students": [{"name": f"Student {index}"} for index in range(500)]}
    trimmed = trim_tool_dump_for_history(payload, max_chars=120)
    assert trimmed["_truncated"] is True
    assert trimmed["preview"].endswith("...")


def test_trim_tool_dump_for_history_leaves_small_payload():
    payload = {"count": 3}
    assert trim_tool_dump_for_history(payload, max_chars=120) == payload
