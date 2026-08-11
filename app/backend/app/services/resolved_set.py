"""Server-side bulk recipient resolution. Computes a filtered set of
students (e.g. "missing submissions for assignment 4", or "late
submissions for assignment 4") once, and persists it as an opaque handle
(ResolvedSet) so the LLM only ever sees a compact {count, sample} summary
— never the raw per-student list. Mirrors the existing small-resolver
pattern in services/chat.py (_resolve_assignment_reference,
_resolve_students_via_llm), which resolves a single reference to a single
ID; this resolves a criterion to a whole recipient LIST, persisted so a
later turn can materialize it back out without re-deriving it or
re-dumping it into context."""
import secrets
from collections.abc import Iterable, Sequence
from dataclasses import replace
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp_tools.schemas import (
    SubmissionStatusFilter,
    normalize_status_filters,
)
from app.models.conversation import Conversation
from app.models.course import Course
from app.models.resolved_set import ResolvedSet
from app.models.user import User
from app.schemas.canvas import SubmissionStatus
from app.services.canvas import get_submissions
from app.services.score_range import (
    BasisDecision,
    ScoreBasis,
    count_without_submission,
    looks_non_numeric,
    match_score_range,
    resolve_score_basis,
)
from app.services.student import get_students

__all__ = [
    "RESOLVED_SET_TTL",
    "STATUS_FILTERS",
    "BasisDecision",
    "ScoreBasis",
    "SubmissionStatusFilter",
    "active_roster_names",
    "compute_submissions_by_score_range",
    "compute_submissions_by_status",
    "compute_submissions_by_status_breakdown",
    "create_resolved_set",
    "materialize_resolved_set",
    "normalize_status_filters",
    "status_label",
    "status_slug",
]

# Generous relative to a review session — an instructor reading a resolved
# count and deciding whether to message those students should never race
# an expiring handle (see the toolplan discussion this mirrors: "make the
# TTL generous relative to a review session — hours, not minutes").
RESOLVED_SET_TTL = timedelta(hours=4)

# "missing" and "late" are mutually exclusive categories over the same
# submission data (a late submission is, by definition, not missing).
#
# Canvas's own "missing" flag (see _parse_submission_status in
# services/canvas.py) only ever applies once an assignment is PAST due —
# an assignment that isn't due yet always reports "missing": false for
# everyone, no matter how few students have started it. That makes
# "missing" too narrow for this app's actual use ("remind students who
# haven't submitted yet" is a sensible request before a deadline too, not
# only after one) — so "missing" here means either Canvas's own missing
# flag (overdue, unsubmitted) OR "unsubmitted" (not yet due, nothing
# turned in yet).
#
# "late" is exactly Canvas's own "late" status: submitted, but after the
# due date.
#
# Excused students are never counted in either category.
#
# Public (not underscore-prefixed) so other course-wide aggregations — e.g.
# course_overview.get_course_overview — can reuse the exact same categories
# instead of re-deriving a slightly different (and driftable) definition of
# "missing" (#1508).
STATUS_FILTERS: dict[SubmissionStatusFilter, frozenset[SubmissionStatus]] = {
    "missing": frozenset({SubmissionStatus.missing, SubmissionStatus.unsubmitted}),
    "late": frozenset({SubmissionStatus.late}),
}

# Categories are mutually exclusive individually, but an instructor asking for
# "missing and late" wants both groups addressed at once, not one of them
# silently. Requesting several resolves to their union — see
# compute_submissions_by_status_breakdown, which returns the combined
# recipient list alongside the per-category counts needed to say out loud
# that the group is a combination.
#
# normalize_status_filters lives in mcp_tools/schemas.py so the action schema
# can normalize at the trust boundary; re-exported above for callers that
# already treat this module as the home of the status vocabulary.


def status_slug(statuses: Sequence[SubmissionStatusFilter]) -> str:
    """Stable identifier for a status request, e.g. "missing_late".

    Used for the ResolvedSet.kind and for the `status` field sent to the
    frontend, which reads it as a string — so a union has to stay one token
    rather than becoming a list that a string reader would silently drop.
    """
    return "_".join(statuses)


def status_label(statuses: Sequence[SubmissionStatusFilter]) -> str:
    """Human phrasing for a status request, e.g. "missing or late"."""
    return " or ".join(statuses)


async def active_roster_names(
    course: Course,
    user: User,
    db: AsyncSession,
) -> dict[int, str]:
    """Active enrollments as {canvas_user_id: name}.

    Split out of compute_submissions_by_status so a caller walking several
    assignments in one turn can fetch the roster once and hand it back in.
    get_students hits Canvas (fetch_enrollments) and then reconciles every
    local Student row, so repeating it per assignment turns one course-wide
    question into one Canvas roster call per assignment."""
    students = await get_students(course.id, user, course.canvas_url, db)
    return {
        int(s.canvas_user_id): s.name for s in students if s.enrollment_state == "active"
    }


async def compute_submissions_by_status_breakdown(
    course: Course,
    assignment_id: int,
    user: User,
    db: AsyncSession,
    statuses: SubmissionStatusFilter | Iterable[SubmissionStatusFilter],
    *,
    active_names: dict[int, str] | None = None,
) -> tuple[list[dict], dict[SubmissionStatusFilter, int]]:
    """Students matching any of these submission-status categories, plus how
    many matched each one.

    The union and the breakdown come from a single get_submissions call:
    computing each category with its own call would double the Canvas cost of
    a combined request for data that is already in hand, and could return
    inconsistent halves if a submission changed between the two.

    The breakdown exists so the caller can say "4 missing and 3 late,
    combined" instead of an unexplained 7 — a joint group has to be visibly
    joint, or it reads as the model having quietly picked one category.

    Returns ([{"user_id": int, "name": str}, ...], {status: count}). The list
    is deduped: each student appears once no matter how many categories they
    match, and each is counted under the first category that matched, so the
    counts always sum to the list length even if the categories were ever to
    stop being disjoint.
    """
    requested = normalize_status_filters(statuses)
    per_status = {status: STATUS_FILTERS[status] for status in requested}
    matching_statuses = frozenset().union(*per_status.values())

    submissions = await get_submissions(course.id, assignment_id, user, course.canvas_url, db)
    if active_names is None:
        active_names = await active_roster_names(course, user, db)

    matched: list[dict] = []
    counts: dict[SubmissionStatusFilter, int] = dict.fromkeys(requested, 0)
    for s in submissions:
        if s.status not in matching_statuses or s.user_id not in active_names:
            continue
        matched.append(
            {"user_id": s.user_id, "name": active_names[s.user_id] or s.student_name or f"Student {s.user_id}"}
        )
        for status, allowed in per_status.items():
            if s.status in allowed:
                counts[status] += 1
                break
    return matched, counts


async def compute_submissions_by_status(
    course: Course,
    assignment_id: int,
    user: User,
    db: AsyncSession,
    status: SubmissionStatusFilter | Iterable[SubmissionStatusFilter],
    *,
    active_names: dict[int, str] | None = None,
) -> list[dict]:
    """Students matching a submission-status category on this assignment
    — see STATUS_FILTERS for exactly what "missing" and "late" each
    mean. Cross-referenced against the active roster the same way
    broadcast_to_all_students already does (chat.py), so a
    withdrawn/inactive enrollment's stale submission record never
    produces a message target.

    Pass active_names to reuse a roster already fetched this turn (see
    active_roster_names); omitted, it is fetched here as before. The
    roster is per course, not per assignment, so sharing it across
    assignments changes nothing about the result.

    Accepts several categories as well as one, returning their union; callers
    that also need the per-category counts should use
    compute_submissions_by_status_breakdown directly.

    Returns [{"user_id": int, "name": str}, ...], deduped by construction
    (one submission row per student per assignment)."""
    matched, _ = await compute_submissions_by_status_breakdown(
        course, assignment_id, user, db, status, active_names=active_names
    )
    return matched


async def compute_submissions_by_score_range(
    course: Course,
    assignment_id: int,
    user: User,
    db: AsyncSession,
    *,
    low: float,
    high: float,
    points_possible: float | None,
    requested_basis: ScoreBasis | None = None,
    active_names: dict[int, str] | None = None,
) -> BasisDecision:
    """Students whose score falls in a band, having decided what the band
    meant — see services/score_range.py for the percent-vs-points rule.

    Both readings are computed from one get_submissions call, for the same
    reason the status union is: the alternative doubles the Canvas cost of a
    single question, and two calls could disagree if a grade changed between
    them — which here would mean comparing two sets that were never true at
    the same moment, and the whole decision is a set comparison.

    Returns the BasisDecision rather than a plain list because the caller
    needs the losing reading too: to say which interpretation it used, or to
    ask when both readings are live and pick different students.
    """
    if low > high:
        low, high = high, low

    submissions = await get_submissions(course.id, assignment_id, user, course.canvas_url, db)

    # Checked before the roster fetch: a complete/incomplete assignment has
    # no band to compute either way, so there is nothing for the roster to
    # filter and no reason to spend the extra Canvas call.
    if looks_non_numeric(submissions):
        return BasisDecision(None, "non_numeric_grading", [], None, [])

    if active_names is None:
        active_names = await active_roster_names(course, user, db)

    points_matched = match_score_range(
        submissions, active_names,
        low=low, high=high, basis="points", points_possible=points_possible,
    )
    # None (not []) when there is no points value to divide by: "percent
    # matched nobody" is evidence about the reading, "percent is undefined"
    # removes it from consideration entirely.
    percentage_matched = (
        match_score_range(
            submissions, active_names,
            low=low, high=high, basis="percentage", points_possible=points_possible,
        )
        if points_possible
        else None
    )
    decision = resolve_score_basis(
        low=low, high=high, points_possible=points_possible,
        percentage_matched=percentage_matched, points_matched=points_matched,
        requested_basis=requested_basis,
    )
    # Attached once here rather than at every BasisDecision construction
    # inside resolve_score_basis: the count is a property of the submissions,
    # and this is the only place that has them. replace() because the decision
    # is frozen, which it should stay — the basis choice is a conclusion, not
    # a mutable field.
    return replace(
        decision,
        excluded_no_submission=count_without_submission(submissions, active_names),
    )


def _new_handle() -> str:
    return f"rs_{secrets.token_hex(12)}"


async def create_resolved_set(
    db: AsyncSession,
    conversation: Conversation,
    kind: str,
    query: dict,
    recipients: list[dict],
) -> ResolvedSet:
    resolved = ResolvedSet(
        handle=_new_handle(),
        conversation_id=conversation.id,
        kind=kind,
        query=query,
        snapshot_recipients=recipients,
        expires_at=datetime.now(UTC) + RESOLVED_SET_TTL,
    )
    db.add(resolved)
    await db.flush()
    return resolved


async def materialize_resolved_set(
    db: AsyncSession, handle: str, conversation_id: int
) -> ResolvedSet | None:
    """Dereferences a handle for actual use (e.g. building a send_message
    preview). The ownership (conversation_id must match) and expiry checks
    make this an authorization boundary, not just a lookup — a handle
    string is untrusted LLM output, and must be scoped to the conversation
    that produced it so it can never be replayed into a different
    course/conversation. Returns None (never raises) on any failure, so
    the caller always has a uniform "unresolved" signal to fall back on,
    the same convention _resolve_assignment_reference/
    _resolve_students_via_llm already use."""
    resolved = await db.get(ResolvedSet, handle)
    if resolved is None:
        return None
    if resolved.conversation_id != conversation_id:
        return None
    if resolved.expires_at < datetime.now(UTC):
        return None
    return resolved
