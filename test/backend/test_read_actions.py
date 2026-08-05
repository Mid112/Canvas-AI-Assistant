"""Tests for direct-execute reads and fetch_submissions' chained
assignment resolution (see READ_ACTIONS / _run_tracked_read /
_run_fetch_submissions_chain in app/backend/app/services/chat.py)."""
import asyncio
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient

from app.main import app

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
    email = f"read_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Read Action Instructor", "email": email, "password": "Secret123!"},
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


def _two_assignments() -> list[dict]:
    return [
        {
            "id": 111, "name": "Assignment 1", "description": None,
            "due_at": "2026-01-01T00:00:00+00:00", "points_possible": 10.0,
            "course_id": 1,
        },
        {
            "id": 222, "name": "Final Project", "description": None,
            "due_at": "2026-06-01T00:00:00+00:00", "points_possible": 100.0,
            "course_id": 1,
        },
    ]


def _tool_call_logs(conversation_id: int) -> list[dict]:
    """Reads tool_call_logs rows directly — there is no HTTP endpoint for
    this (deliberate; the ask was for the log to exist, not a UI). A fresh
    engine avoids sharing the global engine's asyncpg pool across event
    loops, same pattern as conftest.py's admin_credentials fixture."""
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
                return [
                    {
                        "action_name": r.action_name,
                        "status": r.status,
                        "parameters": r.parameters,
                        "error_detail": r.error_detail,
                    }
                    for r in rows
                ]
        finally:
            await engine.dispose()

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_query())
    finally:
        loop.close()


# Verifies: a raw read action executes immediately with no preview/confirm.
def test_fetch_courses_executes_directly_and_is_tracked(client):
    headers, _ = _register_with_canvas(client)

    with patch("app.mcp_tools.dispatcher.get_courses", new=AsyncMock(return_value=[])):
        body = _chat(client, headers, "what courses do I have?", '{"action": "fetch_courses"}')

    assert body["is_error"] is False
    assert body["reply"]["courses"] == []
    assert "pending_message_id" not in body["reply"]
    assert "intent_preview" not in body["reply"]

    logs = _tool_call_logs(body["conversation_id"])
    assert len(logs) == 1
    assert logs[0]["action_name"] == "fetch_courses"
    assert logs[0]["status"] == "executed"
    assert logs[0]["parameters"] == {"action": "fetch_courses"}


# Verifies: a read wrapped in intent_preview is unwrapped and executed
# directly instead of producing a pointless "confirm this read" preview.
def test_intent_preview_wrapped_read_is_unwrapped_and_executed(client):
    headers, _ = _register_with_canvas(client)
    llm_output = (
        '{"action": "intent_preview", "summary": "List your courses", '
        '"proposed_action": {"action": "fetch_courses"}}'
    )

    with patch("app.mcp_tools.dispatcher.get_courses", new=AsyncMock(return_value=[])):
        body = _chat(client, headers, "what courses do I have?", llm_output)

    assert body["is_error"] is False
    assert body["reply"]["courses"] == []
    assert "pending_message_id" not in body["reply"]

    logs = _tool_call_logs(body["conversation_id"])
    assert len(logs) == 1
    assert logs[0]["action_name"] == "fetch_courses"
    assert logs[0]["status"] == "executed"


# Verifies: get_active_course executes directly but is not tracked.
def test_get_active_course_executes_directly_without_tracking(client):
    headers, _ = _register_with_canvas(client)

    body = _chat(client, headers, "what's my active course?", '{"action": "get_active_course"}')

    assert body["is_error"] is False
    assert "active_course" in body["reply"]
    assert _tool_call_logs(body["conversation_id"]) == []


# Verifies: a failed tracked read is marked failed with the error detail.
def test_tracked_read_marks_failed_on_canvas_error(client):
    headers, local_course_id = _register_with_canvas(client)

    with patch(
        "app.mcp_tools.dispatcher.get_students",
        new=AsyncMock(
            side_effect=HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Canvas server error: 503")
        ),
    ):
        body = _chat(
            client, headers, "who is in my course?",
            '{"action": "fetch_students", "course_name": "CPSC 310"}',
        )

    assert body["is_error"] is True
    assert body["reply"]["error"] == "Canvas server error: 503"

    logs = _tool_call_logs(body["conversation_id"])
    assert len(logs) == 1
    assert logs[0]["action_name"] == "fetch_students"
    assert logs[0]["status"] == "failed"
    assert "Canvas server error: 503" in logs[0]["error_detail"]
    assert logs[0]["parameters"]["local_course_id"] == local_course_id


# Verifies: an explicit assignment_id that verifies locally skips the chain.
def test_fetch_submissions_explicit_verified_assignment_id_skips_chain(client):
    headers, local_course_id = _register_with_canvas(client)

    # Populate the local assignments table via a real fetch_assignments turn.
    with patch(
        "app.services.canvas.fetch_assignments",
        new=AsyncMock(return_value=[{
            "id": 10, "name": "Assignment 1", "description": None,
            "due_at": None, "points_possible": 100.0, "course_id": 1,
        }]),
    ):
        first = _chat(
            client, headers, "show me the assignments",
            '{"action": "fetch_assignments", "course_name": "CPSC 310"}',
        )
    assert first["is_error"] is False
    conversation_id = first["conversation_id"]
    logs_after_first = _tool_call_logs(conversation_id)

    with patch("app.mcp_tools.dispatcher.get_submissions", new=AsyncMock(return_value=[])):
        second = _chat(
            client, headers, "show me submissions for assignment 1",
            '{"action": "fetch_submissions", "course_name": "CPSC 310", "assignment_id": 10}',
            conversation_id=conversation_id,
        )

    assert second["is_error"] is False
    assert second["reply"]["submissions"] == []

    new_logs = _tool_call_logs(conversation_id)[len(logs_after_first):]
    assert [row["action_name"] for row in new_logs] == ["fetch_submissions"]
    assert new_logs[0]["parameters"]["assignment_id"] == 10
    assert new_logs[0]["parameters"]["local_course_id"] == local_course_id


# Verifies: an assignment_id that does not verify locally (never synced /
# hallucinated) falls back to the full resolution chain instead of being
# trusted and sent straight to Canvas.
def test_fetch_submissions_unverified_assignment_id_falls_back_to_chain(client):
    headers, _ = _register_with_canvas(client)
    assignments_payload = _two_assignments()

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=assignments_payload)),
        patch("app.mcp_tools.dispatcher.get_submissions", new=AsyncMock(return_value=[])),
    ):
        body = _chat(
            client, headers, "show me submissions for the latest assignment",
            [
                '{"action": "fetch_submissions", "course_name": "CPSC 310", "assignment_id": 999}',
                '{"assignment_id": 222}',
            ],
        )

    assert body["is_error"] is False
    assert body["reply"]["submissions"] == []

    logs = _tool_call_logs(body["conversation_id"])
    assert [row["action_name"] for row in logs] == ["fetch_assignments", "fetch_submissions"]
    assert all(row["status"] == "executed" for row in logs)
    assert logs[1]["parameters"]["assignment_id"] == 222


# Verifies: assignment_reference alone (no assignment_id) runs the full
# chain and resolves "the latest assignment" via the dedicated resolver call.
def test_fetch_submissions_reference_only_runs_full_chain(client):
    headers, _ = _register_with_canvas(client)
    assignments_payload = _two_assignments()

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=assignments_payload)),
        patch("app.mcp_tools.dispatcher.get_submissions", new=AsyncMock(return_value=[])) as mock_submissions,
    ):
        body = _chat(
            client, headers, "show me submissions for the latest assignment",
            [
                '{"action": "fetch_submissions", "course_name": "CPSC 310", '
                '"assignment_reference": "the latest assignment"}',
                '{"assignment_id": 222}',
            ],
        )

    assert body["is_error"] is False
    assert body["reply"]["submissions"] == []
    assert mock_submissions.await_args.args[1] == 222

    logs = _tool_call_logs(body["conversation_id"])
    assert [row["action_name"] for row in logs] == ["fetch_assignments", "fetch_submissions"]


# Verifies: an unresolvable/ambiguous reference returns clarify, not an error.
def test_fetch_submissions_unresolvable_reference_returns_clarify(client):
    headers, _ = _register_with_canvas(client)
    assignments_payload = [
        {"id": 111, "name": "Assignment 1", "description": None, "due_at": None, "points_possible": 10.0, "course_id": 1},
        {"id": 222, "name": "Assignment 2", "description": None, "due_at": None, "points_possible": 10.0, "course_id": 1},
    ]

    with patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=assignments_payload)):
        body = _chat(
            client, headers, "show me submissions for that one assignment",
            [
                '{"action": "fetch_submissions", "course_name": "CPSC 310", '
                '"assignment_reference": "that one"}',
                '{"assignment_id": null}',
            ],
        )

    assert body["is_error"] is False
    assert body["reply"]["clarify"] is True
    assert "Assignment 1" in body["reply"]["question"]
    assert "Assignment 2" in body["reply"]["question"]


# Verifies: a course with no assignments yet returns clarify, not an error.
def test_fetch_submissions_no_assignments_returns_clarify(client):
    headers, _ = _register_with_canvas(client)

    with patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=[])):
        body = _chat(
            client, headers, "show me submissions for the latest assignment",
            '{"action": "fetch_submissions", "course_name": "CPSC 310", "assignment_reference": "the latest assignment"}',
        )

    assert body["is_error"] is False
    assert body["reply"]["clarify"] is True
    assert "no assignments yet" in body["reply"]["question"]


# Verifies: write actions are completely unaffected by any of this — still
# gated behind intent_preview/confirm exactly as before.
def test_write_action_is_still_gated_behind_preview(client):
    headers, local_course_id = _register_with_canvas(client)

    llm_output = (
        '{"action": "intent_preview", "summary": "Create Assignment 1", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "Assignment 1", '
        '"description": "Peer evaluation", "due_date": "2030-01-01T00:00:00", '
        '"points_possible": 100}}'
    )

    with patch("app.mcp_tools.dispatcher.create_course_assignment", new=AsyncMock()) as mock_create:
        body = _chat(client, headers, "create assignment 1", llm_output)

    assert body["is_error"] is False
    assert body["reply"]["action"] == "intent_preview"
    assert "pending_message_id" in body["reply"]
    mock_create.assert_not_called()
    # Writes are not tracked in tool_call_logs — that table is read-only.
    assert _tool_call_logs(body["conversation_id"]) == []
