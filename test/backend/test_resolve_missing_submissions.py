"""Tests for resolve_missing_submissions and the ResolvedSet handle it
produces (see compute_missing_submissions/create_resolved_set/
materialize_resolved_set in app/backend/app/services/resolved_set.py, and
_run_resolve_missing_submissions_chain / recipient_handle in
app/backend/app/services/chat.py)."""
import asyncio
import uuid
from datetime import UTC, datetime, timedelta
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
    email = f"missingsubs_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Missing Submissions Instructor", "email": email, "password": "secret123"},
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


def _resolved_sets(conversation_id: int) -> list[dict]:
    """Reads resolved_sets rows directly — same pattern as
    test_send_message_resolution.py's _tool_call_logs helper."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.config import settings as _settings
    from app.models.resolved_set import ResolvedSet

    async def _query():
        engine = create_async_engine(_settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                rows = await db.scalars(
                    select(ResolvedSet)
                    .where(ResolvedSet.conversation_id == conversation_id)
                    .order_by(ResolvedSet.handle)
                )
                return [
                    {
                        "handle": r.handle, "kind": r.kind, "query": r.query,
                        "snapshot_recipients": r.snapshot_recipients,
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


def _expire_resolved_set(handle: str) -> None:
    """Forces a resolved set into the past for TTL testing — same
    raw-engine-per-call pattern as _resolved_sets."""
    from sqlalchemy import update

    from app.config import settings as _settings
    from app.models.resolved_set import ResolvedSet

    async def _run():
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

        engine = create_async_engine(_settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                await db.execute(
                    update(ResolvedSet)
                    .where(ResolvedSet.handle == handle)
                    .values(expires_at=datetime.now(UTC) - timedelta(hours=1))
                )
                await db.commit()
        finally:
            await engine.dispose()

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_run())
    finally:
        loop.close()


def _tool_call_log_actions(conversation_id: int) -> list[str]:
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


# Verifies: resolve_missing_submissions filters to Canvas-"missing" +
# actively-enrolled students only (graded/excused submissions and inactive
# enrollments are excluded), returns a compact count/sample/handle — never
# the raw list — and persists a matching ResolvedSet row.
def test_resolve_missing_submissions_filters_and_persists_handle(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [
        _student("501", local_course_id, "Alice"),
        _student("502", local_course_id, "Bob"),
        _student("503", local_course_id, "Charlie", enrollment_state="inactive"),
        _student("504", local_course_id, "Dana"),
    ]
    submissions = [
        _submission(501, SubmissionStatus.missing, "Alice"),
        _submission(502, SubmissionStatus.graded, "Bob"),
        _submission(503, SubmissionStatus.missing, "Charlie"),  # inactive — excluded
        _submission(504, SubmissionStatus.excused, "Dana"),
    ]

    llm_outputs = [
        '{"action": "resolve_missing_submissions", "course_name": "CPSC 310", '
        '"assignment_reference": "assignment 4"}',
        '{"assignment_id": 222}',
    ]

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        body = _chat(client, headers, "who's missing assignment 4?", llm_outputs)

    assert body["is_error"] is False, body
    reply = body["reply"]
    assert reply["action"] == "resolve_missing_submissions"
    assert reply["count"] == 1
    assert reply["sample"] == ["Alice"]
    assert reply["handle"].startswith("rs_")

    rows = _resolved_sets(body["conversation_id"])
    assert len(rows) == 1
    assert rows[0]["handle"] == reply["handle"]
    assert rows[0]["kind"] == "missing_submissions"
    assert rows[0]["query"] == {"local_course_id": local_course_id, "assignment_id": 222}
    assert rows[0]["snapshot_recipients"] == [{"user_id": 501, "name": "Alice"}]

    logs = _tool_call_log_actions(body["conversation_id"])
    assert logs == ["fetch_assignments", "resolve_missing_submissions"]


# Verifies: a course with no assignments yet still returns clarify (shared
# _resolve_course_and_assignment helper behavior, unchanged from
# fetch_submissions' existing test coverage).
def test_resolve_missing_submissions_no_assignments_returns_clarify(client):
    headers, _ = _register_with_canvas(client)

    with patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=[])):
        body = _chat(
            client, headers, "who's missing assignment 4?",
            '{"action": "resolve_missing_submissions", "course_name": "CPSC 310", '
            '"assignment_reference": "assignment 4"}',
        )

    assert body["is_error"] is False
    assert body["reply"]["clarify"] is True
    assert "no assignments yet" in body["reply"]["question"]


# Verifies: a later send_message turn can materialize a resolve_missing_submissions
# handle into real recipients, scoped to the conversation that created it.
def test_send_message_recipient_handle_materializes_recipients(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice")]
    submissions = [_submission(501, SubmissionStatus.missing, "Alice")]

    resolve_outputs = [
        '{"action": "resolve_missing_submissions", "course_name": "CPSC 310", '
        '"assignment_reference": "assignment 4"}',
        '{"assignment_id": 222}',
    ]
    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        first = _chat(client, headers, "who's missing assignment 4?", resolve_outputs)
    assert first["is_error"] is False, first
    conversation_id = first["conversation_id"]
    handle = first["reply"]["handle"]

    send_outputs = [
        # Real prior history now exists, so _resolve_course_switch fires
        # first (see test_course_switch_resolution.py) — no course named,
        # so it reports no switch.
        '{"switched_to": null}',
        '{"action": "send_message", "course_name": "CPSC 310", "subject": "Reminder", '
        f'"body": "Please submit assignment 4.", "recipient_handle": "{handle}"}}',
    ]
    second = _chat(
        client, headers, "remind them", send_outputs, conversation_id=conversation_id,
    )

    assert second["is_error"] is False, second
    reply = second["reply"]
    assert reply["action"] == "intent_preview"
    assert reply["proposed_action"]["recipient_canvas_user_ids"] == [501]
    assert reply["proposed_action"]["recipient_names"] == ["Alice"]


# Verifies: a handle from a different conversation is rejected (ownership
# check), not silently materialized — this is the auth boundary, not just
# a lookup.
def test_recipient_handle_from_other_conversation_is_rejected(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice")]
    submissions = [_submission(501, SubmissionStatus.missing, "Alice")]

    resolve_outputs = [
        '{"action": "resolve_missing_submissions", "course_name": "CPSC 310", '
        '"assignment_reference": "assignment 4"}',
        '{"assignment_id": 222}',
    ]
    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        first = _chat(client, headers, "who's missing assignment 4?", resolve_outputs)
    assert first["is_error"] is False, first
    handle = first["reply"]["handle"]

    # A brand-new, unrelated conversation for the same user/course.
    other = _chat(
        client, headers, "message them",
        '{"action": "send_message", "course_name": "CPSC 310", "subject": "Reminder", '
        f'"body": "Please submit.", "recipient_handle": "{handle}"}}',
        conversation_id=None,
    )

    assert other["is_error"] is False, other
    assert other["conversation_id"] != first["conversation_id"]
    assert other["reply"]["clarify"] is True


# Verifies: an expired handle is rejected the same way as an unknown one.
def test_expired_recipient_handle_returns_clarify(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice")]
    submissions = [_submission(501, SubmissionStatus.missing, "Alice")]

    resolve_outputs = [
        '{"action": "resolve_missing_submissions", "course_name": "CPSC 310", '
        '"assignment_reference": "assignment 4"}',
        '{"assignment_id": 222}',
    ]
    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        first = _chat(client, headers, "who's missing assignment 4?", resolve_outputs)
    assert first["is_error"] is False, first
    conversation_id = first["conversation_id"]
    handle = first["reply"]["handle"]
    _expire_resolved_set(handle)

    send_outputs = [
        '{"switched_to": null}',
        '{"action": "send_message", "course_name": "CPSC 310", "subject": "Reminder", '
        f'"body": "Please submit.", "recipient_handle": "{handle}"}}',
    ]
    second = _chat(
        client, headers, "remind them", send_outputs, conversation_id=conversation_id,
    )

    assert second["is_error"] is False, second
    assert second["reply"]["clarify"] is True
