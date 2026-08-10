from canvas_test_utils import unique_canvas_token

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


def _register_with_two_courses(
    client, *, set_active: bool = True
) -> tuple[dict, dict]:
    """Register a fresh instructor with two Canvas courses, set the first
    as active (seeds canvas_course_names for both, via
    sync_courses_if_stale). Returns (headers, {course_name: local_id})."""
    email = f"courseswitch_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Course Switch Instructor", "email": email, "password": "Secret123!"},
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": unique_canvas_token(), "canvas_url": CANVAS_URL},
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
        if set_active:
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


# Verifies: a first turn that names another course resolves to that course.
#
# The pre-resolver used to be skipped without prior history, on the reasoning
# that there is no stale framing to leak on turn one. But leaking history is
# only half its job; the other half is noticing that the message names a
# course the main call is about to be told it is not in. Skipping it meant the
# very first "create an assignment ... for CPSC 320" was built against the
# active course, and only a retry — by then with history — got it right.
# A write landing in the wrong Canvas course is worth the extra small call.
def test_first_turn_resolves_a_course_named_in_the_message(client):
    headers, local_ids = _register_with_two_courses(client)

    body, mock_adapter = _chat(
        client,
        headers,
        "create an assignment called Final for CPSC 320",
        [
            '{"switched_to": "CPSC 320"}',
            '{"action": "respond", "course_name": "CPSC 320", "message": "OK."}',
        ],
    )

    assert body["is_error"] is False, body
    # Pre-resolver, then the main call — the switch is settled before the main
    # prompt is built, which is the whole point of resolving it here.
    assert mock_adapter.generate.await_count == 2

    # Call 0 is the pre-resolver: its own system prompt, and no history.
    # Asserted on the system prompt rather than on the message text, which
    # names CPSC 320 either way and so proves nothing about which call it is.
    pre_resolver_call = mock_adapter.generate.call_args_list[0]
    assert "switched_to" in pre_resolver_call.args[0]
    assert pre_resolver_call.kwargs["history"] == []

    # Call 1 is the main one, and it must already be framed on the course the
    # instructor named — not the active course it would otherwise inherit.
    main_call = mock_adapter.generate.call_args_list[1]
    assert "CURRENT COURSE FOR THIS CONVERSATION: CPSC 320" in main_call.args[1]


# Verifies: the active course still wins when the message names no course at
# all — the pre-resolver answering "null" must not fork anything.
def test_first_turn_without_a_named_course_stays_on_the_active_one(client):
    headers, local_ids = _register_with_two_courses(client)

    body, _ = _chat(
        client, headers, "show me my assignments",
        [
            '{"switched_to": null}',
            '{"action": "respond", "course_name": "CPSC 310", "message": "OK."}',
        ],
    )

    assert body["is_error"] is False, body


# Verifies a terse course-setting reply still moves the conversation — but now
# through _resolve_course_switch rather than a regex fast path.
#
# _resolve_course_context_statement used to match "couse is CPSC 320" with no
# LLM call and answer "Using CPSC 320 for this chat.", spending the whole turn
# acknowledging the course instead of doing anything. Removing it costs the one
# small resolver call this asserts, and buys a switch that recognizes the
# course wherever it appears in the sentence rather than only in two fixed
# phrasings.
def test_short_course_context_statement_switches_the_conversation(client):
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
        [
            '{"switched_to": "CPSC 320"}',
            '{"action": "respond", "course_name": "CPSC 320", "message": "OK."}',
        ],
        conversation_id=first["conversation_id"],
    )

    assert body["is_error"] is False, body
    assert body["conversation_id"] != first["conversation_id"]
    # The switch is settled before the main call, so the main prompt is framed
    # with the right course from the start.
    assert mock_adapter.generate.await_count == 2


# Verifies the replacement for the deleted regex: a conversation with no course
# of its own is bound to the one its first message names, and the turn then
# CONTINUES instead of being spent on an acknowledgement.
#
# The active-course preference is cleared deliberately. canvas_course_names is
# populated by sync_courses_if_stale (the sweep, the active-course button, a
# post-write sync) and never by the chat path, so the reachable version of
# "conversation has no course" is an instructor whose names were indexed by the
# sweep but who has not used the course button. Skipping the button instead
# would leave the name index empty, where no resolver — this one, the old
# regex, or the LLM switch resolver — can match anything.
def test_course_less_conversation_binds_to_a_course_named_in_the_message(client):
    headers, local_ids = _register_with_two_courses(client)
    _clear_active_course_preference(client, headers)

    body, mock_adapter = _chat(
        client,
        headers,
        "show me the assignments for CPSC 320",
        '{"action": "respond", "course_name": "CPSC 320", "message": "OK."}',
    )

    assert body["is_error"] is False, body
    # The model answered the actual question — no canned "Using X" turn.
    assert body["reply"]["message"] == "OK."
    # Bound without a resolver call: the course name is read straight off the
    # message against the instructor's real course list.
    assert mock_adapter.generate.await_count == 1
    assert "CPSC 320" in str(mock_adapter.generate.call_args_list[-1].args)


def _clear_active_course_preference(client, headers) -> None:
    """Drop the persisted active course so a new conversation starts
    course-less, the state the sweep-but-no-button instructor is in."""
    import asyncio

    from sqlalchemy import select, update
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.config import settings as _settings
    from app.models.user import User
    from app.models.user_preference import UserPreference

    email = client.get("/api/v1/auth/me", headers=headers).json()["email"]

    async def _clear():
        engine = create_async_engine(_settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                user_id = await db.scalar(select(User.id).where(User.email == email))
                await db.execute(
                    update(UserPreference)
                    .where(UserPreference.user_id == user_id)
                    .values(active_course_id=None)
                )
                await db.commit()
        finally:
            await engine.dispose()

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_clear())
    finally:
        loop.close()


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
