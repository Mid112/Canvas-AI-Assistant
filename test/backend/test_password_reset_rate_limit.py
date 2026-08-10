"""
Regression tests for password-reset rate limits (5/minute, see limiter.py).

Isolated from modules that disable app.state.limiter for their whole run.
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


def test_password_reset_request_6th_request_in_a_minute_returns_429(client):
    email = f"nobody_{uuid.uuid4()}@example.com"

    for _ in range(5):
        resp = client.post("/api/v1/auth/password-reset/request", json={"email": email})
        assert resp.status_code == 200

    resp = client.post("/api/v1/auth/password-reset/request", json={"email": email})
    assert resp.status_code == 429


def test_password_reset_confirm_6th_request_in_a_minute_returns_429(client):
    payload = {"token": "invalid-token", "new_password": "Newsecret123!"}

    for _ in range(5):
        resp = client.post("/api/v1/auth/password-reset/confirm", json=payload)
        assert resp.status_code == 400

    resp = client.post("/api/v1/auth/password-reset/confirm", json=payload)
    assert resp.status_code == 429
