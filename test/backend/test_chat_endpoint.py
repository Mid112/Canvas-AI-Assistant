import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register(client) -> dict:
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# Verifies: No auth.
def test_no_auth(client):
    response = client.post("/api/v1/chat/", json={"message": "hello"})
    assert response.status_code == 401


# Verifies: Llm error.
def test_llm_error(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = Exception("connection refused")

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "List my courses"},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is True
    assert "error" in body["reply"]


# Verifies: Plain text model reply is returned.
def test_plain_text_model_reply_is_returned(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = "I can help with Canvas course questions."

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "List my courses"},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is False
    assert body["reply"] == {
        "action": "respond",
        "message": "I can help with Canvas course questions.",
    }


# Verifies: Malformed json still returns safe error.
def test_malformed_json_still_returns_safe_error(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "respond",'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "List my courses"},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is True
    assert "could not be understood" in body["reply"]["error"]


# Verifies: User log.
def test_user_log(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "fetch_courses"}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter), \
         patch("app.mcp_tools.dispatcher.get_courses", new=AsyncMock(return_value=[])):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "List my courses"},
            headers=headers,
        )

    assert response.status_code == 200
    conversation_id = response.json()["conversation_id"]

    history = client.get(f"/api/v1/chat/conversations/{conversation_id}", headers=headers)
    assert history.status_code == 200
    roles = [m["role"] for m in history.json()["messages"]]
    assert "user" in roles


# Verifies: Chat resolves course name before calling model.
def test_chat_resolves_course_name_before_calling_model(client):
    headers = _register(client)

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": "https://canvas.ubc.ca"},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_courses:
        mock_courses.return_value = [
            {
                "id": 499,
                "name": "COSC 499",
                "course_code": "COSC 499",
                "enrollment_term_id": 1,
                "workflow_state": "available",
            }
        ]
        courses = client.get(
            "/api/v1/canvas/courses?canvas_url=https://canvas.ubc.ca",
            headers=headers,
        )
    assert courses.status_code == 200
    local_course_id = courses.json()[0]["local_id"]

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "respond", "message": "Resolved."}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "How many people are in COSC 499?"},
            headers=headers,
        )

    assert response.status_code == 200
    generated_user_message = mock_adapter.generate.call_args.args[1]
    assert f"local_course_id: {local_course_id}" in generated_user_message
    assert "do not ask the user for internal IDs" in generated_user_message


# Verifies: Chat reuses conversation course context on followup.
def test_chat_reuses_conversation_course_context_on_followup(client):
    headers = _register(client)

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": "https://canvas.ubc.ca"},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_courses:
        mock_courses.return_value = [
            {
                "id": 310,
                "name": "COSC 310",
                "course_code": "COSC 310",
                "enrollment_term_id": 1,
                "workflow_state": "available",
            }
        ]
        courses = client.get(
            "/api/v1/canvas/courses?canvas_url=https://canvas.ubc.ca",
            headers=headers,
        )
    local_course_id = courses.json()[0]["local_id"]

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "respond", "message": "OK."}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        first = client.post(
            "/api/v1/chat/",
            json={"message": "Summarize COSC 310", "local_course_id": local_course_id},
            headers=headers,
        )
        conversation_id = first.json()["conversation_id"]
        client.post(
            "/api/v1/chat/",
            json={"message": "How many students are there?", "conversation_id": conversation_id},
            headers=headers,
        )

    followup_user_message = mock_adapter.generate.call_args_list[1].args[1]
    assert f"local_course_id: {local_course_id}" in followup_user_message


def test_chat_followup_stays_on_conversation_course_despite_conflicting_active_course(
    client,
):
    """A conversation named a course by text in turn 1 (e.g. answering a
    clarify question about a different course than the user's global active
    course) must not snap back to the global active course on a turn 2 that
    names no course at all — the conversation's own course_id should win."""
    headers = _register(client)

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": "https://canvas.ubc.ca"},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_courses:
        mock_courses.return_value = [
            {
                "id": 310,
                "name": "COSC 310",
                "course_code": "COSC 310",
                "enrollment_term_id": 1,
                "workflow_state": "available",
            },
            {
                "id": 499,
                "name": "COSC 499",
                "course_code": "COSC 499",
                "enrollment_term_id": 1,
                "workflow_state": "available",
            },
        ]
        courses = client.get(
            "/api/v1/canvas/courses?canvas_url=https://canvas.ubc.ca",
            headers=headers,
        )
    local_ids = {c["name"]: c["local_id"] for c in courses.json()}

    # Global active course is set to COSC 310 ...
    client.patch(
        "/api/v1/canvas/active-course",
        json={"local_course_id": local_ids["COSC 310"]},
        headers=headers,
    )

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "respond", "message": "OK."}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        # ... but this conversation is about COSC 499, named explicitly in turn 1.
        first = client.post(
            "/api/v1/chat/",
            json={"message": "show assignments for COSC 499"},
            headers=headers,
        )
        conversation_id = first.json()["conversation_id"]
        # Turn 2 names no course at all (e.g. answering a clarify question).
        client.post(
            "/api/v1/chat/",
            json={"message": "all assignments", "conversation_id": conversation_id},
            headers=headers,
        )

    followup_user_message = mock_adapter.generate.call_args_list[1].args[1]
    assert f"local_course_id: {local_ids['COSC 499']}" in followup_user_message


def test_history_sent_to_llm_truncates_oversized_prior_messages(client):
    """Regression test for a real incident: a prior turn's stored assistant
    message can end up huge — a failed-parse turn logs the full raw model
    output verbatim, and for a 'thinking' model that can be a multi-thousand
    -character <think> dump. _get_recent_messages then fed that whole thing
    back to the LLM as conversation history on the next turn, and the
    request to Groq for the *following* turn failed with a 413 (payload too
    large). Any single history message's content must be capped regardless
    of why it got large — this test uses a plain oversized reply (routed
    through the same code path any huge stored message takes) rather than
    reproducing the parse-error branch specifically."""
    headers = _register(client)

    huge_reply = "x" * 5000

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = [
        huge_reply,
        '{"action": "respond", "message": "OK."}',
    ]

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        first = client.post(
            "/api/v1/chat/",
            json={"message": "first message"},
            headers=headers,
        )
        conversation_id = first.json()["conversation_id"]
        client.post(
            "/api/v1/chat/",
            json={"message": "second message", "conversation_id": conversation_id},
            headers=headers,
        )

    followup_history = mock_adapter.generate.call_args_list[1].kwargs["history"]
    assert len(followup_history) == 2
    huge_entry = next(m for m in followup_history if m["role"] == "assistant")
    assert len(huge_entry["content"]) < len(huge_reply)
    assert huge_entry["content"].endswith("…[truncated]")


def test_history_summarizes_clarify_reply_for_next_turn(client):
    """Assistant turns replayed as LLM history should be reduced to their
    natural-language gist for terminal, already-resolved turns like a
    clarify question — feeding the full JSON shape back to the model risks
    it echoing stray field names/structure into its next output instead of
    just answering based on the plain-English question it asked."""
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = [
        '{"action": "clarify", "question": "Which course do you mean?", "partial_plan": {}}',
        '{"action": "respond", "message": "OK."}',
    ]

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        first = client.post(
            "/api/v1/chat/",
            json={"message": "show me assignments"},
            headers=headers,
        )
        conversation_id = first.json()["conversation_id"]
        client.post(
            "/api/v1/chat/",
            json={"message": "COSC 310", "conversation_id": conversation_id},
            headers=headers,
        )

    followup_history = mock_adapter.generate.call_args_list[1].kwargs["history"]
    assistant_entry = next(m for m in followup_history if m["role"] == "assistant")
    assert assistant_entry["content"] == "Which course do you mean?"


def test_history_keeps_intent_preview_full_for_modify_turn(client):
    """Unlike clarify/respond turns, an intent_preview must stay full JSON
    in history — a follow-up 'modify' turn needs the complete previous
    proposed_action to correctly carry forward fields the user didn't ask
    to change."""
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = [
        '{"action": "intent_preview", "summary": "I will fetch your courses.", "proposed_action": {"action": "fetch_courses"}}',
        '{"action": "respond", "message": "OK."}',
    ]

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        first = client.post(
            "/api/v1/chat/",
            json={"message": "show me my courses"},
            headers=headers,
        )
        conversation_id = first.json()["conversation_id"]
        client.post(
            "/api/v1/chat/",
            json={"message": "actually, something else", "conversation_id": conversation_id},
            headers=headers,
        )

    followup_history = mock_adapter.generate.call_args_list[1].kwargs["history"]
    assistant_entry = next(m for m in followup_history if m["role"] == "assistant")
    assert "proposed_action" in assistant_entry["content"]
    assert "fetch_courses" in assistant_entry["content"]


def test_course_name_resolution_prefers_longest_match(client):
    """Two courses whose normalized names overlap as substrings (one name
    contained within another) must resolve to the more specific, longer
    match deterministically rather than whichever the DB query happens to
    return first."""
    headers = _register(client)

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": "https://canvas.ubc.ca"},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_courses:
        mock_courses.return_value = [
            {
                "id": 1,
                "name": "COSC 310",
                "course_code": "COSC 310",
                "enrollment_term_id": 1,
                "workflow_state": "available",
            },
            {
                "id": 2,
                "name": "COSC 310 Advanced",
                "course_code": "COSC 310 Advanced",
                "enrollment_term_id": 1,
                "workflow_state": "available",
            },
        ]
        courses = client.get(
            "/api/v1/canvas/courses?canvas_url=https://canvas.ubc.ca",
            headers=headers,
        )
    local_ids = {c["name"]: c["local_id"] for c in courses.json()}

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "respond", "message": "OK."}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        client.post(
            "/api/v1/chat/",
            json={"message": "Summarize COSC 310 Advanced"},
            headers=headers,
        )

    sent_message = mock_adapter.generate.call_args_list[0].args[1]
    assert f"local_course_id: {local_ids['COSC 310 Advanced']}" in sent_message


def test_chat_uses_saved_active_course_when_client_context_is_not_ready(client):
    headers = _register(client)

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": "https://canvas.ubc.ca"},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_courses:
        mock_courses.return_value = [
            {
                "id": 499,
                "name": "COSC 499",
                "course_code": "COSC 499",
                "enrollment_term_id": 1,
                "workflow_state": "available",
            }
        ]
        courses = client.get(
            "/api/v1/canvas/courses?canvas_url=https://canvas.ubc.ca",
            headers=headers,
        )
    local_course_id = courses.json()[0]["local_id"]

    active = client.patch(
        "/api/v1/canvas/active-course",
        json={"local_course_id": local_course_id},
        headers=headers,
    )
    assert active.status_code == 200

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "respond", "message": "Using active course."}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "How many students are in the active course?"},
            headers=headers,
        )

    assert response.status_code == 200
    generated_user_message = mock_adapter.generate.call_args.args[1]
    assert f"local_course_id: {local_course_id}" in generated_user_message
    assert "course_name: COSC 499" in generated_user_message


def test_write_action_without_intent_preview_is_forced_into_a_preview(client):
    """A model that skips intent_preview and names a write action directly
    (e.g. a smaller/local model not following the system prompt) must still
    only ever produce a preview on a normal chat turn — never an actual
    Canvas write. Regression test for a real incident where this happened
    live against Ollama's llama3.2."""
    headers = _register(client)

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": "https://canvas.ubc.ca"},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_courses:
        mock_courses.return_value = [
            {
                "id": 322,
                "name": "COSC 322",
                "course_code": "COSC 322",
                "enrollment_term_id": 1,
                "workflow_state": "available",
            }
        ]
        courses = client.get(
            "/api/v1/canvas/courses?canvas_url=https://canvas.ubc.ca",
            headers=headers,
        )
    local_course_id = courses.json()[0]["local_id"]

    future_due_date = (datetime.now(UTC) + timedelta(days=7)).isoformat()
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "create_assignment", "local_course_id": %d, '
        '"title": "Assignment 1", "description": "Peer evaluation", '
        '"due_date": "%s", "points_possible": 100}' % (local_course_id, future_due_date)
    )

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter), \
         patch("app.mcp_tools.dispatcher.create_course_assignment", new=AsyncMock()) as mock_create:
        response = client.post(
            "/api/v1/chat/",
            json={"message": "create assignment 1 due date July 11 details \"Peer evaluation\""},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is False
    assert body["reply"]["action"] == "intent_preview"
    assert body["reply"]["proposed_action"]["action"] == "create_assignment"
    assert "pending_message_id" in body["reply"]
    mock_create.assert_not_called()


def test_canvas_failure_returns_chat_error(client):
    """Canvas API failures during read actions return a user-friendly chat
    error. A raw fetch_courses response (the model skipping intent_preview)
    now gets auto-wrapped into a real preview rather than executed
    directly on the normal turn — see handle_chat_message — so the
    Canvas call, and its failure, only happen once that preview is
    confirmed."""
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": "https://canvas.ubc.ca"},
            headers=headers,
        )

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "fetch_courses"}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        preview = client.post(
            "/api/v1/chat/",
            json={"message": "List my courses"},
            headers=headers,
        )

    assert preview.status_code == 200
    preview_body = preview.json()
    assert preview_body["is_error"] is False
    assert preview_body["reply"]["action"] == "intent_preview"
    conversation_id = preview_body["conversation_id"]
    pending_message_id = preview_body["reply"]["pending_message_id"]

    with patch(
        "app.mcp_tools.dispatcher.get_courses",
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
