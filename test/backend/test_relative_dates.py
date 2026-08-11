"""Reading the dates instructors actually type.

Covers relative_dates and the parse_due_date rules built on it. Every case
here fixes something real: "March 21" resolved five months into the past,
"March 21" and "2026-03-21" produced instants a day apart, and every relative
English phrase reached the due-date field as literal prose.
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from app.services.due_date import format_due_date_for_preview, parse_due_date
from app.services.relative_dates import (
    DatePreference,
    apply_year_preference,
    resolve_relative_date,
)

VANCOUVER = "America/Vancouver"
# A Monday, chosen so "last Saturday" and "next Saturday" land on different
# weeks and a bare weekday has somewhere to go in both directions.
MONDAY = date(2026, 8, 10)
NOON_MONDAY = datetime(2026, 8, 10, 12, 0)


def local(value: str, **kwargs) -> str:
    parsed = parse_due_date(value, VANCOUVER, today=NOON_MONDAY, **kwargs)
    return parsed.astimezone(ZoneInfo(VANCOUVER)).strftime("%a %Y-%m-%d %H:%M")


# ----------------------------------------------------------- relative phrases


@pytest.mark.parametrize(
    ("phrase", "expected"),
    [
        ("today", date(2026, 8, 10)),
        ("tonight", date(2026, 8, 10)),
        ("tomorrow", date(2026, 8, 11)),
        ("yesterday", date(2026, 8, 9)),
        ("the day after tomorrow", date(2026, 8, 12)),
        ("next friday", date(2026, 8, 14)),
        ("last saturday", date(2026, 8, 8)),
        ("last monday", date(2026, 8, 3)),
        ("next week", date(2026, 8, 17)),
        ("last week", date(2026, 8, 3)),
        ("next month", date(2026, 9, 10)),
        ("in two weeks", date(2026, 8, 24)),
        ("in 10 days", date(2026, 8, 20)),
        ("three days ago", date(2026, 8, 7)),
        ("2 months ago", date(2026, 6, 10)),
    ],
)
def test_phrases_that_carry_their_own_direction(phrase, expected):
    """None of these need to know what the date is for — they say so."""
    assert resolve_relative_date(phrase, today=MONDAY) == expected


def test_a_backward_phrase_stays_backward_even_for_a_deadline():
    """The case that ruled out "roll anything in the past forward".

    "last Saturday" in a due-date field is the instructor saying something
    contradictory, and the honest response is to keep their date and let the
    past-due-date check tell them. Quietly advancing it to next Saturday
    would put a date on the preview they never chose and had no reason to
    re-read.
    """
    assert resolve_relative_date(
        "last saturday", today=MONDAY, preference=DatePreference.FUTURE
    ) == date(2026, 8, 8)


def test_a_bare_weekday_follows_the_field():
    """Nothing in "Saturday" says which Saturday. What it is for does."""
    assert resolve_relative_date(
        "saturday", today=MONDAY, preference=DatePreference.FUTURE
    ) == date(2026, 8, 15)
    assert resolve_relative_date(
        "saturday", today=MONDAY, preference=DatePreference.PAST
    ) == date(2026, 8, 8)
    assert (
        resolve_relative_date(
            "saturday", today=MONDAY, preference=DatePreference.LITERAL
        )
        is None
    )


def test_prepositions_do_not_stop_a_phrase_resolving():
    for phrase in ("due next friday", "by next friday", "on next friday"):
        assert resolve_relative_date(phrase, today=MONDAY) == date(2026, 8, 14)


def test_calendar_notation_is_left_to_the_calendar_parser():
    """Not this module's job — returning None is how it says so."""
    for phrase in ("2026-03-21", "March 21", "", "   ", "sometime soonish"):
        assert resolve_relative_date(phrase, today=MONDAY) is None


def test_month_arithmetic_clamps_instead_of_rolling_over():
    """January 31 plus a month is February 28, not March 3."""
    assert resolve_relative_date(
        "next month", today=date(2026, 1, 31)
    ) == date(2026, 2, 28)


# ------------------------------------------------------------ the year choice


def test_a_year_nobody_stated_follows_the_field():
    march = date(2026, 3, 21)
    assert apply_year_preference(
        march, today=MONDAY, year_was_stated=False,
        preference=DatePreference.FUTURE,
    ) == date(2027, 3, 21)
    assert apply_year_preference(
        date(2026, 9, 2), today=MONDAY, year_was_stated=False,
        preference=DatePreference.PAST,
    ) == date(2025, 9, 2)


def test_a_stated_year_is_always_kept():
    """Even a past one. Someone who typed 2026 meant 2026, and refusing it
    downstream says so; silently making it 2027 does not."""
    assert apply_year_preference(
        date(2026, 3, 21), today=MONDAY, year_was_stated=True,
        preference=DatePreference.FUTURE,
    ) == date(2026, 3, 21)


# ------------------------------------------------------------- parse_due_date


def test_a_bare_month_and_day_becomes_the_next_one():
    """Typed in August, "March 21" is next March. It used to be five months
    ago, because dateutil fills a missing year from today's."""
    assert local("march 21st") == "Sun 2027-03-21 23:59"
    assert local("March 21") == "Sun 2027-03-21 23:59"


def test_a_month_and_day_still_ahead_is_left_where_it_is():
    assert local("september 2nd") == "Wed 2026-09-02 23:59"


def test_the_same_day_written_two_ways_is_the_same_instant():
    """It was not. _DATE_ONLY only matched YYYY-MM-DD, so the ISO spelling
    got end-of-day and every other spelling got midnight — the same calendar
    date, 24 hours apart, decided by punctuation."""
    assert local("2026-09-02") == local("september 2 2026") == "Wed 2026-09-02 23:59"


def test_a_stated_clock_time_is_never_overwritten():
    assert local("2026-09-02T14:30:00") == "Wed 2026-09-02 14:30"
    assert local("september 2 2026 at 9am") == "Wed 2026-09-02 09:00"


def test_a_reporting_window_starts_when_the_day_starts():
    assert local("2026-09-02", preference=DatePreference.PAST) == "Wed 2026-09-02 00:00"


def test_relative_phrases_no_longer_reach_the_field_as_prose():
    """Every one of these used to come back as its own literal text."""
    assert local("next friday") == "Fri 2026-08-14 23:59"
    assert local("tomorrow") == "Tue 2026-08-11 23:59"
    assert local("in two weeks") == "Mon 2026-08-24 23:59"


def test_an_absolute_instant_is_not_rolled_or_reinterpreted():
    """A value carrying an offset is already an instant — nothing about it
    is underspecified, so no preference applies."""
    parsed = parse_due_date(
        "2026-03-21T16:59:00-07:00", VANCOUVER, today=NOON_MONDAY
    )
    assert parsed.isoformat() == "2026-03-21T23:59:00+00:00"


def test_the_instructor_timezone_decides_the_instant():
    """The whole reason the timezone column matters: the same wall clock is
    seven hours apart depending on whether we know where they are."""
    vancouver = parse_due_date("2026-09-02", VANCOUVER, today=NOON_MONDAY)
    unknown = parse_due_date("2026-09-02", None, today=NOON_MONDAY)
    assert vancouver.isoformat() == "2026-09-03T06:59:00+00:00"
    assert unknown.isoformat() == "2026-09-02T23:59:00+00:00"


def test_preview_formatting_is_stable_across_a_round_trip():
    """Resolving then formatting must not re-roll the year: the resolved
    value states its year, so apply_year_preference has to leave it alone."""
    resolved = parse_due_date("march 21st", VANCOUVER, today=NOON_MONDAY).isoformat()
    assert "2027" in format_due_date_for_preview(resolved, VANCOUVER)
    assert format_due_date_for_preview(resolved, VANCOUVER) == (
        format_due_date_for_preview(resolved, VANCOUVER)
    )


def test_ambiguous_numeric_dates_are_still_refused():
    """07/08/2026 is July 8 or August 7 depending on where you live, so it
    stays untouched for validation to reject."""
    from app.services.due_date import normalize_due_date_to_utc_iso

    assert normalize_due_date_to_utc_iso("07/08/2026", VANCOUVER) == "07/08/2026"
