"""Unit tests for shared password strength policy (#1451)."""

import pytest
from pydantic import ValidationError

from app.core.password_policy import (
    PASSWORD_REQUIREMENTS_MESSAGE,
    is_strong_password,
    validate_password_strength,
)
from app.schemas.auth import (
    ChangePasswordRequest,
    PasswordResetConfirmRequest,
    RegisterRequest,
)


def test_is_strong_password_requires_all_rules():
    assert is_strong_password("Secret123!") is True
    assert is_strong_password("secret123!") is False
    assert is_strong_password("SECRET123!") is False
    assert is_strong_password("Secret!!!!") is False
    assert is_strong_password("Secret123") is False
    assert is_strong_password("Sec1!") is False


def test_validate_password_strength_raises_clear_message():
    with pytest.raises(ValueError, match="uppercase letter"):
        validate_password_strength("secret123")
    assert validate_password_strength("Secret123!") == "Secret123!"


def test_register_request_rejects_weak_password():
    with pytest.raises(ValidationError) as exc:
        RegisterRequest(
            name="Jane",
            email="jane@example.com",
            password="secret123",
        )
    assert PASSWORD_REQUIREMENTS_MESSAGE in str(exc.value)


def test_password_reset_and_change_reject_weak_password():
    with pytest.raises(ValidationError):
        PasswordResetConfirmRequest(token="tok", new_password="weakpass1")
    with pytest.raises(ValidationError):
        ChangePasswordRequest(
            current_password="OldPass123!",
            new_password="weakpass1",
        )
