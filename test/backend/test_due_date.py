"""Due-date normalization for assignment updates (#1435)."""

from datetime import UTC, datetime

from app.services.due_date import (
    format_due_date_for_preview,
    normalize_due_date_to_utc_iso,
    parse_due_date,
)
from app.services.write_preview import _format_due_date


# Verifies: Hour-only updates keep the date and fill omitted seconds in UTC.
def test_normalize_hour_update_fills_omitted_seconds():
    assert normalize_due_date_to_utc_iso("2026-08-13T17:00") == "2026-08-13T17:00:00+00:00"
    assert normalize_due_date_to_utc_iso("2026-08-13T23:59") == "2026-08-13T23:59:00+00:00"


# Verifies: Offset-aware local times convert to the equivalent UTC instant.
def test_normalize_timezone_conversion_to_utc():
    assert normalize_due_date_to_utc_iso("2026-08-13T16:59:00-07:00") == "2026-08-13T23:59:00+00:00"
    assert normalize_due_date_to_utc_iso("2026-08-13T23:59:00Z") == "2026-08-13T23:59:00+00:00"


# Verifies: Date-only values default to end-of-day 23:59:00 UTC.
def test_normalize_date_only_defaults_to_end_of_day():
    assert normalize_due_date_to_utc_iso("2026-08-13") == "2026-08-13T23:59:00+00:00"


# Verifies: Naive ISO times are treated as UTC wall-clock.
def test_normalize_naive_iso_assumes_utc():
    assert normalize_due_date_to_utc_iso("2026-08-13T23:59:00") == "2026-08-13T23:59:00+00:00"


# Verifies: Ambiguous numeric dates are left alone for validation errors.
def test_normalize_leaves_ambiguous_numeric_dates_untouched():
    assert normalize_due_date_to_utc_iso("07/08/2026") == "07/08/2026"


# Verifies: Preview formatting uses the same UTC instant as the write payload.
def test_preview_due_date_matches_normalized_canvas_payload():
    raw = "2026-08-13T16:59:00-07:00"
    normalized = normalize_due_date_to_utc_iso(raw)
    assert normalized == "2026-08-13T23:59:00+00:00"
    assert format_due_date_for_preview(raw) == "August 13, 2026 at 11:59 PM UTC"
    assert _format_due_date(normalized) == format_due_date_for_preview(raw)
    assert parse_due_date(normalized) == datetime(2026, 8, 13, 23, 59, tzinfo=UTC)
