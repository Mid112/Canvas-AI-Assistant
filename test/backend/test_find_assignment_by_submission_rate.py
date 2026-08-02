"""Tests for find_assignment_by_submission_rate (see compute_submission_rate/
find_assignments_by_submission_rate in
app/backend/app/services/assignment_rate.py, and
_run_find_assignment_by_submission_rate_chain in
app/backend/app/services/chat.py)."""
import asyncio
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.canvas import SubmissionResponse, SubmissionStatus
from app.schemas.student import StudentResponse

CANVAS_URL = "https://canvas.example.edu"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> tuple[dict, int]:
    email = f"submrate_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Submission Rate Instructor", "email": email, "password": "secret123"},
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


def _chat(client, headers, message, llm_output, conversation_id=None) -> tuple[dict, AsyncMock]:
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


def _submission(user_id: int, assignment_id: int, status: SubmissionStatus) -> SubmissionResponse:
    return SubmissionResponse(
        id=user_id, assignment_id=assignment_id, user_id=user_id,
        workflow_state="unsubmitted", status=status,
    )


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


# Verifies: when multiple assignments qualify for the threshold, "the
# last" (latest due date) among them is picked — not the first, not the
# lowest rate — and (since find_assignment_by_submission_rate is a
# _CHAINABLE_READ_ACTIONS action) the loop asks the model what to do next
# in the SAME turn, correctly threading the resolved assignment_id/due_date
# into that follow-up call rather than terminating on the raw read result.
def test_picks_latest_due_date_among_qualifying_assignments_and_chains_into_update(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice"), _student("502", local_course_id, "Bob")]

    async def submissions_side_effect(local_course_id_arg, assignment_id, user, canvas_url, db):
        # Both assignments are fully unsubmitted (0% rate) — both qualify
        # for "below 30%"; only due date should break the tie.
        return [
            _submission(501, assignment_id, SubmissionStatus.missing),
            _submission(502, assignment_id, SubmissionStatus.missing),
        ]

    llm_outputs = [
        '{"action": "find_assignment_by_submission_rate", "course_name": "CPSC 310", '
        '"comparator": "below", "threshold_percent": 30}',
        # The follow-up turn, given the resolved assignment in its prompt
        # (asserted below), proposes the write the original request wanted.
        '{"action": "intent_preview", "course_name": "CPSC 310", '
        '"summary": "Push back Assignment 4 by 3 days", "proposed_action": '
        '{"action": "update_assignment", "local_course_id": ' + str(local_course_id) + ', '
        '"assignment_id": 222, "due_date": "2026-06-04T00:00:00"}}',
    ]

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.assignment_rate.get_submissions", new=AsyncMock(side_effect=submissions_side_effect)),
        patch("app.services.assignment_rate.get_students", new=AsyncMock(return_value=students)),
    ):
        body, mock_adapter = _chat(
            client, headers,
            "push back the last assignment with fewer than 30% submissions by 3 days",
            llm_outputs,
        )

    assert body["is_error"] is False, body
    assert mock_adapter.generate.await_count == 2

    # The second call's prompt must carry step 1's real, correctly-resolved
    # result — not the raw fetch_assignments dump, and not a guess.
    followup_prompt = mock_adapter.generate.call_args_list[1].args[1]
    assert '"matched": true' in followup_prompt
    assert '"assignment_id": 222' in followup_prompt  # "Assignment 4" — the later due date
    assert '"submission_rate_percent": 0.0' in followup_prompt

    reply = body["reply"]
    assert reply["action"] == "intent_preview"
    assert reply["proposed_action"]["assignment_id"] == 222
    assert reply["proposed_action"]["due_date"] == "2026-06-04T00:00:00"

    logs = _tool_call_log_actions(body["conversation_id"])
    assert logs == ["fetch_assignments", "find_assignment_by_submission_rate"]


# Verifies: the "above" comparator selects assignments above the
# threshold instead of below.
def test_above_comparator_selects_high_submission_rate(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice"), _student("502", local_course_id, "Bob")]

    async def submissions_side_effect(local_course_id_arg, assignment_id, user, canvas_url, db):
        if assignment_id == 111:
            return [
                _submission(501, assignment_id, SubmissionStatus.graded),
                _submission(502, assignment_id, SubmissionStatus.graded),
            ]
        return [
            _submission(501, assignment_id, SubmissionStatus.missing),
            _submission(502, assignment_id, SubmissionStatus.missing),
        ]

    llm_outputs = [
        '{"action": "find_assignment_by_submission_rate", "course_name": "CPSC 310", '
        '"comparator": "above", "threshold_percent": 50}',
        '{"action": "respond", "course_name": "CPSC 310", "message": "Assignment 1 has a 100% submission rate."}',
    ]

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.assignment_rate.get_submissions", new=AsyncMock(side_effect=submissions_side_effect)),
        patch("app.services.assignment_rate.get_students", new=AsyncMock(return_value=students)),
    ):
        body, mock_adapter = _chat(
            client, headers, "find an assignment with over half the class submitted", llm_outputs,
        )

    assert body["is_error"] is False, body
    assert mock_adapter.generate.await_count == 2
    followup_prompt = mock_adapter.generate.call_args_list[1].args[1]
    assert '"assignment_id": 111' in followup_prompt
    assert '"submission_rate_percent": 100.0' in followup_prompt


# Verifies: no assignment meeting the threshold still chains (the model is
# told "matched: false" and gets to decide what to say), rather than
# raising an error or clarify.
def test_no_matching_assignment_still_chains_to_a_response(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice"), _student("502", local_course_id, "Bob")]

    llm_outputs = [
        '{"action": "find_assignment_by_submission_rate", "course_name": "CPSC 310", '
        '"comparator": "below", "threshold_percent": 30}',
        '{"action": "respond", "course_name": "CPSC 310", '
        '"message": "No assignment currently has fewer than 30% submissions."}',
    ]

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch(
            "app.services.assignment_rate.get_submissions",
            new=AsyncMock(return_value=[
                _submission(501, 0, SubmissionStatus.graded),
                _submission(502, 0, SubmissionStatus.graded),
            ]),
        ),
        patch("app.services.assignment_rate.get_students", new=AsyncMock(return_value=students)),
    ):
        body, mock_adapter = _chat(
            client, headers, "find the last assignment with fewer than 30% submissions", llm_outputs,
        )

    assert body["is_error"] is False, body
    assert mock_adapter.generate.await_count == 2
    followup_prompt = mock_adapter.generate.call_args_list[1].args[1]
    assert '"matched": false' in followup_prompt

    reply = body["reply"]
    assert reply["action"] == "respond"
    assert "clarify" not in reply


# Verifies: a course with no assignments yet also chains (matched: false
# with a plain explanation reaches the follow-up call), not an error.
def test_no_assignments_still_chains_to_a_response(client):
    headers, _ = _register_with_canvas(client)

    llm_outputs = [
        '{"action": "find_assignment_by_submission_rate", "course_name": "CPSC 310", '
        '"comparator": "below", "threshold_percent": 30}',
        '{"action": "respond", "course_name": "CPSC 310", "message": "CPSC 310 has no assignments yet."}',
    ]

    with patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=[])):
        body, mock_adapter = _chat(
            client, headers, "find the last assignment with fewer than 30% submissions", llm_outputs,
        )

    assert body["is_error"] is False, body
    assert mock_adapter.generate.await_count == 2
    followup_prompt = mock_adapter.generate.call_args_list[1].args[1]
    assert "no assignments yet" in followup_prompt

    assert body["reply"]["action"] == "respond"
