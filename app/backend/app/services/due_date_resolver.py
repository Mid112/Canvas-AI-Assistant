"""The one place a due date becomes an instant.

Every write path that accepts a due date -- create/update assignment, create
quiz, their drafts, their validators, and the preview that shows the
instructor what will happen -- resolves it here.

Why this exists: those paths used to each do their own resolution, and they
disagreed. Assignments called ``due_date.parse_due_date`` with the
instructor's Canvas timezone; quizzes called ``datetime.fromisoformat`` and
treated a naive value as UTC. For an instructor in Vancouver the same typed
string became two instants 7 hours apart, and a date-only value landed 31
hours apart (end-of-day versus midnight). Populating
``canvas_connections.time_zone`` fixed only the assignment half, because the
quiz half never read the column.

Splitting "which timezone" from "which instant" is what allowed them to
drift, so this module owns both, plus the not-in-the-past rule that also had
two implementations with two different messages.

``due_date.py`` stays underneath as the pure parsing layer: it takes a
timezone name and knows nothing about users or connections. This module is
the part that knows where the timezone comes from. It cannot live in
``due_date.py`` because the lookup needs ``canvas_timezone``, which imports
``services.canvas``, which imports ``due_date`` -- a cycle.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.models.user import User
from app.services.due_date import normalize_due_date_to_utc_iso, parse_due_date


class DueDateError(ValueError):
    """A due date the caller asked to validate could not be accepted.

    Carries ``kind`` so HTTP callers can phrase their own 422 without
    re-deriving why it failed, and so both validators can finally share one
    reason vocabulary instead of inventing separate wording.
    """

    def __init__(self, message: str, *, kind: str) -> None:
        super().__init__(message)
        self.kind = kind


_INVALID_MESSAGE = (
    "Invalid due date format: {value}. "
    "Use ISO 8601 with timezone when possible, e.g. 2026-09-01T23:59:00Z."
)
_PAST_MESSAGE = (
    "Due date must be in the future. "
    "Choose a date and time after now, then try again."
)


def _instructor_timezone(user: User, canvas_url: str | None) -> str | None:
    """Imported lazily: canvas_timezone reaches services.canvas for URL
    comparison, and services.canvas imports quiz_validation, which imports
    this module. A module-level import closes that loop. Same pattern
    assignment_validation and write_preview already use for due_date.
    """
    from app.services.canvas_timezone import get_instructor_canvas_timezone

    return get_instructor_canvas_timezone(user, canvas_url)


def resolve_due_date(
    value: str | None,
    user: User,
    canvas_url: str | None = None,
    *,
    require_future: bool = False,
) -> str | None:
    """Resolve an instructor's due-date input to a UTC ISO string.

    Reads the instructor's Canvas timezone off their connection for
    ``canvas_url`` and interprets naive wall-clock input in that zone. With no
    stored timezone the value is read as UTC, which is the pre-existing
    fallback and the state most connection rows are still in.

    ``require_future`` turns this into the validating form: unparseable or
    already-past input raises ``DueDateError`` instead of being passed
    through. Callers that only display or draft a value leave it False, so
    the instructor keeps seeing their own text rather than an error page --
    the same leniency ``normalize_due_date_to_utc_iso`` already had.

    Returns None for a missing or blank due date; "no due date" is a valid
    assignment, not a failure.
    """
    if value is None or not str(value).strip():
        return None

    raw = str(value)
    instructor_timezone = _instructor_timezone(user, canvas_url)
    normalized = normalize_due_date_to_utc_iso(raw, instructor_timezone)

    if not require_future:
        return normalized

    # normalize_due_date_to_utc_iso hands back the original string when it
    # cannot parse it, so an unchanged value is how "unparseable" surfaces.
    try:
        resolved = parse_due_date(normalized, instructor_timezone)
    except (ValueError, TypeError, OverflowError) as exc:
        raise DueDateError(
            _INVALID_MESSAGE.format(value=raw), kind="invalid"
        ) from exc

    if resolved <= datetime.now(UTC):
        raise DueDateError(_PAST_MESSAGE, kind="past")

    return normalized


def due_date_is_in_the_past(
    value: str | None,
    user: User,
    canvas_url: str | None = None,
) -> bool:
    """True when the resolved instant has already passed.

    For callers that want to steer rather than reject -- the dispatcher checks
    this before showing a preview that confirm would only refuse, since the
    model does not reliably do "nearest future occurrence" arithmetic and
    tends to keep the current year even when that puts the date behind us.
    """
    try:
        resolve_due_date(value, user, canvas_url, require_future=True)
    except DueDateError as exc:
        return exc.kind == "past"
    return False
