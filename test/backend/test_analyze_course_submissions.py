"""Tests for analyze_course_submissions — the course-wide submission
overview behind the dashboard's "Analyse Missing Submissions" button.

Bug 12: that button used to send an open-ended "grade and submission
performance analysis" prompt that no tool could serve, so the model
answered from nothing and invented submission rates that contradicted the
instructor's actual course. These tests pin that the question now resolves
to a real server-side read, and that "missing"/"late" keep exactly the
definitions in app/backend/app/services/resolved_set.py.
"""
import uuid
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


def _register_with_canvas(client, *, set_active: bool = True) -> tuple[dict, int]:
    email = f"analyzesubs_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Analysis Instructor", "email": email, "password": "Secret123!"},
    )
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": f"test-token-{uuid.uuid4()}", "canvas_url": CANVAS_URL},
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
        if set_active:
            client.patch(
                "/api/v1/canvas/active-course",
                json={"local_course_id": local_course_id},
                headers=headers,
            )

    return headers, local_course_id


def _chat(client, headers, message, llm_output) -> dict:
    mock_adapter = AsyncMock()
    if isinstance(llm_output, list):
        mock_adapter.generate.side_effect = llm_output
    else:
        mock_adapter.generate.return_value = llm_output
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/", json={"message": message}, headers=headers
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


_ANALYZE = '{"action": "analyze_course_submissions", "course_name": "CPSC 310", "status": "missing"}'


# Verifies: the course-wide question resolves without naming an assignment.
# resolve_missing_submissions would have asked "which assignment?" here,
# which is the wrong answer to "analyse missing submissions" (#12).
def test_analyze_course_submissions_reports_every_assignment(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [
        _student("501", local_course_id, "Alice"),
        _student("502", local_course_id, "Bob"),
    ]
    submissions = [
        _submission(501, SubmissionStatus.missing, "Alice"),
        _submission(502, SubmissionStatus.submitted, "Bob"),
    ]

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        body = _chat(client, headers, "analyse missing submissions", _ANALYZE)

    assert body["is_error"] is False, body
    reply = body["reply"]
    assert reply["action"] == "analyze_course_submissions"
    assert reply["course"] == "CPSC 310"
    # Both assignments walked, one missing student on each.
    assert [entry["assignment_name"] for entry in reply["assignments"]] == [
        "Assignment 1",
        "Assignment 4",
    ]
    assert reply["total"] == 2
    assert all(entry["students"] == ["Alice"] for entry in reply["assignments"])
    # The names the instructor asked for are actually in the summary.
    assert "Alice" in reply["summary"]
    assert "Bob" not in reply["summary"]


# Verifies: a clean course reports zero rather than staying silent, so the
# instructor can tell "nothing missing" apart from "the tool didn't run".
def test_analyze_course_submissions_reports_a_clean_course(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice")]
    submissions = [_submission(501, SubmissionStatus.submitted, "Alice")]

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        body = _chat(client, headers, "analyse missing submissions", _ANALYZE)

    reply = body["reply"]
    assert reply["total"] == 0
    assert "No missing submissions" in reply["summary"]


# Verifies: "late" stays the mutually exclusive category resolved_set.py
# defines — a late submission was submitted, so it is never also missing.
def test_analyze_course_submissions_late_is_a_separate_category(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [
        _student("501", local_course_id, "Alice"),
        _student("502", local_course_id, "Bob"),
    ]
    submissions = [
        _submission(501, SubmissionStatus.missing, "Alice"),
        _submission(502, SubmissionStatus.late, "Bob"),
    ]
    late_action = (
        '{"action": "analyze_course_submissions", "course_name": "CPSC 310", '
        '"status": "late"}'
    )

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        body = _chat(client, headers, "who submitted late?", late_action)

    reply = body["reply"]
    assert reply["status"] == "late"
    assert "Bob" in reply["summary"]
    assert "Alice" not in reply["summary"]


# Verifies: inactive enrollments never appear, matching
# compute_submissions_by_status's active-roster cross-reference.
def test_analyze_course_submissions_excludes_inactive_students(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [
        _student("501", local_course_id, "Alice"),
        _student("502", local_course_id, "Dropped Student", enrollment_state="inactive"),
    ]
    submissions = [
        _submission(501, SubmissionStatus.missing, "Alice"),
        _submission(502, SubmissionStatus.missing, "Dropped Student"),
    ]

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        body = _chat(client, headers, "analyse missing submissions", _ANALYZE)

    reply = body["reply"]
    assert "Dropped Student" not in reply["summary"]
    assert reply["total"] == 2  # Alice, on both assignments


# Verifies: an empty course says so instead of returning a bare zero that
# reads like "everyone submitted".
def test_analyze_course_submissions_handles_a_course_with_no_assignments(client):
    headers, _local_course_id = _register_with_canvas(client)

    with patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=[])):
        body = _chat(client, headers, "analyse missing submissions", _ANALYZE)

    reply = body["reply"]
    assert reply["total"] == 0
    assert "no assignments yet" in reply["summary"]


# Verifies: with no active course and none named, the assistant states
# plainly that it cannot run — not a clarify round-trip that implies the
# request is still in flight.
def test_analyze_course_submissions_errors_without_a_course(client):
    headers, _local_course_id = _register_with_canvas(client, set_active=False)

    body = _chat(
        client,
        headers,
        "analyse missing submissions",
        '{"action": "analyze_course_submissions", "status": "missing"}',
    )

    reply = body["reply"]
    assert reply["action"] == "respond"
    assert "without knowing which course" in reply["message"]
    assert reply.get("question") is None


_LATE = (
    '{"action": "analyze_course_submissions", "course_name": "CPSC 310", '
    '"status": "late"}'
)


def _assignment(aid: int, name: str, published: bool = True) -> dict:
    return {
        "id": aid, "name": name, "description": None,
        "due_at": "2026-01-01T00:00:00+00:00", "points_possible": 10.0,
        "course_id": 1, "published": published,
    }


# Verifies: a late scan that finds nothing must not claim students are up to
# date. "late" only establishes that nothing arrived after the due date — it
# says nothing about work never submitted at all, so the old shared copy was
# bug 12 in the opposite direction: the assistant contradicting the course by
# reassuring the instructor about a category it never looked at.
def test_analyze_late_zero_does_not_claim_everyone_is_up_to_date(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice")]
    # Alice is MISSING, not late. A late scan therefore matches nothing.
    submissions = [_submission(501, SubmissionStatus.missing, "Alice")]

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        body = _chat(client, headers, "who submitted late?", _LATE)

    reply = body["reply"]
    assert reply["total"] == 0
    summary = reply["summary"]
    assert "No late submissions" in summary
    # The false assurance, in any of its old phrasings.
    assert "up to date" not in summary
    assert "every active student" not in summary
    # And it points at the category it did not cover.
    assert "missing" in summary.lower()


# Verifies: drafts are excluded. A draft is invisible to students and cannot
# have real submissions, so counting it registers every active student as
# missing something they were never assigned. course_overview.py draws this
# exact line for the dashboard; the chat answer has to agree with it.
def test_analyze_course_submissions_skips_unpublished_assignments(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice")]
    submissions = [_submission(501, SubmissionStatus.missing, "Alice")]
    assignments = [
        _assignment(111, "Published Assignment"),
        _assignment(999, "Draft Assignment", published=False),
    ]

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=assignments)),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        body = _chat(client, headers, "analyse missing submissions", _ANALYZE)

    reply = body["reply"]
    names = [entry["assignment_name"] for entry in reply["assignments"]]
    assert names == ["Published Assignment"]
    assert "Draft Assignment" not in reply["summary"]
    # Alice is missing on the one published assignment only, not on both.
    assert reply["total"] == 1


# Verifies: a course whose assignments are all drafts says so, rather than
# reporting a bare zero that reads as "everyone has submitted everything".
def test_analyze_course_submissions_reports_an_all_draft_course(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice")]
    submissions = [_submission(501, SubmissionStatus.missing, "Alice")]
    assignments = [_assignment(111, "Draft One", published=False)]

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=assignments)),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        body = _chat(client, headers, "analyse missing submissions", _ANALYZE)

    reply = body["reply"]
    assert reply["total"] == 0
    assert "unpublished" in reply["summary"]
    assert "up to date" not in reply["summary"]


# Verifies: a truncated name list says how many of the total it is showing.
# count is the full matched number while names are capped by a course-wide
# budget, so "Assignment 1: 60 (Alice, Bob, ...)" read as the complete roster.
def test_analyze_course_submissions_marks_truncated_name_lists(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student(str(500 + i), local_course_id, f"Student{i}") for i in range(60)]
    submissions = [
        _submission(500 + i, SubmissionStatus.missing, f"Student{i}") for i in range(60)
    ]

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=_two_assignments())),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=AsyncMock(return_value=students)),
    ):
        body = _chat(client, headers, "analyse missing submissions", _ANALYZE)

    reply = body["reply"]
    first, second = reply["assignments"]
    # Full count preserved, names capped at the budget, and flagged.
    assert first["count"] == 60
    assert len(first["students"]) == 50
    assert first["students_truncated"] is True
    assert "showing 50" in reply["summary"]
    # The budget is course-wide, so the second assignment gets no names at
    # all — it must show a bare count, never a partial list read as complete.
    assert second["count"] == 60
    assert second["students"] == []
    assert "Assignment 4: 60" in reply["summary"]


# Verifies: the roster is fetched once for the whole scan. Every assignment
# used to call compute_submissions_by_status, which re-fetched enrollments
# from Canvas, turning one dashboard click into one roster call per
# assignment.
def test_analyze_course_submissions_fetches_the_roster_once(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice")]
    submissions = [_submission(501, SubmissionStatus.missing, "Alice")]
    roster_mock = AsyncMock(return_value=students)

    assignments = [
        _assignment(111, "Assignment 1"),
        _assignment(222, "Assignment 2"),
        _assignment(333, "Assignment 3"),
    ]

    with (
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=assignments)),
        patch("app.services.resolved_set.get_submissions", new=AsyncMock(return_value=submissions)),
        patch("app.services.resolved_set.get_students", new=roster_mock),
    ):
        body = _chat(client, headers, "analyse missing submissions", _ANALYZE)

    assert body["reply"]["total"] == 3, body["reply"]
    # Three assignments, one roster call.
    assert roster_mock.await_count == 1, roster_mock.await_count


# Verifies: the per-assignment student name arrays never reach a later
# prompt. Read-action results are otherwise replayed to the model as full
# JSON, which would put up to 50 names per assignment into every subsequent
# turn — exactly what the sibling resolve_missing_submissions chain avoids by
# returning only {count, sample, handle}.
def test_analyze_history_for_llm_drops_student_names():
    import json

    from app.services.chat import _summarize_assistant_history_content

    stored = json.dumps(
        {
            "action": "analyze_course_submissions",
            "status": "missing",
            "course": "CPSC 310",
            "total": 2,
            "assignments": [
                {
                    "assignment_id": 111,
                    "assignment_name": "Assignment 1",
                    "due_at": None,
                    "count": 2,
                    "students": ["Alice Chen", "Bob Smith"],
                }
            ],
            "summary": "2 missing submission(s) ... Assignment 1: 2 (Alice Chen, Bob Smith).",
        }
    )

    compacted = _summarize_assistant_history_content("assistant", stored)

    assert "Alice Chen" not in compacted
    assert "Bob Smith" not in compacted
    # The counts a follow-up turn actually needs survive.
    data = json.loads(compacted)
    assert data["total"] == 2
    assert data["assignments"] == [
        {"assignment_id": 111, "assignment_name": "Assignment 1", "count": 2}
    ]


# Verifies: the nothing-matched summary is carried through intact, because
# that is where the "a late scan does not cover missing work" caveat lives
# and a follow-up turn must not lose it. It contains no names by definition.
def test_analyze_history_keeps_the_zero_result_caveat():
    import json

    from app.services.chat import _summarize_assistant_history_content

    summary = (
        "No late submissions in CPSC 310 across 2 published assignment(s). "
        "This does not cover work that was never submitted — ask about "
        "missing submissions for that."
    )
    stored = json.dumps(
        {
            "action": "analyze_course_submissions",
            "status": "late",
            "course": "CPSC 310",
            "total": 0,
            "assignments": [],
            "summary": summary,
        }
    )

    compacted = json.loads(_summarize_assistant_history_content("assistant", stored))
    assert compacted["summary"] == summary


# Verifies (#1507): selecting a course writes the indexed course_context
# envelope immediately, so follow-ups can use that selection without
# pasting the full course list into every turn.
def test_course_context_endpoint_writes_indexed_envelope(client):
    import asyncio

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.config import settings
    from app.models.conversation import Conversation

    headers, local_course_id = _register_with_canvas(client)

    response = client.post(
        "/api/v1/chat/course-context",
        json={"local_course_id": local_course_id},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["conversation_id"]
    context = body["course_context"]
    assert context["index"] == 1
    assert context["local_course_id"] == local_course_id
    assert context["course_name"] == "CPSC 310"
    assert context.get("course_code") == "CPSC310"
    assert "selected_at" in context

    # Same course again — index stays put.
    again = client.post(
        "/api/v1/chat/course-context",
        json={
            "local_course_id": local_course_id,
            "conversation_id": body["conversation_id"],
        },
        headers=headers,
    )
    assert again.status_code == 200
    assert again.json()["course_context"]["index"] == 1

    async def _load_memory():
        engine = create_async_engine(settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                memory = await db.scalar(
                    select(Conversation.field_memory).where(
                        Conversation.id == body["conversation_id"]
                    )
                )
                return dict(memory or {})
        finally:
            await engine.dispose()

    memory = asyncio.run(_load_memory())
    assert memory.get("course_context", {}).get("index") == 1
    assert memory.get("local_course_id") == local_course_id
