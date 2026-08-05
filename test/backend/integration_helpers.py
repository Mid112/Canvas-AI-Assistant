"""Shared helpers for feature-level integration tests (#711–#714)."""

from __future__ import annotations

import json
import uuid
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.schemas.canvas import AssignmentResponse

CANVAS_URL = "https://canvas.example.edu"


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def register_instructor(client: TestClient, *, prefix: str = "inst") -> dict:
    email = f"{prefix}_{uuid.uuid4()}@example.com"
    password = "Secret123!"
    resp = client.post(
        "/api/v1/auth/register",
        json={"name": "Integration Instructor", "email": email, "password": password},
    )
    assert resp.status_code == 201, resp.json()
    token = resp.json()["access_token"]
    return {
        "email": email,
        "password": password,
        "token": token,
        "headers": auth(token),
    }


def connect_canvas_and_sync_course(client: TestClient, headers: dict) -> int:
    """Connect Canvas for the instructor and sync one course, then set it
    active. Returns local_course_id.

    The active-course PATCH also seeds canvas_course_names (see
    set_active_course's sync_courses_if_stale call) — that's what lets a
    chat turn with no explicit local_course_id and no course_name in the
    mocked LLM reply still resolve a course via the
    UserPreference.active_course_id fallback in get_or_create_conversation.
    Without it, the model is never trusted with a raw local_course_id
    (see COURSE RESOLUTION in build_system_prompt), so every chat turn
    below would get stuck asking "Which course is this about?" instead of
    producing a real preview."""
    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        patch_resp = client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": CANVAS_URL},
            headers=headers,
        )
    assert patch_resp.status_code == 200, patch_resp.json()

    canvas_course_id = uuid.uuid4().int % 10_000_000
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = [
            {
                "id": canvas_course_id,
                "name": "CPSC 310",
                "course_code": "CPSC310",
                "enrollment_term_id": 1,
                "workflow_state": "available",
                "total_students": 12,
            }
        ]
        resp = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}",
            headers=headers,
        )
        assert resp.status_code == 200, resp.json()
        assert len(resp.json()) >= 1
        local_course_id = resp.json()[0]["local_id"]

        active_resp = client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_course_id},
            headers=headers,
        )
        assert active_resp.status_code == 200, active_resp.json()

    return local_course_id


def register_with_canvas(client: TestClient, *, prefix: str = "canvas") -> tuple[dict, int]:
    instructor = register_instructor(client, prefix=prefix)
    local_course_id = connect_canvas_and_sync_course(client, instructor["headers"])
    return instructor["headers"], local_course_id


def create_assignment_preview_llm(local_course_id: int, title: str = "Midterm Exam") -> str:
    return json.dumps(
        {
            "action": "intent_preview",
            "summary": f"Create {title}",
            "proposed_action": {
                "action": "create_assignment",
                "local_course_id": local_course_id,
                "title": title,
                "description": "Covers chapters 1 through 5",
                "due_date": "2030-01-01T00:00:00",
                "points_possible": 100,
            },
        }
    )


def chat_turn(
    client: TestClient,
    headers: dict,
    message: str,
    llm_output: str,
    *,
    conversation_id: int | None = None,
    pending_message_id: int | None = None,
) -> dict:
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = llm_output
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={
                "message": message,
                "conversation_id": conversation_id,
                "pending_message_id": pending_message_id,
            },
            headers=headers,
        )
    assert response.status_code == 200, response.json()
    return response.json()


def propose_create_assignment(
    client: TestClient,
    headers: dict,
    local_course_id: int,
    *,
    title: str = "Midterm Exam",
) -> tuple[int, int]:
    body = chat_turn(
        client,
        headers,
        f"create {title}",
        create_assignment_preview_llm(local_course_id, title),
    )
    pending = body["reply"]["pending_message_id"]
    assert pending is not None
    return body["conversation_id"], pending


def fake_assignment(title: str = "Midterm Exam") -> AssignmentResponse:
    return AssignmentResponse(
        id=42,
        name=title,
        description="Covers chapters 1 through 5",
        due_at="2030-01-01T00:00:00",
        points_possible=100.0,
        course_id=9999,
    )


def admin_login(client: TestClient, admin_credentials: dict) -> dict[str, str]:
    resp = client.post("/api/v1/auth/admin/login", json=admin_credentials)
    assert resp.status_code == 200, resp.json()
    return auth(resp.json()["access_token"])
