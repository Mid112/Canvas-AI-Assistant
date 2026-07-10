import pytest

from app.mcp_tools.dispatcher import (
    ToolExecutionError,
    _create_assignment_due_date_in_past,
    _create_assignment_missing_field,
    _extract_json,
    parse_action,
)
from app.mcp_tools.schemas import FetchAssignmentsAction, FetchCoursesAction, FetchStudentsAction


#testing the _extract_json function

# Verifies: Strips thinking.
def test_strips_thinking():
    raw = '<think>some reasoning here</think>\n\n{"action": "fetch_courses"}'
    assert _extract_json(raw) == '{"action": "fetch_courses"}'


# Verifies: Plain json.
def test_plain_json():
    raw = '{"action": "fetch_courses"}'
    assert _extract_json(raw) == '{"action": "fetch_courses"}'


# Verifies: Markdown json.
def test_markdown_json():
    raw = '```json\n{"action": "fetch_courses"}\n```'
    result = _extract_json(raw)
    assert "fetch_courses" in result


#testing valid inputs to be parsed into a compatible message

# Verifies: Fetch courses.
def test_fetch_courses():
    action = parse_action('{"action": "fetch_courses"}')
    assert isinstance(action, FetchCoursesAction)
    assert action.action == "fetch_courses"


# Verifies: Fetch assignments.
def test_fetch_assignments():
    action = parse_action('{"action": "fetch_assignments", "local_course_id": 4}')
    assert isinstance(action, FetchAssignmentsAction)
    assert action.local_course_id == 4


# Verifies: Fetch students.
def test_fetch_students():
    action = parse_action('{"action": "fetch_students", "local_course_id": 7}')
    assert isinstance(action, FetchStudentsAction)
    assert action.local_course_id == 7


# Verifies: Send message with recipients.
def test_send_message_with_recipients():
    action = parse_action(
        '{"action": "send_message", "local_course_id": 2, "subject": "Reminder", '
        '"body": "Please submit", "recipient_canvas_user_ids": [101, 102]}'
    )
    assert action.recipient_canvas_user_ids == [101, 102]


# Verifies: Thinking json.
def test_thinking_json():
    raw = '<think>reasoning</think>\n{"action": "fetch_courses"}'
    action = parse_action(raw)
    assert isinstance(action, FetchCoursesAction)


#testing invalid inputs
# Verifies: Invalid json.
def test_invalid_json():
    with pytest.raises(ToolExecutionError) as exc_info:
        parse_action("not json at all")
    assert "could not be understood" in exc_info.value.user_message


# Verifies: Missing action.
def test_missing_action():
    with pytest.raises(ToolExecutionError) as exc_info:
        parse_action('{"local_course_id": 4}')
    assert "missing required information" in exc_info.value.user_message


# Verifies: Unknown action.
def test_unknown_action():
    with pytest.raises(ToolExecutionError) as exc_info:
        parse_action('{"action": "delete_everything"}')
    assert "isn't supported" in exc_info.value.user_message


# Verifies: Missing field.
def test_missing_field():
    with pytest.raises(ToolExecutionError) as exc_info:
        parse_action('{"action": "fetch_assignments"}')
    assert "missing required details" in exc_info.value.user_message


# Verifies: Wrong type.
def test_wrong_type():
    with pytest.raises(ToolExecutionError):
        parse_action('{"action": "fetch_assignments", "local_course_id": "not_a_number"}')


#testing _create_assignment_missing_field

_COMPLETE_PROPOSAL = {
    "action": "create_assignment",
    "local_course_id": 1,
    "title": "test4",
    "description": "Covers chapters 1-4",
    "due_date": "2026-11-20",
    "points_possible": 20,
}


# Verifies: Missing field none when all fields present.
def test_missing_field_none_when_all_fields_present():
    assert _create_assignment_missing_field(_COMPLETE_PROPOSAL) is None


# Verifies: Missing field detects empty string description.
def test_missing_field_detects_empty_string_description():
    # The regression this guards: a model can satisfy Pydantic's `str`
    # type with "" instead of actually asking, which schema validation
    # alone doesn't catch since proposed_action isn't validated against
    # CreateAssignmentAction until confirm time.
    proposal = {**_COMPLETE_PROPOSAL, "description": ""}
    assert _create_assignment_missing_field(proposal) == "description"


# Verifies: Missing field detects whitespace only title.
def test_missing_field_detects_whitespace_only_title():
    proposal = {**_COMPLETE_PROPOSAL, "title": "   "}
    assert _create_assignment_missing_field(proposal) == "title"


# Verifies: Missing field detects absent due date.
def test_missing_field_detects_absent_due_date():
    proposal = {k: v for k, v in _COMPLETE_PROPOSAL.items() if k != "due_date"}
    assert _create_assignment_missing_field(proposal) == "due_date"


# Verifies: Missing field detects null points possible.
def test_missing_field_detects_null_points_possible():
    proposal = {**_COMPLETE_PROPOSAL, "points_possible": None}
    assert _create_assignment_missing_field(proposal) == "points_possible"


# Verifies: Missing field checks title before description.
def test_missing_field_checks_title_before_description():
    proposal = {**_COMPLETE_PROPOSAL, "title": "", "description": ""}
    assert _create_assignment_missing_field(proposal) == "title"


#testing _create_assignment_due_date_in_past

# Verifies: Due date in past true for stale date.
def test_due_date_in_past_true_for_stale_date():
    # The regression this guards: the model has no innate sense of
    # "today" beyond the TODAY'S DATE prompt line and doesn't reliably
    # apply it, so it can hand back a same-year date that's already gone.
    assert _create_assignment_due_date_in_past("2020-01-01") is True


# Verifies: Due date in past false for future date.
def test_due_date_in_past_false_for_future_date():
    assert _create_assignment_due_date_in_past("2030-01-01") is False


# Verifies: Due date in past false for unparseable string.
def test_due_date_in_past_false_for_unparseable_string():
    # Leave format errors to the existing due_date validators — this
    # check only judges dates it can actually parse.
    assert _create_assignment_due_date_in_past("not a date") is False