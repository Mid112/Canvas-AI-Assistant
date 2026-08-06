import uuid
import pytest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException, status
from fastapi.testclient import TestClient
from app.main import app

CANVAS_URL = "https://canvas.example.edu"
ASSIGNMENT_ID = 10
DAY = 86400


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _enrollment(user_id: int, name: str = "Alice Smith") -> dict:
    return {
        "id": user_id + 10_000_000,
        "course_id": 1,
        "user_id": user_id,
        "type": "StudentEnrollment",
        "enrollment_state": "active",
        "user": {
            "id": user_id,
            "name": name,
            "sortable_name": ", ".join(reversed(name.split(" ", 1))),
            "login_id": f"user{user_id}@example.com",
        },
    }


def _submission(user_id: int, **overrides) -> dict:
    base = {
        "id": user_id + 20_000_000,
        "assignment_id": ASSIGNMENT_ID,
        "user_id": user_id,
        "score": None,
        "grade": None,
        "graded_at": None,
        "submitted_at": None,
        "workflow_state": "unsubmitted",
        "missing": False,
        "late": False,
        "excused": False,
        "seconds_late": 0,
    }
    return {**base, **overrides}


def _on_time(user_id: int) -> dict:
    return _submission(user_id, workflow_state="submitted", submitted_at="2026-06-01T08:00:00Z")


def _late(user_id: int, seconds_late: int = DAY, **overrides) -> dict:
    defaults = {
        "workflow_state": "submitted",
        "submitted_at": "2026-06-02T08:00:00Z",
        "late": True,
        "seconds_late": seconds_late,
    }
    return _submission(user_id, **{**defaults, **overrides})


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth_headers(client):
    """A single registered user with a Canvas token connected."""
    email = f"test_{uuid.uuid4()}@example.com"
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "Secret123!"},
    )
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-canvas-token", "canvas_url": CANVAS_URL},
            headers=headers,
        )
    return headers


@pytest.fixture(scope="module")
def synced_course_id(client, auth_headers):
    """One Canvas course synced into the DB for the auth_headers user."""
    canvas_id = uuid.uuid4().int % 10_000_000
    courses = [
        {
            "id": canvas_id,
            "name": "CPSC 310",
            "course_code": "CPSC310",
            "enrollment_term_id": 1,
            "workflow_state": "available",
        }
    ]
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        response = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=auth_headers)
    assert response.status_code == 200
    return response.json()[0]["local_id"]


def _analyze(client, headers, course_id, enrollments, submissions):
    """Call the endpoint with both Canvas fetches mocked."""
    with (
        patch("app.services.analysis.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.analysis.fetch_submissions", new_callable=AsyncMock) as mock_submissions,
    ):
        mock_enrollments.return_value = enrollments
        mock_submissions.return_value = submissions
        return client.get(
            f"/api/v1/canvas/courses/{course_id}/assignments/{ASSIGNMENT_ID}/late-submissions?canvas_url={CANVAS_URL}",
            headers=headers,
        )


# ---------------------------------------------------------------------------
# Auth and ownership guards
# ---------------------------------------------------------------------------


# Verifies: Late submissions unauthenticated.

# Verifies: Late submissions no canvas token.
def test_late_submissions_no_canvas_token(client, create_local_course_for_user_email):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "No Token", "email": email, "password": "Secret123!"},
    )
    token = reg.json()["access_token"]
    local_course_id = create_local_course_for_user_email(email, canvas_url=CANVAS_URL)
    response = client.get(
        f"/api/v1/canvas/courses/{local_course_id}/assignments/10/late-submissions?canvas_url={CANVAS_URL}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


# Verifies: Late submissions course not found.
def test_late_submissions_course_not_found(client, auth_headers):
    """Unknown local course returns 404 without ever calling Canvas."""
    with (
        patch("app.services.analysis.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.analysis.fetch_submissions", new_callable=AsyncMock) as mock_submissions,
    ):
        response = client.get(
            f"/api/v1/canvas/courses/999999/assignments/10/late-submissions?canvas_url={CANVAS_URL}",
            headers=auth_headers,
        )
    assert response.status_code == 404
    mock_enrollments.assert_not_called()
    mock_submissions.assert_not_called()


# ---------------------------------------------------------------------------
# #554 — Detect late submissions
# ---------------------------------------------------------------------------


# Verifies: Detect late submission.
def test_detect_late_submission(client, auth_headers, synced_course_id):
    """One on-time, one late — only the late one is detected."""
    enrollments = [_enrollment(1, "Alice Smith"), _enrollment(2, "Bob Jones")]
    submissions = [_on_time(1), _late(2)]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    assert response.status_code == 200
    data = response.json()
    assert data["summary"]["late_count"] == 1
    assert [s["canvas_user_id"] for s in data["late_students"]] == ["2"]


# Verifies: Graded late submission still counts as late.
def test_graded_late_submission_still_counts_as_late(client, auth_headers, synced_course_id):
    """A late submission that was since graded (parsed status 'graded') must still be
    detected — detection relies on the Canvas late flag, not the parsed status."""
    enrollments = [_enrollment(1, "Alice Smith")]
    submissions = [_late(1, workflow_state="graded", score=80.0, grade="B")]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    data = response.json()
    assert data["summary"]["late_count"] == 1
    assert data["late_students"][0]["status"] == "graded"
    assert data["late_students"][0]["score"] == 80.0


# Verifies: Missing and unsubmitted are not late.
def test_missing_and_unsubmitted_are_not_late(client, auth_headers, synced_course_id):
    """Students who never submitted are missing, not late."""
    enrollments = [_enrollment(1, "Alice Smith"), _enrollment(2, "Bob Jones")]
    submissions = [_submission(1, missing=True), _submission(2)]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    data = response.json()
    assert data["summary"]["late_count"] == 0
    assert data["summary"]["submitted_count"] == 0
    assert data["late_students"] == []


# Verifies: Excused late submission not counted.
def test_excused_late_submission_not_counted(client, auth_headers, synced_course_id):
    """An excused submission is never late, even if Canvas kept the late flag."""
    enrollments = [_enrollment(1, "Alice Smith")]
    submissions = [_late(1, excused=True)]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    data = response.json()
    assert data["summary"]["late_count"] == 0
    assert data["late_students"] == []


# Verifies: Late submission from unenrolled user ignored.
def test_late_submission_from_unenrolled_user_ignored(client, auth_headers, synced_course_id):
    """A late submission from a dropped student must not appear in the analysis."""
    enrollments = [_enrollment(1, "Alice Smith")]
    submissions = [_on_time(1), _late(99)]  # 99 is not enrolled
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    data = response.json()
    assert data["summary"]["total_enrolled"] == 1
    assert data["summary"]["late_count"] == 0


# Verifies: Duplicate enrollments counted once.
def test_duplicate_enrollments_counted_once(client, auth_headers, synced_course_id):
    """A student enrolled in two sections is analyzed once."""
    enrollments = [_enrollment(1, "Alice Smith"), _enrollment(1, "Alice Smith")]
    submissions = [_late(1)]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    data = response.json()
    assert data["summary"]["total_enrolled"] == 1
    assert data["summary"]["late_count"] == 1


# ---------------------------------------------------------------------------
# #557 — Generate late student list
# ---------------------------------------------------------------------------


# Verifies: Late student fields.
def test_late_student_fields(client, auth_headers, synced_course_id):
    enrollments = [_enrollment(1, "Alice Smith")]
    submissions = [_late(1, seconds_late=2 * DAY, score=70.0, grade="C", workflow_state="graded")]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    student = response.json()["late_students"][0]
    assert student["canvas_user_id"] == "1"
    assert student["name"] == "Alice Smith"
    assert student["sortable_name"] == "Smith, Alice"
    assert student["login_id"] == "user1@example.com"
    assert student["submitted_at"] is not None
    assert student["seconds_late"] == 2 * DAY
    assert student["days_late"] == 2.0
    assert student["status"] == "graded"
    assert student["score"] == 70.0
    assert student["grade"] == "C"


# Verifies: Late students sorted most late first.
def test_late_students_sorted_most_late_first(client, auth_headers, synced_course_id):
    enrollments = [_enrollment(1, "Alice Smith"), _enrollment(2, "Bob Jones"), _enrollment(3, "Cara Diaz")]
    submissions = [_late(1, seconds_late=DAY), _late(2, seconds_late=3 * DAY), _late(3, seconds_late=2 * DAY)]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    ids = [s["canvas_user_id"] for s in response.json()["late_students"]]
    assert ids == ["2", "3", "1"]


# Verifies: Days late rounded.
def test_days_late_rounded(client, auth_headers, synced_course_id):
    """36 hours late → 1.5 days."""
    enrollments = [_enrollment(1, "Alice Smith")]
    submissions = [_late(1, seconds_late=DAY + DAY // 2)]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    assert response.json()["late_students"][0]["days_late"] == 1.5


# ---------------------------------------------------------------------------
# #555 — Generate summary statistics
# ---------------------------------------------------------------------------


# Verifies: Summary statistics.
def test_summary_statistics(client, auth_headers, synced_course_id):
    """5 enrolled: 2 on time, 2 late (1 and 3 days), 1 never submitted."""
    enrollments = [_enrollment(i, f"Student {i}") for i in (1, 2, 3, 4, 5)]
    submissions = [
        _on_time(1),
        _on_time(2),
        _late(3, seconds_late=DAY),
        _late(4, seconds_late=3 * DAY),
        _submission(5),
    ]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    summary = response.json()["summary"]
    assert summary["total_enrolled"] == 5
    assert summary["submitted_count"] == 4
    assert summary["on_time_count"] == 2
    assert summary["late_count"] == 2
    assert summary["late_rate"] == 50.0  # 2 of 4 submissions were late
    assert summary["avg_days_late"] == 2.0
    assert summary["max_days_late"] == 3.0


# Verifies: Late rate rounded.
def test_late_rate_rounded(client, auth_headers, synced_course_id):
    """1 late of 3 submitted → 33.3."""
    enrollments = [_enrollment(i, f"Student {i}") for i in (1, 2, 3)]
    submissions = [_on_time(1), _on_time(2), _late(3)]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    assert response.json()["summary"]["late_rate"] == 33.3


# Verifies: Nobody late.
def test_nobody_late(client, auth_headers, synced_course_id):
    enrollments = [_enrollment(1, "Alice Smith"), _enrollment(2, "Bob Jones")]
    submissions = [_on_time(1), _on_time(2)]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    summary = response.json()["summary"]
    assert summary["late_count"] == 0
    assert summary["late_rate"] == 0.0
    assert summary["avg_days_late"] == 0.0
    assert summary["max_days_late"] == 0.0


# Verifies: Empty roster.
def test_empty_roster(client, auth_headers, synced_course_id):
    """No enrolled students → all zeros (no division by zero)."""
    response = _analyze(client, auth_headers, synced_course_id, [], [])
    assert response.status_code == 200
    summary = response.json()["summary"]
    assert summary["total_enrolled"] == 0
    assert summary["submitted_count"] == 0
    assert summary["late_count"] == 0
    assert summary["late_rate"] == 0.0


# Verifies: Missing seconds late defaults to zero.
def test_missing_seconds_late_defaults_to_zero(client, auth_headers, synced_course_id):
    """Canvas omitting seconds_late must not crash the analysis."""
    enrollments = [_enrollment(1, "Alice Smith")]
    raw = _late(1)
    del raw["seconds_late"]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, [raw])
    assert response.status_code == 200
    assert response.json()["late_students"][0]["seconds_late"] == 0


# ---------------------------------------------------------------------------
# #556 — Return structured response
# ---------------------------------------------------------------------------


# Verifies: Response structure.
def test_response_structure(client, auth_headers, synced_course_id):
    """Top-level shape: course/assignment context, timestamp, summary, late list."""
    enrollments = [_enrollment(1, "Alice Smith")]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, [_late(1)])
    assert response.status_code == 200
    data = response.json()
    assert data["local_course_id"] == synced_course_id
    assert data["assignment_id"] == ASSIGNMENT_ID
    assert data["canvas_url"] == CANVAS_URL
    assert data["canvas_course_id"]
    assert data["generated_at"] is not None
    assert isinstance(data["summary"], dict)
    assert isinstance(data["late_students"], list)


# ---------------------------------------------------------------------------
# Canvas API failure propagation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("status_code,detail", [
    (status.HTTP_422_UNPROCESSABLE_CONTENT, "Invalid Canvas API token"),
    (status.HTTP_403_FORBIDDEN, "Canvas token lacks permission for this resource"),
    (status.HTTP_502_BAD_GATEWAY, "Could not reach Canvas"),
    (status.HTTP_504_GATEWAY_TIMEOUT, "Canvas API timed out"),
])
# Verifies: Late submissions canvas errors.
def test_late_submissions_canvas_errors(client, auth_headers, synced_course_id, status_code, detail):
    with (
        patch("app.services.analysis.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.analysis.fetch_submissions", new_callable=AsyncMock) as mock_submissions,
    ):
        mock_enrollments.side_effect = HTTPException(status_code=status_code, detail=detail)
        mock_submissions.return_value = []
        response = client.get(
            f"/api/v1/canvas/courses/{synced_course_id}/assignments/{ASSIGNMENT_ID}/late-submissions"
            f"?canvas_url={CANVAS_URL}",
            headers=auth_headers,
        )
    assert response.status_code == status_code
