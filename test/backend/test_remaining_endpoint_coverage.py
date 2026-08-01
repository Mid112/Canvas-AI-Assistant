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


def _register(client, password: str = "secret123") -> tuple[str, dict]:
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
            json={"canvas_token": "test-canvas-token", "canvas_url": CANVAS_URL},
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


def test_change_password_success_and_rejects_wrong_current(client):
    email, headers = _register(client, password="oldpass123")

    wrong = client.post(
        "/api/v1/auth/me/change-password",
        json={"current_password": "not-the-password", "new_password": "newpass123"},
        headers=headers,
    )
    assert wrong.status_code == 401
    assert wrong.json()["detail"] == "Current password is incorrect"

    ok = client.post(
        "/api/v1/auth/me/change-password",
        json={"current_password": "oldpass123", "new_password": "newpass123"},
        headers=headers,
    )
    assert ok.status_code == 204

    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "oldpass123"},
        ).status_code
        == 401
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "newpass123"},
    )
    assert login.status_code == 200
    assert "access_token" in login.json()


def test_change_password_requires_auth(client):
    resp = client.post(
        "/api/v1/auth/me/change-password",
        json={"current_password": "oldpass123", "new_password": "newpass123"},
    )
    assert resp.status_code == 401


def test_list_and_revoke_sessions(client):
    email, headers_a = _register(client, password="secret123")

    listed = client.get("/api/v1/auth/me/sessions", headers=headers_a)
    assert listed.status_code == 200
    sessions = listed.json()
    assert len(sessions) >= 1
    assert any(s["is_current"] is True for s in sessions)
    for s in sessions:
        assert "id" in s
        assert "created_at" in s
        assert "expires_at" in s

    # Second login must land in a later second so JWT exp (and thus the
    # token hash) differs — minting twice in the same second can collide.
    time.sleep(1.1)
    login_b = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "secret123"},
    )
    assert login_b.status_code == 200
    headers_b = {"Authorization": f"Bearer {login_b.json()['access_token']}"}
    assert login_b.json()["access_token"] != headers_a["Authorization"].removeprefix("Bearer ")

    after_login = client.get("/api/v1/auth/me/sessions", headers=headers_a)
    assert after_login.status_code == 200
    assert len(after_login.json()) >= 2

    other = next(s for s in after_login.json() if s["is_current"] is False)
    revoke = client.delete(f"/api/v1/auth/me/sessions/{other['id']}", headers=headers_a)
    assert revoke.status_code == 204

    # Revoked session can no longer call authenticated endpoints.
    assert client.get("/api/v1/auth/me", headers=headers_b).status_code == 401
    # Current session still works.
    assert client.get("/api/v1/auth/me", headers=headers_a).status_code == 200


def test_revoke_unknown_session_404s(client):
    _, headers = _register(client)
    resp = client.delete("/api/v1/auth/me/sessions/999999999", headers=headers)
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Session not found"


def test_revoke_session_cannot_target_another_users_session(client):
    _, headers_a = _register(client)
    _, headers_b = _register(client)

    sessions_b = client.get("/api/v1/auth/me/sessions", headers=headers_b).json()
    other_id = sessions_b[0]["id"]

    resp = client.delete(f"/api/v1/auth/me/sessions/{other_id}", headers=headers_a)
    assert resp.status_code == 404
    # Owner's session remains usable.
    assert client.get("/api/v1/auth/me", headers=headers_b).status_code == 200


def test_password_reset_confirm_success_and_invalid_token(client):
    email, headers = _register(client, password="oldpass123")
    known_token = f"reset-token-{uuid.uuid4()}"

    with patch("app.services.auth.generate_reset_token", return_value=known_token):
        request = client.post("/api/v1/auth/password-reset/request", json={"email": email})
    assert request.status_code == 204

    bad = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": "not-a-real-token", "new_password": "brandnew12"},
    )
    assert bad.status_code == 400
    assert bad.json()["detail"] == "Invalid or expired reset token"

    confirm = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": known_token, "new_password": "brandnew12"},
    )
    assert confirm.status_code == 204

    # Old password + old session are invalid; new password works.
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "oldpass123"},
        ).status_code
        == 401
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "brandnew12"},
    )
    assert login.status_code == 200

    # Token is single-use.
    reuse = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": known_token, "new_password": "anotherone1"},
    )
    assert reuse.status_code == 400


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


def test_assignment_preview_http_returns_dry_run_metadata(client):
    headers = _register_with_canvas(client)
    local_course_id = _sync_course(client, headers)

    payload = {
        "name": "Midterm Exam",
        "description": "Covers weeks 1-6",
        "due_at": "2026-12-15T23:59:00Z",
        "points_possible": 100,
    }
    response = client.post(
        f"/api/v1/canvas/courses/{local_course_id}/assignments/preview"
        f"?canvas_url={CANVAS_URL}",
        json=payload,
        headers=headers,
    )

    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["action"] == "create_assignment"
    assert "Midterm Exam" in body["summary"]
    assert "COSC 310" in body["summary"]
    assert body["reversible"] is True
    assert body["metadata"]["name"] == "Midterm Exam"
    assert any(r["type"] == "course" and r["name"] == "COSC 310" for r in body["affected_resources"])
    assert any(r["type"] == "assignment" for r in body["affected_resources"])


def test_assignment_preview_unauthenticated(client):
    response = client.post(
        "/api/v1/canvas/courses/1/assignments/preview",
        json={"name": "X"},
    )
    assert response.status_code == 401


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


def test_admin_dashboard_returns_counts(client, admin_credentials):
    login = client.post("/api/v1/auth/admin/login", json=admin_credentials)
    assert login.status_code == 200, login.json()
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    resp = client.get("/api/v1/admin/dashboard", headers=headers)
    assert resp.status_code == 200, resp.json()
    data = resp.json()
    assert isinstance(data["instructor_count"], int)
    assert isinstance(data["admin_count"], int)
    assert isinstance(data["active_workflows"], int)
    assert isinstance(data["audit_events_last_7_days"], int)
    assert data["admin_count"] >= 1


def test_admin_dashboard_rejects_instructor(client):
    _, headers = _register(client)
    resp = client.get("/api/v1/admin/dashboard", headers=headers)
    assert resp.status_code == 403


def test_admin_dashboard_unauthenticated(client):
    resp = client.get("/api/v1/admin/dashboard")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Message draft PATCH (#698)
# ---------------------------------------------------------------------------


def test_message_draft_patch_updates_fields(client):
    _, headers = _register(client)
    create = client.post(
        "/api/v1/messages/drafts",
        json={
            "subject": "Original subject",
            "body": "Original body",
            "recipients": [{"id": "1", "name": "Alex", "email": "a@x.com"}],
        },
        headers=headers,
    )
    assert create.status_code == 201, create.json()
    draft_id = create.json()["id"]

    patched = client.patch(
        f"/api/v1/messages/drafts/{draft_id}",
        json={
            "subject": "Updated subject",
            "body": "Updated body",
            "recipients": [
                {"id": "1", "name": "Alex", "email": "a@x.com"},
                {"id": "2", "name": "Blair", "email": "b@x.com"},
            ],
        },
        headers=headers,
    )
    assert patched.status_code == 200, patched.json()
    assert patched.json()["subject"] == "Updated subject"
    assert patched.json()["body"] == "Updated body"
    assert len(patched.json()["recipients"]) == 2

    fetched = client.get(f"/api/v1/messages/drafts/{draft_id}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["subject"] == "Updated subject"


def test_message_draft_patch_unknown_draft_404s(client):
    _, headers = _register(client)
    resp = client.patch(
        "/api/v1/messages/drafts/999999999",
        json={"subject": "Nope"},
        headers=headers,
    )
    assert resp.status_code == 404


def test_message_draft_patch_cannot_edit_another_users_draft(client):
    _, headers_a = _register(client)
    _, headers_b = _register(client)

    create = client.post(
        "/api/v1/messages/drafts",
        json={"subject": "Private", "body": "Mine", "recipients": []},
        headers=headers_a,
    )
    assert create.status_code == 201
    draft_id = create.json()["id"]

    resp = client.patch(
        f"/api/v1/messages/drafts/{draft_id}",
        json={"subject": "Hijacked"},
        headers=headers_b,
    )
    assert resp.status_code == 404
