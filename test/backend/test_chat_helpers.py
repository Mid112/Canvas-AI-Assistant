"""
Unit tests for chat helper / safety primitives in app.services.chat (#708, #710).
"""
from app.services.chat import (
    HISTORY_MESSAGE_MAX_CHARS,
    NORMAL_TURN_ALLOWED_ACTIONS,
    _attach_quiz_generation_prompt,
    _summarize_assistant_history_content,
    _truncate_history_content,
    build_system_prompt,
)


def test_normal_turn_allowed_actions_are_safe_only():
    assert NORMAL_TURN_ALLOWED_ACTIONS == {
        "intent_preview",
        "clarify",
        "out_of_scope",
        "respond",
    }


def test_build_system_prompt_includes_scope_and_today():
    prompt = build_system_prompt()
    assert "SCOPE CHECK" in prompt
    assert "out_of_scope" in prompt
    assert "Today's date is" in prompt
    assert "AVAILABLE ACTIONS" in prompt
    # Meta-control actions are not listed as executable Canvas tools
    tools_section = prompt.split("AVAILABLE ACTIONS", 1)[1]
    assert "- out_of_scope:" not in tools_section
    assert "- clarify:" not in tools_section
    assert "- respond:" not in tools_section
    assert "- intent_preview:" not in tools_section
    assert "- create_assignment:" in tools_section


def test_summarize_leaves_user_messages_alone():
    raw = '{"action": "clarify", "question": "Which course?"}'
    assert _summarize_assistant_history_content("user", raw) == raw


def test_summarize_strips_empty_clarify_partial_plan_to_question():
    raw = '{"action": "clarify", "question": "Which course?", "partial_plan": {}}'
    assert _summarize_assistant_history_content("assistant", raw) == "Which course?"


def test_summarize_preserves_grade_clarify_partial_plan():
    raw = (
        '{"action": "clarify", "question": "What grade?", '
        '"partial_plan": {"action": "update_grade", "assignment_reference": "ggg", '
        '"student_reference": "all students"}}'
    )
    summarized = _summarize_assistant_history_content("assistant", raw)

    assert '"assignment_reference": "ggg"' in summarized
    assert '"student_reference": "all students"' in summarized


def test_summarize_strips_respond_to_message():
    raw = '{"action": "respond", "message": "I can help with Canvas."}'
    assert _summarize_assistant_history_content("assistant", raw) == "I can help with Canvas."


def test_summarize_strips_error_to_error_text():
    raw = '{"error": "The assistant is currently unavailable. Please try again shortly."}'
    assert (
        _summarize_assistant_history_content("assistant", raw)
        == "The assistant is currently unavailable. Please try again shortly."
    )


def test_summarize_preserves_intent_preview_json():
    raw = (
        '{"intent_preview": true, "summary": "Create midterm", '
        '"proposed_action": {"action": "create_assignment", "title": "Midterm"}}'
    )
    assert _summarize_assistant_history_content("assistant", raw) == raw


def test_summarize_preserves_read_action_results():
    raw = '{"action": "fetch_assignments", "assignments": [{"id": 1, "name": "A1"}]}'
    assert _summarize_assistant_history_content("assistant", raw) == raw


def test_truncate_short_content_unchanged():
    assert _truncate_history_content("hello") == "hello"


def test_truncate_long_content():
    long = "x" * (HISTORY_MESSAGE_MAX_CHARS + 50)
    truncated = _truncate_history_content(long)
    assert truncated.endswith(" …[truncated]")
    assert len(truncated) == HISTORY_MESSAGE_MAX_CHARS + len(" …[truncated]")


# Verifies: create_quiz intent_preview gets the raw utterance as generation_prompt (#1512).
def test_attach_quiz_generation_prompt_stamps_create_quiz():
    utterance = (
        "Create a quiz called 'recursion principles' with 5 multiple-choice "
        "questions about cell biology. Each question should have 4 options. "
        "Set it to 50 points total, with a 30-minute time limit."
    )
    result = {
        "intent_preview": True,
        "summary": "Create recursion principles",
        "proposed_action": {
            "action": "create_quiz",
            "title": "recursion principles",
            "description": "",
            "local_course_id": 1,
        },
    }

    stamped = _attach_quiz_generation_prompt(result, utterance)

    assert stamped["proposed_action"]["generation_prompt"] == utterance
    assert stamped["proposed_action"]["title"] == "recursion principles"
    # Original dict is not mutated.
    assert "generation_prompt" not in result["proposed_action"]


def test_attach_quiz_generation_prompt_skips_non_quiz_and_blank():
    assignment = {
        "intent_preview": True,
        "proposed_action": {"action": "create_assignment", "title": "HW"},
    }
    assert _attach_quiz_generation_prompt(assignment, "make homework") is assignment

    quiz = {
        "intent_preview": True,
        "proposed_action": {"action": "create_quiz", "title": "Q"},
    }
    assert _attach_quiz_generation_prompt(quiz, "   ") is quiz
    assert _attach_quiz_generation_prompt({"action": "respond"}, "hi") == {
        "action": "respond"
    }
