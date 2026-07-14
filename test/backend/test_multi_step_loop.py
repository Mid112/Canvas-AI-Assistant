"""Tests for the bounded multi-step loop itself (see MAX_TURN_STEPS,
_CHAINABLE_READ_ACTIONS, and the step loop in handle_chat_message,
app/backend/app/services/chat.py) — as opposed to
test_resolve_missing_submissions.py / test_find_assignment_by_submission_rate.py,
which test each resolver's own correctness."""
import re
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.canvas import SubmissionResponse, SubmissionStatus
from app.schemas.student import StudentResponse

CANVAS_URL = "https://canvas.ubc.ca"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> tuple[dict, int]:
    email = f"looptest_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Loop Test Instructor", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": CANVAS_URL},
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
        active_resp = client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_course_id},
            headers=headers,
        )
        assert active_resp.status_code == 200, active_resp.text

    return headers, local_course_id


def _two_assignments() -> list[dict]:
    return [
        {
            "id": 111, "name": "Assignment 1", "description": None,
            "due_at": "2026-01-01T00:00:00+00:00", "points_possible": 10.0,
            "course_id": 1,
        },
        {
            "id": 222, "name": "Assignment 4", "description": None,
            "due_at": "2026-06-01T00:00:00+00:00", "points_possible": 100.0,
            "course_id": 1,
        },
    ]


def _student(canvas_user_id: str, course_id: int, name: str, enrollment_state: str = "active") -> StudentResponse:
    return StudentResponse(
        id=1, canvas_user_id=canvas_user_id, course_id=course_id,
        name=name, enrollment_state=enrollment_state,
    )


def _submission(user_id: int, status: SubmissionStatus, name: str | None = None) -> SubmissionResponse:
    return SubmissionResponse(
        id=user_id, assignment_id=222, user_id=user_id, student_name=name,
        workflow_state="unsubmitted", status=status,
    )


# Verifies the actual promised capability: "message students missing
# assignment 4" resolves the recipient set AND proposes the send_message
# in ONE user turn — no second message required — with the model's own
# follow-up decision using the exact handle produced by step 1 (extracted
# from the loop-fed prompt via regex, since the handle is generated fresh
# per request and can't be hardcoded ahead of time).
def test_resolve_missing_submissions_chains_into_send_message_in_one_turn(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice")]
    submissions = [_submission(501, SubmissionStatus.missing, "Alice")]

    async def dynamic_generate(system_prompt, message, history, timeout):
        if "You resolve which assignment" in system_prompt:
            return '{"assignment_id": 222}'
        if '"handle"' not in message:
            # First outer decision — nothing resolved yet in this turn.
            return (
                '{"action": "resolve_missing_submissions", "course_name": "CPSC 310", '
                '"assignment_reference": "assignment 4"}'
            )
        # Follow-up call: loop_steps carries step 1's resolved handle —
        # extract it rather than hardcoding, since it's generated fresh
        # per request (see create_resolved_set's _new_handle).
        match = re.search(r'"handle": "(rs_[0-9a-f]+)"', message)
        assert match, f"expected a resolved handle in the follow-up prompt, got: {message}"
        handle = match.group(1)
        return (
            '{"action": "send_message", "course_name": "CPSC 310", "subject": "Reminder", '
            f'"body": "Please submit assignment 4.", "recipient_handle": "{handle}"}}'
        )

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = dynamic_generate

    with (
        patch("app.services.chat.get_llm_adapter", return_value=mock_adapter),
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "message the students missing assignment 4 to remind them", "conversation_id": None},
            headers=headers,
        )
    body = response.json()

    assert body["is_error"] is False, body
    assert mock_adapter.generate.await_count == 3  # main decision, assignment resolver, send_message follow-up

    reply = body["reply"]
    assert reply["action"] == "intent_preview"
    assert reply["proposed_action"]["action"] == "send_message"
    assert reply["proposed_action"]["recipient_canvas_user_ids"] == [501]
    assert reply["proposed_action"]["recipient_names"] == ["Alice"]
    assert "pending_message_id" in reply


# Verifies: hitting MAX_TURN_STEPS without ever reaching a terminal action
# surfaces a plain "respond" fallback (not an error), carrying forward the
# last step's own summary rather than silently dropping it.
def test_step_budget_exhaustion_falls_back_to_a_response(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice")]
    submissions = [_submission(501, SubmissionStatus.missing, "Alice")]

    outer_calls = 0

    async def dynamic_generate(system_prompt, message, history, timeout):
        nonlocal outer_calls
        if "You resolve which assignment" in system_prompt:
            return '{"assignment_id": 222}'
        outer_calls += 1
        if outer_calls == 1:
            # First step: no assignment_id yet, forces the internal
            # fetch_assignments + resolver sub-call (which also upserts
            # the local Assignment row fetch_submissions/resolve_missing_
            # submissions later verify assignment_id against).
            return (
                '{"action": "resolve_missing_submissions", "course_name": "CPSC 310", '
                '"assignment_reference": "assignment 4"}'
            )
        # Every subsequent step: keeps proposing the same chainable read,
        # now with a verified assignment_id (no further resolver sub-call
        # needed), so the loop never reaches a terminal action on its own.
        return (
            '{"action": "resolve_missing_submissions", "course_name": "CPSC 310", "assignment_id": 222}'
        )

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = dynamic_generate

    with (
        patch("app.services.chat.get_llm_adapter", return_value=mock_adapter),
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "keep checking who's missing assignment 4", "conversation_id": None},
            headers=headers,
        )
    body = response.json()

    assert body["is_error"] is False, body
    assert outer_calls == 15  # MAX_TURN_STEPS
    assert mock_adapter.generate.await_count == 16  # 15 outer + 1 inner assignment resolver (step 1 only)

    reply = body["reply"]
    assert reply["action"] == "respond"
    assert "allowed number of steps" in reply["message"]
    assert "Here's what I found so far" in reply["message"]


# Verifies: a modify turn never enters the step loop, even if the model
# (unusually) proposes a _CHAINABLE_READ_ACTIONS action as its "revision"
# — it's treated as a single, terminal step exactly like every other
# modify turn, not chained or wrapped in a step-budget message.
def test_modify_turn_never_loops_even_for_a_chainable_action(client):
    headers, local_course_id = _register_with_canvas(client)

    create_output = (
        '{"action": "intent_preview", "course_name": "CPSC 310", "summary": "Create Quiz", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "Quiz", '
        '"description": "Short quiz", "due_date": "2030-01-01T00:00:00", '
        '"points_possible": 10}}'
    )
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = create_output
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        first = client.post(
            "/api/v1/chat/",
            json={"message": "create a quiz", "conversation_id": None},
            headers=headers,
        ).json()
    assert first["is_error"] is False, first
    conversation_id = first["conversation_id"]
    pending_message_id = first["reply"]["pending_message_id"]

    async def dynamic_generate(system_prompt, message, history, timeout):
        if "You resolve which assignment" in system_prompt:
            return '{"assignment_id": 222}'
        return (
            '{"action": "resolve_missing_submissions", "course_name": "CPSC 310", '
            '"assignment_reference": "assignment 4"}'
        )

    mock_adapter2 = AsyncMock()
    mock_adapter2.generate.side_effect = dynamic_generate
    students = [_student("501", local_course_id, "Alice")]
    submissions = [_submission(501, SubmissionStatus.missing, "Alice")]

    with (
        patch("app.services.chat.get_llm_adapter", return_value=mock_adapter2),
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        response = client.post(
            "/api/v1/chat/",
            json={
                "message": "actually check who's missing assignment 4 instead",
                "conversation_id": conversation_id,
                "pending_message_id": pending_message_id,
            },
            headers=headers,
        )
    body = response.json()

    assert response.status_code == 200
    assert body["is_error"] is False, body
    # A read result on a modify turn, unaffected by looping — same shape
    # any modify turn proposing a read has always produced. Exactly 2
    # calls: the modify-turn's own decision, plus the ONE internal
    # assignment-resolver sub-call the chain itself always needed (that
    # sub-call is not part of the OUTER step loop — is_chainable_step's
    # pending_message_id gate only blocks a second OUTER step).
    assert body["reply"]["action"] == "resolve_missing_submissions"
    assert mock_adapter2.generate.await_count == 2
