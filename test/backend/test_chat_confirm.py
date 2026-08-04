import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.canvas import AssignmentResponse

CANVAS_URL = "https://canvas.example.edu"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> tuple[dict, int]:
    """Register a fresh instructor, connect Canvas, seed one course, and
    set it active — the active-course PATCH also seeds canvas_course_names
    (see set_active_course's sync_courses_if_stale call), which is what
    lets a chat turn with no explicit local_course_id and no course_name
    in the mocked LLM reply still resolve a course via the
    UserPreference.active_course_id fallback in get_or_create_conversation.
    Returns (headers, local_course_id)."""
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Instructor", "email": email, "password": "secret123"},
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


def _propose_create_assignment(client, headers, local_course_id) -> tuple[int, int]:
    """Drives a chat turn that produces a create_assignment intent_preview.
    Returns (conversation_id, pending_message_id)."""
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "intent_preview", "summary": "Create Midterm Exam", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "Midterm Exam", '
        '"description": "Covers chapters 1 through 5", "due_date": "2030-01-01T00:00:00", '
        '"points_possible": 100}}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "create a midterm exam"},
            headers=headers,
        )
    body = response.json()
    return body["conversation_id"], body["reply"]["pending_message_id"]


# Verifies: Confirm replay is rejected.
def test_confirm_replay_is_rejected(client):
    """The core regression test: confirming the same pending_message_id
    twice must not execute the Canvas write twice."""
    headers, local_course_id = _register_with_canvas(client)
    conversation_id, pending_message_id = _propose_create_assignment(
        client, headers, local_course_id
    )

    fake_assignment = AssignmentResponse(
        id=42,
        name="Midterm Exam",
        description="Covers chapters 1 through 5",
        due_at="2030-01-01T00:00:00",
        points_possible=100.0,
        course_id=9999,
    )
    with patch(
        "app.mcp_tools.dispatcher.create_course_assignment", new=AsyncMock(return_value=fake_assignment)
    ) as mock_create:
        first = client.post(
            "/api/v1/chat/confirm",
            json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
            headers=headers,
        )
        assert first.status_code == 200
        assert first.json()["reply"]["success"] is True
        mock_create.assert_called_once()

        second = client.post(
            "/api/v1/chat/confirm",
            json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
            headers=headers,
        )
        assert second.status_code == 409
        # still exactly one call — the replay never reached Canvas
        mock_create.assert_called_once()


# Verifies: Confirm executes write without self-deadlocking on own executing workflow.
def test_confirm_executes_write_without_self_deadlock(client):
    """handle_confirmed_action commits the workflow as ``executing`` before
    execute_tool. The in-flight guard must exclude that workflow id so the
    confirm path does not 409 against itself when create_course_assignment
    (not a dispatcher-level mock) runs the real guard.
    """
    headers, local_course_id = _register_with_canvas(client)
    conversation_id, pending_message_id = _propose_create_assignment(
        client, headers, local_course_id
    )

    canvas_payload = {
        "id": 42,
        "name": "Midterm Exam",
        "description": "Covers chapters 1 through 5",
        "due_at": "2030-01-01T00:00:00",
        "points_possible": 100.0,
        "course_id": 9999,
        "published": False,
    }
    # Mock only the Canvas HTTP layer — leave create_course_assignment and
    # _assert_no_executing_write real so a self-deadlock surfaces here.
    with patch(
        "app.services.canvas.create_assignment",
        new=AsyncMock(return_value=canvas_payload),
    ) as mock_create:
        response = client.post(
            "/api/v1/chat/confirm",
            json={
                "conversation_id": conversation_id,
                "pending_message_id": pending_message_id,
            },
            headers=headers,
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body.get("is_error") is not True
    assert body["reply"]["success"] is True
    assert body["reply"]["action"] == "create_assignment"
    mock_create.assert_awaited_once()


# Verifies: Confirm unknown pending message id 404s.
def test_confirm_unknown_pending_message_id_404s(client):
    headers, local_course_id = _register_with_canvas(client)
    conversation_id, _ = _propose_create_assignment(client, headers, local_course_id)

    response = client.post(
        "/api/v1/chat/confirm",
        json={"conversation_id": conversation_id, "pending_message_id": 999999999},
        headers=headers,
    )
    assert response.status_code == 404


# Verifies: Course id backfill.
def test_course_id_backfill(client):
    """conversations.course_id should be backfilled from the proposed
    action's local_course_id once a write preview is generated, even
    though the client (matching non_unit_test/test_vague_llm.py's
    behavior) never sends local_course_id up front."""
    headers, local_course_id = _register_with_canvas(client)
    conversation_id, _ = _propose_create_assignment(client, headers, local_course_id)

    history = client.get(f"/api/v1/chat/conversations/{conversation_id}", headers=headers)
    assert history.status_code == 200
    assert history.json()["course_id"] == local_course_id


# Verifies: Confirm canvas failure returns chat error.
def test_confirm_canvas_failure_returns_chat_error(client):
    """Canvas failures on confirm return a user-friendly chat error, not a bare HTTP response."""
    headers, local_course_id = _register_with_canvas(client)
    conversation_id, pending_message_id = _propose_create_assignment(
        client, headers, local_course_id
    )

    with patch(
        "app.mcp_tools.dispatcher.create_course_assignment",
        new=AsyncMock(
            side_effect=HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Canvas server error: 503",
            )
        ),
    ):
        response = client.post(
            "/api/v1/chat/confirm",
            json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is True
    assert body["reply"]["error"] == "Canvas server error: 503"


# Verifies: Modify snapshots previous proposed action.
def test_modify_snapshots_previous_proposed_action(client):
    """A modify round overwrites the preview message in place (see
    update_message_content), which would otherwise make the version being
    replaced unrecoverable. handle_chat_message must snapshot it onto the
    new result as previous_proposed_action/previous_summary before the
    overwrite, so the client can render a one-step diff."""
    headers, local_course_id = _register_with_canvas(client)
    conversation_id, pending_message_id = _propose_create_assignment(
        client, headers, local_course_id
    )

    modify_adapter = AsyncMock()
    modify_adapter.generate.return_value = (
        '{"action": "intent_preview", "summary": "Create Midterm Exam, now worth 50 points", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "Midterm Exam", '
        '"description": "Covers chapters 1 through 5", "due_date": "2030-01-01T00:00:00", '
        '"points_possible": 50}}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=modify_adapter):
        modify_response = client.post(
            "/api/v1/chat/",
            json={
                "message": "actually make it worth 50 points",
                "conversation_id": conversation_id,
                "pending_message_id": pending_message_id,
            },
            headers=headers,
        )

    assert modify_response.status_code == 200
    reply = modify_response.json()["reply"]
    # Same message row reused, not a new one.
    assert reply["pending_message_id"] == pending_message_id
    assert reply["proposed_action"]["points_possible"] == 50
    assert reply["previous_proposed_action"]["points_possible"] == 100
    assert reply["previous_summary"] == "Create Midterm Exam"

    # A second modify round only remembers one step back — the very first
    # version (100 points) is gone, replaced by the second (50 points).
    second_modify_adapter = AsyncMock()
    second_modify_adapter.generate.return_value = (
        '{"action": "intent_preview", "summary": "Create Midterm Exam, now worth 75 points", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "Midterm Exam", '
        '"description": "Covers chapters 1 through 5", "due_date": "2030-01-01T00:00:00", '
        '"points_possible": 75}}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=second_modify_adapter):
        second_response = client.post(
            "/api/v1/chat/",
            json={
                "message": "actually make it worth 75 points",
                "conversation_id": conversation_id,
                "pending_message_id": pending_message_id,
            },
            headers=headers,
        )

    second_reply = second_response.json()["reply"]
    assert second_reply["proposed_action"]["points_possible"] == 75
    assert second_reply["previous_proposed_action"]["points_possible"] == 50


def test_non_preview_modify_supersedes_pending_workflow(client):
    headers, local_course_id = _register_with_canvas(client)
    conversation_id, pending_message_id = _propose_create_assignment(
        client, headers, local_course_id
    )

    modify_adapter = AsyncMock()
    modify_adapter.generate.return_value = (
        '{"action": "respond", "message": "No problem, I will leave that proposal alone."}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=modify_adapter):
        modify_response = client.post(
            "/api/v1/chat/",
            json={
                "message": "never mind",
                "conversation_id": conversation_id,
                "pending_message_id": pending_message_id,
            },
            headers=headers,
        )

    assert modify_response.status_code == 200

    history = client.get(f"/api/v1/chat/conversations/{conversation_id}", headers=headers)
    assert history.status_code == 200
    assert history.json()["workflow_statuses"][str(pending_message_id)]["status"] == "superseded"

    confirm = client.post(
        "/api/v1/chat/confirm",
        json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
        headers=headers,
    )
    assert confirm.status_code == 409


# Verifies: Incomplete create assignment is clarified not previewed.
def test_incomplete_create_assignment_is_clarified_not_previewed(client):
    """Regression test: a model can technically satisfy Pydantic's `str`
    type for a required field (e.g. description) by emitting "" instead
    of asking, since proposed_action isn't validated against
    CreateAssignmentAction's schema until confirm time. This must be
    caught before a preview is ever shown, not just documented as a
    system prompt instruction the model might not follow.

    Ticket 16 / #1440: when description and points are both missing,
    the clarify question must list both so the user can answer once."""
    headers, local_course_id = _register_with_canvas(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "intent_preview", "summary": "Create test4 due November 20th.", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "test4", '
        '"description": "", "due_date": "2030-11-20", "points_possible": null}}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": 'create an assignment called "test4" due on November 20th'},
            headers=headers,
        )

    assert response.status_code == 200
    reply = response.json()["reply"]
    assert reply["action"] == "clarify"
    question = reply["question"].lower()
    assert "description" in question
    assert "point" in question
    assert "one message" in question
    assert reply["partial_plan"]["title"] == "test4"
    assert "description" not in reply["partial_plan"]
    assert "points_possible" not in reply["partial_plan"]
    assert "intent_preview" not in reply


# Verifies: Create assignment with past due date is clarified not previewed.
def test_create_assignment_with_past_due_date_is_clarified_not_previewed(client):
    """Regression test: the model has no innate sense of "today" beyond
    the TODAY'S DATE prompt line and doesn't reliably apply it (observed
    defaulting to the current year even when that put the date in the
    past). A doomed preview — one that would 422 on confirm anyway —
    must not be shown; it should ask for the date again instead."""
    headers, local_course_id = _register_with_canvas(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "intent_preview", "summary": "Create test5 due February 26th.", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "test5", '
        '"description": "next year, norush", "due_date": "2020-02-26", "points_possible": 30}}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": 'create an assignment called "test5" due on February 26th'},
            headers=headers,
        )

    assert response.status_code == 200
    reply = response.json()["reply"]
    assert reply["action"] == "clarify"
    assert "2020-02-26" in reply["question"]
    assert "intent_preview" not in reply


# Verifies: Clarify nested inside proposed action is rejected.
def test_clarify_nested_inside_proposed_action_is_rejected(client):
    """Regression test: a modify turn confused about merging its edit
    with an existing plan can nest {"action": "clarify", ...} inside
    proposed_action instead of using the top-level clarify action. Left
    unchecked, the frontend renders this as a bogus confirmable "Clarify"
    action card instead of a real clarifying question — this must be
    rejected as a malformed response instead."""
    headers, _ = _register_with_canvas(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "intent_preview", "summary": "Need more info.", '
        '"proposed_action": {"action": "clarify", "question": "What description?", '
        '"partial_plan": {"local_course_id": 1, "title": "test5"}}}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "create an assignment"},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is True
    assert "could not be understood" in body["reply"]["error"]


# Verifies: Modify turn sends current plan as structured context.
def test_modify_turn_sends_current_plan_as_structured_context(client):
    """Regression test: a modify message that only restates the part
    being changed (e.g. just appending a year to the date) doesn't
    repeat already-answered fields like description or points_possible.
    Left to reconstruct that from conversation history, the model can
    lose them entirely. The current plan must be handed to the model
    explicitly, not left implicit."""
    headers, local_course_id = _register_with_canvas(client)
    conversation_id, pending_message_id = _propose_create_assignment(
        client, headers, local_course_id
    )

    modify_adapter = AsyncMock()
    modify_adapter.generate.return_value = (
        '{"action": "intent_preview", "summary": "Create Midterm Exam, moved a week later", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "Midterm Exam", '
        '"description": "Covers chapters 1 through 5", "due_date": "2030-01-08T00:00:00", '
        '"points_possible": 100}}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=modify_adapter):
        client.post(
            "/api/v1/chat/",
            json={
                "message": "move it a week later",
                "conversation_id": conversation_id,
                "pending_message_id": pending_message_id,
            },
            headers=headers,
        )

    sent_message = modify_adapter.generate.call_args.args[1]
    assert "Current proposed plan" in sent_message
    assert '"description": "Covers chapters 1 through 5"' in sent_message
    assert '"points_possible": 100' in sent_message
    assert "User request: move it a week later" in sent_message
