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


def _register_with_canvas(client) -> dict:
    email = f"overview_{uuid.uuid4()}@example.com"
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Overview Instructor", "email": email, "password": "Secret123!"},
    )
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": CANVAS_URL},
            headers=headers,
        )
    return headers


def _sync_local_course(client, headers, canvas_id: int | None = None) -> int:
    cid = canvas_id if canvas_id is not None else uuid.uuid4().int % 10_000_000
    courses = [
        {
            "id": cid,
            "name": "CS 101: Introduction to Programming",
            "course_code": "CS101",
            "workflow_state": "available",
            "term": {"name": "Fall 2026"},
        }
    ]
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        response = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert response.status_code == 200
    return response.json()[0]["local_id"]


def test_course_overview_unauthenticated(client):
    response = client.get("/api/v1/canvas/courses/1/overview")
    assert response.status_code == 401


def test_course_overview_unknown_course(client):
    headers = _register_with_canvas(client)
    response = client.get(
        f"/api/v1/canvas/courses/999999/overview?canvas_url={CANVAS_URL}",
        headers=headers,
    )
    assert response.status_code == 404


# Verifies: Course overview empty state.
def test_course_overview_empty_state(client):
    headers = _register_with_canvas(client)
    local_id = _sync_local_course(client, headers)

    with (
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
    ):
        mock_enrollments.return_value = []
        mock_assignments.return_value = []
        response = client.get(
            f"/api/v1/canvas/courses/{local_id}/overview?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["local_id"] == local_id
    assert payload["name"] == "CS 101: Introduction to Programming"
    assert payload["term"] == "Fall 2026"
    assert payload["student_count"] == 0
    assert payload["assignment_count"] == 0
    assert payload["missing_submissions"] == 0
    assert payload["late_submissions"] == 0
    assert payload["average_grade"] is None
    assert payload["completion_rate"] is None
    assert payload["recent_assignments"] == []
    assert payload["recent_activity"] == []
    assert payload["is_active"] is False


# Verifies: Course overview with assignments and submissions.
def test_course_overview_with_assignments_and_submissions(client):
    headers = _register_with_canvas(client)
    local_id = _sync_local_course(client, headers)
    assignment_id_one = uuid.uuid4().int % 10_000_000
    assignment_id_two = assignment_id_one + 1

    assignments = [
        {
            "id": assignment_id_one,
            "name": "Variables Quiz",
            "description": None,
            "due_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
            "points_possible": 100.0,
            "course_id": 1,
        },
        {
            "id": assignment_id_two,
            "name": "Loops Lab",
            "description": None,
            "due_at": (datetime.now(UTC) + timedelta(days=5)).isoformat(),
            "points_possible": 50.0,
            "course_id": 1,
        },
    ]

    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = assignments
        client.get(
            f"/api/v1/canvas/courses/{local_id}/assignments?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    enrollments = [
        {
            "user_id": 1001,
            "enrollment_state": "active",
            "user": {"name": "Ada Lovelace", "sortable_name": "Lovelace, Ada"},
        },
        {
            "user_id": 1002,
            "enrollment_state": "active",
            "user": {"name": "Grace Hopper", "sortable_name": "Hopper, Grace"},
        },
    ]

    with (
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
        patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock_submissions,
    ):
        mock_enrollments.return_value = enrollments
        mock_assignments.return_value = assignments
        mock_submissions.return_value = []
        response = client.get(
            f"/api/v1/canvas/courses/{local_id}/overview?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["student_count"] == 2
    assert payload["assignment_count"] == 2
    assert payload["average_grade"] is None
    assert len(payload["recent_assignments"]) == 2
    assert payload["recent_assignments"][0]["title"] in {"Variables Quiz", "Loops Lab"}
    assert payload["recent_assignments"][0]["total_students"] == 2
    assert payload["recent_activity"] == []
    # Refreshed live from Canvas (via get_submissions) for every published
    # assignment, not just whichever one a previous Analytics/Submissions
    # visit happened to warm the cache for.
    assert mock_submissions.await_count == 2


# Verifies: missing/late counts, average_grade, completion_rate, and recent_activity
# are computed from real submission data (not just left at their empty defaults).
def test_course_overview_grades_completion_and_activity(client):
    headers = _register_with_canvas(client)
    local_id = _sync_local_course(client, headers)
    assignment_id = uuid.uuid4().int % 10_000_000

    assignments = [
        {
            "id": assignment_id,
            "name": "Midterm",
            "description": None,
            "due_at": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
            "points_possible": 100.0,
            "course_id": 1,
        }
    ]
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = assignments
        client.get(
            f"/api/v1/canvas/courses/{local_id}/assignments?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    enrollments = [
        {
            "user_id": 2001,
            "enrollment_state": "active",
            "user": {"name": "Ada Lovelace", "sortable_name": "Lovelace, Ada"},
        },
        {
            "user_id": 2002,
            "enrollment_state": "active",
            "user": {"name": "Grace Hopper", "sortable_name": "Hopper, Grace"},
        },
    ]
    submission_id_one = uuid.uuid4().int % 10_000_000
    submission_id_two = submission_id_one + 1
    submissions = [
        {
            "id": submission_id_one,
            "assignment_id": assignment_id,
            "user_id": 2001,
            "score": 90.0,
            "grade": "A",
            "submitted_at": "2026-01-01T12:00:00Z",
            "workflow_state": "graded",
            "user": {"name": "Ada Lovelace"},
        },
        {
            "id": submission_id_two,
            "assignment_id": assignment_id,
            "user_id": 2002,
            "score": None,
            "grade": None,
            "submitted_at": None,
            "workflow_state": "unsubmitted",
            "missing": True,
        },
    ]

    with patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock:
        mock.return_value = submissions
        submissions_resp = client.get(
            f"/api/v1/canvas/courses/{local_id}/assignments/{assignment_id}/submissions?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert submissions_resp.status_code == 200

    with (
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
        patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock_submissions,
    ):
        mock_enrollments.return_value = enrollments
        mock_assignments.return_value = assignments
        mock_submissions.return_value = submissions
        response = client.get(
            f"/api/v1/canvas/courses/{local_id}/overview?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["missing_submissions"] == 1
    assert payload["late_submissions"] == 0
    assert payload["average_grade"] == 90.0
    assert payload["completion_rate"] == 50.0
    assert len(payload["recent_activity"]) == 1
    assert payload["recent_activity"][0]["student_name"] == "Ada Lovelace"


def test_course_overview_average_grade_is_weighted_by_points_possible(client):
    headers = _register_with_canvas(client)
    local_id = _sync_local_course(client, headers)
    quiz_id = uuid.uuid4().int % 10_000_000
    exam_id = quiz_id + 1
    assignments = [
        {
            "id": quiz_id,
            "name": "Small Quiz",
            "description": None,
            "due_at": None,
            "points_possible": 10.0,
            "course_id": 1,
        },
        {
            "id": exam_id,
            "name": "Large Exam",
            "description": None,
            "due_at": None,
            "points_possible": 100.0,
            "course_id": 1,
        },
    ]
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = assignments
        client.get(
            f"/api/v1/canvas/courses/{local_id}/assignments?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    submissions_by_assignment = {
        quiz_id: [
            {
                "id": uuid.uuid4().int % 10_000_000,
                "assignment_id": quiz_id,
                "user_id": 3001,
                "score": 10.0,
                "grade": "10",
                "submitted_at": "2026-01-01T12:00:00Z",
                "workflow_state": "graded",
                "user": {"name": "Ada Lovelace"},
            }
        ],
        exam_id: [
            {
                "id": uuid.uuid4().int % 10_000_000,
                "assignment_id": exam_id,
                "user_id": 3001,
                "score": 50.0,
                "grade": "50",
                "submitted_at": "2026-01-01T12:00:00Z",
                "workflow_state": "graded",
                "user": {"name": "Ada Lovelace"},
            }
        ],
    }

    for assignment_id, payload in submissions_by_assignment.items():
        with patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock:
            mock.return_value = payload
            client.get(
                f"/api/v1/canvas/courses/{local_id}/assignments/{assignment_id}/submissions?canvas_url={CANVAS_URL}",
                headers=headers,
            )

    with (
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
        patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock_submissions,
    ):
        mock_enrollments.return_value = [
            {"user_id": 3001, "enrollment_state": "active", "user": {"name": "Ada Lovelace"}},
        ]
        mock_assignments.return_value = assignments
        mock_submissions.side_effect = (
            lambda course_id, assignment_id, *_args, **_kwargs: submissions_by_assignment[
                assignment_id
            ]
        )
        response = client.get(
            f"/api/v1/canvas/courses/{local_id}/overview?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert response.status_code == 200
    # 60 earned points out of 110 possible = 54.5%. A flat average of the two
    # percentages would incorrectly show 75.0%.
    assert response.json()["average_grade"] == 54.5


# Regression test for #1508: Overview previously only counted Canvas's
# "missing" flag, which Canvas never sets before an assignment's due date —
# so a not-yet-due assignment with zero submissions showed 0 missing here
# even though Assignment Submissions (which resolves "missing" as
# missing-OR-unsubmitted, see resolved_set.STATUS_FILTERS) would show every
# student as missing it.
def test_course_overview_counts_unsubmitted_as_missing(client):
    headers = _register_with_canvas(client)
    local_id = _sync_local_course(client, headers)
    assignment_id = uuid.uuid4().int % 10_000_000

    assignments = [
        {
            "id": assignment_id,
            "name": "Not Yet Due Homework",
            "description": None,
            # Not yet due — Canvas never flags a submission "missing": true
            # until the due date has passed, even with zero submissions.
            "due_at": (datetime.now(UTC) + timedelta(days=3)).isoformat(),
            "points_possible": 100.0,
            "course_id": 1,
        }
    ]
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = assignments
        client.get(
            f"/api/v1/canvas/courses/{local_id}/assignments?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    enrollments = [
        {
            "user_id": 4001,
            "enrollment_state": "active",
            "user": {"name": "Ada Lovelace", "sortable_name": "Lovelace, Ada"},
        },
    ]
    submissions = [
        {
            "id": uuid.uuid4().int % 10_000_000,
            "assignment_id": assignment_id,
            "user_id": 4001,
            "score": None,
            "grade": None,
            "submitted_at": None,
            "workflow_state": "unsubmitted",
            "missing": False,
        },
    ]

    with (
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
        patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock_submissions,
    ):
        mock_enrollments.return_value = enrollments
        mock_assignments.return_value = assignments
        mock_submissions.return_value = submissions
        response = client.get(
            f"/api/v1/canvas/courses/{local_id}/overview?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["missing_submissions"] == 1
    assert payload["late_submissions"] == 0


# Regression test for #1508: Overview must refresh submissions itself (the
# same live get_submissions() call the Assignment Submissions page makes)
# rather than only reflecting whatever a *different* assignment happened to
# be cached from a prior Submissions/Analytics visit.
def test_course_overview_matches_submissions_without_prior_visit(client):
    headers = _register_with_canvas(client)
    local_id = _sync_local_course(client, headers)
    assignment_id = uuid.uuid4().int % 10_000_000

    assignments = [
        {
            "id": assignment_id,
            "name": "Essay",
            "description": None,
            "due_at": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
            "points_possible": 100.0,
            "course_id": 1,
        }
    ]
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = assignments
        client.get(
            f"/api/v1/canvas/courses/{local_id}/assignments?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    enrollments = [
        {
            "user_id": 5001,
            "enrollment_state": "active",
            "user": {"name": "Ada Lovelace", "sortable_name": "Lovelace, Ada"},
        },
        {
            "user_id": 5002,
            "enrollment_state": "active",
            "user": {"name": "Grace Hopper", "sortable_name": "Hopper, Grace"},
        },
    ]
    # Canvas-side state changed (one more submission came in) since the last
    # sync, but no one visited Submissions/Analytics for this assignment to
    # incidentally warm the local cache — Overview must fetch it live itself.
    submissions = [
        {
            "id": uuid.uuid4().int % 10_000_000,
            "assignment_id": assignment_id,
            "user_id": 5001,
            "score": None,
            "grade": None,
            "submitted_at": "2026-01-02T12:00:00Z",
            "workflow_state": "submitted",
        },
        {
            "id": uuid.uuid4().int % 10_000_000,
            "assignment_id": assignment_id,
            "user_id": 5002,
            "score": None,
            "grade": None,
            "submitted_at": None,
            "workflow_state": "unsubmitted",
            "missing": True,
        },
    ]

    with (
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
        patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock_submissions,
    ):
        mock_enrollments.return_value = enrollments
        mock_assignments.return_value = assignments
        mock_submissions.return_value = submissions
        overview_response = client.get(
            f"/api/v1/canvas/courses/{local_id}/overview?canvas_url={CANVAS_URL}",
            headers=headers,
        )
        submissions_response = client.get(
            f"/api/v1/canvas/courses/{local_id}/assignments/{assignment_id}/submissions?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert overview_response.status_code == 200
    assert submissions_response.status_code == 200
    overview_payload = overview_response.json()
    submissions_payload = submissions_response.json()

    submitted_count = sum(
        1 for s in submissions_payload if s["status"] in {"submitted", "graded", "late"}
    )
    missing_count = sum(
        1 for s in submissions_payload if s["status"] in {"missing", "unsubmitted"}
    )

    assert overview_payload["missing_submissions"] == missing_count == 1
    assert overview_payload["recent_assignments"][0]["submitted_count"] == submitted_count == 1


# Regression test for review feedback on #1508: one assignment's Canvas
# submissions fetch failing (timeout, 404, etc.) must not abort the whole
# Overview response — other published assignments' live-refreshed counts
# should still come through and the endpoint must still return 200.
def test_course_overview_survives_one_assignment_canvas_failure(client):
    headers = _register_with_canvas(client)
    local_id = _sync_local_course(client, headers)
    failing_assignment_id = uuid.uuid4().int % 10_000_000
    healthy_assignment_id = failing_assignment_id + 1

    assignments = [
        {
            "id": failing_assignment_id,
            "name": "Flaky Canvas Assignment",
            "description": None,
            "due_at": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
            "points_possible": 100.0,
            "course_id": 1,
        },
        {
            "id": healthy_assignment_id,
            "name": "Healthy Assignment",
            "description": None,
            "due_at": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
            "points_possible": 100.0,
            "course_id": 1,
        },
    ]
    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock:
        mock.return_value = assignments
        client.get(
            f"/api/v1/canvas/courses/{local_id}/assignments?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    enrollments = [
        {
            "user_id": 6001,
            "enrollment_state": "active",
            "user": {"name": "Ada Lovelace", "sortable_name": "Lovelace, Ada"},
        },
    ]
    healthy_submissions = [
        {
            "id": uuid.uuid4().int % 10_000_000,
            "assignment_id": healthy_assignment_id,
            "user_id": 6001,
            "score": None,
            "grade": None,
            "submitted_at": "2026-01-02T12:00:00Z",
            "workflow_state": "submitted",
        },
    ]

    def _fetch_submissions_side_effect(_course_id, assignment_id, *_args, **_kwargs):
        if assignment_id == failing_assignment_id:
            raise TimeoutError("Canvas request timed out")
        return healthy_submissions

    with (
        patch("app.services.student.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as mock_assignments,
        patch("app.services.canvas.fetch_submissions", new_callable=AsyncMock) as mock_submissions,
    ):
        mock_enrollments.return_value = enrollments
        mock_assignments.return_value = assignments
        mock_submissions.side_effect = _fetch_submissions_side_effect
        response = client.get(
            f"/api/v1/canvas/courses/{local_id}/overview?canvas_url={CANVAS_URL}",
            headers=headers,
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["assignment_count"] == 2
    # The healthy assignment's submission is still counted even though the
    # other assignment's Canvas fetch raised.
    submitted_titles = {
        item["title"] for item in payload["recent_assignments"] if item["submitted_count"] > 0
    }
    assert submitted_titles == {"Healthy Assignment"}
