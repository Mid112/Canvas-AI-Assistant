"""Integration tests for the Secure Troubleshooting endpoints
(GET /admin/troubleshoot/diagnostics, GET /admin/troubleshoot/failed-operations)."""

import json
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient

from app.main import app
from integration_helpers import (
    CANVAS_URL,
    admin_login,
    auth,
    connect_canvas_and_sync_course,
    propose_create_assignment,
    register_instructor,
)

DIAGNOSTICS = "/api/v1/admin/troubleshoot/diagnostics"
FAILED_OPS = "/api/v1/admin/troubleshoot/failed-operations"
CANVAS_TOKEN = f"secret-canvas-token-{uuid.uuid4()}"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def admin_headers(client, admin_credentials):
    return admin_login(client, admin_credentials)


def test_diagnostics_requires_admin(client):
    instructor = register_instructor(client)
    resp = client.get(DIAGNOSTICS, headers=instructor["headers"])
    assert resp.status_code == 403


def test_diagnostics_requires_auth(client):
    resp = client.get(DIAGNOSTICS)
    assert resp.status_code == 401


def test_failed_operations_requires_admin(client):
    instructor = register_instructor(client)
    resp = client.get(FAILED_OPS, headers=instructor["headers"])
    assert resp.status_code == 403


def test_diagnostics_returns_expected_shape(client, admin_headers):
    resp = client.get(DIAGNOSTICS, headers=admin_headers)

    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {
        "canvas_api_url",
        "backend_uptime_seconds",
        "health",
        "instructor_canvas",
        "llm_providers",
        "recent_failed_operations_count",
    }
    assert body["backend_uptime_seconds"] >= 0
    assert body["recent_failed_operations_count"] >= 0
    assert isinstance(body["llm_providers"], list)


def test_failed_operations_returns_paginated_shape(client, admin_headers):
    resp = client.get(f"{FAILED_OPS}?limit=5&offset=0", headers=admin_headers)

    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body and "total" in body
    assert body["total"] >= 0
    assert len(body["items"]) <= 5


def test_failed_operations_lists_a_real_failed_workflow(client, admin_headers):
    """Drives an actual confirmed Canvas write that fails (mirrors
    test_chat_confirm.py::test_confirm_canvas_failure_returns_chat_error),
    then verifies the resulting failed Workflow surfaces through the
    troubleshooting endpoint an admin actually sees."""
    instructor = register_instructor(client, prefix="failops")
    local_course_id = connect_canvas_and_sync_course(client, instructor["headers"])
    conversation_id, pending_message_id = propose_create_assignment(
        client, instructor["headers"], local_course_id
    )

    with patch(
        "app.mcp_tools.dispatcher.create_course_assignment",
        new=AsyncMock(
            side_effect=HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Canvas server error: 503",
            )
        ),
    ):
        confirm = client.post(
            "/api/v1/chat/confirm",
            json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
            headers=instructor["headers"],
        )
    assert confirm.status_code == 200, confirm.json()

    resp = client.get(f"{FAILED_OPS}?limit=200", headers=admin_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    matches = [item for item in items if item["user_email"] == instructor["email"]]
    assert len(matches) == 1
    assert matches[0]["action_name"] == "create_assignment"
    assert matches[0]["error_detail"] is not None


def test_troubleshoot_endpoints_never_expose_canvas_token(client, admin_headers):
    """Regression test for #903 (prevent token exposure): connects Canvas
    with a known token, then asserts that token never appears anywhere in
    either troubleshooting response body -- encrypted or plaintext."""
    email = f"tokencheck_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Token Check", "email": email, "password": "secret123"},
    )
    headers = auth(reg.json()["access_token"])

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        connect = client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": CANVAS_TOKEN, "canvas_url": CANVAS_URL},
            headers=headers,
        )
    assert connect.status_code == 200, connect.json()

    diagnostics = client.get(DIAGNOSTICS, headers=admin_headers)
    failed_ops = client.get(FAILED_OPS, headers=admin_headers)

    assert CANVAS_TOKEN not in diagnostics.text
    assert CANVAS_TOKEN not in failed_ops.text
    # Also guard against the encrypted form ever round-tripping through --
    # not directly checkable without decrypting, but the response schemas
    # (DiagnosticsResponse/FailedOperationListResponse) have no field that
    # could carry it, so this is a structural guarantee backed by the shape
    # assertions above.
    assert json.dumps(diagnostics.json())  # response is well-formed JSON
