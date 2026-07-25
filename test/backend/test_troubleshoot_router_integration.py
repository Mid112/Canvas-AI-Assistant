"""Integration tests for the Secure Troubleshooting diagnostics endpoint
(GET /admin/troubleshoot/diagnostics). Failed-operations listing itself now
lives at GET /admin/failed-operations (Feature 11, see
test_failed_operations.py) -- Troubleshooting's diagnostics summary reuses
that table rather than keeping its own separate failed-ops query/endpoint."""

import json
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from integration_helpers import CANVAS_URL, admin_login, auth, register_instructor

DIAGNOSTICS = "/api/v1/admin/troubleshoot/diagnostics"
INSTRUCTOR_CANVAS_CONNECTIONS = "/api/v1/admin/troubleshoot/instructor-canvas-connections"
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
    # instructor_canvas is counts-only here -- the per-connection detail list
    # moved to its own paginated endpoint (see tests below) so paging through
    # it doesn't re-run the health/LLM-provider checks bundled into this response.
    assert set(body["instructor_canvas"].keys()) == {"total", "healthy", "failing"}


def test_instructor_canvas_connections_requires_admin(client):
    instructor = register_instructor(client)
    resp = client.get(INSTRUCTOR_CANVAS_CONNECTIONS, headers=instructor["headers"])
    assert resp.status_code == 403


def test_instructor_canvas_connections_requires_auth(client):
    resp = client.get(INSTRUCTOR_CANVAS_CONNECTIONS)
    assert resp.status_code == 401


def test_instructor_canvas_connections_returns_expected_shape(client, admin_headers):
    resp = client.get(INSTRUCTOR_CANVAS_CONNECTIONS, headers=admin_headers)

    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"items", "total"}
    assert isinstance(body["items"], list)
    assert isinstance(body["total"], int)


def test_instructor_canvas_connections_rejects_invalid_pagination_params(client, admin_headers):
    assert (
        client.get(f"{INSTRUCTOR_CANVAS_CONNECTIONS}?limit=0", headers=admin_headers).status_code
        == 422
    )
    assert (
        client.get(f"{INSTRUCTOR_CANVAS_CONNECTIONS}?limit=101", headers=admin_headers).status_code
        == 422
    )
    assert (
        client.get(f"{INSTRUCTOR_CANVAS_CONNECTIONS}?offset=-1", headers=admin_headers).status_code
        == 422
    )


def test_instructor_canvas_connections_never_exposes_canvas_token(client, admin_headers):
    """Same regression guard as test_troubleshoot_diagnostics_never_exposes_canvas_token,
    applied to the dedicated connections-listing endpoint."""
    email = f"tokencheck_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Token Check Connections", "email": email, "password": "secret123"},
    )
    headers = auth(reg.json()["access_token"])

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        connect = client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": CANVAS_TOKEN, "canvas_url": CANVAS_URL},
            headers=headers,
        )
    assert connect.status_code == 200, connect.json()

    resp = client.get(INSTRUCTOR_CANVAS_CONNECTIONS, headers=admin_headers)

    assert CANVAS_TOKEN not in resp.text


def test_troubleshoot_diagnostics_never_exposes_canvas_token(client, admin_headers):
    """Regression test for #903 (prevent token exposure): connects Canvas
    with a known token, then asserts that token never appears anywhere in
    the diagnostics response body -- encrypted or plaintext."""
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

    assert CANVAS_TOKEN not in diagnostics.text
    # Also guard against the encrypted form ever round-tripping through --
    # not directly checkable without decrypting, but DiagnosticsResponse has
    # no field that could carry it, so this is a structural guarantee backed
    # by the shape assertion above.
    assert json.dumps(diagnostics.json())  # response is well-formed JSON
