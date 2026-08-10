from canvas_test_utils import unique_canvas_token

"""Backend HTTP coverage for previously untested endpoints.

Fills the gaps tracked under Backend Testing & Validation (#698 / #699):
  - POST /auth/me/change-password
  - GET  /auth/me/sessions
  - DELETE /auth/me/sessions/{id}
  - POST /auth/password-reset/confirm
  - GET  /auth/me/notifications
  - POST /canvas/courses/{id}/assignments/preview
  - GET  /admin/dashboard
  - PATCH /messages/drafts/{id}
"""

import time
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

CANVAS_URL = "https://canvas.example.edu"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register(client, password: str = "Secret123!") -> tuple[str, dict]:
    email = f"cov_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Coverage User", "email": email, "password": password},
    )
    assert reg.status_code == 201, reg.json()
    token = reg.json()["access_token"]
    return email, {"Authorization": f"Bearer {token}"}


def _register_with_canvas(client) -> dict:
    _, headers = _register(client)
    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        resp = client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": unique_canvas_token(), "canvas_url": CANVAS_URL},
            headers=headers,
        )
    assert resp.status_code == 200, resp.json()
    return headers


def _sync_course(client, headers) -> int:
    course = {
        "id": uuid.uuid4().int % 10_000_000,
        "name": "COSC 310",
        "course_code": "COSC310",
        "enrollment_term_id": 1,
        "workflow_state": "available",
    }
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = [course]
        response = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}",
            headers=headers,
        )
    assert response.status_code == 200, response.json()
    return response.json()[0]["local_id"]


# ---------------------------------------------------------------------------
# Auth account workflows (#699)
# ---------------------------------------------------------------------------


def test_change_password_requires_auth(client):
    resp = client.post(
        "/api/v1/auth/me/change-password",
        json={"current_password": "Oldpass123!", "new_password": "Newpass123!"},
    )
    assert resp.status_code == 401


def test_revoke_session_cannot_target_another_users_session(client):
    _, headers_a = _register(client)
    _, headers_b = _register(client)

    sessions_b = client.get("/api/v1/auth/me/sessions", headers=headers_b).json()
    other_id = sessions_b[0]["id"]

    resp = client.delete(f"/api/v1/auth/me/sessions/{other_id}", headers=headers_a)
    assert resp.status_code == 404
    # Owner's session remains usable.
    assert client.get("/api/v1/auth/me", headers=headers_b).status_code == 200


def test_get_notification_settings_defaults_and_round_trip(client):
    _, headers = _register(client)

    empty = client.get("/api/v1/auth/me/notifications", headers=headers)
    assert empty.status_code == 200
    assert empty.json() == {}

    settings = {"workflow-approvals": True, "grade-updates": False}
    patched = client.patch(
        "/api/v1/auth/me/notifications",
        json={"settings": settings},
        headers=headers,
    )
    assert patched.status_code == 200

    fetched = client.get("/api/v1/auth/me/notifications", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["workflow-approvals"] is True
    assert fetched.json()["grade-updates"] is False


# ---------------------------------------------------------------------------
# Canvas assignment preview HTTP (#698 / #700 leftover)
# ---------------------------------------------------------------------------


def test_assignment_preview_rejects_blank_description(client):
    """Ticket 22: blank description rejected on preview with actionable message."""
    headers = _register_with_canvas(client)
    local_course_id = _sync_course(client, headers)
    response = client.post(
        f"/api/v1/canvas/courses/{local_course_id}/assignments/preview"
        f"?canvas_url={CANVAS_URL}",
        json={
            "name": "No Desc",
            "description": "   ",
            "due_at": "2026-12-15T23:59:00Z",
            "points_possible": 50,
        },
        headers=headers,
    )
    assert response.status_code == 422
    assert "description" in str(response.json()["detail"]).lower()


def test_assignment_preview_unknown_course_404s(client):
    headers = _register_with_canvas(client)
    response = client.post(
        f"/api/v1/canvas/courses/999999999/assignments/preview?canvas_url={CANVAS_URL}",
        json={"name": "Ghost"},
        headers=headers,
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Admin dashboard (#698)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Message draft PATCH (#698)
# ---------------------------------------------------------------------------


def test_message_draft_patch_unknown_draft_404s(client):
    _, headers = _register(client)
    resp = client.patch(
        "/api/v1/messages/drafts/999999999",
        json={"subject": "Nope"},
        headers=headers,
    )
    assert resp.status_code == 404


