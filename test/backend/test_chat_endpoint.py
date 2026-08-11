from canvas_test_utils import unique_canvas_token

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import decode_access_token
from app.main import app
from app.models.canvas_connection import CanvasConnection
from app.models.canvas_course_name import CanvasCourseName
from app.models.conversation import Conversation
from app.models.course import Course


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register(client) -> dict:
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "Secret123!"},
    )
    token = reg.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# Verifies: No auth.

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

    history = client.get("/api/v1/chat/conversations", headers=headers)
    assert history.status_code == 200
    assert history.json()["items"][0]["preview"] == "List my courses"


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


# Verifies: Malformed json soft-degrades to a respond action after retry (#1304).
def test_malformed_json_soft_degrades_after_retry(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = [
        '{"action": "respond",',
        '{"action": "respond",',
    ]

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "List my courses"},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is False
    assert body["reply"]["action"] == "respond"
    assert "trouble formatting" in body["reply"]["message"].lower()
    assert mock_adapter.generate.await_count == 2


def test_malformed_json_recovers_when_retry_returns_valid_action(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = [
        '{"action": "respond",',
        '{"action": "respond", "message": "Here are your courses."}',
    ]

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
        "message": "Here are your courses.",
    }


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



def test_list_conversations(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "respond", "message": "Hello from history."}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "Can you help?"},
            headers=headers,
        )

    assert response.status_code == 200
    conversation_id = response.json()["conversation_id"]

    history = client.get("/api/v1/chat/conversations?limit=10", headers=headers)

    assert history.status_code == 200
    body = history.json()
    assert body["total"] >= 1
    assert body["items"][0]["id"] == conversation_id
    assert body["items"][0]["message_count"] == 2
    assert body["items"][0]["preview"] == "Hello from history."


def test_conversation_preview_preserves_bracketed_user_text(client):
    headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = Exception("connection refused")

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "[URGENT] Please help with grading"},
            headers=headers,
        )

    assert response.status_code == 200

    history = client.get("/api/v1/chat/conversations", headers=headers)
    assert history.status_code == 200
    assert history.json()["items"][0]["preview"] == "[URGENT] Please help with grading"


def test_conversation_history_is_scoped_to_current_user(client):
    owner_headers = _register(client)
    other_headers = _register(client)

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "respond", "message": "Private transcript."}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "remember this"},
            headers=owner_headers,
        )

    assert response.status_code == 200
    conversation_id = response.json()["conversation_id"]

    other_list = client.get("/api/v1/chat/conversations", headers=other_headers)
    assert other_list.status_code == 200
    assert conversation_id not in [item["id"] for item in other_list.json()["items"]]

    other_detail = client.get(
        f"/api/v1/chat/conversations/{conversation_id}",
        headers=other_headers,
    )
    assert other_detail.status_code == 404


# Read actions (fetch_courses, fetch_assignments, fetch_students,
# fetch_submissions, get_active_course) no longer go through intent_preview
# at all — they execute directly on the normal turn (see READ_ACTIONS in
# services/chat.py's handle_chat_message), so there is no pending preview
# for them to have a status. Coverage for a write action's pending status
# lives in test_conversation_workflow_status.py instead of here.


# Verifies: Chat resolves course name before calling model.
def test_chat_resolves_course_name_before_calling_model(client):
    """The prompt built for the LLM carries the user's real course names
    (YOUR COURSES) — course resolution is the model's job (COURSE
    RESOLUTION in build_system_prompt), never a pre-injected numeric ID."""
    headers = _register(client)

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": unique_canvas_token(), "canvas_url": "https://canvas.example.edu"},
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
            "/api/v1/canvas/courses?canvas_url=https://canvas.example.edu",
            headers=headers,
        )
        assert courses.status_code == 200
        local_course_id = courses.json()[0]["local_id"]
        # Seeds canvas_course_names via set_active_course's sync call —
        # that's the only source _build_llm_message's YOUR COURSES list
        # reads from.
        active_resp = client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_course_id},
            headers=headers,
        )
        assert active_resp.status_code == 200

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "respond", "course_name": "COSC 499", "message": "Resolved."}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "How many people are in COSC 499?"},
            headers=headers,
        )

    assert response.status_code == 200
    generated_user_message = mock_adapter.generate.call_args.args[1]
    assert "YOUR COURSES" in generated_user_message
    assert "COSC 499" in generated_user_message
    assert "local_course_id:" not in generated_user_message
    assert "canvas_course_id:" not in generated_user_message


# Verifies: Chat reuses conversation course context on followup.
def test_chat_reuses_conversation_course_context_on_followup(client):
    headers = _register(client)

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": unique_canvas_token(), "canvas_url": "https://canvas.example.edu"},
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
            "/api/v1/canvas/courses?canvas_url=https://canvas.example.edu",
            headers=headers,
        )
        local_course_id = courses.json()[0]["local_id"]
        # Seeds canvas_course_names via set_active_course's sync call —
        # the only source _build_llm_message's YOUR COURSES/CURRENT
        # COURSE block reads from.
        client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_course_id},
            headers=headers,
        )

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

    # Turn 1 has no prior history, so _resolve_course_switch is skipped
    # (see handle_chat_message) and it's a single LLM call — call[0].
    # Turn 2 already has turn 1's history, so it costs two calls: the new
    # course-switch pre-resolver (call[1]), then the main call (call[2]).
    followup_user_message = mock_adapter.generate.call_args_list[2].args[1]
    assert "CURRENT COURSE FOR THIS CONVERSATION: COSC 310" in followup_user_message


def test_chat_refreshes_renamed_course_context_and_matches_course_code(client):
    headers = _register(client)

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": unique_canvas_token(), "canvas_url": "https://canvas.example.edu"},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_courses:
        mock_courses.return_value = [
            {
                "id": 499,
                "name": "COSC 333",
                "course_code": "COSC 333",
                "enrollment_term_id": 1,
                "workflow_state": "available",
            }
        ]
        courses = client.get(
            "/api/v1/canvas/courses?canvas_url=https://canvas.example.edu",
            headers=headers,
        )
        local_course_id = courses.json()[0]["local_id"]
        client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_course_id},
            headers=headers,
        )

    user_id = int(decode_access_token(headers["Authorization"].removeprefix("Bearer "))[0])

    async def _seed_stale_conversation():
        engine = create_async_engine(settings.DATABASE_URL)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with Session() as db:
                await db.execute(
                    update(Course)
                    .where(Course.id == local_course_id)
                    .values(name="Capstone Project", course_code="COSC 499")
                )
                await db.execute(
                    update(CanvasCourseName)
                    .where(CanvasCourseName.local_course_id == local_course_id)
                    .values(name="COSC 333")
                )
                conversation = Conversation(
                    user_id=user_id,
                    course_id=local_course_id,
                    course_name="COSC 333",
                )
                db.add(conversation)
                await db.commit()
                return conversation.id
        finally:
            await engine.dispose()

    conversation_id = asyncio.run(_seed_stale_conversation())

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "respond", "course_name": "COSC 499", "message": "Using COSC 499."}'
    )

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "Use COSC 499 for this chat", "conversation_id": conversation_id},
            headers=headers,
        )

    assert response.status_code == 200
    generated_user_message = mock_adapter.generate.call_args.args[1]
    assert "Capstone Project / COSC 499" in generated_user_message
    assert "CURRENT COURSE FOR THIS CONVERSATION: Capstone Project" in generated_user_message
    assert "COSC 333" not in generated_user_message

    async def _conversation_name():
        engine = create_async_engine(settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                return await db.scalar(
                    select(Conversation.course_name).where(Conversation.id == conversation_id)
                )
        finally:
            await engine.dispose()

    assert asyncio.run(_conversation_name()) == "Capstone Project"


def test_chat_followup_stays_on_conversation_course_despite_conflicting_active_course(
    client,
):
    """A conversation the model resolved to one course in turn 1 (naming
    it explicitly in its course_name field — e.g. answering what the user
    typed) must not snap back to the user's global active course on a
    turn 2 that names no course at all — the conversation's own,
    already-resolved course_id should win over the
    UserPreference.active_course_id fallback, which is only ever a seed
    for a still course-less conversation (see get_or_create_conversation)."""
    headers = _register(client)

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": unique_canvas_token(), "canvas_url": "https://canvas.example.edu"},
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
            "/api/v1/canvas/courses?canvas_url=https://canvas.example.edu",
            headers=headers,
        )
        local_ids = {c["name"]: c["local_id"] for c in courses.json()}

        # Global active course is set to COSC 310 (also seeds
        # canvas_course_names for both courses, via sync_courses_if_stale).
        client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_ids["COSC 310"]},
            headers=headers,
        )

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = [
        # Turn 1 names COSC 499 while COSC 310 is active, so the pre-resolver
        # runs even without history (_message_may_name_another_course spots the
        # name locally). It used to be skipped here, leaving the main call
        # framed on the active course and relying on that call to overrule its
        # own framing — which is exactly what it failed to do in practice.
        '{"switched_to": "COSC 499"}',
        '{"action": "respond", "course_name": "COSC 499", "message": "OK."}',
        # Turn 2 now has turn 1's history, so _resolve_course_switch runs
        # first — "all assignments" names no course, so it reports no switch.
        '{"switched_to": null}',
        '{"action": "respond", "message": "OK."}',
    ]

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
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

    followup_user_message = mock_adapter.generate.call_args_list[3].args[1]
    assert "CURRENT COURSE FOR THIS CONVERSATION: COSC 499" in followup_user_message


def test_explicit_course_in_message_beats_active_course(client):
    """Regression test for #1509: "Explicitly naming a course must win over
    whatever is active."

    Reported bug: a user with Math 101 set as their active course typed
    "show assignments for COSC 499" and the assistant answered about Math
    101 instead. The root cause lived in the client, not here — the
    frontend was sending the ambient active course as local_course_id on
    every single chat turn, and local_course_id is documented (see
    ChatRequest.local_course_id, get_or_create_conversation,
    handle_chat_message) as an explicit "set active course" selection that
    always wins, bypassing the course-name resolution that would otherwise
    have honored "COSC 499" from the message text. The fix was for the
    client to stop sending it ambiently (services/assistant.ts) — this test
    pins the contract from this endpoint's side: a request that omits
    local_course_id (a normal chat turn, post-fix) must resolve strictly
    from what the user actually typed, never from the persisted active
    course, even though that preference is populated and would otherwise
    match a different real course of the user's."""
    headers = _register(client)

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": unique_canvas_token(), "canvas_url": "https://canvas.example.edu"},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_courses:
        mock_courses.return_value = [
            {
                "id": 101,
                "name": "Math 101",
                "course_code": "MATH 101",
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
            "/api/v1/canvas/courses?canvas_url=https://canvas.example.edu",
            headers=headers,
        )
        local_ids = {c["name"]: c["local_id"] for c in courses.json()}

        # Math 101 is the persisted active course (also seeds
        # canvas_course_names for both courses via sync_courses_if_stale) —
        # mirrors a real instructor who just hasn't switched it lately.
        client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_ids["Math 101"]},
            headers=headers,
        )

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "fetch_assignments", "course_name": "COSC 499"}'
    )

    with (
        patch("app.services.chat.get_llm_adapter", return_value=mock_adapter),
        patch(
            "app.mcp_tools.dispatcher.get_assignments", new=AsyncMock(return_value=[])
        ) as mock_fetch_assignments,
    ):
        # No local_course_id in the request body — this is what a correct,
        # post-#1509 client sends on every ordinary turn.
        response = client.post(
            "/api/v1/chat/",
            json={"message": "show assignments for COSC 499"},
            headers=headers,
        )

    assert response.status_code == 200
    mock_fetch_assignments.assert_awaited_once()
    assert mock_fetch_assignments.await_args.args[0] == local_ids["COSC 499"]
    assert mock_fetch_assignments.await_args.args[0] != local_ids["Math 101"]


def test_ambient_local_course_id_forks_away_from_an_already_resolved_conversation(client):
    """Companion to test_explicit_course_in_message_beats_active_course:
    reproduces #1509's mechanism deterministically (no LLM-behavior
    modeling needed) on a follow-up turn.

    Turn 1 resolves a fresh conversation to COSC 499 from the message
    alone. Turn 2 simulates the pre-#1509 frontend bug — sending
    local_course_id as the ambient active course (Math 101) on every
    single turn, including this one, which never named any course at all.
    get_or_create_conversation treats any local_course_id as an explicit,
    deliberate switch: since it differs from the conversation's already-
    resolved course_id, it forks to a *different* conversation anchored to
    Math 101 instead of continuing the COSC 499 conversation — silently
    dropping the whole COSC 499 exchange the user was just having. Compare
    with test_chat_followup_stays_on_conversation_course_despite_conflicting_active_course,
    which confirms the fixed contract (omitting local_course_id on this
    same turn) keeps the original conversation."""
    headers = _register(client)

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": unique_canvas_token(), "canvas_url": "https://canvas.example.edu"},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_courses:
        mock_courses.return_value = [
            {
                "id": 101,
                "name": "Math 101",
                "course_code": "MATH 101",
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
            "/api/v1/canvas/courses?canvas_url=https://canvas.example.edu",
            headers=headers,
        )
        local_ids = {c["name"]: c["local_id"] for c in courses.json()}
        client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_ids["Math 101"]},
            headers=headers,
        )

    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = [
        # Turn 1 names COSC 499 while Math 101 is active, so the pre-resolver
        # runs on it even with no history — see
        # _message_may_name_another_course.
        '{"switched_to": "COSC 499"}',
        '{"action": "respond", "course_name": "COSC 499", "message": "OK."}',
        # Turn 2 carries an explicit local_course_id, which skips the
        # pre-resolver outright (a deliberate selection outranks the message).
        '{"action": "respond", "message": "OK."}',
    ]

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        first = client.post(
            "/api/v1/chat/",
            json={"message": "show assignments for COSC 499"},
            headers=headers,
        )
        first_conversation_id = first.json()["conversation_id"]

        # Turn 2 names no course at all — a normal follow-up — but a
        # pre-#1509 client still attaches the ambient active course.
        second = client.post(
            "/api/v1/chat/",
            json={
                "message": "now list the overdue ones",
                "conversation_id": first_conversation_id,
                "local_course_id": local_ids["Math 101"],
            },
            headers=headers,
        )

    # The bug, reproduced: turn 2 silently landed on a different
    # conversation instead of continuing the COSC 499 one.
    forked_conversation_id = second.json()["conversation_id"]
    assert forked_conversation_id != first_conversation_id

    async def _forked_course_id():
        engine = create_async_engine(settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                return await db.scalar(
                    select(Conversation.course_id).where(Conversation.id == forked_conversation_id)
                )
        finally:
            await engine.dispose()

    assert asyncio.run(_forked_course_id()) == local_ids["Math 101"]


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
    to change. Uses create_assignment (a write) since reads no longer
    produce an intent_preview at all — they execute directly (see
    READ_ACTIONS in handle_chat_message)."""
    headers = _register(client)

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": unique_canvas_token(), "canvas_url": "https://canvas.example.edu"},
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
            "/api/v1/canvas/courses?canvas_url=https://canvas.example.edu",
            headers=headers,
        )
        local_course_id = courses.json()[0]["local_id"]
        client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_course_id},
            headers=headers,
        )

    future_due_date = (datetime.now(UTC) + timedelta(days=7)).isoformat()
    mock_adapter = AsyncMock()
    mock_adapter.generate.side_effect = [
        '{"action": "intent_preview", "summary": "I will create Assignment 1.", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "Assignment 1", '
        f'"description": "Peer evaluation", "due_date": "{future_due_date}", '
        '"points_possible": 100}}',
        # The followup turn has both prior history and an established
        # conversation.course_id, so it also triggers the pre-resolver
        # course-switch check (_resolve_course_switch) before the main
        # call — see COURSE RESOLUTION in build_system_prompt.
        '{"switched_to": null}',
        '{"action": "respond", "message": "OK."}',
    ]

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        first = client.post(
            "/api/v1/chat/",
            json={"message": "create assignment 1"},
            headers=headers,
        )
        conversation_id = first.json()["conversation_id"]
        client.post(
            "/api/v1/chat/",
            json={"message": "actually, something else", "conversation_id": conversation_id},
            headers=headers,
        )

    followup_history = mock_adapter.generate.call_args_list[2].kwargs["history"]
    assistant_entry = next(m for m in followup_history if m["role"] == "assistant")
    assert "proposed_action" in assistant_entry["content"]
    assert "create_assignment" in assistant_entry["content"]


def test_course_name_resolution_is_exact_not_fuzzy(client):
    """Course resolution matches the model's course_name exactly against
    YOUR COURSES — never a substring/fuzzy match. Disambiguating similar
    names (e.g. "COSC 310" vs "COSC 310 Advanced") is the model's job now
    (COURSE RESOLUTION in build_system_prompt); the app's only role is an
    exact lookup once the model has already named one precisely."""
    headers = _register(client)

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": unique_canvas_token(), "canvas_url": "https://canvas.example.edu"},
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
            "/api/v1/canvas/courses?canvas_url=https://canvas.example.edu",
            headers=headers,
        )
        local_ids = {c["name"]: c["local_id"] for c in courses.json()}
        # Seeds canvas_course_names for both courses.
        client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_ids["COSC 310"]},
            headers=headers,
        )

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "fetch_assignments", "course_name": "COSC 310 Advanced"}'
    )

    with (
        patch("app.services.chat.get_llm_adapter", return_value=mock_adapter),
        patch(
            "app.mcp_tools.dispatcher.get_assignments", new=AsyncMock(return_value=[])
        ) as mock_fetch_assignments,
    ):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "Summarize COSC 310 Advanced"},
            headers=headers,
        )

    # fetch_assignments is a read action now — it executes directly, no
    # intent_preview/confirm step, so the resolved local_course_id is only
    # observable via what actually got passed to the Canvas-facing call.
    assert response.status_code == 200
    assert response.json()["reply"]["assignments"] == []
    mock_fetch_assignments.assert_awaited_once()
    assert mock_fetch_assignments.await_args.args[0] == local_ids["COSC 310 Advanced"]


def test_chat_uses_saved_active_course_when_client_context_is_not_ready(client):
    headers = _register(client)

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": unique_canvas_token(), "canvas_url": "https://canvas.example.edu"},
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
            "/api/v1/canvas/courses?canvas_url=https://canvas.example.edu",
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
    mock_adapter.generate.return_value = '{"action": "respond", "course_name": "COSC 499", "message": "Using active course."}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "How many students are in the active course?"},
            headers=headers,
        )

    assert response.status_code == 200
    generated_user_message = mock_adapter.generate.call_args.args[1]
    assert "CURRENT COURSE FOR THIS CONVERSATION: COSC 499" in generated_user_message
    assert "local_course_id:" not in generated_user_message


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
            json={"canvas_token": unique_canvas_token(), "canvas_url": "https://canvas.example.edu"},
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
            "/api/v1/canvas/courses?canvas_url=https://canvas.example.edu",
            headers=headers,
        )
        local_course_id = courses.json()[0]["local_id"]
        client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_course_id},
            headers=headers,
        )

    future_due_date = (datetime.now(UTC) + timedelta(days=7)).isoformat()
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "create_assignment", "course_name": "COSC 322", '
        '"title": "Assignment 1", "description": "Peer evaluation", '
        f'"due_date": "{future_due_date}", "points_possible": 100}}'
    )

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter), \
         patch("app.mcp_tools.dispatcher.create_course_assignment", new=AsyncMock()) as mock_create:
        response = client.post(
            "/api/v1/chat/",
            json={"message": "create assignment 1 due date January 15 2030 details \"Peer evaluation\""},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is False
    assert body["reply"]["action"] == "intent_preview"
    assert body["reply"]["proposed_action"]["action"] == "create_assignment"
    assert "pending_message_id" in body["reply"]
    mock_create.assert_not_called()


# Verifies: General/standalone questions succeed even with no Canvas connection.
def test_chat_general_question_succeeds_without_canvas_token(client):
    headers = _register(client)  # never connects a Canvas token

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "respond", "message": "Office hours are usually posted on your syllabus."}'
    )

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "What are typical office hours?"},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is False
    assert body["reply"]["action"] == "respond"


# Verifies: A Canvas-needed action against a course whose token connection
# has since been removed returns an actionable, non-technical error rather
# than leaking the raw internal detail. (fetch_courses itself can't exercise
# this path — it falls back to a different, already-friendly "no connections
# at all" check in dispatcher.py's _default_canvas_url before ever reaching
# require_canvas_token. This test instead syncs a course while connected,
# then removes the connection, so a later fetch_assignments call reaches
# require_canvas_token/CanvasTokenRequiredError for real.)
def test_canvas_action_without_token_returns_actionable_error(client):
    headers = _register(client)

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": unique_canvas_token(), "canvas_url": "https://canvas.example.edu"},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_courses:
        mock_courses.return_value = [
            {
                "id": 777,
                "name": "COSC 777",
                "course_code": "COSC 777",
                "enrollment_term_id": 1,
                "workflow_state": "available",
            }
        ]
        courses = client.get(
            "/api/v1/canvas/courses?canvas_url=https://canvas.example.edu",
            headers=headers,
        )
    local_course_id = courses.json()[0]["local_id"]
    user_id = int(decode_access_token(headers["Authorization"].removeprefix("Bearer "))[0])

    async def _remove_canvas_connection(uid: int):
        engine = create_async_engine(settings.DATABASE_URL)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with Session() as db:
                await db.execute(delete(CanvasConnection).where(CanvasConnection.user_id == uid))
                await db.commit()
        finally:
            await engine.dispose()

    asyncio.run(_remove_canvas_connection(user_id))

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "fetch_assignments"}'

    # fetch_assignments is a read action — it executes directly on the
    # normal turn (no intent_preview/confirm round-trip), so the missing
    # connection surfaces as an error on this same response, not a later
    # confirm. local_course_id is passed by the client (trusted), same as
    # a real "active course" button click — the model is never given one.
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "List assignments for COSC 777", "local_course_id": local_course_id},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is True
    assert body["reply"]["requires_canvas_token"] is True
    assert "connect canvas" in body["reply"]["error"].lower()
    assert "PATCH" not in body["reply"]["error"]


def test_canvas_failure_returns_chat_error(client):
    """Canvas API failures during a read action surface immediately as a
    user-friendly chat error. fetch_courses is a read action — it executes
    directly on the normal turn now (see READ_ACTIONS in
    handle_chat_message), no preview/confirm step to fail at separately."""
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "Secret123!"},
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": unique_canvas_token(), "canvas_url": "https://canvas.example.edu"},
            headers=headers,
        )

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "fetch_courses"}'

    with (
        patch("app.services.chat.get_llm_adapter", return_value=mock_adapter),
        patch(
            "app.mcp_tools.dispatcher.get_courses",
            new=AsyncMock(
                side_effect=HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Canvas server error: 503",
                )
            ),
        ),
    ):
        response = client.post(
            "/api/v1/chat/",
            json={"message": "List my courses"},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["is_error"] is True
    assert body["reply"]["error"] == "Canvas server error: 503"


def test_switching_course_and_back_returns_to_the_original_conversation(client):
    """A conversation's course, once set, is never mutated in place —
    switching to a different course (via the "set active course" button)
    routes to a different conversation, reusing one that already exists
    for the target course rather than always forking fresh. Switching
    back a second time must land back in the *original* conversation,
    with its earlier history intact, not a brand-new third one."""
    headers = _register(client)

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": unique_canvas_token(), "canvas_url": "https://canvas.example.edu"},
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_courses:
        mock_courses.return_value = [
            {
                "id": 501,
                "name": "COSC 501",
                "course_code": "COSC 501",
                "enrollment_term_id": 1,
                "workflow_state": "available",
            },
            {
                "id": 502,
                "name": "COSC 502",
                "course_code": "COSC 502",
                "enrollment_term_id": 1,
                "workflow_state": "available",
            },
        ]
        courses = client.get(
            "/api/v1/canvas/courses?canvas_url=https://canvas.example.edu",
            headers=headers,
        )
        local_ids = {c["name"]: c["local_id"] for c in courses.json()}

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "respond", "message": "OK."}'

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        # Turn 1: conversation A, course 501, via the button.
        client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_ids["COSC 501"]},
            headers=headers,
        )
        first = client.post(
            "/api/v1/chat/",
            json={"message": "first message about 501", "local_course_id": local_ids["COSC 501"]},
            headers=headers,
        )
        conversation_a_id = first.json()["conversation_id"]
        # Creating the first conversation is not moving an existing one, so
        # there is nothing for the client to follow.
        assert first.json()["course_id"] is None

        # Turn 2: switch to course 502 mid-thread — routes to a new
        # conversation B, not conversation A.
        client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_ids["COSC 502"]},
            headers=headers,
        )
        second = client.post(
            "/api/v1/chat/",
            json={
                "message": "switch to 502",
                "conversation_id": conversation_a_id,
                "local_course_id": local_ids["COSC 502"],
            },
            headers=headers,
        )
        conversation_b_id = second.json()["conversation_id"]
        assert conversation_b_id != conversation_a_id
        # The thread moved, so the response says where to. The chat tab strip
        # is keyed by course, not by conversation id: without this the reply
        # lands under a tab still named after the course they left, and the
        # active-course selector never follows either.
        assert second.json()["course_id"] == local_ids["COSC 502"]
        assert second.json()["course_name"] == "COSC 502"

        # Turn 3: switch back to course 501 — must reuse conversation A,
        # not fork a third one.
        client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_ids["COSC 501"]},
            headers=headers,
        )
        third = client.post(
            "/api/v1/chat/",
            json={
                "message": "back to 501",
                "conversation_id": conversation_b_id,
                "local_course_id": local_ids["COSC 501"],
            },
            headers=headers,
        )
        conversation_c_id = third.json()["conversation_id"]

    assert conversation_c_id == conversation_a_id

    history = client.get(f"/api/v1/chat/conversations/{conversation_a_id}", headers=headers)
    assert history.status_code == 200
    contents = [m["content"] for m in history.json()["messages"]]
    assert "first message about 501" in contents
    assert "back to 501" in contents
    assert "switch to 502" not in contents


# Verifies: the moved-course signal is reported only when the thread actually
# moved. An instructor accepted a "switch to Capstone Project?" offer, the
# server routed the turn to that course's conversation and answered correctly
# — and the UI stayed on the tab they had left, still labelled Math 101, with
# Math 101 still the active course. conversation_id alone could not fix that:
# the tab strip is keyed by course.
def test_a_rerouted_turn_reports_the_course_it_landed_in(client):
    from types import SimpleNamespace

    headers = _register(client)

    def _post(sent_id, routed):
        with patch(
            "app.routers.chat.handle_chat_message",
            new=AsyncMock(
                return_value=(routed, {"action": "respond", "message": "3 students."}, False)
            ),
        ):
            return client.post(
                "/api/v1/chat/",
                json={"message": "yes", "conversation_id": sent_id},
                headers=headers,
            ).json()

    moved = _post(
        4,
        SimpleNamespace(id=77, course_id=9, course_name="Capstone Project"),
    )
    assert moved["conversation_id"] == 77
    assert moved["course_id"] == 9
    assert moved["course_name"] == "Capstone Project"

    # The ordinary turn: same conversation back, so nothing is reported and no
    # existing turn changes behaviour. Firing on every turn instead would make
    # the tab strip re-route continuously off a signal that means nothing.
    stayed = _post(
        4,
        SimpleNamespace(id=4, course_id=9, course_name="Capstone Project"),
    )
    assert stayed["course_id"] is None
    assert stayed["course_name"] is None


# Verifies: accepting a course switch leaves each transcript able to stand on
# its own. The course being left keeps its question and a line saying where the
# work went; the course being entered gets the original request replayed as its
# own message, so its answer is not an answer to a question filed elsewhere.
def test_an_accepted_switch_splits_the_record_between_both_courses(client):
    headers = _register(client)

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={
                "canvas_token": unique_canvas_token(),
                "canvas_url": "https://canvas.example.edu",
            },
            headers=headers,
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock_courses:
        mock_courses.return_value = [
            {
                "id": 601 + offset,
                "name": name,
                "course_code": name,
                "enrollment_term_id": 1,
                "workflow_state": "available",
            }
            for offset, name in enumerate(("Math 101", "Capstone Project"))
        ]
        courses = client.get(
            "/api/v1/canvas/courses?canvas_url=https://canvas.example.edu",
            headers=headers,
        )
        local_ids = {c["name"]: c["local_id"] for c in courses.json()}

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "respond", "message": "Math 101 has no assignment by that name."}'
    )

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        first = client.post(
            "/api/v1/chat/",
            json={
                "message": "who submitted to testing event 2?",
                "local_course_id": local_ids["Math 101"],
            },
            headers=headers,
        )
        math_conversation_id = first.json()["conversation_id"]

    # Stand in for the offer the resolvers build: an outstanding "switch to
    # Capstone Project?" carrying the request it interrupted. Seeded rather
    # than provoked so this test is about what an accepted switch *records*,
    # not about which resolver noticed the assignment was elsewhere.
    async def _seed_offer():
        engine = create_async_engine(settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                conversation = await db.get(Conversation, math_conversation_id)
                conversation.field_memory = {
                    **(conversation.field_memory or {}),
                    "pending_expectation": {
                        "field": "course_switch",
                        "question": "Should I switch to Capstone Project?",
                        "action": None,
                        "candidates": [
                            {"id": local_ids["Capstone Project"], "label": "Capstone Project"}
                        ],
                        "payload": {
                            "user_message": "who submitted to testing event 2?",
                            "assignment_reference": "Testing Event 2",
                            "local_course_id": local_ids["Capstone Project"],
                            "course_name": "Capstone Project",
                        },
                    },
                }
                await db.commit()
        finally:
            await engine.dispose()

    asyncio.run(_seed_offer())

    # A different answer, so the Capstone reply cannot be mistaken for an echo
    # of the Math 101 one.
    mock_adapter.generate.return_value = (
        '{"action": "respond", "message": "3 students submitted to Testing Event 2."}'
    )

    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        answered = client.post(
            "/api/v1/chat/",
            json={"message": "yes", "conversation_id": math_conversation_id},
            headers=headers,
        )

    capstone_conversation_id = answered.json()["conversation_id"]
    assert capstone_conversation_id != math_conversation_id
    assert answered.json()["course_id"] == local_ids["Capstone Project"]

    def _messages(conversation_id):
        return [
            (m["role"], m["content"])
            for m in client.get(
                f"/api/v1/chat/conversations/{conversation_id}", headers=headers
            ).json()["messages"]
        ]

    math = _messages(math_conversation_id)
    capstone = _messages(capstone_conversation_id)

    # Math 101 keeps what actually happened in it, including the "yes" — moving
    # that across would leave an offer nobody answered.
    assert ("user", "who submitted to testing event 2?") in math
    assert ("user", "yes") in math
    note = next(
        content
        for role, content in math
        if role == "assistant" and "continuing in" in content
    )
    assert "Testing Event 2" in note
    assert "Capstone Project" in note
    # The answer belongs to the other course and must not be duplicated here.
    assert not any("3 students submitted" in content for _role, content in math)

    # Capstone gets the question its answer answers, and never the bare "yes".
    assert ("user", "who submitted to testing event 2?") in capstone
    assert ("user", "yes") not in capstone
    assert any(
        role == "assistant" and "3 students submitted" in content
        for role, content in capstone
    )
