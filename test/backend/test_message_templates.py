import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app


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
