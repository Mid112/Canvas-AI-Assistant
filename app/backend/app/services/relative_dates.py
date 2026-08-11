"""Resolving the dates instructors actually type.

Instructors write "next Friday", "last Saturday", "in two weeks" and
"March 21". None of those parse: ``dateutil`` reads calendar notation, not
English, so every one of them used to pass straight through as literal text
and land in a due-date field as prose. The system prompt asks the model to
convert them to ISO first, which mostly worked and hid the gap -- but it is
exactly the instruction we are loosening, so the gap is about to widen.

The harder half is that an underspecified date has no single correct
reading. "March 21", typed in August with no year, is *next* March when it
is a deadline and *this* March when it is the start of a reporting window.
"Saturday" is the coming one or the last one for the same reason. Nothing in
the string distinguishes them -- only what the date is for does -- which is
why resolution takes a ``DatePreference`` from the caller instead of picking
a global policy.

Phrases that carry their own direction ("last Saturday", "tomorrow") ignore
the preference entirely. A backward phrase in a deadline field stays in the
past and gets refused downstream, which is the honest outcome: silently
turning "last Saturday" into a future date would put a date on the preview
that the instructor never asked for and would have no reason to double-check.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from enum import Enum


class DatePreference(str, Enum):
    """Which way to read a date that does not say which way it points.

    ``FUTURE`` -- deadlines. A due date is a date you have not reached yet,
    so a bare "March 21" means the next one and a bare "Saturday" means the
    coming one.

    ``PAST`` -- reporting windows. "Submissions since March 21" means the
    March that already happened; rolling it forward would silently return an
    empty result for a question that had a real answer.

    ``LITERAL`` -- take the text exactly as written and resolve nothing that
    needs a direction. Phrases that carry their own ("yesterday", "next
    Friday") still resolve; a bare weekday does not.
    """

    FUTURE = "future"
    PAST = "past"
    LITERAL = "literal"


_WEEKDAYS = {
    "monday": 0, "mon": 0,
    "tuesday": 1, "tue": 1, "tues": 1,
    "wednesday": 2, "wed": 2, "weds": 2,
    "thursday": 3, "thu": 3, "thur": 3, "thurs": 3,
    "friday": 4, "fri": 4,
    "saturday": 5, "sat": 5,
    "sunday": 6, "sun": 6,
}

# Only the counts someone says out loud. A number past this is written as a
# digit in practice, and the digit branch already covers it.
_NUMBER_WORDS = {
    "a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11,
    "twelve": 12,
}

_BACKWARD_WORDS = {"last", "past", "previous", "prior"}
_FORWARD_WORDS = {"next", "coming", "upcoming", "following"}

# "due by next Friday" and "since last Saturday" are the same two phrases
# wearing a preposition. Strip it rather than teach every pattern to expect
# one. Deliberately does NOT infer direction from "since"/"after" -- the
# caller knows what the field is for, and a preposition is a weaker signal
# than that.
_LEADING_NOISE = re.compile(
    r"^(?:due|by|on|at|before|after|since|from|starting|until|till|the)\s+"
)
_TRAILING_NOISE = re.compile(r"[\s.,;:!?]+$")


def _normalize(text: str) -> str:
    cleaned = " ".join(str(text).lower().split())
    cleaned = _TRAILING_NOISE.sub("", cleaned)
    while True:
        stripped = _LEADING_NOISE.sub("", cleaned, count=1)
        if stripped == cleaned:
            return cleaned
        cleaned = stripped


def _count(word: str) -> int | None:
    if word.isdigit():
        return int(word)
    return _NUMBER_WORDS.get(word)


def _shift_months(start: date, months: int) -> date:
    """Move by whole months, clamping the day to the target month's length.

    January 31 plus one month is February 28, not March 3. Rolling over is
    the behaviour of naive day arithmetic and it puts a due date in the
    wrong month.
    """
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    day = min(start.day, _days_in_month(year, month))
    return date(year, month, day)


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        return 31
    return (date(year, month + 1, 1) - timedelta(days=1)).day


def _weekday_on_or_after(today: date, target: int) -> date:
    return today + timedelta(days=(target - today.weekday()) % 7)


def _weekday_after(today: date, target: int) -> date:
    return today + timedelta(days=((target - today.weekday()) % 7) or 7)


def _weekday_on_or_before(today: date, target: int) -> date:
    return today - timedelta(days=(today.weekday() - target) % 7)


def _weekday_before(today: date, target: int) -> date:
    return today - timedelta(days=((today.weekday() - target) % 7) or 7)


def resolve_relative_date(
    text: str,
    *,
    today: date,
    preference: DatePreference = DatePreference.FUTURE,
) -> date | None:
    """Read an English date phrase as a calendar date.

    Returns None when the text is not a phrase this understands, which is
    the signal for the caller to fall back to ordinary calendar parsing --
    "2026-03-21" and "March 21" are not this function's job.

    ``today`` is passed in rather than read from the clock so the caller
    supplies the instructor's own local date. Resolving "tomorrow" against
    a server running in UTC gets the wrong day for anyone west of it for
    several hours each evening.
    """
    phrase = _normalize(text)
    if not phrase:
        return None

    if phrase in {"today", "tonight", "this evening", "this afternoon"}:
        return today
    if phrase == "tomorrow":
        return today + timedelta(days=1)
    if phrase == "yesterday":
        return today - timedelta(days=1)
    if phrase in {"day after tomorrow", "the day after tomorrow"}:
        return today + timedelta(days=2)
    if phrase in {"day before yesterday", "the day before yesterday"}:
        return today - timedelta(days=2)

    tokens = phrase.split()

    # "next friday" / "last saturday" / "this monday" / bare "friday"
    if tokens[-1] in _WEEKDAYS:
        target = _WEEKDAYS[tokens[-1]]
        qualifier = tokens[-2] if len(tokens) > 1 else ""
        if qualifier in _FORWARD_WORDS:
            return _weekday_after(today, target)
        if qualifier in _BACKWARD_WORDS:
            return _weekday_before(today, target)
        if qualifier in {"this", ""}:
            # No direction stated, so the field decides. LITERAL means the
            # caller would rather have nothing than a guess.
            if preference is DatePreference.FUTURE:
                return _weekday_on_or_after(today, target)
            if preference is DatePreference.PAST:
                return _weekday_on_or_before(today, target)
            return None
        return None

    # "next week" / "last month" / "next year"
    if len(tokens) == 2 and tokens[1] in {"week", "month", "year"}:
        direction = tokens[0]
        if direction in _FORWARD_WORDS:
            sign = 1
        elif direction in _BACKWARD_WORDS:
            sign = -1
        elif direction == "this":
            return today
        else:
            return None
        if tokens[1] == "week":
            return today + timedelta(days=7 * sign)
        if tokens[1] == "month":
            return _shift_months(today, sign)
        return _shift_months(today, 12 * sign)

    # "in two weeks" / "in 10 days"
    match = re.fullmatch(r"in (\S+) (day|week|month|year)s?", phrase)
    if match:
        amount = _count(match.group(1))
        if amount is None:
            return None
        return _offset(today, amount, match.group(2))

    # "two weeks ago" / "10 days ago"
    match = re.fullmatch(r"(\S+) (day|week|month|year)s? ago", phrase)
    if match:
        amount = _count(match.group(1))
        if amount is None:
            return None
        return _offset(today, -amount, match.group(2))

    return None


def _offset(start: date, amount: int, unit: str) -> date:
    if unit == "day":
        return start + timedelta(days=amount)
    if unit == "week":
        return start + timedelta(days=7 * amount)
    if unit == "month":
        return _shift_months(start, amount)
    return _shift_months(start, 12 * amount)


def apply_year_preference(
    parsed: date,
    *,
    today: date,
    year_was_stated: bool,
    preference: DatePreference,
) -> date:
    """Pick the year for a date whose year nobody said out loud.

    "March 21" typed in August is next March if it is a deadline. The
    trigger is that no year was *stated* -- not that the resolved date is in
    the past -- and the difference matters more than it looks. By the time a
    date reaches us the model has usually already converted it to ISO, so a
    deliberate "last Saturday" and a mis-yeared "March 21" both arrive as
    plain past dates and nothing tells them apart. Rolling on "is in the
    past" would quietly move the instructor's "last Saturday" to a future
    day they never chose and would have no reason to re-read.

    A stated year is always kept, even a past one. Someone who typed 2026
    meant 2026, and refusing it downstream tells them so; silently making it
    2027 does not.
    """
    if year_was_stated or preference is DatePreference.LITERAL:
        return parsed

    if preference is DatePreference.FUTURE and parsed < today:
        return safe_replace_year(parsed, parsed.year + 1)
    if preference is DatePreference.PAST and parsed > today:
        return safe_replace_year(parsed, parsed.year - 1)
    return parsed


def safe_replace_year(value: date, year: int) -> date:
    """February 29 does not exist in most years; fall back to the 28th."""
    try:
        return value.replace(year=year)
    except ValueError:
        return value.replace(year=year, day=28)
