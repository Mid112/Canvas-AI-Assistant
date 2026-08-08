"""One due-date resolver shared by assignments and quizzes.

Before this module existed the two write paths each resolved due dates their
own way: assignments went through due_date.parse_due_date with the
instructor's Canvas timezone, while quizzes called datetime.fromisoformat and
hardcoded naive-means-UTC. The same instructor input therefore landed on two
different instants -- 7 hours apart for a wall-clock time, 31 hours apart for
a date-only value -- and no amount of populating canvas_connections.time_zone
could fix the quiz side, because it never read the column.
"""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from app.services.due_date_resolver import DueDateError, resolve_due_date

VANCOUVER = "America/Vancouver"


def _user(time_zone: str | None, canvas_url: str = "https://canvas.test") -> SimpleNamespace:
    """A stand-in for User carrying one Canvas connection.

    get_instructor_canvas_timezone only reads .canvas_connections, so this
    stays a plain object -- no database, no session.
    """
    return SimpleNamespace(
        canvas_connections=[
            SimpleNamespace(canvas_url=canvas_url, time_zone=time_zone)
        ]
    )


# Verifies: the resolver reads the zone off the instructor's connection row
# rather than taking it as a caller-supplied argument. This is the lookup the
# quiz path never performed.
def test_resolves_using_the_timezone_on_the_connection():
    resolved = resolve_due_date(
        "2026-08-15T23:59", _user(VANCOUVER), "https://canvas.test"
    )

    # 23:59 Vancouver (PDT, UTC-7) is 06:59 the next day in UTC.
    assert resolved == "2026-08-16T06:59:00+00:00"


# Verifies: a connection with no timezone still resolves, falling back to UTC.
# This is the state every row in the database is actually in, so it must not
# raise -- it just produces the un-shifted instant.
def test_falls_back_to_utc_when_the_connection_has_no_timezone():
    assert (
        resolve_due_date("2026-08-15T23:59", _user(None), "https://canvas.test")
        == "2026-08-15T23:59:00+00:00"
    )


# Verifies: the divergence that motivated this module. Both call sites now go
# through one function, so "the quiz answer" and "the assignment answer" are
# the same answer by construction.
@pytest.mark.parametrize(
    "raw,expected",
    [
        ("2026-08-15T23:59", "2026-08-16T06:59:00+00:00"),
        # Date-only means end of day, not midnight. The quiz path's
        # fromisoformat gave 00:00 -- 31 hours earlier once the zone is applied.
        ("2026-08-15", "2026-08-16T06:59:00+00:00"),
        # Already offset-aware input is converted, not re-interpreted.
        ("2026-08-15T16:59:00-07:00", "2026-08-15T23:59:00+00:00"),
    ],
)
def test_one_answer_per_input_regardless_of_caller(raw, expected):
    assert resolve_due_date(raw, _user(VANCOUVER), "https://canvas.test") == expected


# Verifies: absent stays absent. An assignment with no due date is legitimate,
# so the resolver must not invent one.
@pytest.mark.parametrize("blank", [None, "", "   "])
def test_blank_input_resolves_to_no_due_date(blank):
    assert resolve_due_date(blank, _user(VANCOUVER)) is None


# Verifies: the future check runs on the resolved instant, not the raw string.
# Reading the raw string as UTC (what quiz_validation did) makes an evening
# Vancouver due date look already past for the seven hours before midnight
# UTC, rejecting a time the instructor can legitimately pick.
def test_future_check_uses_the_resolved_instant_not_the_raw_string():
    # One hour from now in Vancouver: unambiguously future in that zone, but
    # behind "now" by six hours once misread as UTC.
    one_hour_ahead = datetime.now(ZoneInfo(VANCOUVER)) + timedelta(hours=1)
    raw = one_hour_ahead.strftime("%Y-%m-%dT%H:%M")

    # Sanity: the naive string really is in the past when read as UTC, so this
    # test would fail against the old quiz behaviour rather than pass by luck.
    assert datetime.fromisoformat(raw).replace(tzinfo=UTC) < datetime.now(UTC)

    assert (
        resolve_due_date(raw, _user(VANCOUVER), require_future=True) is not None
    )


# Verifies: a genuinely past date is still rejected, with one error type both
# validators can translate -- they previously produced different messages.
def test_past_due_date_is_rejected_when_the_caller_asks_for_a_future_one():
    with pytest.raises(DueDateError) as exc:
        resolve_due_date("2020-01-01T09:00", _user(VANCOUVER), require_future=True)

    assert exc.value.kind == "past"


# Verifies: unparseable input raises only when the caller is validating.
# Preview/draft callers stay lenient so the instructor still sees their own
# text rather than an exception page.
def test_unparseable_input_raises_only_for_validating_callers():
    assert resolve_due_date("next tuesday-ish", _user(VANCOUVER)) == "next tuesday-ish"

    with pytest.raises(DueDateError) as exc:
        resolve_due_date("next tuesday-ish", _user(VANCOUVER), require_future=True)

    assert exc.value.kind == "invalid"


# Verifies: ambiguous numeric dates are left alone rather than guessed at.
# 07/08/2026 is July 8 or August 7 depending on locale; due_date.py already
# refuses to pick, and the resolver must not undo that.
def test_ambiguous_numeric_dates_are_not_guessed():
    assert (
        resolve_due_date("07/08/2026", _user(VANCOUVER)) == "07/08/2026"
    )
