"""Tests for the concurrency/session-isolation and course-resolution
fixes in app/backend/app/services/chat.py and
app/backend/app/services/canvas.py:

- handle_confirmed_action's post-write refresh and set_active_course's
  Canvas sync both run in an isolated session now, so a Canvas failure
  there can never expire/corrupt the shared session objects the caller
  still needs (see AsyncSession.rollback()'s always-expires behavior).
- _match_course_name resolves a same-name collision across terms
  (canvas_course_names is write-once and fetch_courses includes completed
  terms) by preferring the non-completed match, and falls back to a safe
  normalized-substring match when there's no exact match at all.
- handle_chat_message's post-hoc course resolution: never forks on a
  modify turn (would silently break update_message_content), mutates a
  preference-seeded-but-still-empty conversation in place instead of
  forking (no orphaned empty Conversation row), and never overrides an
  explicitly client-supplied local_course_id with the model's own
  possibly-conflicting course_name output."""
import asyncio
import uuid
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.canvas import AssignmentResponse

CANVAS_URL = "https://canvas.ubc.ca"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> dict:
    email = f"courseres_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Course Resolution Instructor", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": CANVAS_URL},
            headers=headers,
        )
    return headers


def _chat(client, headers, message, llm_output, conversation_id=None, local_course_id=None) -> dict:
    mock_adapter = AsyncMock()
    if isinstance(llm_output, list):
        mock_adapter.generate.side_effect = llm_output
    else:
        mock_adapter.generate.return_value = llm_output
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={
                "message": message,
                "conversation_id": conversation_id,
                "local_course_id": local_course_id,
            },
            headers=headers,
        )
    return response.json()


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _user_conversations(headers: dict) -> list[dict]:
    """All conversations for the user behind these auth headers — used to
    check for orphaned/duplicated Conversation rows directly, since the
    chat API only ever returns the ONE conversation_id a given turn ended
    up on."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.config import settings as _settings
    from app.core.security import decode_access_token
    from app.models.conversation import Conversation

    token = headers["Authorization"].removeprefix("Bearer ")
    user_id_str, _role = decode_access_token(token)
    user_id = int(user_id_str)

    async def _query():
        engine = create_async_engine(_settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                rows = await db.scalars(
                    select(Conversation).where(Conversation.user_id == user_id).order_by(Conversation.id)
                )
                return [{"id": c.id, "course_id": c.course_id, "course_name": c.course_name} for c in rows]
        finally:
            await engine.dispose()

    return _run(_query())


def _message_count(conversation_id: int) -> int:
    from sqlalchemy import func, select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.config import settings as _settings
    from app.models.message import Message

    async def _query():
        engine = create_async_engine(_settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                return await db.scalar(
                    select(func.count()).select_from(Message).where(Message.conversation_id == conversation_id)
                )
        finally:
            await engine.dispose()

    return _run(_query())


# ── Session isolation ───────────────────────────────────────────────────

# Verifies: a Canvas failure during the best-effort post-write
# canvas_course_names refresh never turns an already-successful confirm
# into a 500 — the isolated session's rollback can't expire the shared
# session's `conversation`/`workflow` objects the response is built from.
def test_confirm_succeeds_even_when_post_write_sync_fails(client):
    headers = _register_with_canvas(client)

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = [{
            "id": uuid.uuid4().int % 10_000_000, "name": "CPSC 310", "course_code": "CPSC310",
            "enrollment_term_id": 1, "workflow_state": "available",
        }]
        courses_resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
        local_course_id = courses_resp.json()[0]["local_id"]

    create_output = (
        '{"action": "intent_preview", "course_name": "CPSC 310", "summary": "Create Quiz", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "Quiz", '
        '"description": "A short quiz on course topics.", "due_date": "2030-01-01T00:00:00", '
        '"points_possible": 10}}'
    )
    first = _chat(client, headers, "create a quiz", create_output, local_course_id=local_course_id)
    assert first["is_error"] is False, first
    conversation_id = first["conversation_id"]
    pending_message_id = first["reply"]["pending_message_id"]

    with (
        patch(
            "app.mcp_tools.dispatcher.create_course_assignment",
            new=AsyncMock(return_value=AssignmentResponse(
                id=1, course_id=local_course_id, name="Quiz", description="A short quiz on course topics.",
                due_at="2030-01-01T00:00:00", points_possible=10,
            )),
        ),
        # The post-write refresh's own Canvas call fails outright — this
        # must not affect the confirm response at all.
        patch("app.services.canvas.fetch_courses", new=AsyncMock(side_effect=httpx.ConnectError("boom"))),
    ):
        confirm_resp = client.post(
            "/api/v1/chat/confirm",
            json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
            headers=headers,
        )

    assert confirm_resp.status_code == 200, confirm_resp.text
    body = confirm_resp.json()
    assert body["is_error"] is False, body
    assert body["conversation_id"] == conversation_id


# Verifies: set_active_course succeeds (still updates the local
# preference) even when the opportunistic canvas_course_names refresh
# fails — this used to be a pure local write and must not start 502/504ing
# on a Canvas hiccup.
def test_set_active_course_succeeds_even_when_sync_fails(client):
    headers = _register_with_canvas(client)

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = [{
            "id": uuid.uuid4().int % 10_000_000, "name": "CPSC 320", "course_code": "CPSC320",
            "enrollment_term_id": 1, "workflow_state": "available",
        }]
        courses_resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
        local_course_id = courses_resp.json()[0]["local_id"]

    with patch("app.services.canvas.fetch_courses", new=AsyncMock(side_effect=httpx.ConnectError("boom"))):
        set_resp = client.patch(
            "/api/v1/canvas/active-course", json={"local_course_id": local_course_id}, headers=headers,
        )

    assert set_resp.status_code == 200, set_resp.text
    assert set_resp.json()["local_id"] == local_course_id


# ── Duplicate course name resolution ────────────────────────────────────

# Verifies: the same course name across two terms (one completed, one
# active) resolves to the active one instead of being permanently
# unresolvable — the normal steady state for a returning instructor.
def test_duplicate_course_name_resolves_to_the_active_term(client):
    headers = _register_with_canvas(client)
    old_id = uuid.uuid4().int % 10_000_000
    new_id = old_id + 1

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = [
            {
                "id": old_id, "name": "CPSC 310", "course_code": "CPSC310",
                "enrollment_term_id": 1, "workflow_state": "completed",
            },
            {
                "id": new_id, "name": "CPSC 310", "course_code": "CPSC310",
                "enrollment_term_id": 2, "workflow_state": "available",
            },
        ]
        courses_resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
        courses = courses_resp.json()
        completed_local_id = next(c["local_id"] for c in courses if c["canvas_id"] == old_id)

        # Activating either one seeds canvas_course_names for BOTH (same
        # sync fetches the whole course list) — activate the completed one
        # just to prove that doesn't matter for what gets resolved later.
        active_resp = client.patch(
            "/api/v1/canvas/active-course", json={"local_course_id": completed_local_id}, headers=headers,
        )
        assert active_resp.status_code == 200, active_resp.text

    with patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=[])):
        body = _chat(
            client, headers, "show me my assignments for CPSC 310",
            '{"action": "fetch_assignments", "course_name": "CPSC 310"}',
        )
    assert body["is_error"] is False, body
    assert body["reply"]["assignments"] == []


# Verifies: two GENUINELY ambiguous same-name matches (both still active,
# or both with an unknown workflow_state) stay unresolved — the fix
# narrows a completed-vs-active split, it never guesses between two live
# candidates. Direct unit test of _match_course_name: exercising this via
# the full HTTP path would need a course-less conversation, but
# activating either course to seed canvas_course_names also seeds the
# active-course preference, which the sticky-course fallback would then
# use regardless of the ambiguous match — masking the exact property
# under test.
def test_match_course_name_duplicate_active_names_remain_ambiguous():
    from app.models.canvas_course_name import CanvasCourseName
    from app.services.chat import _match_course_name

    course_names = [
        CanvasCourseName(
            canvas_connection_id=1, canvas_course_id="1", local_course_id=1,
            name="CPSC 310", workflow_state="available",
        ),
        CanvasCourseName(
            canvas_connection_id=1, canvas_course_id="2", local_course_id=2,
            name="CPSC 310", workflow_state="available",
        ),
    ]
    assert _match_course_name(course_names, "CPSC 310") is None


# Verifies: a legacy row with no workflow_state recorded (written before
# this column existed) sitting alongside a known-completed duplicate still
# resolves to the one that ISN'T known-completed — a null workflow_state
# is treated as "not known to be completed," not excluded outright.
def test_match_course_name_legacy_row_with_null_workflow_state_still_resolves():
    from app.models.canvas_course_name import CanvasCourseName
    from app.services.chat import _match_course_name

    course_names = [
        CanvasCourseName(
            canvas_connection_id=1, canvas_course_id="1", local_course_id=1,
            name="CPSC 310", workflow_state="completed",
        ),
        CanvasCourseName(
            canvas_connection_id=1, canvas_course_id="2", local_course_id=2,
            name="CPSC 310", workflow_state=None,
        ),
    ]
    match = _match_course_name(course_names, "CPSC 310")
    assert match is not None
    assert match.local_course_id == 2


def test_match_course_name_rejects_short_fuzzy_fragments():
    """#1301: generic short fragments must not fuzzy-resolve a course."""
    from app.models.canvas_course_name import CanvasCourseName
    from app.services.chat import _match_course_name

    course_names = [
        CanvasCourseName(
            canvas_connection_id=1, canvas_course_id="1", local_course_id=1,
            name="CPSC 310 - Software Engineering", workflow_state="available",
        ),
    ]
    assert _match_course_name(course_names, "CPS") is None
    assert _match_course_name(course_names, "CPSC 310") is not None


# ── Fuzzy substring fallback ─────────────────────────────────────────────

# Verifies: an unambiguous normalized-substring match still resolves when
# the model doesn't echo the course name verbatim (paraphrase/abbreviation).
def test_abbreviated_course_name_resolves_via_substring_fallback(client):
    headers = _register_with_canvas(client)

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = [{
            "id": uuid.uuid4().int % 10_000_000,
            "name": "CPSC 310 - Software Engineering", "course_code": "CPSC310",
            "enrollment_term_id": 1, "workflow_state": "available",
        }]
        courses_resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
        local_course_id = courses_resp.json()[0]["local_id"]
        active_resp = client.patch(
            "/api/v1/canvas/active-course", json={"local_course_id": local_course_id}, headers=headers,
        )
        assert active_resp.status_code == 200, active_resp.text

    # The model echoes a shortened form instead of the exact stored name.
    with patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=[])):
        body = _chat(
            client, headers, "show me my assignments for CPSC 310",
            '{"action": "fetch_assignments", "course_name": "CPSC 310"}',
        )
    assert body["is_error"] is False, body
    assert body["reply"]["assignments"] == []


# ── Modify-turn fork prevention ─────────────────────────────────────────

# Verifies: a modify turn is never forked to a different conversation even
# if the model's own course_name output names a different course — that
# used to raise an unhandled ToolExecutionError from update_message_content
# looking up pending_message_id against the wrong (forked) conversation.
def test_modify_turn_never_forks_even_with_conflicting_course_name(client):
    headers = _register_with_canvas(client)

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = [
            {"id": 501, "name": "CPSC 310", "course_code": "CPSC310", "enrollment_term_id": 1, "workflow_state": "available"},
            {"id": 502, "name": "CPSC 320", "course_code": "CPSC320", "enrollment_term_id": 1, "workflow_state": "available"},
        ]
        courses_resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
        courses = courses_resp.json()
        local_id_310 = next(c["local_id"] for c in courses if c["canvas_id"] == 501)
        active_resp = client.patch(
            "/api/v1/canvas/active-course", json={"local_course_id": local_id_310}, headers=headers,
        )
        assert active_resp.status_code == 200, active_resp.text

    create_output = (
        '{"action": "intent_preview", "course_name": "CPSC 310", "summary": "Create Quiz", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_id_310}, "title": "Quiz", '
        '"description": "A short quiz on course topics.", "due_date": "2030-01-01T00:00:00", '
        '"points_possible": 10}}'
    )
    first = _chat(client, headers, "create a quiz", create_output, local_course_id=local_id_310)
    assert first["is_error"] is False, first
    conversation_id = first["conversation_id"]
    pending_message_id = first["reply"]["pending_message_id"]

    # A misbehaving revision turn that echoes the OTHER course's name —
    # must not fork; must still apply as a normal modify.
    modify_output = (
        '{"action": "intent_preview", "course_name": "CPSC 320", "summary": "Create Quiz (renamed)", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_id_310}, "title": "Quiz 2", '
        '"description": "A short quiz on course topics.", "due_date": "2030-01-01T00:00:00", '
        '"points_possible": 10}}'
    )
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = modify_output
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

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["is_error"] is False, body
    assert body["conversation_id"] == conversation_id
    assert body["reply"]["proposed_action"]["title"] == "Quiz 2"

    conversations = _user_conversations(headers)
    assert len(conversations) == 1
    assert conversations[0]["course_id"] == local_id_310


# ── Orphaned preference-seeded conversation prevention ──────────────────

# Verifies: a brand-new, preference-seeded conversation whose first
# message names a DIFFERENT course mutates in place instead of forking —
# no permanently empty orphaned Conversation row left behind.
def test_fresh_conversation_mutates_in_place_instead_of_orphaning(client):
    headers = _register_with_canvas(client)

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = [
            {"id": 601, "name": "CPSC 310", "course_code": "CPSC310", "enrollment_term_id": 1, "workflow_state": "available"},
            {"id": 602, "name": "CPSC 320", "course_code": "CPSC320", "enrollment_term_id": 1, "workflow_state": "available"},
        ]
        courses_resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
        courses = courses_resp.json()
        local_id_310 = next(c["local_id"] for c in courses if c["canvas_id"] == 601)
        local_id_320 = next(c["local_id"] for c in courses if c["canvas_id"] == 602)
        # Sets CPSC 310 as the persisted active-course preference — the
        # NEXT brand-new conversation (conversation_id=None) will be
        # seeded with this course_id before anything is said in it.
        active_resp = client.patch(
            "/api/v1/canvas/active-course", json={"local_course_id": local_id_310}, headers=headers,
        )
        assert active_resp.status_code == 200, active_resp.text

    # Brand-new conversation (no conversation_id) whose first message
    # names the OTHER course — must mutate the same (seeded) conversation,
    # not fork and orphan it.
    with patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=[])):
        body = _chat(
            client, headers, "show me assignments for CPSC 320",
            '{"action": "fetch_assignments", "course_name": "CPSC 320"}',
            conversation_id=None,
        )
    assert body["is_error"] is False, body

    conversations = _user_conversations(headers)
    assert len(conversations) == 1, conversations
    assert conversations[0]["course_id"] == local_id_320
    assert _message_count(conversations[0]["id"]) == 2  # user + assistant


# ── Explicit active-course precedence ───────────────────────────────────

# Verifies: an explicitly client-supplied local_course_id (the "set active
# course" button, sent alongside this same message) wins over whatever
# course_name the model's own output happens to echo — never silently
# overridden.
def test_explicit_local_course_id_wins_over_model_course_name(client):
    headers = _register_with_canvas(client)

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = [
            {"id": 701, "name": "CPSC 310", "course_code": "CPSC310", "enrollment_term_id": 1, "workflow_state": "available"},
            {"id": 702, "name": "CPSC 320", "course_code": "CPSC320", "enrollment_term_id": 1, "workflow_state": "available"},
        ]
        courses_resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
        courses = courses_resp.json()
        local_id_310 = next(c["local_id"] for c in courses if c["canvas_id"] == 701)
        active_resp = client.patch(
            "/api/v1/canvas/active-course", json={"local_course_id": local_id_310}, headers=headers,
        )
        assert active_resp.status_code == 200, active_resp.text

    # First turn establishes conversation on CPSC 310 with real history.
    with patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=[])):
        first = _chat(
            client, headers, "show me assignments for CPSC 310",
            '{"action": "fetch_assignments", "course_name": "CPSC 310"}',
            local_course_id=local_id_310,
        )
    assert first["is_error"] is False, first
    conversation_id = first["conversation_id"]

    # Second turn explicitly re-selects CPSC 310 (button click,
    # local_course_id set) in the SAME request whose mocked model output
    # confusingly names CPSC 320 — the explicit selection must win. Also
    # proves local_course_id skips the pre-switch resolver entirely (only
    # one mocked response needed, not a "switched_to" one first).
    with patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=[])):
        second = _chat(
            client, headers, "how many assignments are there?",
            '{"action": "fetch_assignments", "course_name": "CPSC 320"}',
            conversation_id=conversation_id, local_course_id=local_id_310,
        )
    assert second["is_error"] is False, second
    assert second["conversation_id"] == conversation_id

    conversations = _user_conversations(headers)
    assert len(conversations) == 1
    assert conversations[0]["course_id"] == local_id_310
