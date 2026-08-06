"""Test note: covers the test missing submissions behavior so future changes can preserve the expected Canvas workflow contract."""

import uuid
import pytest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException, status
from fastapi.testclient import TestClient
from app.main import app

CANVAS_URL = "https://canvas.example.edu"
ASSIGNMENT_ID = 10


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _enrollment(user_id: int, name: str = "Alice Smith", **user_overrides) -> dict:
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
            **user_overrides,
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
    }
    return {**base, **overrides}


def _submitted(user_id: int) -> dict:
    return _submission(user_id, workflow_state="submitted", submitted_at="2026-06-01T08:00:00Z")


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
            f"/api/v1/canvas/courses/{course_id}/assignments/{ASSIGNMENT_ID}/missing-submissions?canvas_url={CANVAS_URL}",
            headers=headers,
        )


# ---------------------------------------------------------------------------
# Auth and ownership guards
# ---------------------------------------------------------------------------


# Verifies: Missing submissions unauthenticated.

# Verifies: Missing submissions no canvas token.
def test_missing_submissions_no_canvas_token(client, create_local_course_for_user_email):
    email = f"test_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "No Token", "email": email, "password": "Secret123!"},
    )
    token = reg.json()["access_token"]
    local_course_id = create_local_course_for_user_email(email, canvas_url=CANVAS_URL)
    response = client.get(
        f"/api/v1/canvas/courses/{local_course_id}/assignments/10/missing-submissions?canvas_url={CANVAS_URL}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


# Verifies: Missing submissions course not found.
def test_missing_submissions_course_not_found(client, auth_headers):
    """Unknown local course returns 404 without ever calling Canvas."""
    with (
        patch("app.services.analysis.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.analysis.fetch_submissions", new_callable=AsyncMock) as mock_submissions,
    ):
        response = client.get(
            f"/api/v1/canvas/courses/999999/assignments/10/missing-submissions?canvas_url={CANVAS_URL}",
            headers=auth_headers,
        )
    assert response.status_code == 404
    mock_enrollments.assert_not_called()
    mock_submissions.assert_not_called()


# ---------------------------------------------------------------------------
# #550 — Compare enrolled students to submissions
# ---------------------------------------------------------------------------


# Verifies: Compare enrolled to submissions.
def test_compare_enrolled_to_submissions(client, auth_headers, synced_course_id):
    """Two enrolled students, one submitted — the other is reported missing."""
    enrollments = [_enrollment(1, "Alice Smith"), _enrollment(2, "Bob Jones")]
    submissions = [_submitted(1), _submission(2)]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    assert response.status_code == 200
    data = response.json()
    assert data["summary"]["total_enrolled"] == 2
    assert data["summary"]["submitted_count"] == 1
    assert data["summary"]["missing_count"] == 1
    assert [s["canvas_user_id"] for s in data["missing_students"]] == ["2"]


# Verifies: Student without submission record is missing.
def test_student_without_submission_record_is_missing(client, auth_headers, synced_course_id):
    """An enrolled student with no submission record at all counts as missing."""
    enrollments = [_enrollment(1, "Alice Smith"), _enrollment(2, "Bob Jones")]
    submissions = [_submitted(1)]  # no record for student 2
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    data = response.json()
    assert data["summary"]["missing_count"] == 1
    assert data["missing_students"][0]["canvas_user_id"] == "2"


# Verifies: Submission from unenrolled user is ignored.
def test_submission_from_unenrolled_user_is_ignored(client, auth_headers, synced_course_id):
    """A submission from a dropped student must not inflate the stats."""
    enrollments = [_enrollment(1, "Alice Smith")]
    submissions = [_submitted(1), _submitted(99)]  # 99 is not enrolled
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    data = response.json()
    assert data["summary"]["total_enrolled"] == 1
    assert data["summary"]["submitted_count"] == 1
    assert data["summary"]["missing_count"] == 0


# Verifies: Duplicate enrollments counted once.
def test_duplicate_enrollments_counted_once(client, auth_headers, synced_course_id):
    """A student enrolled in two sections appears once in the analysis."""
    enrollments = [_enrollment(1, "Alice Smith"), _enrollment(1, "Alice Smith")]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, [])
    data = response.json()
    assert data["summary"]["total_enrolled"] == 1
    assert data["summary"]["missing_count"] == 1


# ---------------------------------------------------------------------------
# #551 — Generate missing student list
# ---------------------------------------------------------------------------


# Verifies: Missing student fields.
def test_missing_student_fields(client, auth_headers, synced_course_id):
    enrollments = [_enrollment(1, "Alice Smith")]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, [_submission(1)])
    student = response.json()["missing_students"][0]
    assert student["canvas_user_id"] == "1"
    assert student["name"] == "Alice Smith"
    assert student["sortable_name"] == "Smith, Alice"
    assert student["login_id"] == "user1@example.com"


# Verifies: Missing students sorted by sortable name.
def test_missing_students_sorted_by_sortable_name(client, auth_headers, synced_course_id):
    enrollments = [
        _enrollment(1, "Charlie Young"),
        _enrollment(2, "Alice Brown"),
        _enrollment(3, "Bob Adams"),
    ]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, [])
    names = [s["name"] for s in response.json()["missing_students"]]
    assert names == ["Bob Adams", "Alice Brown", "Charlie Young"]


# Verifies: Excused student not in missing list.
def test_excused_student_not_in_missing_list(client, auth_headers, synced_course_id):
    enrollments = [_enrollment(1, "Alice Smith"), _enrollment(2, "Bob Jones")]
    submissions = [_submission(1, excused=True), _submission(2)]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    data = response.json()
    assert data["summary"]["excused_count"] == 1
    assert data["summary"]["missing_count"] == 1
    assert [s["canvas_user_id"] for s in data["missing_students"]] == ["2"]


# Verifies: Canvas missing flag counts as missing.
def test_canvas_missing_flag_counts_as_missing(client, auth_headers, synced_course_id):
    """A submission Canvas itself flags as missing lands in the missing list."""
    enrollments = [_enrollment(1, "Alice Smith")]
    submissions = [_submission(1, missing=True)]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    data = response.json()
    assert data["summary"]["missing_count"] == 1
    assert data["summary"]["status_counts"]["missing"] == 1


# ---------------------------------------------------------------------------
# #552 — Generate summary statistics
# ---------------------------------------------------------------------------


# Verifies: Summary statistics.
def test_summary_statistics(client, auth_headers, synced_course_id):
    """4 enrolled: graded, late, excused, unsubmitted → rate 50%, counts per status."""
    enrollments = [_enrollment(i, f"Student {i}") for i in (1, 2, 3, 4)]
    submissions = [
        _submission(1, workflow_state="graded", score=90.0, grade="A"),
        _submission(2, workflow_state="submitted", late=True, submitted_at="2026-06-01T08:00:00Z"),
        _submission(3, excused=True),
        _submission(4),
    ]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    summary = response.json()["summary"]
    assert summary["total_enrolled"] == 4
    assert summary["submitted_count"] == 2  # graded + late both count as submitted
    assert summary["missing_count"] == 1
    assert summary["excused_count"] == 1
    assert summary["submission_rate"] == 50.0
    assert summary["status_counts"] == {
        "graded": 1,
        "submitted": 0,
        "late": 1,
        "missing": 0,
        "unsubmitted": 1,
        "excused": 1,
    }


# Verifies: Status counts sum to total enrolled.
def test_status_counts_sum_to_total_enrolled(client, auth_headers, synced_course_id):
    enrollments = [_enrollment(i, f"Student {i}") for i in range(1, 6)]
    submissions = [_submitted(1), _submission(2, missing=True), _submission(3, excused=True)]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    summary = response.json()["summary"]
    assert sum(summary["status_counts"].values()) == summary["total_enrolled"]


# Verifies: Submission rate rounded.
def test_submission_rate_rounded(client, auth_headers, synced_course_id):
    """1 of 3 submitted → 33.3, not a long float."""
    enrollments = [_enrollment(i, f"Student {i}") for i in (1, 2, 3)]
    submissions = [_submitted(1)]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    assert response.json()["summary"]["submission_rate"] == 33.3


# Verifies: Empty roster.
def test_empty_roster(client, auth_headers, synced_course_id):
    """No enrolled students → all zeros and rate 0.0 (no division by zero)."""
    response = _analyze(client, auth_headers, synced_course_id, [], [])
    assert response.status_code == 200
    summary = response.json()["summary"]
    assert summary["total_enrolled"] == 0
    assert summary["submitted_count"] == 0
    assert summary["missing_count"] == 0
    assert summary["submission_rate"] == 0.0


# Verifies: Everyone submitted.
def test_everyone_submitted(client, auth_headers, synced_course_id):
    enrollments = [_enrollment(1, "Alice Smith"), _enrollment(2, "Bob Jones")]
    submissions = [_submitted(1), _submitted(2)]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, submissions)
    data = response.json()
    assert data["summary"]["submission_rate"] == 100.0
    assert data["summary"]["missing_count"] == 0
    assert data["missing_students"] == []


# ---------------------------------------------------------------------------
# #553 — Return structured response
# ---------------------------------------------------------------------------


# Verifies: Response structure.
def test_response_structure(client, auth_headers, synced_course_id):
    """Top-level shape: course/assignment context, timestamp, summary, missing list."""
    enrollments = [_enrollment(1, "Alice Smith")]
    response = _analyze(client, auth_headers, synced_course_id, enrollments, [])
    assert response.status_code == 200
    data = response.json()
    assert data["local_course_id"] == synced_course_id
    assert data["assignment_id"] == ASSIGNMENT_ID
    assert data["canvas_url"] == CANVAS_URL
    assert data["canvas_course_id"]
    assert data["generated_at"] is not None
    assert isinstance(data["summary"], dict)
    assert isinstance(data["missing_students"], list)


# ---------------------------------------------------------------------------
# Canvas API failure propagation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("status_code,detail", [
    (status.HTTP_422_UNPROCESSABLE_CONTENT, "Invalid Canvas API token"),
    (status.HTTP_403_FORBIDDEN, "Canvas token lacks permission for this resource"),
    (status.HTTP_502_BAD_GATEWAY, "Could not reach Canvas"),
    (status.HTTP_504_GATEWAY_TIMEOUT, "Canvas API timed out"),
])
# Verifies: Missing submissions canvas errors.
def test_missing_submissions_canvas_errors(client, auth_headers, synced_course_id, status_code, detail):
    with (
        patch("app.services.analysis.fetch_enrollments", new_callable=AsyncMock) as mock_enrollments,
        patch("app.services.analysis.fetch_submissions", new_callable=AsyncMock) as mock_submissions,
    ):
        mock_enrollments.side_effect = HTTPException(status_code=status_code, detail=detail)
        mock_submissions.return_value = []
        response = client.get(
            f"/api/v1/canvas/courses/{synced_course_id}/assignments/{ASSIGNMENT_ID}/missing-submissions"
            f"?canvas_url={CANVAS_URL}",
            headers=auth_headers,
        )
    assert response.status_code == status_code
