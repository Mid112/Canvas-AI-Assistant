"""Canonical assignment/quiz due-date parsing for Canvas writes (#1435).

Chat and MCP often emit naive ISO times or omit minutes/seconds. Canvas and
our previews must share one UTC-normalized representation so hour updates,
timezone conversion, and omitted seconds stay consistent from preview → PUT.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, time

from dateutil import parser as date_parser

# Numeric slash/dash dates like 07/08/2026 are ambiguous (MDY vs DMY).
# Leave them untouched so downstream validation asks for an ISO date.
_AMBIGUOUS_NUMERIC_DATE = re.compile(r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$")
_DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_due_date(value: str) -> datetime:
    """Parse a due-date string into an aware UTC datetime.

    Rules:
    - Date-only (``YYYY-MM-DD``) → ``23:59:00`` UTC (end-of-day default).
    - Missing minutes/seconds → ``0``.
    - Naive datetimes → UTC wall clock (LLM/ISO without offset).
    - Aware datetimes → converted to UTC.
    """
    raw = value.strip()
    if _DATE_ONLY.match(raw):
        return datetime.combine(datetime.fromisoformat(raw).date(), time(23, 59, 0), tzinfo=UTC)

    parsed = date_parser.parse(raw)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    else:
        parsed = parsed.astimezone(UTC)
    return parsed.replace(microsecond=0)


def normalize_due_date_to_utc_iso(value: str) -> str:
    """Normalize to a Canvas-safe UTC ISO string, or return the original
    value when the input is ambiguous/unparseable so validation can error.
    """
    if not isinstance(value, str):
        return value
    raw = value.strip()
    if not raw:
        return value
    if _AMBIGUOUS_NUMERIC_DATE.match(raw):
        return value
    try:
        return parse_due_date(raw).isoformat()
    except (date_parser.ParserError, ValueError, OverflowError, TypeError):
        return value


def format_due_date_for_preview(due_date: str | None) -> str:
    """Human-readable due date using the same UTC instant Canvas will store."""
    if not due_date:
        return "No due date set"
    try:
        return parse_due_date(due_date).strftime("%B %d, %Y at %I:%M %p UTC")
    except (date_parser.ParserError, ValueError, OverflowError, TypeError):
        return due_date
