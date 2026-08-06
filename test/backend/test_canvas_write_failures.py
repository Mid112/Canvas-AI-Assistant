"""
Canvas write-path and integration failure coverage (#709).

Read-path failure matrices already live in test_assignment / test_student /
test_late_submissions. This file covers create/update assignment writes and
message-draft send Canvas errors, plus a nested Canvas error-detail shape.
"""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient

from app.integrations.canvas import _canvas_error_detail
from app.main import app
from app.schemas.student import StudentResponse

CANVAS_URL = "https://canvas.example.edu"

CREATE_PAYLOAD = {
    "name": "New Assignment",
    "description": "Read chapter 1",
    "due_at": "2030-12-15T23:59:00Z",
    "points_possible": 50,
}
UPDATE_PAYLOAD = {
    "name": "Updated Assignment",
    "description": "Updated",
    "due_at": "2030-12-20T23:59:00Z",
    "points_possible": 75,
}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> tuple[dict, int]:
    email = f"cwf_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Write Fail", "email": email, "password": "Secret123!"},
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

    return headers, resp.json()[0]["local_id"]


def _student(canvas_user_id: str, course_id: int) -> StudentResponse:
    return StudentResponse(
        id=1,
        canvas_user_id=canvas_user_id,
        course_id=course_id,
        name=f"Student {canvas_user_id}",
        enrollment_state="active",
    )


# ---------------------------------------------------------------------------
# POST create assignment — Canvas failure matrix
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "exc,expected_status",
    [
        (
            HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid Canvas API token"),
            422,
        ),
        (
            HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Canvas token lacks permission for this resource"),
            403,
        ),
        (
            HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas"),
            502,
        ),
        (
            HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out"),
            504,
        ),
        (
            HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canvas resource not found"),
            404,
        ),
    ],
)
def test_create_assignment_canvas_failures(client, exc, expected_status):
    headers, local_course_id = _register_with_canvas(client)
    with patch("app.services.canvas.create_assignment", new_callable=AsyncMock) as mock:
        mock.side_effect = exc
        resp = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/assignments?canvas_url={CANVAS_URL}",
            json=CREATE_PAYLOAD,
            headers=headers,
        )
    assert resp.status_code == expected_status


# ---------------------------------------------------------------------------
# PATCH update assignment — Canvas failure matrix
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "exc,expected_status",
    [
        (
            HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid Canvas API token"),
            422,
        ),
        (
            HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Canvas token lacks permission for this resource"),
            403,
        ),
        (
            HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach Canvas"),
            502,
        ),
        (
            HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Canvas API timed out"),
            504,
        ),
    ],
)
def test_update_assignment_canvas_failures(client, exc, expected_status):
    headers, local_course_id = _register_with_canvas(client)
    with patch("app.services.canvas.update_assignment", new_callable=AsyncMock) as mock:
        mock.side_effect = exc
        resp = client.patch(
            f"/api/v1/canvas/courses/{local_course_id}/assignments/10?canvas_url={CANVAS_URL}",
            json=UPDATE_PAYLOAD,
            headers=headers,
        )
    assert resp.status_code == expected_status


# ---------------------------------------------------------------------------
# Message draft send — Canvas delivery failures
# ---------------------------------------------------------------------------

def test_send_draft_canvas_unreachable(client):
    headers, local_course_id = _register_with_canvas(client)
    create = client.post(
        "/api/v1/messages/drafts",
        json={
            "course_id": local_course_id,
            "subject": "Reminder",
            "body": "Please submit",
            "recipients": [{"id": "42", "name": "Alex"}],
        },
        headers=headers,
    )
    draft_id = create.json()["id"]

    with (
        patch(
            "app.services.message_validation.get_students",
            new=AsyncMock(return_value=[_student("42", local_course_id)]),
        ),
        patch(
            "app.services.canvas.send_conversation",
            new=AsyncMock(
                side_effect=HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Could not reach Canvas",
                )
            ),
        ),
    ):
        resp = client.post(
            f"/api/v1/messages/drafts/{draft_id}/send?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert resp.status_code == 502


def test_send_draft_canvas_timeout(client):
    headers, local_course_id = _register_with_canvas(client)
    create = client.post(
        "/api/v1/messages/drafts",
        json={
            "course_id": local_course_id,
            "subject": "Reminder",
            "body": "Please submit",
            "recipients": [{"id": "42", "name": "Alex"}],
        },
        headers=headers,
    )
    draft_id = create.json()["id"]

    with (
        patch(
            "app.services.message_validation.get_students",
            new=AsyncMock(return_value=[_student("42", local_course_id)]),
        ),
        patch(
            "app.services.canvas.send_conversation",
            new=AsyncMock(
                side_effect=HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail="Canvas API timed out",
                )
            ),
        ),
    ):
        resp = client.post(
            f"/api/v1/messages/drafts/{draft_id}/send?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert resp.status_code == 504


def test_send_draft_canvas_permission_denied(client):
    headers, local_course_id = _register_with_canvas(client)
    create = client.post(
        "/api/v1/messages/drafts",
        json={
            "course_id": local_course_id,
            "subject": "Reminder",
            "body": "Please submit",
            "recipients": [{"id": "42", "name": "Alex"}],
        },
        headers=headers,
    )
    draft_id = create.json()["id"]

    with (
        patch(
            "app.services.message_validation.get_students",
            new=AsyncMock(return_value=[_student("42", local_course_id)]),
        ),
        patch(
            "app.services.canvas.send_conversation",
            new=AsyncMock(
                side_effect=HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Canvas token lacks permission for this resource",
                )
            ),
        ),
    ):
        resp = client.post(
            f"/api/v1/messages/drafts/{draft_id}/send?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# integrations/canvas.py — nested error detail (unique shape)
# ---------------------------------------------------------------------------

def _fake_response(status_code: int, json_data=None, text: str = ""):
    response = MagicMock(spec=httpx.Response)
    response.status_code = status_code
    response.is_server_error = 500 <= status_code <= 599
    response.is_error = status_code >= 400
    response.text = text
    if json_data is None:
        response.json.side_effect = ValueError("not json")
    else:
        response.json.return_value = json_data
    return response


def test_canvas_error_detail_flattens_nested_grade_errors():
    response = _fake_response(
        400,
        json_data={
            "errors": {
                "posted_grade": [{"message": "Grade must be less than or equal to 100"}],
            },
        },
    )
    assert _canvas_error_detail(response) == (
        "posted_grade: Grade must be less than or equal to 100"
    )
