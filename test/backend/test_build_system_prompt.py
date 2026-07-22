"""Unit tests for services/chat.py::build_system_prompt's Canvas-token gating."""
from app.services.chat import build_system_prompt


# Verifies: Default (has_canvas_token=True) omits the no-token instruction block.
def test_build_system_prompt_default_omits_canvas_gate():
    prompt = build_system_prompt()
    assert "has NOT connected a Canvas account" not in prompt


# Verifies: has_canvas_token=False includes the no-token instruction block.
def test_build_system_prompt_without_token_includes_canvas_gate():
    prompt = build_system_prompt(has_canvas_token=False)
    assert "has NOT connected a Canvas account" in prompt
    assert "Do not propose any Canvas-touching action" in prompt


def test_build_system_prompt_distinguishes_assignment_feedback_from_private_message():
    # Covers the reviewer clarification request: the model prompt tells chat to
    # ask whether the instructor means assignment feedback or a private message.
    prompt = build_system_prompt()
    normalized_prompt = " ".join(prompt.split())

    assert "assignment feedback on a submission" in normalized_prompt
    assert "send a private message to the student" in normalized_prompt
    assert "Do not guess between update_grade and send_message" in normalized_prompt
