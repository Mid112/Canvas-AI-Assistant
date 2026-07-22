"""Unit tests for services/chat.py::build_system_prompt's Canvas-token gating."""
from app.services.chat import build_system_prompt


# Verifies: Default (has_canvas_token=True) omits the limited-mode instruction block.
def test_build_system_prompt_default_omits_canvas_gate():
    prompt = build_system_prompt()
    assert "LIMITED MODE" not in prompt
    assert "has NOT connected a Canvas account" not in prompt


# Verifies: has_canvas_token=False includes the limited-mode instruction block.
def test_build_system_prompt_without_token_includes_canvas_gate():
    prompt = build_system_prompt(has_canvas_token=False)
    assert "LIMITED MODE" in prompt
    assert "has NOT connected a Canvas account" in prompt
    assert "Do not propose or execute any Canvas-touching action" in prompt


def test_build_system_prompt_distinguishes_assignment_feedback_from_private_message():
    # Covers the reviewer clarification request: the model prompt tells chat to
    # ask whether the instructor means assignment feedback or a private message.
    prompt = build_system_prompt()
    normalized_prompt = " ".join(prompt.split())

    assert "assignment feedback on a submission" in normalized_prompt
    assert "send a private message to the student" in normalized_prompt
    assert "Do not guess between update_grade and send_message" in normalized_prompt


def test_build_system_prompt_routes_grade_requests_to_grades_tab_handoff():
    # Covers the clarify-loop fix: missing assignment/student fields should not
    # stop grade requests before the backend resolver can open the Grades tab.
    prompt = build_system_prompt()
    normalized_prompt = " ".join(prompt.split())

    assert "create_quiz and update_grade are exceptions" in normalized_prompt
    assert "UPDATE_GRADE HANDOFF" in prompt
    assert "propose update_grade immediately" in normalized_prompt
    assert "opens the dedicated Grades tab" in normalized_prompt
    assert "Do not clarify only because update_grade is missing" in normalized_prompt


def test_build_system_prompt_keeps_feedback_message_clarification_exception():
    # Covers the nuance: update_grade skips missing field clarification, but
    # vague feedback/note wording still asks assignment feedback vs private DM.
    prompt = build_system_prompt()
    normalized_prompt = " ".join(prompt.split())

    assert "Exception: if the user asks to \"give feedback\"" in normalized_prompt
    assert "assignment feedback on a submission or a private message" in normalized_prompt
