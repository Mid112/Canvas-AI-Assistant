import pytest

from app.mcp_tools.dispatcher import ToolExecutionError, parse_action, _extract_json
from app.mcp_tools.schemas import FetchAssignmentsAction, FetchCoursesAction


#testing the _extract_json function

def test_strips_thinking():
    raw = '<think>some reasoning here</think>\n\n{"action": "fetch_courses"}'
    assert _extract_json(raw) == '{"action": "fetch_courses"}'


def test_plain_json():
    raw = '{"action": "fetch_courses"}'
    assert _extract_json(raw) == '{"action": "fetch_courses"}'


def test_markdown_json():
    raw = '```json\n{"action": "fetch_courses"}\n```'
    result = _extract_json(raw)
    assert "fetch_courses" in result


#testing valid inputs to be parsed into a compatible message

def test_fetch_courses():
    action = parse_action('{"action": "fetch_courses"}')
    assert isinstance(action, FetchCoursesAction)
    assert action.action == "fetch_courses"


def test_fetch_assignments():
    action = parse_action('{"action": "fetch_assignments", "local_course_id": 4}')
    assert isinstance(action, FetchAssignmentsAction)
    assert action.local_course_id == 4


def test_thinking_json():
    raw = '<think>reasoning</think>\n{"action": "fetch_courses"}'
    action = parse_action(raw)
    assert isinstance(action, FetchCoursesAction)


#testing invalid inputs
def test_invalid_json():
    with pytest.raises(ToolExecutionError) as exc_info:
        parse_action("not json at all")
    assert "could not be understood" in exc_info.value.user_message


def test_missing_action():
    with pytest.raises(ToolExecutionError) as exc_info:
        parse_action('{"local_course_id": 4}')
    assert "missing required information" in exc_info.value.user_message


def test_unknown_action():
    with pytest.raises(ToolExecutionError) as exc_info:
        parse_action('{"action": "delete_everything"}')
    assert "isn't supported" in exc_info.value.user_message


def test_missing_field():
    with pytest.raises(ToolExecutionError) as exc_info:
        parse_action('{"action": "fetch_assignments"}')
    assert "missing required details" in exc_info.value.user_message


def test_wrong_type():
    with pytest.raises(ToolExecutionError):
        parse_action('{"action": "fetch_assignments", "local_course_id": "not_a_number"}')