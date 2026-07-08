"""
Regression test for the admin login rate limit (5/minute, see limiter.py).

Isolated from test_admin_auth.py because that module disables
app.state.limiter for its whole run — this file needs it enabled.
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    app.state.limiter.reset()
    with TestClient(app) as c:
        yield c
    app.state.limiter.reset()


# Verifies: Admin login 6th request in a minute returns 429.
def test_admin_login_6th_request_in_a_minute_returns_429(client):
    payload = {"email": f"nobody_{uuid.uuid4()}@example.com", "password": "wrong"}

    for _ in range(5):
        resp = client.post("/api/v1/auth/admin/login", json=payload)
        assert resp.status_code == 401

    resp = client.post("/api/v1/auth/admin/login", json=payload)
    assert resp.status_code == 429
