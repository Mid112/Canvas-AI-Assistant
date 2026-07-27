from app.models.conversation import Conversation
from app.services.field_memory import (
    extract_refs_from_read_result,
    format_field_memory_for_prompt,
    merge_field_memory,
    merge_grounded_facts_into_memory,
    merge_read_result_into_field_memory,
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
            "recent_assignments": [{"id": 42, "name": "HW1"}],
        }
    )
    assert "FIELD MEMORY" in prompt
    assert '"assignment_id": 42' in prompt
    assert '"student_reference": "Alex"' in prompt
    assert "recent_assignments" in prompt


def test_extract_and_merge_read_refs_into_field_memory():
    conversation = Conversation(field_memory={})
    refs = extract_refs_from_read_result(
        {"local_course_id": 3, "assignment_reference": "first quiz"},
        {
            "assignment_id": 99,
            "assignment_name": "Quiz 1",
            "student_id": 12,
            "student_name": "Alex",
            "local_course_id": 3,
        },
    )
    assert refs["assignment_id"] == 99
    assert refs["assignment_reference"] == "Quiz 1"
    assert refs["student_id"] == 12

    merge_read_result_into_field_memory(
        conversation,
        {"local_course_id": 3},
        {
            "assignment_id": 99,
            "assignment_name": "Quiz 1",
            "student_id": 12,
            "student_name": "Alex",
        },
    )
    assert conversation.field_memory["assignment_id"] == 99
    assert conversation.field_memory["recent_assignments"][0]["id"] == 99
    assert conversation.field_memory["recent_students"][0]["name"] == "Alex"


def test_merge_grounded_facts_into_memory_is_append_only():
    conversation = Conversation(field_memory={})
    merge_grounded_facts_into_memory(
        conversation,
        ids={10},
        names={"hw1"},
        grades={"88"},
        dates=set(),
    )
    merge_grounded_facts_into_memory(
        conversation,
        ids={10, 11},
        names={"hw2"},
        grades=set(),
        dates=set(),
    )
    facts = conversation.field_memory["grounded_facts"]
    assert facts["ids"] == [10, 11]
    assert "hw1" in facts["names"]
    assert "hw2" in facts["names"]
    assert facts["grades"] == ["88"]


def test_trim_tool_dump_for_history_truncates_large_payload():
    payload = {"students": [{"name": f"Student {index}"} for index in range(500)]}
    trimmed = trim_tool_dump_for_history(payload, max_chars=120)
    assert trimmed["_truncated"] is True
    assert trimmed["preview"].endswith("...")


def test_trim_tool_dump_for_history_leaves_small_payload():
    payload = {"count": 3}
    assert trim_tool_dump_for_history(payload, max_chars=120) == payload
