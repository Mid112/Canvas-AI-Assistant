"""Write actions gather their fields on a form, not by interrogation.

The reported failure, in full:

    > create an assignment
    < I still need the assignment title, description, and due date.
    > sam and monty due on september 2nd
    < I still need the description.
    > monty python is a good childrens book
    < Your Request is Out of Scope, it can't be processed.
    > description is monty python is a good childrens book
    < Is this assignment graded? ...
    > sixty five?
    < [preview]

Five turns, one of them an outright rejection of a perfectly good answer.
Two separate defects: the interrogation itself, and the fact that nothing
recorded which question was outstanding, so SCOPE CHECK judged an answer as
if it were a fresh request about a book.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.mcp_tools.dispatcher import _grade_target_is_unstated, execute_tool
from app.mcp_tools.schemas import (
    FORM_HANDOFF_ACTIONS,
    WRITE_ACTIONS,
    CreateAssignmentAction,
    CreateQuizAction,
    IntentPreviewAction,
)
from app.services.chat import (
    _ensure_write_content_is_drafted,
    _format_outstanding_question,
)


def _drafting_adapter(title: str, description: str) -> AsyncMock:
    adapter = AsyncMock()
    adapter.generate.return_value = (
        f'{{"title": "{title}", "description": "{description}"}}'
    )
    return adapter


# --------------------------------------------------- the handoff set itself


def test_every_form_handoff_action_is_still_gated_as_a_write():
    """Loosening what gets asked must not loosen what gets approved. Each of
    these still needs intent_preview → confirm before touching Canvas."""
    assert FORM_HANDOFF_ACTIONS <= WRITE_ACTIONS


# ------------------------------------------------------- drafting the content


@pytest.mark.asyncio
async def test_a_bare_create_assignment_gets_a_title_and_description():
    action = CreateAssignmentAction(
        local_course_id=1, title="", description="", due_date="2027-01-01"
    )
    adapter = _drafting_adapter(
        "Monty and Sam", "A short reflection on the assigned reading."
    )

    filled = await _ensure_write_content_is_drafted(
        action, "create an assignment about monty and sam", adapter
    )

    assert filled.title == "Monty and Sam"
    assert filled.description == "A short reflection on the assigned reading."


@pytest.mark.asyncio
async def test_the_instructors_own_title_is_never_rewritten():
    """Only gaps are filled. A title they typed is a decision, not a draft."""
    action = CreateAssignmentAction(
        local_course_id=1,
        title="sam and monty",
        description="",
        due_date="2027-01-01",
    )
    adapter = _drafting_adapter("Something The Model Preferred", "A description.")

    filled = await _ensure_write_content_is_drafted(
        action, "sam and monty due on september 2nd", adapter
    )

    assert filled.title == "sam and monty"
    assert filled.description == "A description."


@pytest.mark.asyncio
async def test_a_complete_request_costs_no_model_call():
    action = CreateAssignmentAction(
        local_course_id=1, title="HW1", description="Do the reading.",
        due_date="2027-01-01",
    )
    adapter = AsyncMock()

    filled = await _ensure_write_content_is_drafted(action, "make hw1", adapter)

    assert filled is action
    adapter.generate.assert_not_awaited()


@pytest.mark.asyncio
async def test_quizzes_are_drafted_the_same_way():
    """Through intent_preview, which is both what the system prompt asks for
    and the only route a gap-bearing quiz can take: CreateQuizAction pins
    description at min_length=20, so an empty one cannot be constructed as a
    typed action at all."""
    action = IntentPreviewAction(
        summary="I'll create the quiz.",
        proposed_action={
            "action": "create_quiz", "local_course_id": 1,
            "title": "", "description": "",
        },
    )
    adapter = _drafting_adapter(
        "Chapter 4 Quiz", "Five questions covering chapter 4 of the textbook."
    )

    filled = await _ensure_write_content_is_drafted(
        action, "make a quiz on chapter 4", adapter
    )

    assert filled.proposed_action["title"] == "Chapter 4 Quiz"
    assert filled.proposed_action["description"].startswith("Five questions")


@pytest.mark.asyncio
async def test_a_short_draft_never_fails_the_turn():
    """A re-parse here would raise on CreateQuizAction's min_length and lose
    a request that was fine before we tried to improve it."""
    action = CreateQuizAction(
        local_course_id=1,
        title="",
        description="A perfectly adequate starting description.",
        due_date="2027-01-01",
    )
    adapter = _drafting_adapter("Q1", "short")

    filled = await _ensure_write_content_is_drafted(action, "make a quiz", adapter)

    assert filled.title == "Q1"


@pytest.mark.asyncio
async def test_an_intent_preview_wrapped_create_is_drafted_too():
    """The route the system prompt actually asks for."""
    action = IntentPreviewAction(
        summary="I'll create the assignment.",
        proposed_action={
            "action": "create_assignment", "local_course_id": 1,
            "title": "", "description": "",
        },
    )
    adapter = _drafting_adapter("Reading Response", "Write a page on the reading.")

    filled = await _ensure_write_content_is_drafted(
        action, "create an assignment", adapter
    )

    assert filled.proposed_action["title"] == "Reading Response"
    assert filled.proposed_action["description"] == "Write a page on the reading."


@pytest.mark.asyncio
async def test_a_failed_drafter_leaves_the_request_intact():
    """Never raises, and never half-fills. A failed draft is a form the
    instructor completes, not a turn they lose."""
    action = CreateAssignmentAction(
        local_course_id=1, title="HW1", description="", due_date="2027-01-01"
    )
    adapter = AsyncMock()
    adapter.generate.side_effect = RuntimeError("provider down")

    filled = await _ensure_write_content_is_drafted(action, "make hw1", adapter)

    assert filled.title == "HW1"
    assert filled.description == ""


@pytest.mark.asyncio
async def test_other_actions_are_untouched():
    action = IntentPreviewAction(
        summary="I'll update the grade.",
        proposed_action={"action": "update_grade", "local_course_id": 1},
    )
    adapter = AsyncMock()

    assert await _ensure_write_content_is_drafted(action, "bump it", adapter) is action
    adapter.generate.assert_not_awaited()


# ------------------------------------------------------------- ambiguous roles


@pytest.mark.asyncio
async def test_a_date_shaped_title_is_carried_through_as_a_title():
    """"an assignment called September 11th" — the model decides the role,
    and whatever it decides survives to the preview unedited. Nothing here
    tries to second-guess it: the instructor sees the reading on a form
    field and changes it in one keystroke if it is wrong, which is the
    trade that made removing the clarify worth it."""
    action = CreateAssignmentAction(
        local_course_id=1,
        title="September 11th",
        description="A source analysis.",
        due_date="2027-01-15",
    )
    adapter = AsyncMock()

    filled = await _ensure_write_content_is_drafted(
        action, "an assignment called September 11th due January 15th", adapter
    )

    assert filled.title == "September 11th"
    adapter.generate.assert_not_awaited()


# ---------------------------------------------------------------- update_grade


def test_a_grade_request_naming_nobody_is_the_only_one_that_asks():
    assert _grade_target_is_unstated({"action": "update_grade"}) is True


@pytest.mark.parametrize(
    "field",
    ["assignment_id", "assignment_reference", "student_id", "student_reference"],
)
def test_either_half_of_a_grade_target_is_enough_to_proceed(field):
    """A reference is as good as an ID — resolving words into IDs is exactly
    what the resolvers are for, so asking first threw that work away."""
    assert _grade_target_is_unstated({"action": "update_grade", field: "milliken"}) is False


def test_a_missing_grade_is_not_a_reason_to_ask():
    """new_grade is required and still never asked for here. There is
    nothing to draft a grade from, and the grading form is where the
    instructor enters one against the submission they are looking at."""
    assert _grade_target_is_unstated(
        {"action": "update_grade", "student_reference": "Joshua"}
    ) is False


@pytest.mark.asyncio
async def test_update_grade_asks_once_for_both_halves_not_once_each():
    """It used to return on the first gap, so a bare "update a grade" cost
    three round trips before anything appeared."""
    db = AsyncMock()
    user = MagicMock(id=1)
    action = IntentPreviewAction(
        summary="update a grade",
        proposed_action={"action": "update_grade", "local_course_id": 1},
    )

    result = await execute_tool(db, user, action)

    assert result["action"] == "clarify"
    question = result["question"].lower()
    assert "student" in question and "assignment" in question


# ------------------------------------------- remembering the outstanding question


def test_an_outstanding_question_is_put_in_front_of_the_model():
    block = _format_outstanding_question(
        {"question": "What should the assignment description say?"}
    )

    assert "What should the assignment description say?" in block
    # The specific rescue for the reported failure.
    assert "out_of_scope" in block
    # And the escape hatch, so an instructor can still change the subject.
    assert "moved on" in block


def test_no_question_means_no_block():
    assert _format_outstanding_question(None) == ""
    assert _format_outstanding_question({}) == ""
    assert _format_outstanding_question({"question": "   "}) == ""


def test_a_clarify_without_candidates_is_still_remembered():
    """The precise cause of the out_of_scope failure: recording was gated on
    a candidate list, so a plain "what should X be?" left no trace and the
    next turn had no idea a question was open."""
    from app.services.field_memory import (
        pending_expectation,
        record_pending_expectation,
    )

    conversation = SimpleNamespace(field_memory={})
    record_pending_expectation(
        conversation,
        field="description",
        question="What should the assignment description say?",
        candidates=[],
    )

    remembered = pending_expectation(conversation.field_memory)
    assert remembered is not None
    assert remembered["question"] == "What should the assignment description say?"
    assert remembered["candidates"] == []


# --------------------------------------------------------- the reported turn


@pytest.mark.asyncio
async def test_the_reported_transcript_reaches_a_preview_in_one_turn():
    """"create an assignment" used to open a four-question interview."""
    db = AsyncMock()
    user = MagicMock(id=1)

    with patch(
        "app.mcp_tools.dispatcher._resolve_course",
        new=AsyncMock(return_value=SimpleNamespace(
            id=1, name="Capstone Project", canvas_url="https://canvas.example.edu"
        )),
    ):
        result = await execute_tool(
            db,
            user,
            IntentPreviewAction(
                summary="I'll create the assignment.",
                proposed_action={
                    "action": "create_assignment",
                    "local_course_id": 1,
                    "title": "sam and monty",
                    "description": "monty python is a good childrens book",
                    "due_date": "2026-09-02T23:59:00",
                    # No points_possible — four clarify turns ago, this alone
                    # was enough to stop the whole request.
                },
            ),
        )

    assert result["action"] == "intent_preview", result
    assert result.get("clarify") is not True
