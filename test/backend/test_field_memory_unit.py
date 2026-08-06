from app.models.conversation import Conversation
from app.services.field_memory import (
    _PARTIAL_PLAN_SAFE_KEYS,
    clear_course_scoped_field_memory,
    extract_refs_from_read_result,
    format_field_memory_for_prompt,
    merge_field_memory,
    merge_grounded_facts_into_memory,
    merge_read_result_into_field_memory,
    record_course_context,
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


def test_record_course_context_indexes_and_timestamps_selection():
    """Ticket 46 / #1507: course selection writes compact JSON for follow-ups."""
    conversation = Conversation(field_memory={})
    first = record_course_context(
        conversation,
        local_course_id=10,
        course_name="CPSC 310",
        course_code="CPSC310",
    )
    assert first["index"] == 1
    assert first["local_course_id"] == 10
    assert first["course_name"] == "CPSC 310"
    assert first["course_code"] == "CPSC310"
    assert "selected_at" in first
    assert conversation.field_memory["local_course_id"] == 10

    # Same course again — do not bump the index on ordinary chat turns.
    again = record_course_context(
        conversation,
        local_course_id=10,
        course_name="CPSC 310",
        course_code="CPSC310",
    )
    assert again["index"] == 1

    switched = record_course_context(
        conversation,
        local_course_id=20,
        course_name="MATH 101",
        course_code="MATH101",
    )
    assert switched["index"] == 2
    assert switched["local_course_id"] == 20

    prompt = format_field_memory_for_prompt(conversation.field_memory)
    assert "course_context" in prompt
    assert '"index": 2' in prompt
    assert "MATH 101" in prompt


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


def test_merge_fetch_assignments_list_populates_recent_assignments():
    """Real dispatcher shape: {\"assignments\": [{\"id\", \"name\"}, ...]} (#1302)."""
    conversation = Conversation(field_memory={})
    merge_read_result_into_field_memory(
        conversation,
        {"local_course_id": 3, "action": "fetch_assignments"},
        {
            "assignments": [
                {"id": 99, "name": "Quiz 1"},
                {"id": 100, "name": "Lab 2"},
            ]
        },
    )
    recent = conversation.field_memory["recent_assignments"]
    assert recent[0] == {"id": 99, "name": "Quiz 1"}
    assert recent[1] == {"id": 100, "name": "Lab 2"}
    assert conversation.field_memory["assignment_id"] == 99
    assert conversation.field_memory["assignment_reference"] == "Quiz 1"


def test_merge_fetch_students_list_populates_recent_students():
    """Real dispatcher shape with local id + canvas_user_id (#1302)."""
    conversation = Conversation(field_memory={})
    merge_read_result_into_field_memory(
        conversation,
        {"local_course_id": 3, "action": "fetch_students"},
        {
            "students": [
                {"id": 12, "canvas_user_id": 77, "name": "Alex"},
                {"id": 13, "canvas_user_id": 88, "name": "Sam"},
            ]
        },
    )
    recent = conversation.field_memory["recent_students"]
    assert recent[0] == {"id": 77, "name": "Alex"}
    assert recent[1] == {"id": 88, "name": "Sam"}


def test_merge_fetch_submissions_nested_assignment_id_shape():
    """Resolver-chain shape uses assignment_id / assignment_name (#1302)."""
    conversation = Conversation(field_memory={})
    refs = extract_refs_from_read_result(
        {"local_course_id": 3, "assignment_reference": "first quiz"},
        {
            "assignment": {
                "assignment_id": 99,
                "assignment_name": "Quiz 1",
                "due_at": None,
            },
            "counts": {"missing": 2},
        },
    )
    assert refs["assignment_id"] == 99
    assert refs["assignment_reference"] == "Quiz 1"

    merge_read_result_into_field_memory(
        conversation,
        {"local_course_id": 3, "assignment_reference": "first quiz"},
        {
            "assignment": {
                "assignment_id": 99,
                "assignment_name": "Quiz 1",
            },
            "counts": {"missing": 2},
        },
    )
    assert conversation.field_memory["assignment_id"] == 99
    assert conversation.field_memory["assignment_reference"] == "Quiz 1"
    assert conversation.field_memory["recent_assignments"][0] == {
        "id": 99,
        "name": "Quiz 1",
    }


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


def test_partial_plan_safe_keys_exclude_raw_ids():
    """_PARTIAL_PLAN_SAFE_KEYS must not include assignment_id or student_id
    so hallucinated IDs and unresolved references from clarify partial_plans
    are never persisted (#1305)."""
    assert "assignment_id" not in _PARTIAL_PLAN_SAFE_KEYS
    assert "student_id" not in _PARTIAL_PLAN_SAFE_KEYS
    assert "student_reference" not in _PARTIAL_PLAN_SAFE_KEYS
    assert "new_grade" not in _PARTIAL_PLAN_SAFE_KEYS
    assert "feedback" not in _PARTIAL_PLAN_SAFE_KEYS
    assert "assignment_reference" in _PARTIAL_PLAN_SAFE_KEYS
    assert "title" in _PARTIAL_PLAN_SAFE_KEYS
    assert "due_date" in _PARTIAL_PLAN_SAFE_KEYS


def test_merge_field_memory_with_partial_plan_safe_keys_strips_ids():
    """A clarify partial_plan with hallucinated/unresolved values must not
    persist them into field_memory (#1305). Only context-setting fields
    (course, assignment reference, draft params) should survive."""
    conversation = Conversation(field_memory={})
    merge_field_memory(
        conversation,
        {
            "assignment_id": 99999,  # hallucinated
            "assignment_reference": "the latest quiz",
            "student_id": 77777,  # hallucinated
            "student_reference": "999999",  # failed to resolve
            "new_grade": "85",  # not confirmed
            "feedback": "good work",  # not confirmed
            "title": "Quiz 1",  # user-provided draft param
            "due_date": "2026-08-04T23:59:00",  # user-provided draft param
        },
        allowed_keys=_PARTIAL_PLAN_SAFE_KEYS,
    )
    assert "assignment_id" not in conversation.field_memory
    assert "student_id" not in conversation.field_memory
    assert "student_reference" not in conversation.field_memory
    assert "new_grade" not in conversation.field_memory
    assert "feedback" not in conversation.field_memory
    assert conversation.field_memory["assignment_reference"] == "the latest quiz"
    assert conversation.field_memory["title"] == "Quiz 1"
    assert conversation.field_memory["due_date"] == "2026-08-04T23:59:00"


def test_merge_field_memory_keeps_all_supplied_create_assignment_fields():
    """Ticket 16 / #1440: when the user answers multiple missing fields in
    one reply, every safe draft field persists so they are not re-asked."""
    conversation = Conversation(field_memory={"title": "HW1"})
    merge_field_memory(
        conversation,
        {
            "title": "HW1",
            "description": "Covers recursion",
            "due_date": "2030-11-20T23:59:00",
            "points_possible": 25,
        },
        allowed_keys=_PARTIAL_PLAN_SAFE_KEYS,
    )
    assert conversation.field_memory["title"] == "HW1"
    assert conversation.field_memory["description"] == "Covers recursion"
    assert conversation.field_memory["due_date"] == "2030-11-20T23:59:00"
    assert conversation.field_memory["points_possible"] == 25


def test_merge_field_memory_persists_explicit_null_points_possible():
    """Ticket 21: explicit ungraded (points_possible=null) must survive merge
    and prompt formatting so a later turn does not re-ask for points."""
    conversation = Conversation(field_memory={"title": "Reading Check-in"})
    merge_field_memory(
        conversation,
        {
            "title": "Reading Check-in",
            "description": "ungraded participation",
            "due_date": "2030-01-01T00:00:00",
            "points_possible": None,
            "assignment_id": None,  # still skipped — null is not meaningful here
        },
        allowed_keys=_PARTIAL_PLAN_SAFE_KEYS,
    )
    assert conversation.field_memory["points_possible"] is None
    assert "assignment_id" not in conversation.field_memory

    # A later merge that omits points_possible must not wipe the null.
    merge_field_memory(
        conversation,
        {"description": "updated body"},
        allowed_keys=_PARTIAL_PLAN_SAFE_KEYS,
    )
    assert conversation.field_memory["points_possible"] is None
    assert conversation.field_memory["description"] == "updated body"

    prompt = format_field_memory_for_prompt(conversation.field_memory)
    assert '"points_possible": null' in prompt


def test_clear_course_scoped_field_memory_removes_entity_refs():
    """Switching courses must clear assignment/student-scoped fields so
    they don't leak into the new course's context (#1306)."""
    conversation = Conversation(
        field_memory={
            "local_course_id": 1,
            "assignment_id": 42,
            "assignment_reference": "HW1",
            "student_id": 77,
            "student_reference": "Alex",
            "recent_assignments": [{"id": 42, "name": "HW1"}],
            "recent_students": [{"id": 77, "name": "Alex"}],
            "grounded_facts": {"ids": [42, 77], "names": ["hw1"], "grades": [], "dates": []},
            "subject": "Reminder",  # not course-scoped — should persist
        }
    )
    clear_course_scoped_field_memory(conversation)
    memory = conversation.field_memory
    assert "assignment_id" not in memory
    assert "assignment_reference" not in memory
    assert "student_id" not in memory
    assert "student_reference" not in memory
    assert "recent_assignments" not in memory
    assert "recent_students" not in memory
    assert "grounded_facts" not in memory
    # Non-course-scoped fields persist
    assert memory["local_course_id"] == 1
    assert memory["subject"] == "Reminder"


def test_trim_tool_dump_for_history_truncates_large_payload():
    payload = {"students": [{"name": f"Student {index}"} for index in range(500)]}
    trimmed = trim_tool_dump_for_history(payload, max_chars=120)
    assert trimmed["_truncated"] is True
    assert trimmed["preview"].endswith("...")


def test_trim_tool_dump_for_history_leaves_small_payload():
    payload = {"count": 3}
    assert trim_tool_dump_for_history(payload, max_chars=120) == payload
