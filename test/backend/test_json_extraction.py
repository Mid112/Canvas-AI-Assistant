"""Test note: covers the test json extraction behavior so future changes can preserve the expected Canvas workflow contract."""

from app.services.llm.json_extraction import extract_json_object


def test_extracts_plain_json_object():
    raw = '{"action": "fetch_courses"}'
    assert extract_json_object(raw) == '{"action": "fetch_courses"}'


def test_strips_think_block_before_extracting():
    raw = '<think>reasoning about the request</think>\n{"action": "fetch_courses"}'
    assert extract_json_object(raw) == '{"action": "fetch_courses"}'


def test_ignores_trailing_content_after_the_json_object():
    """Regression test for a real incident: Qwen (Groq) appended trailing
    text after a valid JSON answer, and the old greedy `\\{.*\\}` regex
    spanned from the first `{` to the *last* `}` in the whole remaining
    string, concatenating the real JSON with the trailing garbage and
    producing 'JSON parse error: Extra data: line 6 column 5 (char 104)'
    instead of successfully parsing the assistant's actual answer."""
    raw = (
        '{"action": "fetch_submissions", "local_course_id": 351, "assignment_id": 5}\n'
        "\n"
        'Note: this assumes "assignment 1" refers to the assignment with id 5.'
    )
    assert (
        extract_json_object(raw)
        == '{"action": "fetch_submissions", "local_course_id": 351, "assignment_id": 5}'
    )


def test_ignores_braces_inside_string_values():
    raw = '{"action": "respond", "message": "Use the format {a: b} in your request."}'
    assert extract_json_object(raw) == raw


def test_ignores_json_like_text_embedded_in_think_block():
    raw = (
        "<think>The schema looks like {\"action\": \"example\"} but that's not my answer.</think>\n"
        '{"action": "fetch_courses"}'
    )
    assert extract_json_object(raw) == '{"action": "fetch_courses"}'


def test_returns_stripped_text_when_no_json_object_present():
    raw = "<think>still thinking</think>\nI can't find any assignment named that."
    assert extract_json_object(raw) == "I can't find any assignment named that."
