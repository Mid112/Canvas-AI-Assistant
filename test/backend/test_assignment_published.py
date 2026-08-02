import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

CANVAS_URL = "https://canvas.example.edu"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def _register_with_canvas(client) -> tuple[dict, int]:
    """Register a fresh instructor, connect Canvas, seed one course. Returns (headers, local_course_id)."""
    email = f"published_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Instructor", "email": email, "password": "secret123"},
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
            "workflow_state": "available",
        }]
        resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)

    local_course_id = resp.json()[0]["local_id"]
    return headers, local_course_id


def _assignment(canvas_id: int, **overrides) -> dict:
    base = {
        "id": canvas_id,
        "name": "Assignment",
        "description": None,
        "due_at": None,
        "points_possible": 10.0,
        "course_id": 1,
        "published": True,
    }
    return {**base, **overrides}


# ---------------------------------------------------------------------------
# Capturing/updating `published` on sync
# ---------------------------------------------------------------------------


# Verifies: published defaults true when Canvas omits the field entirely.
def test_assignment_published_defaults_true_when_omitted(client):
    headers, local_course_id = _register_with_canvas(client)
    payload = _assignment(uuid.uuid4().int % 10_000_000)
    del payload["published"]

    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = [payload]
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/assignments",
            headers=headers,
        )
    assert response.status_code == 200
    assert response.json()[0]["published"] is True


# Verifies: published=False is captured and returned as-is.
def test_assignment_published_false_is_captured(client):
    headers, local_course_id = _register_with_canvas(client)
    payload = _assignment(uuid.uuid4().int % 10_000_000, published=False)

    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = [payload]
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/assignments",
            headers=headers,
        )
    assert response.status_code == 200
    assert response.json()[0]["published"] is False


# Verifies: published toggles correctly across repeated syncs (draft -> published -> draft).
def test_assignment_published_toggles_across_syncs(client):
    headers, local_course_id = _register_with_canvas(client)
    cid = uuid.uuid4().int % 10_000_000

    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = [_assignment(cid, published=False)]
        r1 = client.get(f"/api/v1/canvas/courses/{local_course_id}/assignments", headers=headers)
    assert r1.json()[0]["published"] is False

    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = [_assignment(cid, published=True)]
        r2 = client.get(f"/api/v1/canvas/courses/{local_course_id}/assignments", headers=headers)
    assert r2.json()[0]["published"] is True

    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = [_assignment(cid, published=False)]
        r3 = client.get(f"/api/v1/canvas/courses/{local_course_id}/assignments", headers=headers)
    assert r3.json()[0]["published"] is False


# ---------------------------------------------------------------------------
# course_overview.py — published filtering in data analysis
# ---------------------------------------------------------------------------


def _sync_students(client, headers, local_course_id, count: int) -> None:
    enrollments = [
        {
            "user_id": 9_000_000 + i,
            "enrollment_state": "active",
            "user": {"name": f"Student {i}", "sortable_name": f"{i}, Student"},
        }
        for i in range(count)
    ]
    with patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock:
        mock.return_value = enrollments
        client.get(
            f"/api/v1/canvas/courses/{local_course_id}/students?canvas_url={CANVAS_URL}",
            headers=headers,
        )


def _sync_submission(client, headers, local_course_id, assignment_id, submission: dict) -> None:
    with patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock:
        mock.return_value = [submission]
        client.get(
            f"/api/v1/canvas/courses/{local_course_id}/assignments/{assignment_id}/submissions?canvas_url={CANVAS_URL}",
            headers=headers,
        )


# Verifies: An unpublished assignment is counted in assignment_count/recent_assignments
# but excluded from missing/late/average_grade/completion_rate.
def test_course_overview_excludes_unpublished_from_analysis_but_shows_it(client):
    headers, local_course_id = _register_with_canvas(client)
    published_id = uuid.uuid4().int % 10_000_000
    draft_id = published_id + 1

    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = [
            _assignment(published_id, name="Published HW", published=True, due_at=(datetime.now(UTC) - timedelta(days=1)).isoformat()),
            _assignment(draft_id, name="Draft HW", published=False, due_at=(datetime.now(UTC) - timedelta(days=1)).isoformat()),
        ]
        client.get(f"/api/v1/canvas/courses/{local_course_id}/assignments?canvas_url={CANVAS_URL}", headers=headers)

    _sync_students(client, headers, local_course_id, 1)

    # A missing submission on the published assignment; the draft has none (Canvas
    # would never return submissions for a draft).
    _sync_submission(client, headers, local_course_id, published_id, {
        "id": uuid.uuid4().int % 10_000_000,
        "assignment_id": published_id,
        "user_id": 9_000_000,
        "score": None,
        "grade": None,
        "submitted_at": None,
        "workflow_state": "unsubmitted",
        "missing": True,
    })

    with (
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
    ):
        mock_assignments.return_value = [
            _assignment(published_id, name="Published HW", published=True),
            _assignment(draft_id, name="Draft HW", published=False),
        ]
        mock_enrollments.return_value = [
            {"user_id": 9_000_000, "enrollment_state": "active", "user": {"name": "Student 0"}},
        ]
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/overview?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["assignment_count"] == 2
    assert payload["missing_submissions"] == 1
    assert {a["title"]: a["published"] for a in payload["recent_assignments"]} == {
        "Published HW": True,
        "Draft HW": False,
    }


# Verifies: A course where every assignment is unpublished yields graceful empty
# stats (no crash, no phantom "missing" count) while still showing assignment_count.
def test_course_overview_all_assignments_unpublished(client):
    headers, local_course_id = _register_with_canvas(client)
    draft_id = uuid.uuid4().int % 10_000_000

    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = [_assignment(draft_id, published=False)]
        client.get(f"/api/v1/canvas/courses/{local_course_id}/assignments?canvas_url={CANVAS_URL}", headers=headers)

    with (
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
    ):
        mock_assignments.return_value = [_assignment(draft_id, published=False)]
        mock_enrollments.return_value = [
            {"user_id": 9_100_000, "enrollment_state": "active", "user": {"name": "Student"}},
        ]
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/overview?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["assignment_count"] == 1
    assert payload["missing_submissions"] == 0
    assert payload["late_submissions"] == 0
    assert payload["average_grade"] is None
    # completion_rate divides by published_assignment_count (0 here) — must stay
    # None rather than raising a ZeroDivisionError.
    assert payload["completion_rate"] is None


# Verifies: A grade recorded against an unpublished assignment (e.g. it was
# published, graded, then reverted to draft) does not skew average_grade.
def test_course_overview_grade_on_unpublished_assignment_excluded_from_average(client):
    headers, local_course_id = _register_with_canvas(client)
    published_id = uuid.uuid4().int % 10_000_000
    draft_id = published_id + 1

    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = [
            _assignment(published_id, published=True, points_possible=100.0),
            _assignment(draft_id, published=False, points_possible=100.0),
        ]
        client.get(f"/api/v1/canvas/courses/{local_course_id}/assignments?canvas_url={CANVAS_URL}", headers=headers)

    _sync_students(client, headers, local_course_id, 1)

    _sync_submission(client, headers, local_course_id, published_id, {
        "id": uuid.uuid4().int % 10_000_000,
        "assignment_id": published_id,
        "user_id": 9_000_000,
        "score": 80.0,
        "grade": "B",
        "submitted_at": "2026-01-01T00:00:00Z",
        "workflow_state": "graded",
    })
    # A leftover graded submission on the now-draft assignment (edge case: it was
    # published, graded, then unpublished again) — should not affect the average.
    _sync_submission(client, headers, local_course_id, draft_id, {
        "id": uuid.uuid4().int % 10_000_000,
        "assignment_id": draft_id,
        "user_id": 9_000_000,
        "score": 20.0,
        "grade": "F",
        "submitted_at": "2026-01-01T00:00:00Z",
        "workflow_state": "graded",
    })

    with (
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
    ):
        mock_assignments.return_value = [
            _assignment(published_id, published=True, points_possible=100.0),
            _assignment(draft_id, published=False, points_possible=100.0),
        ]
        mock_enrollments.return_value = [
            {"user_id": 9_000_000, "enrollment_state": "active", "user": {"name": "Student 0"}},
        ]
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/overview?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert response.status_code == 200
    # Only the published assignment's 80% counts — if the draft's 20% leaked in,
    # the average would be 50.0 instead.
    assert response.json()["average_grade"] == 80.0


# ---------------------------------------------------------------------------
# dashboard.py — published filtering in aggregate stats
# ---------------------------------------------------------------------------


# Verifies: Dashboard's assignment_count includes drafts; missing/late totals don't.
def test_dashboard_assignment_count_includes_drafts_but_missing_excludes_them(client):
    headers, local_course_id = _register_with_canvas(client)
    published_id = uuid.uuid4().int % 10_000_000
    draft_id = published_id + 1

    with (
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
    ):
        mock_assignments.return_value = [
            _assignment(published_id, published=True),
            _assignment(draft_id, published=False),
        ]
        mock_enrollments.return_value = []
        response = client.get("/api/v1/canvas/dashboard", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["assignment_count"] == 2
    assert payload["courses"][0]["assignment_count"] == 2
    # No submissions synced at all yet — missing/late should be 0, not crash,
    # regardless of the draft assignment being present.
    assert payload["missing_submissions"] == 0
    assert payload["late_submissions"] == 0


# ---------------------------------------------------------------------------
# analysis.py — assignment_published context on missing/late submission analysis
# ---------------------------------------------------------------------------


# Verifies: assignment_published reflects the synced assignment's real state.
def test_missing_submissions_analysis_reports_unpublished_assignment(client):
    headers, local_course_id = _register_with_canvas(client)
    draft_id = uuid.uuid4().int % 10_000_000

    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = [_assignment(draft_id, published=False)]
        client.get(f"/api/v1/canvas/courses/{local_course_id}/assignments?canvas_url={CANVAS_URL}", headers=headers)

    with (
        patch("app.services.analysis.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.analysis.fetch_submissions", new_callable=AsyncMock) as mock_submissions,
    ):
        mock_enrollments.return_value = [
            {"user_id": 1, "enrollment_state": "active", "user": {"name": "Ada"}},
        ]
        mock_submissions.return_value = []
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/assignments/{draft_id}/missing-submissions?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["assignment_published"] is False
    # The analysis itself still runs normally — every enrolled student shows as
    # missing, since Canvas genuinely has no submissions for a draft assignment.
    assert payload["summary"]["missing_count"] == 1


# Verifies: assignment_published defaults True when the assignment was never
# synced locally (fetch_assignments never called for it) — the analysis
# endpoints don't depend on a prior assignments-list fetch to function.
def test_missing_submissions_analysis_defaults_published_true_when_unsynced(client):
    headers, local_course_id = _register_with_canvas(client)
    never_synced_id = uuid.uuid4().int % 10_000_000

    with (
        patch("app.services.analysis.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.analysis.fetch_submissions", new_callable=AsyncMock) as mock_submissions,
    ):
        mock_enrollments.return_value = []
        mock_submissions.return_value = []
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/assignments/{never_synced_id}/missing-submissions?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert response.status_code == 200
    assert response.json()["assignment_published"] is True


# Verifies: Same published-context behavior on the late-submissions endpoint.
def test_late_submissions_analysis_reports_unpublished_assignment(client):
    headers, local_course_id = _register_with_canvas(client)
    draft_id = uuid.uuid4().int % 10_000_000

    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = [_assignment(draft_id, published=False)]
        client.get(f"/api/v1/canvas/courses/{local_course_id}/assignments?canvas_url={CANVAS_URL}", headers=headers)

    with (
        patch("app.services.analysis.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.analysis.fetch_submissions", new_callable=AsyncMock) as mock_submissions,
    ):
        mock_enrollments.return_value = []
        mock_submissions.return_value = []
        response = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/assignments/{draft_id}/late-submissions?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert response.status_code == 200
    assert response.json()["assignment_published"] is False
