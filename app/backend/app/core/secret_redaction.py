"""Redact credentials from strings that may be logged or persisted."""

from __future__ import annotations

import re

_REDACTION_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(?i)(authorization\s*[:=]\s*bearer\s+)\S+"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(\bx-api-key\s*[:=]\s*)\S+"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(\bapi[_-]?key\s*[:=]\s*)\S+"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(\b(?:access_)?token\s*[:=]\s*)\S+"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(\bbearer\s+)\S+"), r"\1[REDACTED]"),
    # Common hosted-provider key shapes (OpenAI, Anthropic, Hugging Face, Groq).
    (re.compile(r"\b(sk-(?:ant-)?[A-Za-z0-9_-]{8,})\b"), "[REDACTED_API_KEY]"),
    (re.compile(r"\b(hf_[A-Za-z0-9]{8,})\b"), "[REDACTED_API_KEY]"),
    (re.compile(r"\b(gsk_[A-Za-z0-9]{8,})\b"), "[REDACTED_API_KEY]"),
)


def redact_secrets(text: str) -> str:
    """Return text with API keys, bearer tokens, and similar secrets scrubbed."""
    if not text:
        return text
    redacted = text
    for pattern, replacement in _REDACTION_PATTERNS:
        redacted = pattern.sub(replacement, redacted)
    return redacted


def safe_exception_text(exc: BaseException) -> str:
    """Exception text safe for logs / conversation history (no raw credentials)."""
    return redact_secrets(f"{type(exc).__name__}: {exc}")
