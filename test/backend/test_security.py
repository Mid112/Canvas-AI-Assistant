import pytest

"""
Pure unit tests for app.core.security — no DB, no HTTP client.

Covers the changes introduced in the admin-auth feature:
  - create_access_token now embeds `role` in the JWT payload
  - decode_access_token now returns (user_id, role) and handles old tokens
  - hash_token produces a stable SHA-256 hex digest
"""
from datetime import UTC, datetime, timedelta

from jose import jwt

from app.config import settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    fingerprint_canvas_token,
    hash_token,
)

# ---------------------------------------------------------------------------
# create_access_token
# ---------------------------------------------------------------------------

# Verifies: Create access token embeds role.
def test_create_access_token_embeds_role():
    token = create_access_token(42, role="admin")
    user_id, role = decode_access_token(token)
    assert user_id == "42"
    assert role == "admin"


# Verifies: Create access token default role is instructor.
def test_create_access_token_default_role_is_instructor():
    token = create_access_token(1)
    _, role = decode_access_token(token)
    assert role == "instructor"


# Verifies: Create access token encodes user id as string.
def test_create_access_token_encodes_user_id_as_string():
    token = create_access_token(999, role="ta")
    user_id, _ = decode_access_token(token)
    assert user_id == "999"


# Verifies: Create access token sets expiry.
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

# Verifies: Decode access token old token without role defaults to instructor.
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


# Verifies: Decode access token returns string user id.
def test_decode_access_token_returns_string_user_id():
    token = create_access_token(123, role="admin")
    user_id, _ = decode_access_token(token)
    assert isinstance(user_id, str)


# Verifies: Decode access token returns string role.
def test_decode_access_token_returns_string_role():
    token = create_access_token(1, role="ta")
    _, role = decode_access_token(token)
    assert isinstance(role, str)


# ---------------------------------------------------------------------------
# hash_token
# ---------------------------------------------------------------------------

# Verifies: Hash token is deterministic.
def test_hash_token_is_deterministic():
    t = "some.jwt.token"
    assert hash_token(t) == hash_token(t)


# Verifies: Hash token different inputs produce different hashes.
def test_hash_token_different_inputs_produce_different_hashes():
    assert hash_token("token_a") != hash_token("token_b")


# Verifies: Hash token produces 64 char hex digest.
def test_hash_token_produces_64_char_hex_digest():
    # SHA-256 hex digest is always exactly 64 characters
    assert len(hash_token("any_token")) == 64


# Verifies: Hash token is hex string.
def test_hash_token_is_hex_string():
    digest = hash_token("test")
    int(digest, 16)  # raises ValueError if not valid hex


# ---------------------------------------------------------------------------
# Canvas token fingerprint
# ---------------------------------------------------------------------------

def test_canvas_token_fingerprint_is_deterministic():
    assert fingerprint_canvas_token("canvas-token") == fingerprint_canvas_token("canvas-token")


@pytest.mark.requirement("FR1.5")
def test_canvas_token_fingerprint_does_not_equal_raw_token():
    assert fingerprint_canvas_token("canvas-token") != "canvas-token"


def test_canvas_token_fingerprint_changes_for_different_tokens():
    assert fingerprint_canvas_token("canvas-token-a") != fingerprint_canvas_token("canvas-token-b")
