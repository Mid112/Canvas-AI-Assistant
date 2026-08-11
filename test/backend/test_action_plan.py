"""Two or more actions asked for in ONE message (see ActionPlanAction and the
plan queue in handle_chat_message's step loop).

The bug these exist for: the step loop broke on the first non-read, so a
request naming two writes had its second half parsed, understood, and dropped
without a word. "Send a reminder to students missing testing event 2 and send
encouraging feedback to students who scored 70-90 on the python quiz" came back
as a single message, to the first group only, with both subjects merged.

Read alongside test_multi_step_loop.py, which covers the model-driven chaining
this sits on top of — one action that needs a lookup first is NOT a plan.
"""

import re
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from canvas_test_utils import unique_canvas_token
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.mcp_tools.dispatcher import ToolExecutionError, parse_action
from app.mcp_tools.schemas import MAX_PLAN_ACTIONS, ActionPlanAction
from app.schemas.canvas import SubmissionResponse, SubmissionStatus
from app.schemas.student import StudentResponse
from app.services.chat import (
    PREVIOUS_STEP_HANDLE,
    _bind_plan_step_audience,
    _handle_from_result,
    _plan_step_is_surfaced,
    _prepare_plan_steps,
)

CANVAS_URL = "https://canvas.example.edu"


# --------------------------------------------------------------------------
# The envelope
# --------------------------------------------------------------------------

def test_a_plan_carries_ordinary_actions_not_a_new_combined_one():
    """The whole point of the envelope: no create_assignment_and_send_message.

    Each step validates later, on its own, as the action it names — so adding
    a new pairing of existing actions needs no new schema, no new dispatch
    branch, and no new preview builder.
    """
    plan = parse_action(
        '{"action": "action_plan", "course_name": "CPSC 310", "steps": ['
        '{"action": "create_assignment", "title": "Lab 5"},'
        '{"action": "send_message", "subject": "Lab 5 is up", "body": "See Canvas."}]}'
    )
    assert isinstance(plan, ActionPlanAction)
    assert [step["action"] for step in plan.steps] == ["create_assignment", "send_message"]


def test_one_step_is_not_a_plan():
    """A single action wearing an envelope would be a second code path for the
    case that already works, kept behaving identically by hand forever."""
    with pytest.raises(ToolExecutionError):
        parse_action(
            '{"action": "action_plan", "steps": [{"action": "fetch_assignments"}]}'
        )


def test_a_plan_may_list_ten_actions_and_no_more():
    steps = [{"action": "fetch_assignments"} for _ in range(MAX_PLAN_ACTIONS)]
    assert len(ActionPlanAction(steps=steps).steps) == MAX_PLAN_ACTIONS

    with pytest.raises(ValidationError):
        ActionPlanAction(steps=steps + [{"action": "fetch_assignments"}])


def test_a_plan_cannot_nest_another_plan():
    """Nesting would make the ten-step cap meaningless — ten plans of ten."""
    with pytest.raises(ValidationError):
        ActionPlanAction(
            steps=[
                {"action": "fetch_assignments"},
                {"action": "action_plan", "steps": [{"action": "fetch_courses"}]},
            ]
        )


def test_junk_steps_are_dropped_rather_than_failing_the_whole_plan():
    """A stray null or a step with no action name costs that step, not the
    request. The instructor asked for three things; losing all three because
    the model emitted a fourth badly is the worse trade."""
    plan = ActionPlanAction(
        steps=[
            {"action": "fetch_assignments"},
            {"no_action_key": True},
            {"action": "fetch_students"},
        ]
    )
    assert [step["action"] for step in plan.steps] == [
        "fetch_assignments",
        "fetch_students",
    ]


# --------------------------------------------------------------------------
# Making each step able to stand on its own
# --------------------------------------------------------------------------

def test_the_plans_course_is_copied_onto_every_step():
    """A step is dispatched as its own envelope with no memory of the plan, so
    a course named once at the top has to reach all of them."""
    plan = ActionPlanAction(
        steps=[{"action": "fetch_assignments"}, {"action": "fetch_students"}]
    )
    steps = _prepare_plan_steps(plan, "CPSC 310")
    assert [step["course_name"] for step in steps] == ["CPSC 310", "CPSC 310"]


def test_a_step_that_names_its_own_course_keeps_it():
    """"Message CPSC 310 and grade CPSC 210" is a legitimate plan; the
    plan-level name must not overwrite a step that disagreed on purpose."""
    plan = ActionPlanAction(
        steps=[
            {"action": "fetch_assignments"},
            {"action": "fetch_students", "course_name": "CPSC 210"},
        ]
    )
    steps = _prepare_plan_steps(plan, "CPSC 310")
    assert [step["course_name"] for step in steps] == ["CPSC 310", "CPSC 210"]


def test_preparing_steps_does_not_mutate_the_parsed_plan():
    plan = ActionPlanAction(steps=[{"action": "fetch_assignments"}, {"action": "fetch_students"}])
    _prepare_plan_steps(plan, "CPSC 310")
    assert "course_name" not in plan.steps[0]


# --------------------------------------------------------------------------
# "those students" — pointing a step at the group before it
# --------------------------------------------------------------------------

def test_previous_step_binds_to_the_last_resolved_group():
    step = {"action": "update_grade", "recipient_handle": PREVIOUS_STEP_HANDLE}
    assert _bind_plan_step_audience(step, "rs_abc123") == {
        "action": "update_grade",
        "recipient_handle": "rs_abc123",
    }


def test_previous_step_with_nothing_to_point_at_stops_the_step():
    """None must stop the plan, and the reason is specific to send_message:
    it reads "no recipients" as "announce to the whole class". A reference
    that quietly failed to bind would not narrow the audience — it would
    broadcast the message to everyone, including the students the criterion
    existed to exclude."""
    step = {"action": "send_message", "recipient_handle": PREVIOUS_STEP_HANDLE}
    assert _bind_plan_step_audience(step, None) is None


def test_a_step_without_the_marker_is_left_alone():
    step = {"action": "send_message", "recipient_handle": "rs_written_by_the_model"}
    assert _bind_plan_step_audience(step, "rs_something_else") is step


@pytest.mark.parametrize(
    "result,expected",
    [
        ({"action": "resolve_missing_submissions", "handle": "rs_1"}, "rs_1"),
        ({"action": "respond", "grade_handoff": {"recipient_handle": "rs_2"}}, "rs_2"),
        ({"action": "intent_preview", "recipient_handle": "rs_3"}, "rs_3"),
        ({"action": "respond", "message": "nothing resolved"}, None),
        ({"action": "respond", "grade_handoff": None}, None),
    ],
)
def test_a_handle_is_read_from_wherever_its_chain_puts_it(result, expected):
    """Three chains bank an audience and each already had its own place to say
    so. Read here rather than normalized at the source: moving any of them
    would change a payload the client already reads."""
    assert _handle_from_result(result) == expected


# --------------------------------------------------------------------------
# Which steps the instructor sees
# --------------------------------------------------------------------------

def test_a_read_in_the_middle_of_a_plan_is_scaffolding_not_a_card():
    """The submissions fetch behind "add a mark" is not something the
    instructor asked to see; rendering it buries the cards that were."""
    action = parse_action('{"action": "fetch_submissions", "local_course_id": 1}')
    assert _plan_step_is_surfaced(action, {"submissions": []}, is_last=False) is False


def test_a_read_at_the_end_of_a_plan_is_the_answer_to_its_half():
    """Nothing follows it to consume the data. "Message everyone missing lab 4,
    then show me my assignments" asked for that list."""
    action = parse_action('{"action": "fetch_assignments", "local_course_id": 1}')
    assert _plan_step_is_surfaced(action, {"assignments": []}, is_last=True) is True


def test_a_writes_result_is_surfaced_wherever_it_sits():
    action = parse_action(
        '{"action": "send_message", "local_course_id": 1, "subject": "Hi", "body": "Hello."}'
    )
    assert _plan_step_is_surfaced(action, {"intent_preview": True}, is_last=False) is True


def test_a_reads_clarify_is_surfaced_because_it_is_why_the_plan_stopped():
    action = parse_action('{"action": "fetch_submissions", "local_course_id": 1}')
    assert (
        _plan_step_is_surfaced(
            action, {"clarify": True, "question": "which one?"}, is_last=False
        )
        is True
    )


# --------------------------------------------------------------------------
# End to end
# --------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> tuple[dict, int]:
    email = f"plantest_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Plan Test Instructor", "email": email, "password": "Secret123!"},
    )
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": unique_canvas_token(), "canvas_url": CANVAS_URL},
            headers=headers,
        )

    canvas_course_id = uuid.uuid4().int % 10_000_000
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = [{
            "id": canvas_course_id,
            "name": "CPSC 310",
            "course_code": "CPSC310",
            "enrollment_term_id": 1,
            "workflow_state": "available",
        }]
        resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
        local_course_id = resp.json()[0]["local_id"]
        client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_course_id},
            headers=headers,
        )
    return headers, local_course_id


def _assignments() -> list[dict]:
    return [{
        "id": 222, "name": "Assignment 4", "description": None,
        "due_at": "2026-06-01T00:00:00+00:00", "points_possible": 100.0,
        "course_id": 1,
    }]


def _student(canvas_user_id: str, course_id: int, name: str) -> StudentResponse:
    return StudentResponse(
        id=1, canvas_user_id=canvas_user_id, course_id=course_id,
        name=name, enrollment_state="active",
    )


def _submission(user_id: int, status: SubmissionStatus, name: str, score=None) -> SubmissionResponse:
    return SubmissionResponse(
        id=user_id, assignment_id=222, user_id=user_id, student_name=name,
        workflow_state="unsubmitted", status=status, score=score,
    )


def test_two_writes_in_one_message_both_reach_the_instructor(client):
    """The reported bug, end to end.

    Before the plan queue the loop broke on the first non-read, so the second
    write never ran. Both must arrive, in the order they were asked for, each
    with its own card — not merged into one.
    """
    headers, _ = _register_with_canvas(client)

    calls = 0

    async def generate(system_prompt, message, history, timeout):
        nonlocal calls
        calls += 1
        return (
            '{"action": "action_plan", "course_name": "CPSC 310", '
            '"summary": "Create the lab and tell the class.", "steps": ['
            '{"action": "create_assignment", "course_name": "CPSC 310", '
            '"title": "Lab 5", "description": "Recursion practice.", '
            '"due_date": "2030-01-01T00:00:00", "points_possible": 10},'
            '{"action": "send_message", "course_name": "CPSC 310", '
            '"subject": "Lab 5 is up", "body": "Lab 5 is now on Canvas."}]}'
        )

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = generate

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={
                "message": "create a lab 5 assignment and tell the class about it",
                "conversation_id": None,
            },
            headers=headers,
        )
    body = response.json()
    assert body["is_error"] is False, body

    # One decision for the whole request. The steps do not go back to the
    # model: it already chose them, and re-asking mid-plan is how a step gets
    # re-litigated into a different action.
    assert calls == 1

    reply = body["reply"]
    assert reply["proposed_action"]["action"] == "create_assignment"
    assert reply["proposed_action"]["title"] == "Lab 5"

    extras = reply["additional_previews"]
    assert len(extras) == 1
    assert extras[0]["proposed_action"]["action"] == "send_message"
    assert extras[0]["proposed_action"]["subject"] == "Lab 5 is up"


def test_the_second_step_keeps_its_own_parameters(client):
    """"Pat them on the back" belongs to the step that asked for it.

    The failure this pins is subtle and was the reported one: the phrase
    describing the second action gets absorbed as a FIELD of the first, so one
    write goes out carrying both meanings and the other never happens. Here
    the message body must not leak into the assignment, nor the assignment
    title into the message.
    """
    headers, _ = _register_with_canvas(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "action_plan", "course_name": "CPSC 310", "steps": ['
        '{"action": "create_assignment", "course_name": "CPSC 310", '
        '"title": "Midterm Review", "description": "Practice problems.", '
        '"due_date": "2030-02-01T00:00:00", "points_possible": 20},'
        '{"action": "send_message", "course_name": "CPSC 310", '
        '"subject": "Heads up", "body": "A midterm review is now posted."}]}'
    )

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        body = client.post(
            "/api/v1/chat/",
            json={
                "message": "create a midterm review assignment and tell the class about it",
                "conversation_id": None,
            },
            headers=headers,
        ).json()

    assert body["is_error"] is False, body
    created = body["reply"]["proposed_action"]
    messaged = body["reply"]["additional_previews"][0]["proposed_action"]

    assert created["description"] == "Practice problems."
    assert "midterm review is now posted" not in created["description"]
    assert messaged["body"] == "A midterm review is now posted."
    assert messaged["subject"] == "Heads up"


def test_two_audiences_in_one_message_reach_two_different_groups(client):
    """The reported turn, verbatim in shape.

    "Send a reminder to students missing testing event 2 and send encouraging
    feedback to students who scored 70-90 on the python quiz" came back as ONE
    message with both subjects merged into its title, addressed only to the
    first group. The quiz feedback went to students who had not been graded
    and never reached the students who earned it.

    Two steps, two audiences, two different sets of people — and neither
    step's audience may leak into the other.
    """
    headers, local_course_id = _register_with_canvas(client)
    students = [
        _student("501", local_course_id, "Alice"),
        _student("502", local_course_id, "Bob"),
    ]
    submissions = [
        _submission(501, SubmissionStatus.missing, "Alice"),
        _submission(502, SubmissionStatus.graded, "Bob", score=80.0),
    ]

    async def generate(system_prompt, message, history, timeout):
        if "You resolve which assignment" in system_prompt:
            return '{"assignment_id": 222}'
        return (
            '{"action": "action_plan", "course_name": "CPSC 310", "steps": ['
            '{"action": "send_message", "course_name": "CPSC 310", '
            '"subject": "Reminder", "body": "Please hand in assignment 4.", '
            '"audience": {"kind": "not_submitted", '
            '"assignment_reference": "assignment 4"}},'
            '{"action": "update_grade", "course_name": "CPSC 310", '
            '"assignment_reference": "assignment 4", '
            '"audience": {"kind": "score_range", "min_score": 70, '
            '"max_score": 90, "assignment_reference": "assignment 4"}, '
            '"feedback": "Strong work on this one."}]}'
        )

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = generate

    with (
        patch("app.services.chat.get_llm_adapter", return_value=mock_adapter),
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_assignments())),
        patch("app.mcp_tools.dispatcher.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        body = client.post(
            "/api/v1/chat/",
            json={
                "message": (
                    "send a reminder to students missing assignment 4 and give "
                    "encouraging feedback to students who scored between 70 and 90"
                ),
                "conversation_id": None,
            },
            headers=headers,
        ).json()

    assert body["is_error"] is False, body
    reply = body["reply"]

    # The reminder goes to the student who is missing it — and only to them.
    assert reply["proposed_action"]["action"] == "send_message"
    assert reply["proposed_action"]["recipient_canvas_user_ids"] == [501]
    assert reply["proposed_action"]["subject"] == "Reminder"

    # The feedback goes to the student in the band, who is a different person.
    # Both halves happening is the fix; them reaching the same people would be
    # the same bug wearing a different shape.
    grade_card = reply["additional_previews"][0]
    assert grade_card["grade_handoff"]["student_ids"] == [502]
    assert grade_card["grade_handoff"]["feedback"] == "Strong work on this one."


def test_those_students_grades_exactly_the_group_the_previous_step_resolved(client):
    """"Message everyone missing assignment 4, then give those students
    feedback."

    The plan is written before any of it runs, so the second step cannot
    contain a real handle — there is nothing to copy yet. It says
    "previous_step" and the app substitutes the group the first step actually
    resolved, rather than making the model re-describe a criterion. A group
    described twice is a group that can come back a different size.
    """
    headers, local_course_id = _register_with_canvas(client)
    students = [
        _student("501", local_course_id, "Alice"),
        _student("502", local_course_id, "Bob"),
    ]
    submissions = [
        _submission(501, SubmissionStatus.missing, "Alice", score=40.0),
        _submission(502, SubmissionStatus.graded, "Bob", score=90.0),
    ]

    async def generate(system_prompt, message, history, timeout):
        if "You resolve which assignment" in system_prompt:
            return '{"assignment_id": 222}'
        return (
            '{"action": "action_plan", "course_name": "CPSC 310", "steps": ['
            '{"action": "resolve_missing_submissions", "course_name": "CPSC 310", '
            '"assignment_reference": "assignment 4"},'
            '{"action": "update_grade", "course_name": "CPSC 310", '
            '"assignment_reference": "assignment 4", '
            f'"recipient_handle": "{PREVIOUS_STEP_HANDLE}", '
            '"new_grade": "+1", "feedback": "Catch up when you can."}]}'
        )

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = generate

    with (
        patch("app.services.chat.get_llm_adapter", return_value=mock_adapter),
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_assignments())),
        # Patched where the dispatcher looks it up, not where it is defined:
        # get_submissions is imported into that module's namespace, so a patch
        # on app.services.canvas leaves the fetch_submissions tool call
        # reaching the network and failing as an unreachable Canvas.
        patch("app.mcp_tools.dispatcher.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        body = client.post(
            "/api/v1/chat/",
            json={
                "message": (
                    "find everyone missing assignment 4 and give those students "
                    "a mark and some feedback"
                ),
                "conversation_id": None,
            },
            headers=headers,
        ).json()

    assert body["is_error"] is False, body
    handoff = body["reply"]["grade_handoff"]
    # Alice only. Bob was never missing, and "those students" must not quietly
    # widen to the whole assignment.
    assert handoff["student_ids"] == [501]
    assert handoff["feedback"] == "Catch up when you can."


def test_a_relative_mark_reaches_the_handoff_as_a_per_student_target(client):
    """"Add 1 mark and pat them on the back" is ONE update_grade carrying both.

    The half that used to go missing is the mark: the model was told never to
    invent a grade and had no way to express "+1", so it sent feedback alone
    and the grading form opened with an empty grade box. new_grade "+1" has to
    survive into a real per-student number computed from their actual score.
    """
    headers, _ = _register_with_canvas(client)
    submissions = [_submission(501, SubmissionStatus.graded, "Alice", score=40.0)]

    async def generate(system_prompt, message, history, timeout):
        if "You resolve which assignment" in system_prompt:
            return '{"assignment_id": 222}'
        return (
            '{"action": "update_grade", "course_name": "CPSC 310", '
            '"assignment_reference": "assignment 4", "student_reference": "everyone", '
            '"new_grade": "+1", "feedback": "Nice work."}'
        )

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = generate

    with (
        patch("app.services.chat.get_llm_adapter", return_value=mock_adapter),
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_assignments())),
        # Patched where the dispatcher looks it up, not where it is defined:
        # get_submissions is imported into that module's namespace, so a patch
        # on app.services.canvas leaves the fetch_submissions tool call
        # reaching the network and failing as an unreachable Canvas.
        patch("app.mcp_tools.dispatcher.get_submissions", new=AsyncMock(return_value=submissions)),
    ):
        body = client.post(
            "/api/v1/chat/",
            json={
                "message": "add 1 mark to everyone on assignment 4 and pat them on the back",
                "conversation_id": None,
            },
            headers=headers,
        ).json()

    assert body["is_error"] is False, body
    handoff = body["reply"]["grade_handoff"]
    assert handoff["grade_delta"] == 1.0
    assert handoff["student_grades"] == [
        {"user_id": 501, "name": "Alice", "current_score": 40.0, "new_grade": "41"}
    ]
    # Both halves survive. Feedback arriving without the mark is the bug.
    assert handoff["feedback"] == "Nice work."


def test_a_step_that_has_to_ask_stops_the_rest_of_the_plan(client):
    """The remaining steps were written against an assumption this one just
    disproved. Running them anyway means writing to Canvas on the strength of
    a question nobody answered."""
    headers, _ = _register_with_canvas(client)

    async def generate(system_prompt, message, history, timeout):
        if "You resolve which assignment" in system_prompt:
            # No confident match — the resolver gives up and the chain asks.
            return '{"assignment_id": null}'
        return (
            '{"action": "action_plan", "course_name": "CPSC 310", "steps": ['
            '{"action": "update_grade", "course_name": "CPSC 310", '
            '"assignment_reference": "the thing we discussed", '
            '"student_reference": "everyone", "new_grade": "+1"},'
            '{"action": "send_message", "course_name": "CPSC 310", '
            '"subject": "Marks updated", "body": "Your mark went up."}]}'
        )

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = generate

    with (
        patch("app.services.chat.get_llm_adapter", return_value=mock_adapter),
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_assignments())),
    ):
        body = client.post(
            "/api/v1/chat/",
            json={
                "message": "bump everyone on the thing we discussed and tell them",
                "conversation_id": None,
            },
            headers=headers,
        ).json()

    assert body["is_error"] is False, body
    reply = body["reply"]
    assert reply.get("clarify") is True, reply
    # The message must NOT have gone out announcing a mark change that never
    # happened. Nothing after the unanswered question ran.
    assert "additional_previews" not in reply or reply["additional_previews"] == []
    assert "Marks updated" not in str(reply)


def test_a_plan_never_replaces_a_pending_write_being_revised(client):
    """A modify turn revises one already-proposed write. Letting a plan take
    over would leave the preview it was supposed to revise still pending, and
    the instructor with a card they can no longer act on."""
    headers, local_course_id = _register_with_canvas(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "intent_preview", "course_name": "CPSC 310", "summary": "Create", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "Quiz", '
        '"description": "A short quiz.", "due_date": "2030-01-01T00:00:00", '
        '"points_possible": 10}}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        first = client.post(
            "/api/v1/chat/",
            json={"message": "create a quiz", "conversation_id": None},
            headers=headers,
        ).json()
    assert first["is_error"] is False, first

    plan_adapter = AsyncMock()
    plan_adapter.generate.return_value = (
        '{"action": "action_plan", "course_name": "CPSC 310", "steps": ['
        '{"action": "fetch_assignments", "course_name": "CPSC 310"},'
        '{"action": "send_message", "course_name": "CPSC 310", '
        '"subject": "Hi", "body": "Hello."}]}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=plan_adapter):
        body = client.post(
            "/api/v1/chat/",
            json={
                "message": "actually list my assignments and message everyone",
                "conversation_id": first["conversation_id"],
                "pending_message_id": first["reply"]["pending_message_id"],
            },
            headers=headers,
        ).json()

    assert body["is_error"] is False, body
    assert body["reply"]["action"] == "respond"
    assert "additional_previews" not in body["reply"]
    assert re.search(r"confirm or cancel", body["reply"]["message"], re.I), body["reply"]
