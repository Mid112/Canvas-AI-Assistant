"""
Pure unit tests for app.core.security — no DB, no HTTP client.

Covers the changes introduced in the admin-auth feature:
  - create_access_token now embeds `role` in the JWT payload
  - decode_access_token now returns (user_id, role) and handles old tokens
  - hash_token produces a stable SHA-256 hex digest
"""
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from jose import jwt

backend_path = Path(__file__).parent.parent.parent / "app" / "backend"
sys.path.insert(0, str(backend_path))

from app.config import settings
from app.core.security import create_access_token, decode_access_token, hash_token


# ---------------------------------------------------------------------------
# create_access_token
# ---------------------------------------------------------------------------

def test_create_access_token_embeds_role():
    token = create_access_token(42, role="admin")
    user_id, role = decode_access_token(token)
    assert user_id == "42"
    assert role == "admin"


def test_create_access_token_default_role_is_instructor():
    token = create_access_token(1)
    _, role = decode_access_token(token)
    assert role == "instructor"


def test_create_access_token_encodes_user_id_as_string():
    token = create_access_token(999, role="ta")
    user_id, _ = decode_access_token(token)
    assert user_id == "999"


def test_create_access_token_sets_expiry():
    before = datetime.now(UTC)
    token = create_access_token(1, role="instructor")
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    exp = datetime.fromtimestamp(payload["exp"], tz=UTC)
    expected = before + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    # Allow a 5-second window for test execution time
    assert abs((exp - expected).total_seconds()) < 5


# ---------------------------------------------------------------------------
# decode_access_token — backward compatibility
# ---------------------------------------------------------------------------

def test_decode_access_token_old_token_without_role_defaults_to_instructor():
    """Tokens minted before the role claim was added must still decode cleanly."""
    old_token = jwt.encode(
        {"sub": "77", "exp": datetime.now(UTC) + timedelta(minutes=30)},
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    user_id, role = decode_access_token(old_token)
    assert user_id == "77"
    assert role == "instructor"


def test_decode_access_token_returns_string_user_id():
    token = create_access_token(123, role="admin")
    user_id, _ = decode_access_token(token)
    assert isinstance(user_id, str)


def test_decode_access_token_returns_string_role():
    token = create_access_token(1, role="ta")
    _, role = decode_access_token(token)
    assert isinstance(role, str)


# ---------------------------------------------------------------------------
# hash_token
# ---------------------------------------------------------------------------

def test_hash_token_is_deterministic():
    t = "some.jwt.token"
    assert hash_token(t) == hash_token(t)


def test_hash_token_different_inputs_produce_different_hashes():
    assert hash_token("token_a") != hash_token("token_b")


def test_hash_token_produces_64_char_hex_digest():
    # SHA-256 hex digest is always exactly 64 characters
    assert len(hash_token("any_token")) == 64


def test_hash_token_is_hex_string():
    digest = hash_token("test")
    int(digest, 16)  # raises ValueError if not valid hex
