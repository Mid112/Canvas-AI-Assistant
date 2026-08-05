"""Multi-turn field-memory persistence for resolved assignment/student refs (#1432).

Unit coverage for merge helpers lives in test_field_memory_unit.py. This
module closes the remaining acceptance gap: a successful read must persist
refs, and a follow-up turn must surface them in FIELD MEMORY so the model
can reuse "that assignment" / "the first assignment" without clarifying.
"""

from __future__ import annotations

import asyncio
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.main import app
from app.models.conversation import Conversation

CANVAS_URL = "https://canvas.example.edu"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> tuple[dict, int]:
    email = f"field_mem_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Field Memory Instructor", "email": email, "password": "Secret123!"},
    )
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": CANVAS_URL},
            headers=headers,
        )

    canvas_course_id = uuid.uuid4().int % 10_000_000
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = [
            {
                "id": canvas_course_id,
                "name": "CPSC 310",
                "course_code": "CPSC310",
                "enrollment_term_id": 1,
                "workflow_state": "available",
            }
        ]
        resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
        local_course_id = resp.json()[0]["local_id"]
        active_resp = client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_course_id},
            headers=headers,
        )
        assert active_resp.status_code == 200, active_resp.text

    return headers, local_course_id


def _chat(client, headers, message, llm_output, conversation_id=None):
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


def _conversation_field_memory(conversation_id: int) -> dict:
    async def _query():
        engine = create_async_engine(settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                memory = await db.scalar(
                    select(Conversation.field_memory).where(Conversation.id == conversation_id)
                )
                return dict(memory or {})
        finally:
            await engine.dispose()

    return asyncio.run(_query())


def _two_assignments() -> list[dict]:
    return [
        {
            "id": 111,
            "name": "Assignment 1",
            "description": None,
            "due_at": "2026-01-01T00:00:00+00:00",
            "points_possible": 10.0,
            "course_id": 1,
            "published": True,
        },
        {
            "id": 222,
            "name": "Final Project",
            "description": None,
            "due_at": "2026-06-01T00:00:00+00:00",
            "points_possible": 100.0,
            "course_id": 1,
            "published": True,
        },
    ]


# Verifies: Successful fetch_assignments persists assignment ids/names into
# conversation field_memory, and the next turn injects FIELD MEMORY so a
# natural follow-up ("that assignment") can reuse the resolved id without
# clarifying (#1432).
def test_read_then_followup_reuses_persisted_assignment_without_clarify(client):
    headers, _local_course_id = _register_with_canvas(client)
    assignments = _two_assignments()

    with patch(
        "app.services.canvas.fetch_assignments",
        new=AsyncMock(return_value=assignments),
    ):
        first, _ = _chat(
            client,
            headers,
            "show me the assignments",
            '{"action": "fetch_assignments", "course_name": "CPSC 310"}',
        )

    assert first["is_error"] is False, first
    conversation_id = first["conversation_id"]

    memory = _conversation_field_memory(conversation_id)
    assert memory["assignment_id"] == 111
    assert memory["assignment_reference"] == "Assignment 1"
    recent_ids = {entry["id"] for entry in memory["recent_assignments"]}
    recent_names = {entry["name"] for entry in memory["recent_assignments"]}
    assert recent_ids == {111, 222}
    assert recent_names == {"Assignment 1", "Final Project"}
    assert len(memory["recent_assignments"]) <= 5

    with patch(
        "app.mcp_tools.dispatcher.get_submissions",
        new=AsyncMock(return_value=[]),
    ) as mock_submissions:
        second, mock_adapter = _chat(
            client,
            headers,
            "show submissions for that assignment",
            (
                '{"action": "fetch_submissions", "course_name": "CPSC 310", '
                '"assignment_id": 111}'
            ),
            conversation_id=conversation_id,
        )

    assert second["is_error"] is False, second
    assert second["reply"].get("clarify") is not True
    assert second["reply"]["submissions"] == []
    mock_submissions.assert_awaited()
    assert mock_submissions.await_args.args[1] == 111

    system_prompt = mock_adapter.generate.call_args.args[0]
    assert "FIELD MEMORY" in system_prompt
    assert "Assignment 1" in system_prompt
    assert "Final Project" in system_prompt
    assert '"assignment_id": 111' in system_prompt


# Verifies: Successful fetch_students persists student refs, and a follow-up
# turn sees them in FIELD MEMORY for natural reuse (#1432).
def test_read_then_followup_surfaces_persisted_student_refs_in_field_memory(client):
    from app.schemas.student import StudentResponse

    headers, local_course_id = _register_with_canvas(client)
    students = [
        StudentResponse(
            id=1,
            canvas_user_id="9001",
            course_id=local_course_id,
            name="Alice",
            enrollment_state="active",
        ),
        StudentResponse(
            id=2,
            canvas_user_id="9002",
            course_id=local_course_id,
            name="Bob",
            enrollment_state="active",
        ),
    ]

    with patch(
        "app.mcp_tools.dispatcher.get_students",
        new=AsyncMock(return_value=students),
    ):
        first, _ = _chat(
            client,
            headers,
            "who is in my course?",
            '{"action": "fetch_students", "course_name": "CPSC 310"}',
        )

    assert first["is_error"] is False, first
    conversation_id = first["conversation_id"]
    memory = _conversation_field_memory(conversation_id)
    recent = memory.get("recent_students") or []
    assert {entry["id"] for entry in recent} == {9001, 9002}
    assert {entry["name"] for entry in recent} == {"Alice", "Bob"}

    second, mock_adapter = _chat(
        client,
        headers,
        "tell me about the first student",
        '{"action": "respond", "message": "Alice is enrolled."}',
        conversation_id=conversation_id,
    )
    assert second["is_error"] is False, second
    system_prompt = mock_adapter.generate.call_args.args[0]
    assert "FIELD MEMORY" in system_prompt
    assert "Alice" in system_prompt
    assert "Bob" in system_prompt
