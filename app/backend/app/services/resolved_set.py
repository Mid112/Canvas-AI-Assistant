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
from datetime import UTC, datetime, timedelta
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversation import Conversation
from app.models.course import Course
from app.models.resolved_set import ResolvedSet
from app.models.user import User
from app.schemas.canvas import SubmissionStatus
from app.services.canvas import get_submissions
from app.services.student import get_students

# Generous relative to a review session — an instructor reading a resolved
# count and deciding whether to message those students should never race
# an expiring handle (see the toolplan discussion this mirrors: "make the
# TTL generous relative to a review session — hours, not minutes").
RESOLVED_SET_TTL = timedelta(hours=4)

SubmissionStatusFilter = Literal["missing", "late"]

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
_STATUS_FILTERS: dict[SubmissionStatusFilter, frozenset[SubmissionStatus]] = {
    "missing": frozenset({SubmissionStatus.missing, SubmissionStatus.unsubmitted}),
    "late": frozenset({SubmissionStatus.late}),
}


async def compute_submissions_by_status(
    course: Course,
    assignment_id: int,
    user: User,
    db: AsyncSession,
    status: SubmissionStatusFilter,
) -> list[dict]:
    """Students matching a submission-status category on this assignment
    — see _STATUS_FILTERS for exactly what "missing" and "late" each
    mean. Cross-referenced against the active roster the same way
    broadcast_to_all_students already does (chat.py), so a
    withdrawn/inactive enrollment's stale submission record never
    produces a message target.

    Returns [{"user_id": int, "name": str}, ...], deduped by construction
    (one submission row per student per assignment)."""
    matching_statuses = _STATUS_FILTERS[status]
    submissions = await get_submissions(course.id, assignment_id, user, course.canvas_url, db)
    students = await get_students(course.id, user, course.canvas_url, db)
    active_names = {
        int(s.canvas_user_id): s.name for s in students if s.enrollment_state == "active"
    }

    return [
        {"user_id": s.user_id, "name": active_names[s.user_id] or s.student_name or f"Student {s.user_id}"}
        for s in submissions
        if s.status in matching_statuses and s.user_id in active_names
    ]


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
