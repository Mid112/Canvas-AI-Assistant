"""Tests for update_assignment's assignment_reference resolution (see
_run_update_assignment_chain in app/backend/app/services/chat.py) —
mirrors fetch_submissions/resolve_missing_submissions' "resolve
server-side, one user turn, never trust the model with a raw ID"
pattern, but for a write action: the chain builds the intent_preview
directly instead of routing through execute_tool's own case."""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.canvas import AssignmentResponse

CANVAS_URL = "https://canvas.ubc.ca"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> tuple[dict, int]:
    email = f"updateref_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Update Reference Instructor", "email": email, "password": "secret123"},
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
    return response.json()


def _assignments() -> list[dict]:
    return [
        {
            "id": 111, "name": "Assignment 1", "description": None,
            "due_at": "2026-08-16T17:00:00+00:00", "points_possible": 55.0,
            "course_id": 1,
        },
        {
            "id": 222, "name": "final exam", "description": None,
            "due_at": "2026-07-31T22:59:00+00:00", "points_possible": 300.0,
            "course_id": 1,
        },
    ]


def _seed_local_assignment(
    local_course_id: int,
    canvas_assignment_id: int,
    *,
    title: str = "Seeded Assignment",
) -> None:
    """Persist a mirrored assignment so _resolve_course_and_assignment can
    verify a model-supplied assignment_id without calling Canvas."""
    import asyncio

    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.config import settings as _settings
    from app.models.assignment import Assignment

    async def _insert():
        engine = create_async_engine(_settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                db.add(
                    Assignment(
                        canvas_assignment_id=str(canvas_assignment_id),
                        title=title,
                        course_id=local_course_id,
                    )
                )
                await db.commit()
        finally:
            await engine.dispose()

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_insert())
    finally:
        loop.close()


def _tool_call_log_actions(conversation_id: int) -> list[str]:
    import asyncio

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.config import settings as _settings
    from app.models.tool_call_log import ToolCallLog

    async def _query():
        engine = create_async_engine(_settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                rows = await db.scalars(
                    select(ToolCallLog)
                    .where(ToolCallLog.conversation_id == conversation_id)
                    .order_by(ToolCallLog.id)
                )
                return [r.action_name for r in rows]
        finally:
            await engine.dispose()

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_query())
    finally:
        loop.close()


# Verifies: a natural-language assignment_reference resolves to the real
# Canvas ID and builds the intent_preview in the SAME turn — no
# fetch_assignments round trip shown to the user first.
def test_update_assignment_reference_resolves_and_builds_preview(client):
    headers, local_course_id = _register_with_canvas(client)

    llm_outputs = [
        '{"action": "update_assignment", "course_name": "CPSC 310", '
        '"assignment_reference": "final exam", "due_date": "2026-08-13T23:59:00"}',
        '{"assignment_id": 222}',
    ]

    with patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_assignments())):
        body = _chat(client, headers, "update the final exam due date to August 13th 2026", llm_outputs)

    assert body["is_error"] is False, body
    reply = body["reply"]
    assert reply["action"] == "intent_preview"
    assert reply["proposed_action"]["assignment_id"] == 222
    assert reply["proposed_action"]["due_date"] == "2026-08-13T23:59:00"
    assert reply["proposed_action"]["local_course_id"] == local_course_id
    # Only the requested field is present — title/description/points_possible
    # were never mentioned, so they must be omitted (preserved automatically).
    assert "title" not in reply["proposed_action"]
    assert "points_possible" not in reply["proposed_action"]
    assert "pending_message_id" in reply

    logs = _tool_call_log_actions(body["conversation_id"])
    assert logs == ["fetch_assignments"]


# Verifies: title, description, due_date, and points_possible can all be
# updated together via a resolved reference.
def test_update_assignment_reference_all_fields(client):
    headers, local_course_id = _register_with_canvas(client)

    llm_outputs = [
        '{"action": "update_assignment", "course_name": "CPSC 310", '
        '"assignment_reference": "assignment 1", "title": "Assignment One", '
        '"description": "Updated instructions", "due_date": "2026-08-20T23:59:00", '
        '"points_possible": 60}',
        '{"assignment_id": 111}',
    ]

    with patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_assignments())):
        body = _chat(client, headers, "update assignment 1 completely", llm_outputs)

    assert body["is_error"] is False, body
    proposed = body["reply"]["proposed_action"]
    assert proposed["assignment_id"] == 111
    assert proposed["title"] == "Assignment One"
    assert proposed["description"] == "Updated instructions"
    assert proposed["due_date"] == "2026-08-20T23:59:00"
    assert proposed["points_possible"] == 60


# Verifies: an unresolvable reference returns clarify, not an error or a
# guessed ID.
def test_update_assignment_unresolvable_reference_returns_clarify(client):
    headers, _ = _register_with_canvas(client)

    llm_outputs = [
        '{"action": "update_assignment", "course_name": "CPSC 310", '
        '"assignment_reference": "the makeup quiz", "due_date": "2026-08-13T23:59:00"}',
        '{"assignment_id": null}',
    ]

    with patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_assignments())):
        body = _chat(client, headers, "push back the makeup quiz", llm_outputs)

    assert body["is_error"] is False, body
    assert body["reply"]["clarify"] is True
    assert "Assignment 1" in body["reply"]["question"]
    assert "final exam" in body["reply"]["question"]
    assert "pending_message_id" not in body["reply"]


# Verifies: when assignment_id is already known AND mirrored locally, the
# resolver verifies it without a Canvas fetch_assignments call and still
# builds intent_preview in one turn.
def test_update_assignment_with_known_id_is_unaffected(client):
    headers, local_course_id = _register_with_canvas(client)
    _seed_local_assignment(local_course_id, 222, title="final exam")

    llm_output = (
        '{"action": "intent_preview", "course_name": "CPSC 310", '
        '"summary": "Update final exam due date", "proposed_action": '
        '{"action": "update_assignment", "local_course_id": ' + str(local_course_id) + ', '
        '"assignment_id": 222, "due_date": "2026-08-13T23:59:00"}}'
    )

    body = _chat(client, headers, "update assignment 222's due date", llm_output)

    assert body["is_error"] is False, body
    reply = body["reply"]
    assert reply["action"] == "intent_preview"
    assert reply["proposed_action"]["assignment_id"] == 222
    # Local mirror verified the ID — no live Canvas fetch needed.
    assert _tool_call_log_actions(body["conversation_id"]) == []


# Verifies: end to end — a resolved-reference preview confirms and
# actually calls Canvas with the resolved assignment_id.
def test_update_assignment_reference_confirm_writes_to_canvas(client):
    headers, local_course_id = _register_with_canvas(client)

    llm_outputs = [
        '{"action": "update_assignment", "course_name": "CPSC 310", '
        '"assignment_reference": "final exam", "due_date": "2026-08-13T23:59:00"}',
        '{"assignment_id": 222}',
    ]
    with patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_assignments())):
        body = _chat(client, headers, "update the final exam due date to August 13th 2026", llm_outputs)
    assert body["is_error"] is False, body
    conversation_id = body["conversation_id"]
    pending_message_id = body["reply"]["pending_message_id"]

    current = AssignmentResponse(
        id=222, course_id=local_course_id, name="final exam", description=None,
        due_at="2026-07-31T22:59:00", points_possible=300.0,
    )
    updated = AssignmentResponse(
        id=222, course_id=local_course_id, name="final exam", description=None,
        due_at="2026-08-13T23:59:00", points_possible=300.0,
    )
    with (
        patch("app.mcp_tools.dispatcher.get_assignment", new=AsyncMock(return_value=current)),
        patch("app.mcp_tools.dispatcher.update_course_assignment", new=AsyncMock(return_value=updated)) as mock_update,
    ):
        confirm_resp = client.post(
            "/api/v1/chat/confirm",
            json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
            headers=headers,
        )

    assert confirm_resp.status_code == 200, confirm_resp.text
    assert confirm_resp.json()["is_error"] is False
    mock_update.assert_awaited_once()
    assert mock_update.await_args.args[1] == 222  # the resolved assignment_id, not a guess
