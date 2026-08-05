"""Tests for fetch_submissions' resolved-assignment context and explicit
status grouping (see _run_fetch_submissions_chain in
app/backend/app/services/chat.py, and _build_submissions_result in
app/backend/app/mcp_tools/dispatcher.py) — closes the review gap where a
submissions result didn't say which assignment it was even about, and
"who's pending" had to be inferred from the raw per-submission list."""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.canvas import SubmissionResponse, SubmissionStatus

CANVAS_URL = "https://canvas.example.edu"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> tuple[dict, int]:
    email = f"subctx_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Submission Context Instructor", "email": email, "password": "Secret123!"},
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


def _submission(user_id: int, name: str, status: SubmissionStatus) -> SubmissionResponse:
    return SubmissionResponse(
        id=user_id, assignment_id=222, user_id=user_id, student_name=name,
        workflow_state="unsubmitted", status=status,
    )


# Verifies: the resolved assignment's own id/name/due date are attached to
# the result, and every status category is grouped explicitly — not just
# submitted-vs-not.
def test_fetch_submissions_includes_assignment_context_and_grouping(client):
    headers, _ = _register_with_canvas(client)
    submissions = [
        _submission(501, "Alice", SubmissionStatus.missing),
        _submission(502, "Bob", SubmissionStatus.submitted),
        _submission(503, "Charlie", SubmissionStatus.late),
        _submission(504, "Dana", SubmissionStatus.graded),
        _submission(505, "Eve", SubmissionStatus.excused),
        _submission(506, "Frank", SubmissionStatus.unsubmitted),
    ]

    llm_outputs = [
        '{"action": "fetch_submissions", "course_name": "CPSC 310", '
        '"assignment_reference": "the latest assignment"}',
        '{"assignment_id": 222}',
    ]

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.mcp_tools.dispatcher.get_submissions", new=AsyncMock(return_value=submissions)),
    ):
        body = _chat(client, headers, "show me submissions for the latest assignment", llm_outputs)

    assert body["is_error"] is False, body
    reply = body["reply"]

    assert reply["assignment"]["assignment_id"] == 222
    assert reply["assignment"]["assignment_name"] == "Final Project"
    assert reply["assignment"]["due_at"].startswith("2026-06-01")

    assert reply["counts"] == {
        "graded": 1, "submitted": 1, "late": 1,
        "missing": 1, "unsubmitted": 1, "excused": 1,
    }
    # pending_students = missing + unsubmitted combined.
    pending_names = {s["name"] for s in reply["pending_students"]}
    assert pending_names == {"Alice", "Frank"}
    assert [s["name"] for s in reply["late_students"]] == ["Charlie"]
    assert [s["name"] for s in reply["graded_students"]] == ["Dana"]
    assert [s["name"] for s in reply["excused_students"]] == ["Eve"]
    assert [s["name"] for s in reply["submitted_students"]] == ["Bob"]

    assert "Final Project" in reply["summary"]
    assert "Alice" in reply["summary"] and "Frank" in reply["summary"]


# Verifies: when every student has submitted, the summary says so plainly
# rather than an empty/confusing "0 students have not submitted".
def test_fetch_submissions_summary_when_nobody_pending(client):
    headers, _ = _register_with_canvas(client)
    submissions = [_submission(501, "Alice", SubmissionStatus.submitted)]

    llm_outputs = [
        '{"action": "fetch_submissions", "course_name": "CPSC 310", '
        '"assignment_reference": "the latest assignment"}',
        '{"assignment_id": 222}',
    ]

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.mcp_tools.dispatcher.get_submissions", new=AsyncMock(return_value=submissions)),
    ):
        body = _chat(client, headers, "show me submissions for the latest assignment", llm_outputs)

    assert body["is_error"] is False, body
    reply = body["reply"]
    assert reply["pending_students"] == []
    assert "every student has submitted" in reply["summary"]
    assert "Final Project" in reply["summary"]


# Verifies: a plain assignment_id already known (no assignment_reference
# resolution needed) still gets assignment context attached — the local
# Assignment row read for context doesn't depend on which resolution path
# ran.
def test_fetch_submissions_with_known_id_still_gets_assignment_context(client):
    headers, local_course_id = _register_with_canvas(client)
    submissions = [_submission(501, "Alice", SubmissionStatus.missing)]

    # First turn: fetch_assignments populates the local Assignment row with
    # the real title, exactly as it would if the model had already seen
    # this course's assignments earlier in the conversation.
    with patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())):
        first = _chat(
            client, headers, "show me my assignments",
            '{"action": "fetch_assignments", "course_name": "CPSC 310"}',
        )
    assert first["is_error"] is False, first
    conversation_id = first["conversation_id"]

    with patch("app.mcp_tools.dispatcher.get_submissions", new=AsyncMock(return_value=submissions)):
        second = _chat(
            client, headers, "show submissions for assignment 222",
            '{"action": "fetch_submissions", "course_name": "CPSC 310", "assignment_id": 222}',
            conversation_id=conversation_id,
        )

    assert second["is_error"] is False, second
    assert second["reply"]["assignment"]["assignment_name"] == "Final Project"
