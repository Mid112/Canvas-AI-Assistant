"""Redact credentials from strings that may be logged or persisted.

Feature 14 (#906): chat paths call `redact_secrets` explicitly, and a process-wide
log-record factory installs the same scrubbing on every logger so secrets that
leak into `logger.info/warning/exception` messages are scrubbed too.
"""

from __future__ import annotations

import logging
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


def _redact_log_arg(value):
    if isinstance(value, str):
        return redact_secrets(value)
    return value


def _scrub_log_record(record: logging.LogRecord) -> logging.LogRecord:
    """Scrub secrets without changing the record's formatting contract.

    Uvicorn's access formatter unpacks ``record.args`` directly instead of
    calling ``record.getMessage()``. Preserve the args shape so access logs
    can still render 4xx/5xx responses cleanly.
    """
    if isinstance(record.msg, str) and not record.args:
        record.msg = redact_secrets(record.msg)
    if isinstance(record.args, tuple):
        record.args = tuple(_redact_log_arg(arg) for arg in record.args)
    elif isinstance(record.args, dict):
        record.args = {
            key: _redact_log_arg(value)
            for key, value in record.args.items()
        }
    return record


class SecretRedactionFilter(logging.Filter):
    """Scrub credentials from a log record (usable on individual handlers)."""

    def filter(self, record: logging.LogRecord) -> bool:
        _scrub_log_record(record)
        return True


_FACTORY_INSTALLED = False
_PRIOR_FACTORY = None


def _redacting_record_factory(*args, **kwargs) -> logging.LogRecord:
    factory = _PRIOR_FACTORY or logging.LogRecord
    return _scrub_log_record(factory(*args, **kwargs))


def install_secret_redaction_logging() -> None:
    """Install a process-wide LogRecord factory so every logger is scrubbed.

    A root-logger Filter alone is not enough: child loggers only run their own
    filters before emit, so secrets logged via `logging.getLogger(__name__)`
    would still leak. The record factory runs at LogRecord creation time.
    """
    global _FACTORY_INSTALLED, _PRIOR_FACTORY
    if _FACTORY_INSTALLED:
        return
    _PRIOR_FACTORY = logging.getLogRecordFactory()
    logging.setLogRecordFactory(_redacting_record_factory)
    _FACTORY_INSTALLED = True
