"""Unit tests for services/chat.py::build_system_prompt's Canvas-token gating."""
from app.mcp_tools.schemas import FORM_HANDOFF_ACTIONS
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


def test_every_form_handoff_action_is_exempt_from_the_ambiguity_check():
    # The exemption used to name create_quiz and update_grade only, so this test
    # pinned that phrase. It now covers all four form-handoff actions, and the
    # set is derived rather than restated: a fifth one added to
    # FORM_HANDOFF_ACTIONS without a matching prompt change fails here.
    normalized_prompt = " ".join(build_system_prompt().split())
    exemption = normalized_prompt.split("AMBIGUITY CHECK", 1)[1].split("FORM HANDOFF", 1)[0]

    for action in FORM_HANDOFF_ACTIONS:
        assert action in exemption, (
            f"{action} hands off to a form, so the AMBIGUITY CHECK must exempt "
            "it; otherwise the model interrogates the user for fields the form "
            "is there to collect"
        )


def test_build_system_prompt_routes_grade_requests_to_grades_tab_handoff():
    # Covers the clarify-loop fix: missing assignment/student fields should not
    # stop grade requests before the backend resolver can open the Grades tab.
    prompt = build_system_prompt()
    normalized_prompt = " ".join(prompt.split())

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


def test_build_system_prompt_asks_for_all_missing_required_fields_together():
    # Ticket 16 / #1440: clarify must list every missing required field in
    # one turn so the instructor can answer them together.
    prompt = build_system_prompt()
    normalized_prompt = " ".join(prompt.split())

    assert "list ALL of them together" in normalized_prompt
    assert "answer them in one reply" in normalized_prompt
    assert "label it clearly as optional" in normalized_prompt
    assert "Do not re-ask for fields already present" in normalized_prompt
    assert "Only ask ONE question per turn" not in prompt
