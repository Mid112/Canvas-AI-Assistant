from unittest.mock import MagicMock

import pytest

from app.mcp_tools.dispatcher import (
    ToolExecutionError,
    _create_assignment_due_date_in_past,
    _extract_json,
    _grade_target_is_unstated,
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


@pytest.mark.parametrize(
    "raw",
    [
        '{"action": {"nested": "object"}}',
        '{"action": ["fetch_courses"]}',
        '{"action": 12}',
        '{"action": null}',
    ],
)
def test_non_string_action_raises_tool_execution_error(raw):
    """Non-string action must not TypeError crash chat callers (#1301 / PR #1314)."""
    with pytest.raises(ToolExecutionError) as exc_info:
        parse_action(raw)
    assert "could not be understood" in exc_info.value.user_message
    assert "Raw output" not in exc_info.value.user_message


# Verifies: Missing field.
def test_missing_field():
    with pytest.raises(ToolExecutionError) as exc_info:
        parse_action('{"action": "fetch_assignments"}')
    assert "missing required details" in exc_info.value.user_message


# Verifies: Wrong type.
def test_wrong_type():
    with pytest.raises(ToolExecutionError):
        parse_action('{"action": "fetch_assignments", "local_course_id": "not_a_number"}')


# create_assignment no longer has a missing-field clarify at all — it is a
# FORM_HANDOFF_ACTION, so it proposes with whatever it has and the assignment
# form collects the rest. The helpers these tests exercised
# (_create_assignment_missing_fields / _build_..._question and their field
# tables) are gone with it; test_write_form_handoff.py covers what replaced
# them. The one gap that still gets asked about is a grade with no target.


# Verifies: a grade request naming neither a student nor an assignment is the
# only remaining thing worth asking about.
def test_grade_target_unstated_when_nothing_names_a_target():
    assert _grade_target_is_unstated({"action": "update_grade"}) is True


# Verifies: either half is enough — the resolvers turn words into IDs, so
# asking first would throw that work away.
def test_grade_target_stated_by_a_reference_alone():
    assert _grade_target_is_unstated(
        {"action": "update_grade", "student_reference": "milliken"}
    ) is False
    assert _grade_target_is_unstated(
        {"action": "update_grade", "assignment_id": 7}
    ) is False


# Verifies: blank strings are not a target.
def test_grade_target_ignores_blank_references():
    assert _grade_target_is_unstated(
        {"action": "update_grade", "student_reference": "   "}
    ) is True


#testing _create_assignment_due_date_in_past

# Verifies: Due date in past true for stale date.
def test_due_date_in_past_true_for_stale_date():
    # The regression this guards: the model has no innate sense of
    # "today" beyond the TODAY'S DATE prompt line and doesn't reliably
    # apply it, so it can hand back a same-year date that's already gone.
    assert _create_assignment_due_date_in_past("2020-01-01", MagicMock(canvas_connections=[])) is True


# Verifies: Due date in past false for future date.
def test_due_date_in_past_false_for_future_date():
    assert _create_assignment_due_date_in_past("2030-01-01", MagicMock(canvas_connections=[])) is False


# Verifies: Due date in past false for unparseable string.
def test_due_date_in_past_false_for_unparseable_string():
    # Leave format errors to the existing due_date validators — this
    # check only judges dates it can actually parse.
    assert _create_assignment_due_date_in_past("not a date", MagicMock(canvas_connections=[])) is False