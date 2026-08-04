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


def _headers(client: TestClient, name: str = "Template User") -> dict[str, str]:
    email = f"templates_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": name, "email": email, "password": "secret123"},
    )
    return {"Authorization": f"Bearer {reg.json()['access_token']}"}


def _sync_course(client: TestClient, headers: dict[str, str], name: str) -> int:
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
            "name": name,
            "course_code": name.replace(" ", ""),
            "enrollment_term_id": 1,
            "workflow_state": "available",
        }]
        resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)

    return resp.json()[0]["local_id"]


# Verifies: Create and list message templates.
def test_create_and_list_message_templates(client):
    headers = _headers(client)

    create = client.post(
        "/api/v1/message-templates/",
        json={"title": "Missing work reminder", "content": "Please submit your assignment."},
        headers=headers,
    )

    assert create.status_code == 201
    body = create.json()
    assert body["title"] == "Missing work reminder"
    assert body["content"] == "Please submit your assignment."
    assert body["course_id"] is None

    listed = client.get("/api/v1/message-templates/", headers=headers)
    assert listed.status_code == 200
    assert any(template["id"] == body["id"] for template in listed.json())


# Verifies: Update message template.
def test_update_message_template(client):
    headers = _headers(client)
    created = client.post(
        "/api/v1/message-templates/",
        json={"title": "Draft", "content": "Original body"},
        headers=headers,
    ).json()

    response = client.patch(
        f"/api/v1/message-templates/{created['id']}",
        json={"title": "Updated", "content": "Updated body"},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Updated"
    assert response.json()["content"] == "Updated body"


# Verifies: Message template is user scoped.
def test_message_template_is_user_scoped(client):
    owner_headers = _headers(client, name="Owner")
    other_headers = _headers(client, name="Other")
    created = client.post(
        "/api/v1/message-templates/",
        json={"title": "Private", "content": "Only mine"},
        headers=owner_headers,
    ).json()

    assert client.get(f"/api/v1/message-templates/{created['id']}", headers=other_headers).status_code == 404
    assert client.patch(
        f"/api/v1/message-templates/{created['id']}",
        json={"title": "Stolen"},
        headers=other_headers,
    ).status_code == 404
    assert client.delete(f"/api/v1/message-templates/{created['id']}", headers=other_headers).status_code == 404


# Verifies: Delete message template.
def test_delete_message_template(client):
    headers = _headers(client)
    created = client.post(
        "/api/v1/message-templates/",
        json={"title": "Delete", "content": "Remove me"},
        headers=headers,
    ).json()

    delete = client.delete(f"/api/v1/message-templates/{created['id']}", headers=headers)

    assert delete.status_code == 204
    assert client.get(f"/api/v1/message-templates/{created['id']}", headers=headers).status_code == 404


# Verifies: Message templates require auth.
def test_message_templates_require_auth(client):
    response = client.get("/api/v1/message-templates/")
    assert response.status_code == 401


# Verifies: Course-scoped list includes user-wide (course_id null) templates.
def test_list_message_templates_includes_global_when_course_scoped(client):
    headers = _headers(client)

    global_template = client.post(
        "/api/v1/message-templates/",
        json={"title": "Global reminder", "content": "Applies everywhere."},
        headers=headers,
    ).json()

    course_id = _sync_course(client, headers, "Template Course")
    other_course_id = _sync_course(client, headers, "Other Course")

    course_template = client.post(
        "/api/v1/message-templates/",
        json={
            "title": "Course reminder",
            "content": "Only for this course.",
            "course_id": course_id,
        },
        headers=headers,
    ).json()

    client.post(
        "/api/v1/message-templates/",
        json={
            "title": "Other course only",
            "content": "Should not appear.",
            "course_id": other_course_id,
        },
        headers=headers,
    )

    listed = client.get(
        f"/api/v1/message-templates/?course_id={course_id}",
        headers=headers,
    )

    assert listed.status_code == 200
    ids = {template["id"] for template in listed.json()}
    assert global_template["id"] in ids
    assert course_template["id"] in ids
    assert len(ids) == 2
