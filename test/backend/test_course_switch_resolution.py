"""Tests for the mid-conversation course-switch pre-resolver (see
_resolve_course_switch in app/backend/app/services/chat.py) — closes a real
gap where a course switch was only detected from the main model's OWN
output, by which point the main call had already run using the OLD
conversation's stale history and "CURRENT COURSE" framing."""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

CANVAS_URL = "https://canvas.example.edu"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_two_courses(client) -> tuple[dict, dict]:
    """Register a fresh instructor with two Canvas courses, set the first
    as active (seeds canvas_course_names for both, via
    sync_courses_if_stale). Returns (headers, {course_name: local_id})."""
    email = f"courseswitch_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Course Switch Instructor", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": CANVAS_URL},
            headers=headers,
        )

    base_id = uuid.uuid4().int % 10_000_000
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = [
            {
                "id": base_id, "name": "CPSC 310", "course_code": "CPSC310",
                "enrollment_term_id": 1, "workflow_state": "available",
            },
            {
                "id": base_id + 1, "name": "CPSC 320", "course_code": "CPSC320",
                "enrollment_term_id": 1, "workflow_state": "available",
            },
        ]
        resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
        local_ids = {c["name"]: c["local_id"] for c in resp.json()}
        active_resp = client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_ids["CPSC 310"]},
            headers=headers,
        )
        assert active_resp.status_code == 200, active_resp.text

    return headers, local_ids


def _chat(client, headers, message, llm_output, conversation_id=None) -> dict:
    mock_adapter = AsyncMock()
    if isinstance(llm_output, list):
        mock_adapter.generate.side_effect = llm_output
    else:
        mock_adapter.generate.return_value = llm_output
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": message, "conversation_id": conversation_id},
            headers=headers,
        )
    return response.json(), mock_adapter


# Verifies: a conversation's first-ever turn never pays for the
# pre-resolver, even when course_id is already seeded (from the active
# course preference) — there is no prior history to leak, so the extra
# call would be pure waste.
def test_first_turn_never_calls_the_pre_resolver(client):
    headers, local_ids = _register_with_two_courses(client)

    body, mock_adapter = _chat(
        client, headers, "show me my assignments",
        '{"action": "respond", "course_name": "CPSC 310", "message": "OK."}',
    )

    assert body["is_error"] is False, body
    assert mock_adapter.generate.await_count == 1


def test_short_course_context_statement_switches_without_llm(client):
    headers, local_ids = _register_with_two_courses(client)

    first, _ = _chat(
        client, headers, "show me assignments for CPSC 310",
        '{"action": "respond", "course_name": "CPSC 310", "message": "OK."}',
    )
    assert first["is_error"] is False, first

    body, mock_adapter = _chat(
        client,
        headers,
        "couse is CPSC 320",
        '{"action": "respond", "message": "This should not be used."}',
        conversation_id=first["conversation_id"],
    )

    assert body["is_error"] is False, body
    assert body["reply"]["message"] == "Using CPSC 320 for this chat."
    assert body["conversation_id"] != first["conversation_id"]
    assert mock_adapter.generate.await_count == 0


# Verifies: a follow-up turn that switches to an explicitly-named
# different course is detected BEFORE the main call, so the main call
# receives the correct "CURRENT COURSE" framing and correctly-scoped
# history from the start.
def test_followup_switch_is_resolved_before_the_main_call(client):
    headers, local_ids = _register_with_two_courses(client)

    first, _ = _chat(
        client, headers, "show me assignments for CPSC 310",
        '{"action": "respond", "course_name": "CPSC 310", "message": "OK."}',
    )
    assert first["is_error"] is False, first
    conversation_id = first["conversation_id"]

    second, mock_adapter = _chat(
        client, headers, "now switch to CPSC 320",
        [
            '{"switched_to": "CPSC 320"}',
            '{"action": "respond", "course_name": "CPSC 320", "message": "Switched."}',
        ],
        conversation_id=conversation_id,
    )

    assert second["is_error"] is False, second
    assert mock_adapter.generate.await_count == 2

    # Call 0: the pre-resolver, given only the raw message + course list —
    # no history, no stale "CURRENT COURSE" framing to leak.
    pre_resolver_call = mock_adapter.generate.call_args_list[0]
    assert "CPSC 310" in pre_resolver_call.args[1]
    assert pre_resolver_call.kwargs["history"] == []

    # Call 1: the main call — must already reflect the NEW course, not
    # the old one, and must not carry over turn 1's history (a genuinely
    # different, freshly-forked conversation).
    main_call = mock_adapter.generate.call_args_list[1]
    assert "CURRENT COURSE FOR THIS CONVERSATION: CPSC 320" in main_call.args[1]
    assert main_call.kwargs["history"] == []

    # The conversation actually forked — the response conversation_id is
    # not the same as the one the client sent (by design: a conversation
    # is anchored to one course; see _find_or_fork_conversation_for_course).
    assert second["conversation_id"] != conversation_id


# Verifies: switching back to a course this user already had a
# conversation for REUSES that conversation instead of creating another.
def test_switching_back_reuses_the_original_conversation(client):
    headers, local_ids = _register_with_two_courses(client)

    first, _ = _chat(
        client, headers, "show me assignments for CPSC 310",
        '{"action": "respond", "course_name": "CPSC 310", "message": "OK."}',
    )
    first_conversation_id = first["conversation_id"]

    second, _ = _chat(
        client, headers, "now switch to CPSC 320",
        [
            '{"switched_to": "CPSC 320"}',
            '{"action": "respond", "course_name": "CPSC 320", "message": "Switched."}',
        ],
        conversation_id=first_conversation_id,
    )
    second_conversation_id = second["conversation_id"]
    assert second_conversation_id != first_conversation_id

    third, _ = _chat(
        client, headers, "actually go back to CPSC 310",
        [
            '{"switched_to": "CPSC 310"}',
            '{"action": "respond", "course_name": "CPSC 310", "message": "Back."}',
        ],
        conversation_id=second_conversation_id,
    )

    assert third["is_error"] is False, third
    assert third["conversation_id"] == first_conversation_id


# Verifies: an ordinary follow-up that does NOT switch courses stays on
# the same conversation, and the pre-resolver correctly reports no switch.
def test_ordinary_followup_does_not_spuriously_fork(client):
    headers, local_ids = _register_with_two_courses(client)

    first, _ = _chat(
        client, headers, "show me assignments for CPSC 310",
        '{"action": "respond", "course_name": "CPSC 310", "message": "OK."}',
    )
    conversation_id = first["conversation_id"]

    second, mock_adapter = _chat(
        client, headers, "how many are there?",
        [
            '{"switched_to": null}',
            '{"action": "respond", "message": "Three."}',
        ],
        conversation_id=conversation_id,
    )

    assert second["is_error"] is False, second
    assert second["conversation_id"] == conversation_id
    assert mock_adapter.generate.await_count == 2


# Verifies: a modify turn (pending_message_id set) never triggers the
# pre-resolver — it's revising an existing proposed action tied to this
# conversation, not a fresh request that could name a different course.
def test_modify_turn_skips_the_pre_resolver(client):
    headers, local_ids = _register_with_two_courses(client)

    llm_output = (
        '{"action": "intent_preview", "summary": "Create Quiz", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_ids["CPSC 310"]}, "title": "Quiz", '
        '"description": "A short quiz on course topics.", "due_date": "2030-01-01T00:00:00", '
        '"points_possible": 10}}'
    )
    first, _ = _chat(client, headers, "create a quiz", llm_output)
    assert first["is_error"] is False, first
    conversation_id = first["conversation_id"]
    pending_message_id = first["reply"]["pending_message_id"]

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "intent_preview", "summary": "Create Quiz (renamed)", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_ids["CPSC 310"]}, "title": "Quiz 2", '
        '"description": "A short quiz on course topics.", "due_date": "2030-01-01T00:00:00", '
        '"points_possible": 10}}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={
                "message": "rename it to Quiz 2",
                "conversation_id": conversation_id,
                "pending_message_id": pending_message_id,
            },
            headers=headers,
        )

    assert response.status_code == 200
    assert mock_adapter.generate.await_count == 1


# Verifies: a pre-resolver failure (timeout/bad JSON/HTTP error) never
# breaks the turn — it degrades to the existing post-hoc detection from
# the main model's own course_name output, exactly like before this
# pre-resolver existed.
def test_pre_resolver_failure_falls_back_to_post_hoc_detection(client):
    headers, local_ids = _register_with_two_courses(client)

    first, _ = _chat(
        client, headers, "show me assignments for CPSC 310",
        '{"action": "respond", "course_name": "CPSC 310", "message": "OK."}',
    )
    conversation_id = first["conversation_id"]

    second, mock_adapter = _chat(
        client, headers, "now switch to CPSC 320",
        [
            "not valid json at all",  # pre-resolver call fails to parse
            '{"action": "respond", "course_name": "CPSC 320", "message": "Switched."}',
        ],
        conversation_id=conversation_id,
    )

    assert second["is_error"] is False, second
    # The post-hoc path (unchanged, pre-existing) still catches the switch
    # from the main model's own course_name output.
    assert second["conversation_id"] != conversation_id
