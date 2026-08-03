"""Canonical assignment/quiz due-date parsing for Canvas writes (#1435).

Chat and MCP often emit naive ISO times or omit minutes/seconds. Canvas and
our previews must share one UTC-normalized representation so hour updates,
timezone conversion, and omitted seconds stay consistent from preview → PUT.

When an instructor Canvas timezone is known, naive wall-clock values are
interpreted in that zone (not UTC or browser local time).
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dateutil import parser as date_parser

# Numeric slash/dash dates like 07/08/2026 are ambiguous (MDY vs DMY).
# Leave them untouched so downstream validation asks for an ISO date.
_AMBIGUOUS_NUMERIC_DATE = re.compile(r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$")
_DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _resolve_timezone(name: str | None) -> datetime.tzinfo:
    if not name:
        return UTC
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return UTC


def parse_due_date(value: str, instructor_timezone: str | None = None) -> datetime:
    """Parse a due-date string into an aware UTC datetime.

    Rules:
    - Date-only (``YYYY-MM-DD``) → ``23:59:00`` end-of-day in instructor TZ.
    - Missing minutes/seconds → ``0``.
    - Naive datetimes → instructor Canvas timezone wall clock (UTC fallback).
    - Aware datetimes → converted to UTC.
    """
    tz = _resolve_timezone(instructor_timezone)
    raw = value.strip()
    if _DATE_ONLY.match(raw):
        local_dt = datetime.combine(
            datetime.fromisoformat(raw).date(),
            time(23, 59, 0),
            tzinfo=tz,
        )
        return local_dt.astimezone(UTC).replace(microsecond=0)

    parsed = date_parser.parse(raw)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=tz)
    else:
        parsed = parsed.astimezone(UTC)
    return parsed.astimezone(UTC).replace(microsecond=0)


def normalize_due_date_to_utc_iso(
    value: str,
    instructor_timezone: str | None = None,
) -> str:
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
        return parse_due_date(raw, instructor_timezone).isoformat()
    except (date_parser.ParserError, ValueError, OverflowError, TypeError):
        return value


def format_due_date_for_preview(
    due_date: str | None,
    instructor_timezone: str | None = None,
) -> str:
    """Human-readable due date using the same instant Canvas will store."""
    if not due_date:
        return "No due date set"
    try:
        parsed = parse_due_date(due_date, instructor_timezone)
        tz = _resolve_timezone(instructor_timezone)
        local = parsed.astimezone(tz)
        suffix = local.strftime("%Z") if instructor_timezone else "UTC"
        return local.strftime(f"%B %d, %Y at %I:%M %p {suffix}")
    except (date_parser.ParserError, ValueError, OverflowError, TypeError):
        return due_date
