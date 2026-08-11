from canvas_test_utils import unique_canvas_token

"""Tests for the message a send_message turn hands to the Messages compose
form (see _ensure_message_is_written in app/backend/app/services/chat.py and
draft_subject_and_body in app/backend/app/services/messages.py).

Two bugs live here. The handoff used to carry an empty subject and body, so
the Messages page filled them from its own template presets and the
instructor was shown "Assignment Reminder: Course Update" over "Remind
students about the assignment, due date, and any next steps." — a
*description* of a message, in the field about to be sent to a class. And an
announcement request that already contained the whole message came back as
"What should the message subject be?", making the instructor dictate field by
field something they had just said in one sentence.
"""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.mcp_tools.schemas import IntentPreviewAction, SendMessageAction
from app.schemas.student import StudentResponse
from app.services.chat import _ensure_message_is_written
from app.services.messages import draft_subject_and_body

CANVAS_URL = "https://canvas.example.edu"

# The exact strings MessageDraftPage.tsx falls back to. If one of these ever
# reaches a preview again, the handoff arrived empty.
TEMPLATE_PLACEHOLDERS = {
    "Assignment Reminder: Course Update",
    "Remind students about the assignment, due date, and any next steps.",
    "Share an important update with your class.",
    "Write an encouraging note that helps students stay engaged.",
}


def _drafting_adapter(subject: str, body: str) -> AsyncMock:
    adapter = AsyncMock()
    adapter.generate.return_value = f'{{"subject": "{subject}", "body": "{body}"}}'
    return adapter


# ---------------------------------------------------------------- unit tests


@pytest.mark.asyncio
async def test_blank_subject_and_body_are_written_from_the_request():
    action = SendMessageAction(local_course_id=7)
    adapter = _drafting_adapter(
        "Midterm 2 Reminder",
        "Hello class, a reminder that Midterm 2 is coming up.",
    )

    filled = await _ensure_message_is_written(
        action,
        "hey can you make an announcement to the class saying the midterm exam 2 is coming up?",
        adapter,
    )

    assert filled.subject == "Midterm 2 Reminder"
    assert filled.body == "Hello class, a reminder that Midterm 2 is coming up."
    assert filled.subject not in TEMPLATE_PLACEHOLDERS
    assert filled.body not in TEMPLATE_PLACEHOLDERS


@pytest.mark.asyncio
async def test_a_message_the_model_already_wrote_is_left_alone():
    """No draft call at all — the model's own text is not second-guessed,
    and the instructor is not billed for a rewrite of something already
    written."""
    action = SendMessageAction(
        local_course_id=7, subject="Lab 3 moved", body="Lab 3 is now on Friday."
    )
    adapter = AsyncMock()

    filled = await _ensure_message_is_written(action, "move lab 3 to friday", adapter)

    assert filled is action
    adapter.generate.assert_not_awaited()


@pytest.mark.asyncio
async def test_subject_is_drafted_from_the_body_the_model_wrote():
    """A subject has to describe what is actually being sent. When the body
    exists and only the subject is missing, that body is the better prompt
    than the request behind it."""
    action = SendMessageAction(
        local_course_id=7, body="Office hours move to Thursday this week."
    )
    adapter = _drafting_adapter("Office Hours Moved", "ignored")

    filled = await _ensure_message_is_written(action, "tell them about office hours", adapter)

    assert filled.subject == "Office Hours Moved"
    # Body untouched, and the drafter saw it rather than the user's request.
    assert filled.body == "Office hours move to Thursday this week."
    prompt = adapter.generate.await_args.args[1]
    assert "Office hours move to Thursday this week." in prompt


@pytest.mark.asyncio
async def test_directives_without_a_body_get_the_drafted_message():
    """Per-recipient bodies are what actually gets sent when the model named
    people, so an empty one is the same bug wearing a different field name."""
    action = SendMessageAction(
        local_course_id=7,
        recipient_directives=[
            {"student_reference": "Alice", "body": ""},
            {"student_reference": "Bob", "body": "Bob gets his own note."},
        ],
    )
    adapter = _drafting_adapter("Quiz Reminder", "Please submit the Python quiz.")

    filled = await _ensure_message_is_written(
        action, "remind students who haven't submitted the python quiz", adapter
    )

    assert filled.recipient_directives[0].body == "Please submit the Python quiz."
    # Already written, so untouched — one blank directive does not overwrite
    # a message meant for someone else.
    assert filled.recipient_directives[1].body == "Bob gets his own note."


@pytest.mark.asyncio
async def test_intent_preview_wrapped_send_message_is_filled_too():
    """The route the system prompt actually asks for. An announcement carries
    no recipients, so it is never unwrapped — it reaches the dispatcher still
    wrapped, and used to be the case that clarified."""
    action = IntentPreviewAction(
        summary="I'll post an announcement.",
        proposed_action={"action": "send_message", "local_course_id": 7},
    )
    adapter = _drafting_adapter("Midterm 2 Reminder", "Midterm 2 is coming up.")

    filled = await _ensure_message_is_written(action, "announce midterm 2", adapter)

    assert filled.proposed_action["subject"] == "Midterm 2 Reminder"
    assert filled.proposed_action["body"] == "Midterm 2 is coming up."


@pytest.mark.asyncio
async def test_other_actions_pass_through_untouched():
    action = IntentPreviewAction(
        summary="I'll create the assignment.",
        proposed_action={"action": "create_assignment", "local_course_id": 7},
    )
    adapter = AsyncMock()

    assert await _ensure_message_is_written(action, "make an assignment", adapter) is action
    adapter.generate.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_failed_draft_degrades_to_the_instructors_own_words():
    """The instructor's sentence is a bad message but a fine starting point.
    A placeholder describing a message is neither, and that is what used to
    be shown."""
    adapter = AsyncMock()
    adapter.generate.side_effect = RuntimeError("provider down")

    subject, body = await draft_subject_and_body(
        "remind everyone the midterm is coming up", adapter=adapter
    )

    assert body == "remind everyone the midterm is coming up"
    assert body not in TEMPLATE_PLACEHOLDERS
    assert subject


@pytest.mark.asyncio
async def test_a_draft_with_no_body_degrades_rather_than_sending_nothing():
    adapter = AsyncMock()
    adapter.generate.return_value = '{"subject": "Reminder", "body": ""}'

    subject, body = await draft_subject_and_body("midterm reminder please", adapter=adapter)

    assert subject == "Reminder"
    assert body == "midterm reminder please"


# ------------------------------------------------------------ endpoint tests


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> tuple[dict, int]:
    email = f"draftfill_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Draft Prefill Instructor", "email": email, "password": "Secret123!"},
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


def _chat(client, headers, message, planner_output, draft_output) -> dict:
    """Routes by system prompt rather than call order: the drafter and the
    planner share one adapter, and a positional side_effect list would break
    the moment a turn gains or loses an unrelated model call."""
    adapter = AsyncMock()

    async def generate(system_prompt, user_prompt, *args, **kwargs):
        if "You write the announcement or private message" in system_prompt:
            return draft_output
        return planner_output

    adapter.generate.side_effect = generate
    with patch("app.services.chat.get_llm_adapter", return_value=adapter):
        response = client.post(
            "/api/v1/chat/", json={"message": message, "conversation_id": None}, headers=headers
        )
    return response.json()


# Verifies bug 2: an announcement request that already contains the message
# produces a draft, not "What should the message subject be?".
def test_announcement_request_drafts_instead_of_asking_for_the_subject(client):
    headers, _ = _register_with_canvas(client)

    body = _chat(
        client,
        headers,
        "hey can you make an announcement to the class saying the midterm exam 2 is coming up?",
        '{"action": "intent_preview", "summary": "I will post an announcement.", '
        '"proposed_action": {"action": "send_message", "course_name": "CPSC 310"}}',
        '{"subject": "Midterm 2 Reminder", "body": "Hello class, I want to remind you '
        'that Midterm 2 is coming up."}',
    )

    assert body["is_error"] is False, body
    reply = body["reply"]
    assert reply["action"] == "intent_preview", reply
    assert reply.get("clarify") is not True
    assert reply["proposed_action"]["subject"] == "Midterm 2 Reminder"
    assert reply["proposed_action"]["body"].startswith("Hello class")


# Verifies bug 1: the preview the Messages tab is handed carries a real
# message, so the page never reaches its template presets.
def test_targeted_message_handoff_carries_a_written_draft(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [
        StudentResponse(
            id=1,
            canvas_user_id="501",
            course_id=local_course_id,
            name="Alice",
            enrollment_state="active",
        )
    ]

    with patch("app.mcp_tools.dispatcher.get_students", new=AsyncMock(return_value=students)):
        body = _chat(
            client,
            headers,
            "can you send messages reminding to submit to students who haven't submitted the python quiz?",
            '{"action": "send_message", "course_name": "CPSC 310", '
            '"broadcast_to_all_students": true}',
            '{"subject": "Python Quiz Reminder", "body": "Hi everyone, please submit '
            'the Python quiz when you get a chance."}',
        )

    assert body["is_error"] is False, body
    reply = body["reply"]
    assert reply["action"] == "intent_preview", reply
    proposed = reply["proposed_action"]
    assert proposed["subject"] == "Python Quiz Reminder"
    assert proposed["body"].startswith("Hi everyone")
    assert proposed["subject"] not in TEMPLATE_PLACEHOLDERS
    assert proposed["body"] not in TEMPLATE_PLACEHOLDERS
    assert proposed["recipient_canvas_user_ids"] == [501]
