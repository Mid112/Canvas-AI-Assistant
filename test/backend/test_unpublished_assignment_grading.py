"""Grading an unpublished assignment: refused up front, and named correctly.

Two defects, reported together from one session. Canvas will not accept a
grade or a submission comment on an unpublished assignment, but nothing
checked that before the write — the instructor filled in a grade, confirmed a
preview, and only then got an error. Worse, the error Canvas returns for this
is a 401, which every caller mapped to "Invalid Canvas API token", so the
message told them to reconnect a token that was working.
"""
import uuid
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.integrations.canvas import _raise_for_canvas_error
from app.main import app

CANVAS_URL = "https://canvas.example.edu"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _canvas_401(payload: dict | None, text: str | None = None) -> httpx.Response:
    request = httpx.Request("PUT", f"{CANVAS_URL}/api/v1/courses/1/assignments/2/submissions/3")
    if payload is not None:
        return httpx.Response(401, json=payload, request=request)
    return httpx.Response(401, text=text or "", request=request)


# ---------------------------------------------------------------------------
# The 401 mapping
# ---------------------------------------------------------------------------


# Verifies the reported symptom directly: this is the body Canvas returns when
# a valid token grades an unpublished assignment. Reporting it as a token
# problem sends the instructor to Settings to fix something that is not broken.
@pytest.mark.requirement("FR2.6")
def test_permission_401_is_not_reported_as_an_invalid_token():
    response = _canvas_401(
        {"status": "unauthorized", "errors": [{"message": "user not authorized to perform that action"}]}
    )

    with pytest.raises(HTTPException) as excinfo:
        _raise_for_canvas_error(response)

    assert excinfo.value.status_code == 403
    assert "Invalid Canvas API token" not in excinfo.value.detail
    assert "not authorized to perform that action" in excinfo.value.detail


# Verifies the other half still works. troubleshoot.py and
# failed_operations.py both classify a token problem by this exact prefix to
# offer the reconnect path, so a real bad token must keep the wording.
@pytest.mark.requirement("FR1.8")
def test_genuine_token_401_still_says_invalid_token():
    response = _canvas_401({"errors": [{"message": "Invalid access token."}]})

    with pytest.raises(HTTPException) as excinfo:
        _raise_for_canvas_error(response)

    assert excinfo.value.status_code == 422
    assert excinfo.value.detail == "Invalid Canvas API token"


# Verifies the safe default. A proxy that swallows the body leaves nothing to
# classify, and of the two guesses "your token was rejected" is the one that
# points at something the instructor can actually check.
@pytest.mark.requirement("FR1.8")
def test_401_with_no_usable_body_stays_a_token_error():
    with pytest.raises(HTTPException) as excinfo:
        _raise_for_canvas_error(_canvas_401(None, text=""))

    assert excinfo.value.status_code == 422
    assert excinfo.value.detail == "Invalid Canvas API token"


# ---------------------------------------------------------------------------
# The pre-write guard
# ---------------------------------------------------------------------------


def _register(client) -> tuple[dict, int, int]:
    """Instructor with one synced course holding one unpublished assignment."""
    email = f"unpub_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Unpublished Tester", "email": email, "password": "Secret123!"},
    )
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        connected = client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": f"unpub-{uuid.uuid4()}", "canvas_url": CANVAS_URL},
            headers=headers,
        )
    assert connected.status_code == 200, connected.text

    canvas_course_id = uuid.uuid4().int % 10_000_000
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as courses:
        courses.return_value = [{
            "id": canvas_course_id, "name": "COSC 499", "course_code": "COSC499",
            "enrollment_term_id": 1, "workflow_state": "available",
        }]
        synced = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
    local_course_id = synced.json()[0]["local_id"]

    with patch("app.services.canvas.fetch_assignments", new_callable=AsyncMock) as assignments:
        assignments.return_value = [{
            "id": 4242, "name": "Draft Lab", "description": None, "due_at": None,
            "points_possible": 10.0, "course_id": canvas_course_id, "published": False,
        }]
        synced_assignments = client.get(
            f"/api/v1/canvas/courses/{local_course_id}/assignments?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert synced_assignments.status_code == 200, synced_assignments.text
    return headers, local_course_id, 4242


# Verifies the write never leaves the building. The instructor is told before
# they invest anything, and — the part that matters most — Canvas is never
# asked, so there is no partial state to reason about.
@pytest.mark.requirement("FR2.6")
def test_grading_an_unpublished_assignment_is_refused_before_reaching_canvas(client):
    headers, local_course_id, assignment_id = _register(client)

    with patch(
        "app.integrations.canvas.update_submission_grade", new_callable=AsyncMock
    ) as write:
        response = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/grades?canvas_url={CANVAS_URL}",
            json={"assignment_id": assignment_id, "user_id": 101, "posted_grade": "90"},
            headers=headers,
        )

    assert response.status_code == 400, response.text
    detail = response.json()["detail"]
    assert "unpublished" in detail
    assert "Draft Lab" in detail
    assert "Invalid Canvas API token" not in detail
    write.assert_not_awaited()
