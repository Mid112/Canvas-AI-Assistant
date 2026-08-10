"""Resolving "students who scored between X and Y" — including deciding
whether the instructor meant percent or raw points.

The ambiguity is unavoidable, not a corner case. "Between 70 and 90" means:

* on an assignment out of 50 — nothing at all as points (nobody can score
  90), so it can only be percent;
* on one out of 100 — exactly the same students either way;
* on one out of 200 — two *opposite* groups. 70-90 percent is 140-180
  points (the strong students); 70-90 points is 35-45 percent (the weak
  ones). Guessing here doesn't risk a slightly-off list, it risks messaging
  the precise inverse of the intended group.

So the rule is: decide from the *sets*, never from how many students each
reading matched. Two readings that both match 4 students can match 4
completely different people, and a count comparison calls that agreement.
Only set identity means the choice is genuinely free; anything else where
both readings are live has to be asked about.

Every decision carries a machine-readable reason, and the caller states the
interpretation it used in the reply even when it resolved automatically —
an auto-pick the instructor can't see is an auto-pick they can't correct
before the message goes out.
"""

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

from app.schemas.canvas import SubmissionStatus

ScoreBasis = Literal["percentage", "points"]

__all__ = [
    "BasisDecision",
    "ScoreBasis",
    "describe_basis",
    "detect_explicit_basis",
    "format_range",
    "looks_non_numeric",
    "match_score_range",
    "resolve_score_basis",
]

# A score only means something once it exists. Unsubmitted/missing students
# have no score, and an excused student's lingering score must never place
# them in a band — they were explicitly taken out of the graded population.
_EXCLUDED_STATUSES = frozenset({SubmissionStatus.excused})

# Canvas reports pass/fail work as a grade of "complete"/"incomplete" with a
# score of 1/0 alongside it. Those scores are real numbers, so a band like
# 70-90 would quietly evaluate against them and return nobody — an answer
# that looks like "no students scored that" when the truth is "this
# assignment has no scores to band".
#
# Detected from the submissions rather than the assignment's grading_type,
# because grading_type is not synced onto the local Assignment row; this
# uses data already fetched for the range itself.
_NON_NUMERIC_GRADES = frozenset({"complete", "incomplete", "pass", "fail"})

# Explicit phrasing short-circuits the whole heuristic: if the instructor
# wrote the unit down, there is nothing to infer. Matched server-side rather
# than trusting the model to have noticed, because this is the one signal
# that is literally present in the text and therefore checkable.
_PERCENT_PATTERN = re.compile(r"%|\bpercent(?:age|ages|s)?\b", re.IGNORECASE)
_POINTS_PATTERN = re.compile(
    r"\b(?:points?|pts?|marks?|out\s+of\s+\d+)\b", re.IGNORECASE
)


@dataclass(frozen=True)
class BasisDecision:
    """Which reading won, why, and what each reading would have matched.

    ``basis is None`` is the ambiguous case: both readings matched real,
    different students, so the caller must ask instead of picking. Both
    candidate lists are kept either way so the question (or the
    explanation) can show what the alternative would have been.
    """

    basis: ScoreBasis | None
    reason: str
    matched: list[dict] = field(default_factory=list)
    percentage_matched: list[dict] | None = None
    points_matched: list[dict] = field(default_factory=list)

    @property
    def needs_clarification(self) -> bool:
        """Keyed on the reason, not on ``basis is None``: an assignment with
        no numeric scores also has no basis, but asking "percent or points?"
        about it would be a nonsense question."""
        return self.reason == "ambiguous"

    @property
    def unsupported(self) -> bool:
        return self.reason == "non_numeric_grading"


def detect_explicit_basis(text: str | None) -> ScoreBasis | None:
    """The unit the instructor actually wrote, if they wrote one.

    Returns None when the text names both units or neither — "70 points out
    of 100 percent" is not an explicit instruction, it's a reason to fall
    through to the set comparison rather than to pick whichever pattern
    happened to be tested first.
    """
    if not text:
        return None
    has_percent = bool(_PERCENT_PATTERN.search(text))
    has_points = bool(_POINTS_PATTERN.search(text))
    if has_percent == has_points:
        return None
    return "percentage" if has_percent else "points"


def looks_non_numeric(submissions: Iterable[Any]) -> bool:
    """Whether this assignment is graded complete/incomplete rather than
    numerically.

    Requires *every* graded submission to carry a non-numeric grade, not
    merely one: a points-graded assignment where a single student was marked
    "complete" by hand is still a points assignment, and refusing to band it
    would be worse than the problem being avoided. An assignment nobody has
    graded yet is not non-numeric, just empty — the ordinary zero-result
    path already says that correctly.
    """
    graded = [s for s in submissions if getattr(s, "grade", None) is not None]
    if not graded:
        return False
    return all(
        str(s.grade).strip().lower() in _NON_NUMERIC_GRADES for s in graded
    )


def format_range(low: float, high: float, basis: ScoreBasis | None) -> str:
    """"70-90 percent" / "70-90 points", trimming pointless decimals."""

    def _n(value: float) -> str:
        return str(int(value)) if float(value).is_integer() else str(value)

    unit = "percent" if basis == "percentage" else "points"
    return f"{_n(low)}-{_n(high)} {unit}"


def describe_basis(decision: BasisDecision, low: float, high: float,
                   points_possible: float | None) -> str:
    """Why this reading was used, in one clause the instructor can check.

    Always rendered, including on the paths that resolved automatically:
    the whole point of picking a basis server-side is that the instructor
    can catch a wrong pick before approving whatever comes next.
    """
    band = format_range(low, high, decision.basis)
    possible = (
        f"{int(points_possible)}" if points_possible and float(points_possible).is_integer()
        else f"{points_possible}"
    )
    reasons = {
        "explicit": f"Read as {band}, as you specified.",
        "percentage_undefined": (
            f"Read as {band} — this assignment has no points value, so a "
            "percentage can't be computed."
        ),
        "no_points_possible": (
            f"Read as {band} — this assignment has no points value, so a "
            "percentage can't be computed."
        ),
        "range_exceeds_points_possible": (
            f"Read as {band} — the assignment is out of {possible} points, so "
            f"{format_range(low, high, 'points')} isn't a possible score."
        ),
        "range_exceeds_100_percent": (
            f"Read as {band} — the range is above 100%, so it can only mean "
            "points."
        ),
        "identical": (
            f"Read as {band} — the assignment is out of {possible} points, so "
            "points and percent select the same students."
        ),
        "only_percentage_matches": (
            f"Read as {band} — no students fall in "
            f"{format_range(low, high, 'points')}."
        ),
        "only_points_matches": (
            f"Read as {band} — no students fall in "
            f"{format_range(low, high, 'percentage')}."
        ),
        "both_empty": (
            f"No students fall in {format_range(low, high, 'percentage')} or "
            f"{format_range(low, high, 'points')}."
        ),
        "no_coherent_basis": (
            f"Neither {format_range(low, high, 'percentage')} nor "
            f"{format_range(low, high, 'points')} is a possible score on an "
            f"assignment out of {possible} points."
        ),
    }
    return reasons.get(decision.reason, f"Read as {band}.")


def match_score_range(
    submissions: Iterable[Any],
    active_names: dict[int, str],
    *,
    low: float,
    high: float,
    basis: ScoreBasis,
    points_possible: float | None,
) -> list[dict]:
    """Students whose score falls inside the band under one reading.

    Bounds are inclusive — "between 70 and 90" said out loud includes both
    ends, and excluding them would silently drop the students sitting
    exactly on a round cutoff, which is where instructors actually draw
    lines. Cross-referenced against the active roster the same way
    compute_submissions_by_status_breakdown is, so a withdrawn enrollment's
    stale score never becomes a message target.
    """
    if basis == "percentage" and not points_possible:
        return []

    matched: list[dict] = []
    for s in submissions:
        score = getattr(s, "score", None)
        if score is None or getattr(s, "status", None) in _EXCLUDED_STATUSES:
            continue
        user_id = getattr(s, "user_id", None)
        if user_id not in active_names:
            continue
        value = (score / points_possible) * 100 if basis == "percentage" else score
        if low <= value <= high:
            matched.append(
                {
                    "user_id": user_id,
                    "name": active_names[user_id]
                    or getattr(s, "student_name", None)
                    or f"Student {user_id}",
                }
            )
    return matched


def _ids(rows: Sequence[dict]) -> frozenset[int]:
    return frozenset(row["user_id"] for row in rows)


def resolve_score_basis(
    *,
    low: float,
    high: float,
    points_possible: float | None,
    percentage_matched: list[dict] | None,
    points_matched: list[dict],
    requested_basis: ScoreBasis | None = None,
) -> BasisDecision:
    """Pick percent or points, or decline to pick.

    ``percentage_matched is None`` means a percentage cannot be computed at
    all (no points_possible), which is different from "computed and matched
    nobody" — the first removes a reading, the second is evidence about it.

    The order below is deliberate: the cheap, certain signals (the
    instructor said so; one reading is arithmetically impossible) settle it
    before any set comparison, so a 50-point assignment asked about "70 to
    90" never needs to look at students at all.
    """
    percent_possible = percentage_matched is not None

    if requested_basis == "percentage" and not percent_possible:
        return BasisDecision(
            "points", "percentage_undefined", list(points_matched),
            percentage_matched, list(points_matched),
        )
    if requested_basis is not None:
        chosen = (
            list(percentage_matched or []) if requested_basis == "percentage"
            else list(points_matched)
        )
        return BasisDecision(
            requested_basis, "explicit", chosen, percentage_matched, list(points_matched)
        )

    if not percent_possible:
        return BasisDecision(
            "points", "no_points_possible", list(points_matched),
            percentage_matched, list(points_matched),
        )

    # An assignment out of 50 makes "90 points" unreachable; a band starting
    # above 100 makes "150 percent" unreachable. These are properties of the
    # request and the assignment, not of who happened to score what, so they
    # decide before any student data is consulted.
    points_reachable = points_possible is None or high <= points_possible
    percent_reachable = low <= 100

    if not points_reachable and not percent_reachable:
        # Nothing to ask about: neither reading can match anyone, so the
        # answer is an empty result with an explanation, not a question.
        return BasisDecision(
            "percentage", "no_coherent_basis", [],
            percentage_matched, list(points_matched),
        )
    if not points_reachable:
        return BasisDecision(
            "percentage", "range_exceeds_points_possible",
            list(percentage_matched or []), percentage_matched, list(points_matched),
        )
    if not percent_reachable:
        return BasisDecision(
            "points", "range_exceeds_100_percent", list(points_matched),
            percentage_matched, list(points_matched),
        )

    percent_rows = percentage_matched or []
    if not percent_rows and not points_matched:
        return BasisDecision(
            "percentage", "both_empty", [], percentage_matched, list(points_matched)
        )
    # Set identity, not size: two readings matching the same *count* of
    # different students is the case a count comparison gets wrong.
    if _ids(percent_rows) == _ids(points_matched):
        return BasisDecision(
            "percentage", "identical", list(percent_rows),
            percentage_matched, list(points_matched),
        )
    if not points_matched:
        return BasisDecision(
            "percentage", "only_percentage_matches", list(percent_rows),
            percentage_matched, list(points_matched),
        )
    if not percent_rows:
        return BasisDecision(
            "points", "only_points_matches", list(points_matched),
            percentage_matched, list(points_matched),
        )

    # Both readings are live and select different students. There is no
    # evidence left that favours either, so asking is the only answer that
    # can't be wrong.
    return BasisDecision(
        None, "ambiguous", [], percentage_matched, list(points_matched)
    )
