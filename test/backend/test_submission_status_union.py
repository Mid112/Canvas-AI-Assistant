"""Coverage for requesting missing AND late submissions as one group.

The two categories are mutually exclusive, so before this the schema accepted
only one of them. A request naming both did not error — the model just picked
one, and the instructor got half the students with nothing in the reply to say
so. These tests pin the union itself, the canonical ordering that keeps a
handle stable, and the wording that has to make a combined group visibly
combined.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.mcp_tools.schemas import (
    AnalyzeCourseSubmissionsAction,
    ResolveMissingSubmissionsAction,
    normalize_status_filters,
)
from app.schemas.canvas import SubmissionStatus
from app.services.chat import _build_resolve_missing_summary
from app.services.resolved_set import (
    compute_submissions_by_status,
    compute_submissions_by_status_breakdown,
    status_label,
    status_slug,
)


def _submission(user_id: int, status: SubmissionStatus):
    return SimpleNamespace(user_id=user_id, status=status, student_name=f"S{user_id}")


# One missing, one unsubmitted (also "missing" by this app's definition), one
# late, plus a graded student who must never match either category.
_SUBMISSIONS = [
    _submission(1, SubmissionStatus.missing),
    _submission(2, SubmissionStatus.unsubmitted),
    _submission(3, SubmissionStatus.late),
    _submission(4, SubmissionStatus.graded),
]
_ROSTER = {1: "Ann", 2: "Bo", 3: "Cy", 4: "Di"}


async def _compute(statuses):
    course = SimpleNamespace(id=7, canvas_url="https://canvas.test")
    with patch(
        "app.services.resolved_set.get_submissions", new_callable=AsyncMock
    ) as submissions:
        submissions.return_value = _SUBMISSIONS
        return await compute_submissions_by_status_breakdown(
            course, 99, SimpleNamespace(id=1), None, statuses, active_names=_ROSTER
        )


# ── normalization ────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("missing", ("missing",)),
        ("late", ("late",)),
        (["missing", "late"], ("missing", "late")),
        # Canonical order, so the same request never produces two different
        # handles/slugs depending on the order the model emitted.
        (["late", "missing"], ("missing", "late")),
        (["late", "late"], ("late",)),
        # An empty or absent request stays the long-standing default rather
        # than matching nothing.
        ([], ("missing",)),
        (None, ("missing",)),
    ],
)
def test_normalize_status_filters(value, expected):
    assert normalize_status_filters(value) == expected


def test_slug_and_label_are_stable_for_a_union():
    assert status_slug(("missing", "late")) == "missing_late"
    assert status_label(("missing", "late")) == "missing or late"


@pytest.mark.parametrize(
    "value", ["late", ["late"], ["late", "missing"], ["missing", "late"]]
)
def test_action_schemas_accept_string_and_list(value):
    """The bare string every existing prompt emits must keep working."""
    assert ResolveMissingSubmissionsAction(local_course_id=1, status=value).status == (
        normalize_status_filters(value)
    )
    assert AnalyzeCourseSubmissionsAction(local_course_id=1, status=value).status == (
        normalize_status_filters(value)
    )


def test_action_schema_defaults_to_missing():
    assert ResolveMissingSubmissionsAction(local_course_id=1).status == ("missing",)


# ── the union itself ─────────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_single_status_is_unchanged():
    matched, counts = await _compute("late")

    assert [row["user_id"] for row in matched] == [3]
    assert counts == {"late": 1}


@pytest.mark.anyio
async def test_missing_covers_unsubmitted_too():
    matched, counts = await _compute("missing")

    assert [row["user_id"] for row in matched] == [1, 2]
    assert counts == {"missing": 2}


@pytest.mark.anyio
async def test_union_returns_both_groups_with_a_breakdown():
    matched, counts = await _compute(["missing", "late"])

    assert [row["user_id"] for row in matched] == [1, 2, 3]
    assert counts == {"missing": 2, "late": 1}
    # The graded student is in neither category and must not be swept in by
    # the widened filter.
    assert 4 not in {row["user_id"] for row in matched}


@pytest.mark.anyio
async def test_union_counts_each_student_once():
    """Counts must sum to the recipient total, or the breakdown contradicts
    the number of people who will actually be messaged."""
    matched, counts = await _compute(["missing", "late"])

    assert sum(counts.values()) == len(matched)
    assert len({row["user_id"] for row in matched}) == len(matched)


@pytest.mark.anyio
async def test_union_is_one_canvas_fetch():
    """Computing each category with its own call would double the Canvas cost
    of a combined request and could return inconsistent halves."""
    course = SimpleNamespace(id=7, canvas_url="https://canvas.test")
    with patch(
        "app.services.resolved_set.get_submissions", new_callable=AsyncMock
    ) as submissions:
        submissions.return_value = _SUBMISSIONS
        await compute_submissions_by_status_breakdown(
            course, 99, SimpleNamespace(id=1), None,
            ["missing", "late"], active_names=_ROSTER,
        )

    assert submissions.await_count == 1


@pytest.mark.anyio
async def test_single_status_wrapper_returns_the_union_list():
    course = SimpleNamespace(id=7, canvas_url="https://canvas.test")
    with patch(
        "app.services.resolved_set.get_submissions", new_callable=AsyncMock
    ) as submissions:
        submissions.return_value = _SUBMISSIONS
        matched = await compute_submissions_by_status(
            course, 99, SimpleNamespace(id=1), None,
            ["missing", "late"], active_names=_ROSTER,
        )

    assert [row["user_id"] for row in matched] == [1, 2, 3]


# ── wording ──────────────────────────────────────────────────────────────────


def _summary(statuses, counts, matched_count, sample=()):
    return _build_resolve_missing_summary(
        course_name="CPSC 310",
        assignment_name="Lab 4",
        due_at=None,
        statuses=statuses,
        status_counts=counts,
        matched_count=matched_count,
        sample=list(sample),
    )


def test_combined_summary_states_the_split_and_says_it_is_combined():
    summary = _summary(("missing", "late"), {"missing": 4, "late": 3}, 7)

    assert "7 active student(s)" in summary
    assert "4 missing and 3 late" in summary
    assert "combined group" in summary


def test_combined_summary_keeps_a_zero_side():
    """Collapsing "0 late" away would make a real union indistinguishable from
    the model having quietly resolved a single category — the exact failure
    the combined mode exists to prevent."""
    summary = _summary(("missing", "late"), {"missing": 4, "late": 0}, 4)

    assert "4 missing and 0 late" in summary
    assert "combined group" in summary


def test_single_status_summary_keeps_its_original_wording():
    assert "are missing" in _summary(("missing",), {"missing": 2}, 2)
    assert "submitted late" in _summary(("late",), {"late": 2}, 2)


def test_single_status_summary_does_not_claim_a_combination():
    assert "combined group" not in _summary(("missing",), {"missing": 2}, 2)


def test_combined_empty_summary_covers_both_categories():
    summary = _summary(("missing", "late"), {"missing": 0, "late": 0}, 0)

    assert "missing or submitted" in summary
    assert "late" in summary
