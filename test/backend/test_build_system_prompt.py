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
