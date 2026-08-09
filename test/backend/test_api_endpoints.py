"""
API endpoint coverage for Feature #685 / #706.

Fills gaps left by domain-specific suites: admin dashboard, assignment
preview, auth sessions / change-password / password-reset confirm, and
message draft PATCH.
"""
import asyncio
import contextlib
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from app.config import settings
from app.main import app

CANVAS_URL = "https://canvas.example.edu"


@contextlib.asynccontextmanager
async def _db():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            yield session
    finally:
        await engine.dispose()


@pytest.fixture(scope="module")
def client():
    app.state.limiter.enabled = False
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


def _register(client, password: str = "Secret123!") -> dict:
    email = f"api_{uuid.uuid4()}@example.com"
    resp = client.post(
        "/api/v1/auth/register",
        json={"name": "API Test", "email": email, "password": password},
    )
    assert resp.status_code == 201, resp.json()
    token = resp.json()["access_token"]
    return {
        "email": email,
        "password": password,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"},
    }


def _register_with_canvas(client) -> tuple[dict, int]:
    reg = _register(client)
    headers = reg["headers"]

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

    assert resp.status_code == 200, resp.json()
    return headers, resp.json()[0]["local_id"]


def _admin_headers(client, admin_credentials) -> dict:
    login = client.post("/api/v1/auth/admin/login", json=admin_credentials)
    assert login.status_code == 200, login.json()
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


# ---------------------------------------------------------------------------
# GET /admin/dashboard
# ---------------------------------------------------------------------------



def test_admin_dashboard_returns_stats(client, admin_credentials):
    headers = _admin_headers(client, admin_credentials)
    resp = client.get("/api/v1/admin/dashboard", headers=headers)
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert "instructor_count" in body
    assert "admin_count" in body
    assert "active_workflows" in body
    assert "audit_events_last_7_days" in body
    assert body["admin_count"] >= 1


# ---------------------------------------------------------------------------
# POST /canvas/courses/{id}/assignments/preview
# ---------------------------------------------------------------------------


def test_assignment_preview_success(client):
    headers, local_course_id = _register_with_canvas(client)
    payload = {
        "name": "Midterm Exam",
        "description": "Cover chapters 1-3",
        "due_at": "2030-12-15T23:59:00Z",
        "points_possible": 100,
    }
    resp = client.post(
        f"/api/v1/canvas/courses/{local_course_id}/assignments/preview"
        f"?canvas_url={CANVAS_URL}",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["action"] == "create_assignment"
    assert "Midterm Exam" in body["summary"]
    assert body["reversible"] is True
    assert body["metadata"]["name"] == "Midterm Exam"
    assert body["metadata"]["title"] == "Midterm Exam"
    assert "due" in body["summary"].lower() or "Due" in body["summary"]
    assert "100" in body["summary"] or "100 points" in body["metadata"]["points_possible"]
    assert body["metadata"]["submitted"]["name"] == "Midterm Exam"
    assert any(r["type"] == "course" for r in body["affected_resources"])
    assert any(r["type"] == "assignment" for r in body["affected_resources"])


def test_assignment_preview_rejects_missing_required_fields(client):
    """Ticket 22: preview validates before Canvas — missing due date is a 422."""
    headers, local_course_id = _register_with_canvas(client)
    resp = client.post(
        f"/api/v1/canvas/courses/{local_course_id}/assignments/preview"
        f"?canvas_url={CANVAS_URL}",
        json={"name": "No Due", "description": "Missing due date"},
        headers=headers,
    )
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert "due date" in str(detail).lower()


def test_assignment_preview_rejects_empty_title(client):
    """Ticket 22: empty title is rejected with a fix-it message before submit."""
    headers, local_course_id = _register_with_canvas(client)
    resp = client.post(
        f"/api/v1/canvas/courses/{local_course_id}/assignments/preview"
        f"?canvas_url={CANVAS_URL}",
        json={
            "name": "   ",
            "description": "Has description",
            "due_at": "2030-12-15T23:59:00Z",
            "points_possible": 10,
        },
        headers=headers,
    )
    assert resp.status_code == 422
    assert "title" in str(resp.json()["detail"]).lower()


def test_assignment_create_rejects_past_due_date(client):
    """Ticket 22: REST create validates before Canvas write."""
    headers, local_course_id = _register_with_canvas(client)
    with patch(
        "app.services.canvas.create_assignment",
        new_callable=AsyncMock,
    ) as mock_create:
        resp = client.post(
            f"/api/v1/canvas/courses/{local_course_id}/assignments"
            f"?canvas_url={CANVAS_URL}",
            json={
                "name": "Late Lab",
                "description": "Past due",
                "due_at": "2020-01-01T23:59:00Z",
                "points_possible": 10,
            },
            headers=headers,
        )
    assert resp.status_code == 422
    assert "future" in str(resp.json()["detail"]).lower()
    mock_create.assert_not_called()


def test_assignment_preview_course_not_owned(client):
    headers_a, local_course_id = _register_with_canvas(client)
    headers_b, _ = _register_with_canvas(client)
    resp = client.post(
        f"/api/v1/canvas/courses/{local_course_id}/assignments/preview"
        f"?canvas_url={CANVAS_URL}",
        json={"name": "Stolen", "description": "Nope"},
        headers=headers_b,
    )
    assert resp.status_code == 404
    assert headers_a  # keep A alive for clarity; course belongs to A


# ---------------------------------------------------------------------------
# Auth sessions + change-password + password-reset confirm
# ---------------------------------------------------------------------------

def test_list_sessions_includes_current(client):
    reg = _register(client)
    resp = client.get("/api/v1/auth/me/sessions", headers=reg["headers"])
    assert resp.status_code == 200
    sessions = resp.json()
    assert len(sessions) >= 1
    assert any(s["is_current"] for s in sessions)


def test_revoke_other_session(client):
    import time

    password = "Secret123!"
    email = f"sess_{uuid.uuid4()}@example.com"
    first = client.post(
        "/api/v1/auth/register",
        json={"name": "Session User", "email": email, "password": password},
    )
    assert first.status_code == 201
    headers_a = {"Authorization": f"Bearer {first.json()['access_token']}"}

    # JWT payloads only encode second-resolution expiry — sleeping past the
    # current second guarantees login mints a distinct token/session row.
    time.sleep(1.1)
    second = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert second.status_code == 200
    headers_b = {"Authorization": f"Bearer {second.json()['access_token']}"}
    assert first.json()["access_token"] != second.json()["access_token"]

    sessions = client.get("/api/v1/auth/me/sessions", headers=headers_b).json()
    assert len(sessions) >= 2
    other = next(s for s in sessions if not s["is_current"])
    revoke = client.delete(f"/api/v1/auth/me/sessions/{other['id']}", headers=headers_b)
    assert revoke.status_code == 204

    # Revoked session token can no longer call /me
    assert client.get("/api/v1/auth/me", headers=headers_a).status_code == 401
    assert client.get("/api/v1/auth/me", headers=headers_b).status_code == 200


def test_revoke_unknown_session_returns_404(client):
    reg = _register(client)
    resp = client.delete("/api/v1/auth/me/sessions/999999999", headers=reg["headers"])
    assert resp.status_code == 404


def test_change_password_rejects_wrong_current(client):
    reg = _register(client)
    resp = client.post(
        "/api/v1/auth/me/change-password",
        json={"current_password": "wrong-password", "new_password": "Secret123!"},
        headers=reg["headers"],
    )
    assert resp.status_code == 401
    assert "incorrect" in resp.json()["detail"].lower()


def test_change_password_success(client):
    password = "Secret123!"
    reg = _register(client, password=password)
    resp = client.post(
        "/api/v1/auth/me/change-password",
        json={"current_password": password, "new_password": "Brandnew99!"},
        headers=reg["headers"],
    )
    assert resp.status_code == 204

    login_old = client.post(
        "/api/v1/auth/login",
        json={"email": reg["email"], "password": password},
    )
    assert login_old.status_code == 401

    login_new = client.post(
        "/api/v1/auth/login",
        json={"email": reg["email"], "password": "Brandnew99!"},
    )
    assert login_new.status_code == 200


def test_change_password_revokes_other_sessions(client):
    """Ticket 35 (#1480): password change keeps the current session and
    invalidates every other active session for that user."""
    import time

    password = "Secret123!"
    email = f"pwd_sess_{uuid.uuid4()}@example.com"
    first = client.post(
        "/api/v1/auth/register",
        json={"name": "Pwd Session User", "email": email, "password": password},
    )
    assert first.status_code == 201
    token_a = first.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # JWT payloads only encode second-resolution expiry — sleeping past the
    # current second guarantees login mints a distinct token/session row.
    time.sleep(1.1)
    second = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert second.status_code == 200
    token_b = second.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}
    assert token_a != token_b

    before = client.get("/api/v1/auth/me/sessions", headers=headers_a)
    assert before.status_code == 200
    assert len(before.json()) >= 2

    changed = client.post(
        "/api/v1/auth/me/change-password",
        json={"current_password": password, "new_password": "Brandnew99!"},
        headers=headers_a,
    )
    assert changed.status_code == 204

    # Current session (A) remains usable.
    me_a = client.get("/api/v1/auth/me", headers=headers_a)
    assert me_a.status_code == 200

    # Other session (B) is revoked.
    me_b = client.get("/api/v1/auth/me", headers=headers_b)
    assert me_b.status_code == 401

    after = client.get("/api/v1/auth/me/sessions", headers=headers_a)
    assert after.status_code == 200
    sessions = after.json()
    assert len(sessions) == 1
    assert sessions[0]["is_current"] is True


def test_password_reset_confirm_success(client):
    email = f"reset_{uuid.uuid4()}@example.com"
    password = "Secret123!"
    client.post(
        "/api/v1/auth/register",
        json={"name": "Reset User", "email": email, "password": password},
    )

    async def _issue_token() -> str:
        from app.services.auth import request_password_reset

        async with _db() as db:
            token = await request_password_reset(db, email)
            assert token is not None
            return token

    raw_token = asyncio.run(_issue_token())
    confirm = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": raw_token, "new_password": "Resetpass99!"},
    )
    assert confirm.status_code == 204

    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Resetpass99!"},
    )
    assert login.status_code == 200


def test_password_reset_confirm_rejects_invalid_token(client):
    resp = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": "not-a-real-token", "new_password": "Resetpass99!"},
    )
    assert resp.status_code == 400
    assert "invalid" in resp.json()["detail"].lower() or "expired" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# PATCH /messages/drafts/{id}
# ---------------------------------------------------------------------------

def test_patch_message_draft(client):
    headers = _register(client)["headers"]
    create = client.post(
        "/api/v1/messages/drafts",
        json={
            "subject": "Hello",
            "body": "Original body",
            "recipients": [{"id": "1", "name": "Alex"}],
        },
        headers=headers,
    )
    assert create.status_code == 201, create.json()
    draft_id = create.json()["id"]

    patch = client.patch(
        f"/api/v1/messages/drafts/{draft_id}",
        json={"subject": "Updated subject", "body": "Updated body"},
        headers=headers,
    )
    assert patch.status_code == 200, patch.json()
    assert patch.json()["subject"] == "Updated subject"
    assert patch.json()["body"] == "Updated body"

    get = client.get(f"/api/v1/messages/drafts/{draft_id}", headers=headers)
    assert get.json()["subject"] == "Updated subject"


def test_patch_message_draft_isolation(client):
    headers_a = _register(client)["headers"]
    headers_b = _register(client)["headers"]
    create = client.post(
        "/api/v1/messages/drafts",
        json={"subject": "Private", "body": "Mine", "recipients": []},
        headers=headers_a,
    )
    draft_id = create.json()["id"]

    patch = client.patch(
        f"/api/v1/messages/drafts/{draft_id}",
        json={"subject": "Hijacked"},
        headers=headers_b,
    )
    assert patch.status_code == 404
