"""Shared password strength rules for register / reset / change flows."""

from __future__ import annotations

import re

PASSWORD_MIN_LENGTH = 8

PASSWORD_REQUIREMENTS_MESSAGE = (
    "Password must be at least 8 characters and include an uppercase letter, "
    "a lowercase letter, a number, and a symbol."
)

_UPPER = re.compile(r"[A-Z]")
_LOWER = re.compile(r"[a-z]")
_DIGIT = re.compile(r"\d")
_SYMBOL = re.compile(r"[^A-Za-z0-9]")


def is_strong_password(password: str) -> bool:
    return (
        len(password) >= PASSWORD_MIN_LENGTH
        and _UPPER.search(password) is not None
        and _LOWER.search(password) is not None
        and _DIGIT.search(password) is not None
        and _SYMBOL.search(password) is not None
    )


def validate_password_strength(password: str) -> str:
    if not is_strong_password(password):
        raise ValueError(PASSWORD_REQUIREMENTS_MESSAGE)
    return password
