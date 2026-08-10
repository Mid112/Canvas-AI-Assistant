"""
Integration tests for admin settings persistence and the
allow_instructor_self_registration gate.

Covers:
  - GET /api/v1/admin/settings
  - PATCH /api/v1/admin/settings
  - POST /api/v1/auth/register honoring allow_instructor_self_registration

These specifically guard against a regression where scalar settings (bool,
int, str) written via PATCH were wrapped as {"value": x} on write but read
back via `settings.update(row.value)` — which, for a bool, silently added a
bogus top-level "value" key instead of updating the real setting, so the
setting could never actually change and register_user's gate was dead code.
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def admin_token(client, admin_credentials):
    resp = client.post("/api/v1/auth/admin/login", json=admin_credentials)
    assert resp.status_code == 200, resp.json()
    return resp.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(autouse=True)
def _restore_self_registration(client, admin_headers):
    """Every test in this module starts and ends with self-registration
    enabled, so tests don't leak state into each other or into other test
    modules that register instructors."""
    yield
    client.patch(
        "/api/v1/admin/settings",
        json={"settings": {"allow_instructor_self_registration": True}},
        headers=admin_headers,
    )


def _register(client, email: str | None = None):
    return client.post(
        "/api/v1/auth/register",
        json={
            "name": "Self Registered",
            "email": email or f"selfreg_{uuid.uuid4()}@example.com",
            "password": "Secret123!",
        },
    )


# Verifies: Get settings returns defaults including bool.
def test_get_settings_returns_defaults_including_bool(client, admin_headers):
    resp = client.get("/api/v1/admin/settings", headers=admin_headers)
    assert resp.status_code == 200
    settings = resp.json()["settings"]
    assert settings["allow_instructor_self_registration"] is True
    assert settings["organization_name"] == "Canvas Helper"
    assert settings["session_timeout_minutes"] == 30


# Verifies: Update bool setting round trips correctly.
def test_update_bool_setting_round_trips_correctly(client, admin_headers):
    """The core regression test: writing False for a bool setting must
    actually be read back as False, not silently ignored."""
    patch_resp = client.patch(
        "/api/v1/admin/settings",
        json={"settings": {"allow_instructor_self_registration": False}},
        headers=admin_headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["settings"]["allow_instructor_self_registration"] is False

    get_resp = client.get("/api/v1/admin/settings", headers=admin_headers)
    assert get_resp.status_code == 200
    settings = get_resp.json()["settings"]
    assert settings["allow_instructor_self_registration"] is False
    # The old wrap-in-{"value": x} bug would leak a bogus top-level "value"
    # key instead of ever updating the real one.
    assert "value" not in settings


# Verifies: Update string and int settings round trip.
def test_update_string_and_int_settings_round_trip(client, admin_headers):
    patch_resp = client.patch(
        "/api/v1/admin/settings",
        json={"settings": {"organization_name": "Test University", "session_timeout_minutes": 45}},
        headers=admin_headers,
    )
    assert patch_resp.status_code == 200
    settings = patch_resp.json()["settings"]
    assert settings["organization_name"] == "Test University"
    assert settings["session_timeout_minutes"] == 45

    get_resp = client.get("/api/v1/admin/settings", headers=admin_headers)
    settings = get_resp.json()["settings"]
    assert settings["organization_name"] == "Test University"
    assert settings["session_timeout_minutes"] == 45

    # restore for other tests/modules that assert the default org name
    client.patch(
        "/api/v1/admin/settings",
        json={"settings": {"organization_name": "Canvas Helper", "session_timeout_minutes": 30}},
        headers=admin_headers,
    )


# Verifies: Self registration allowed by default.
def test_self_registration_allowed_by_default(client):
    resp = _register(client)
    assert resp.status_code == 201
    assert "access_token" in resp.json()


# Verifies: Self registration disabled rejects new instructor.
def test_self_registration_disabled_rejects_new_instructor(client, admin_headers):
    disable_resp = client.patch(
        "/api/v1/admin/settings",
        json={"settings": {"allow_instructor_self_registration": False}},
        headers=admin_headers,
    )
    assert disable_resp.status_code == 200
    assert disable_resp.json()["settings"]["allow_instructor_self_registration"] is False

    resp = _register(client)
    assert resp.status_code == 403
    assert "disabled" in resp.json()["detail"].lower()


# Verifies: Self registration re enabled allows registration again.
def test_self_registration_re_enabled_allows_registration_again(client, admin_headers):
    client.patch(
        "/api/v1/admin/settings",
        json={"settings": {"allow_instructor_self_registration": False}},
        headers=admin_headers,
    )
    blocked = _register(client)
    assert blocked.status_code == 403

    client.patch(
        "/api/v1/admin/settings",
        json={"settings": {"allow_instructor_self_registration": True}},
        headers=admin_headers,
    )
    allowed = _register(client)
    assert allowed.status_code == 201
