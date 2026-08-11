"""Canonical assignment/quiz due-date parsing for Canvas writes (#1435).

Chat and MCP often emit naive ISO times or omit minutes/seconds. Canvas and
our previews must share one UTC-normalized representation so hour updates,
timezone conversion, and omitted seconds stay consistent from preview → PUT.

When an instructor Canvas timezone is known, naive wall-clock values are
interpreted in that zone (not UTC or browser local time).

English phrases ("next Friday", "in two weeks") are resolved first, by
relative_dates -- see that module for why an underspecified date needs to
know what it is for before it can be read at all.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, time, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dateutil import parser as date_parser

from app.services.relative_dates import (
    DatePreference,
    apply_year_preference,
    resolve_relative_date,
)
from app.services.relative_dates import (
    safe_replace_year as _safe_replace_year,
)

# Numeric slash/dash dates like 07/08/2026 are ambiguous (MDY vs DMY).
# Leave them untouched so downstream validation asks for an ISO date.
_AMBIGUOUS_NUMERIC_DATE = re.compile(r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$")

# Two defaults that disagree in every component. dateutil fills whatever the
# text omitted and never says what it filled, so parsing twice is the only
# way to find out: a component the input actually stated comes back the same
# both times; one it omitted comes back as two different defaults.
_PROBE_A = datetime(2000, 1, 1, 0, 0, 0)
_PROBE_B = datetime(2001, 2, 3, 4, 5, 6)

# A date with no clock time on it is the end of that day when it is a
# deadline -- "due March 21" has always meant "by the end of March 21", and
# reading it as 00:00 makes the assignment due the instant the day begins,
# a full 24 hours early. A reporting window is the mirror image: "since
# March 21" starts when the day starts.
_END_OF_DAY = time(23, 59, 0)
_START_OF_DAY = time(0, 0, 0)


def _resolve_timezone(name: str | None) -> tzinfo:
    if not name:
        return UTC
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return UTC


def _implied_time(preference: DatePreference) -> time:
    return _START_OF_DAY if preference is DatePreference.PAST else _END_OF_DAY


def _parse_with_specificity(raw: str) -> tuple[datetime, bool, bool]:
    """Parse, and report whether the year and the clock time were stated.

    The time check is the hour alone, on purpose. Naming an hour names a
    time even when the smaller units are left implied -- "9am" is 09:00 and
    "23:59" is 23:59:00 -- so requiring the minute too would read both as
    "no time given" and overwrite them with end-of-day. Probe A's hour is 0
    and probe B's is 4, so they can only agree when the input said so.
    """
    first = date_parser.parse(raw, default=_PROBE_A)
    second = date_parser.parse(raw, default=_PROBE_B)
    year_stated = first.year == second.year
    time_stated = first.hour == second.hour
    return first, year_stated, time_stated


def parse_due_date(
    value: str,
    instructor_timezone: str | None = None,
    *,
    preference: DatePreference = DatePreference.FUTURE,
    today: datetime | None = None,
) -> datetime:
    """Parse a due-date string into an aware UTC datetime.

    Rules:
    - English phrases ("next Friday", "two weeks ago") resolve first.
    - A date with no clock time → end of day in the instructor's zone
      (start of day when ``preference`` is PAST).
    - A date with no year → the next occurrence for a deadline, the most
      recent one for a reporting window. See apply_year_preference for why
      the trigger is the missing year and not a past result.
    - Naive datetimes → instructor Canvas timezone wall clock (UTC fallback).
    - Aware datetimes → an absolute instant already; converted to UTC with
      no rolling, since nothing about them is underspecified.

    ``today`` overrides the reference date, for tests and for callers that
    have already established the instructor's local date.
    """
    tz = _resolve_timezone(instructor_timezone)
    raw = value.strip()
    local_today = (today or datetime.now(tz)).date()

    relative = resolve_relative_date(raw, today=local_today, preference=preference)
    if relative is not None:
        return datetime.combine(
            relative, _implied_time(preference), tzinfo=tz
        ).astimezone(UTC).replace(microsecond=0)

    parsed, year_stated, time_stated = _parse_with_specificity(raw)

    if parsed.tzinfo is not None:
        return parsed.astimezone(UTC).replace(microsecond=0)

    # The probe default's year is a sentinel, not a reading of the input.
    # Start from the current year so "March 21" means one of the two Marches
    # either side of today, and let the preference choose which.
    parsed_date = parsed.date()
    if not year_stated:
        parsed_date = _safe_replace_year(parsed_date, local_today.year)
    local_date = apply_year_preference(
        parsed_date,
        today=local_today,
        year_was_stated=year_stated,
        preference=preference,
    )
    local_time = parsed.time() if time_stated else _implied_time(preference)
    return datetime.combine(local_date, local_time, tzinfo=tz).astimezone(
        UTC
    ).replace(microsecond=0)


def normalize_due_date_to_utc_iso(
    value: str,
    instructor_timezone: str | None = None,
    *,
    preference: DatePreference = DatePreference.FUTURE,
    today: datetime | None = None,
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
        return parse_due_date(
            raw, instructor_timezone, preference=preference, today=today
        ).isoformat()
    except (date_parser.ParserError, ValueError, OverflowError, TypeError):
        return value


def format_due_date_for_preview(
    due_date: str | None,
    instructor_timezone: str | None = None,
) -> str:
    """Human-readable due date using the same instant Canvas will store.

    The "UTC" suffix on a zone-less instructor is deliberate, not a
    fallback wart. When we do not know their zone we *interpret* their wall
    clock as UTC on the way in as well, so parse, store and display all
    quote the same instant and the label describes what was really saved.
    An instructor seeing "11:59 PM UTC" for a deadline they meant locally is
    looking at a connection whose time_zone was never populated -- the fix
    for that is upstream, in fetch_canvas_time_zone, and dropping the label
    here would only make the same wrong instant harder to notice.
    """
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
