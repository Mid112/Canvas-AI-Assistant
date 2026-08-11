"""A form-handoff action may not require a field its form owns.

The failure this exists to stop, verbatim from the chat window:

    > now can you send a message to students who submitted to baking 101
      saying good job?
    < [send_message preview, 3 recipients resolved]
    > instead of a message, can you give them that feedback?
    < Validation error for action 'update_grade': 1 validation error for
      UpdateGradeAction
      new_grade
        Field required [type=missing, ...]

The model did everything right. It carried the audience and the content
across a channel switch — message to feedback — exactly as intended, and
left out the one thing it must never invent: a mark on a student's record.
UPDATE_GRADE HANDOFF tells it to do that in those words. Then the schema
rejected it for complying, and the instructor was shown a Pydantic
traceback.

Two layers disagreeing about what a write needs is the bug. This test is
where they are made to agree, so the next required field added to a
form-handoff schema fails here rather than in someone's chat window.
"""

import pytest

from app.mcp_tools.schemas import (
    ACTION_SCHEMAS,
    FORM_HANDOFF_ACTIONS,
    FORM_OWNED_FIELDS,
    UpdateGradeAction,
)


@pytest.mark.parametrize("action_name", sorted(FORM_HANDOFF_ACTIONS))
def test_no_form_owned_field_is_required(action_name: str):
    schema = ACTION_SCHEMAS[action_name]

    required = {
        name
        for name, field in schema.model_fields.items()
        if field.is_required() and name in FORM_OWNED_FIELDS
    }

    assert not required, (
        f"{schema.__name__} requires {sorted(required)}, which the "
        f"{action_name} form owns. A required content field re-creates the "
        "interrogation at the schema layer: the model is told to propose "
        "with whatever it has, and then refused for having done so."
    )


@pytest.mark.parametrize("action_name", sorted(FORM_HANDOFF_ACTIONS))
def test_the_course_is_still_required(action_name: str):
    """The other half of the contract. Loosening content must not loosen
    identity — a write with no course is not a draft, it is a write aimed at
    nothing, and no form can fill that in from the request."""
    schema = ACTION_SCHEMAS[action_name]

    assert schema.model_fields["local_course_id"].is_required()


def test_identity_fields_are_not_claimed_as_form_owned():
    for field in (
        "local_course_id",
        "assignment_id",
        "student_id",
        "recipient_directives",
        "recipient_handle",
        "broadcast_to_all_students",
    ):
        assert field not in FORM_OWNED_FIELDS


# ------------------------------------------------- the reported turn itself


def test_feedback_without_a_grade_validates():
    """The exact proposed_action from the failing turn."""
    action = UpdateGradeAction(
        action="update_grade",
        assignment_reference="baking 101",
        student_reference="students who submitted to baking 101",
        feedback="good job",
        local_course_id=946,
    )

    assert action.new_grade == ""
    assert action.feedback == "good job"


def test_a_null_grade_does_not_become_the_string_None():
    """A model omitting an optional field often emits null instead. str(None)
    would send the four characters "None" to Canvas as posted_grade."""
    action = UpdateGradeAction(local_course_id=1, new_grade=None, feedback="good job")

    assert action.new_grade == ""


def test_a_real_grade_still_arrives_intact():
    action = UpdateGradeAction(local_course_id=1, new_grade="  87  ")

    assert action.new_grade == "87"


def test_feedback_is_still_read_from_the_deprecated_reason_spelling():
    action = UpdateGradeAction(local_course_id=1, reason="nice work")

    assert action.feedback == "nice work"
