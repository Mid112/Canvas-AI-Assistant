"""Finding what an instructor's words point at, across every course they teach.

Every chain that needs a real Canvas entity used to answer the same question
its own way, and all of them answered it the same wrong way: resolve inside
the conversation's course, and only look elsewhere once the in-course lookup
has failed outright. That makes the current course win by *default* rather
than by being a better match, so a weak match here silently beats a perfect
match one course over:

    "what is the due date of homework 1 limits?"

        Capstone Project (current)  "Homework 1"           partial
        Math 101                    "homework 1 limits"    exact

The old order picked Capstone and never looked at Math 101, because Capstone
did have *something* plausible. This module makes both sides comparable, so
the caller can see that one of them is plainly better. Same shape for people:

    "send feedback to milliken"

        Capstone Project (current)  "Joshua Parker"            no match
        Math 101                    "Joshua Parker-Milliken"   token match

Kind-agnostic on purpose. Assignments and students differ only in how their
candidate rows are loaded and labelled — the scoring, the here-vs-elsewhere
comparison, and the confidence rules are one implementation, so a resolver
that works for assignments cannot quietly not work for students.

Nothing here decides what to *do* about a cross-course match. It reports what
matched and how well; offering a switch, and carrying the interrupted work
across it, belongs to the caller (see chat.py's course-switch offer).
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assignment import Assignment
from app.models.course import Course
from app.models.student import Student
from app.models.user import User

ReferenceKind = Literal["assignment", "student"]

# Below this, a reference is too short to be evidence of anything: a 1-3
# character string matches a token in half the titles a course has, and a
# confident wrong answer here moves work into another Canvas course.
MIN_REFERENCE_LENGTH = 4

# A cross-course match has to be this good on its own before it is worth
# raising at all. Tuned against the real failure: "homework 1" vs "homework 4"
# scores 0.40 (one shared token out of two on each side) and must stay silent.
MIN_CROSS_COURSE_CONFIDENCE = 0.6

# ...and this much better than anything in the current course. Without the
# margin, two near-identical scores would flip on noise. With it, "the course
# you are in" wins every tie, which is the conservative direction: staying put
# is always recoverable, switching does work somewhere the instructor did not
# ask for.
CROSS_COURSE_MARGIN = 0.15

# A local match this good ends the search. Nothing an unindexed course could
# hold would clear it by CROSS_COURSE_MARGIN, so going to Canvas to find out
# is latency spent to confirm a foregone conclusion. Deliberately below 1.0:
# "Homework 1 " and "homework 1" should both count as done.
CONFIDENT_ENOUGH_TO_STOP = 0.9

_NON_ALPHANUMERIC = re.compile(r"[^a-z0-9]+")


def normalize_reference(value: str | None) -> str:
    """Lowercase, punctuation collapsed to single spaces, trimmed.

    Deliberately keeps word boundaries, unlike the course-name normalizer in
    chat.py which strips separators entirely. Tokens are the whole point here:
    "Joshua Parker-Milliken" has to split into three of them for "milliken" to
    find it, and a separator-stripped "joshuaparkermilliken" would only ever
    match by substring — which also matches "arker" and "kermi".
    """
    return _NON_ALPHANUMERIC.sub(" ", (value or "").lower()).strip()


def _tokens(value: str) -> set[str]:
    return {token for token in value.split() if token}


def score_reference(reference: str, label: str) -> float:
    """How well ``label`` answers ``reference``. 0.0 none, 1.0 exact.

    Two things are being measured at once, and both matter:

    * **coverage** — how much of what the instructor said was found. "homework
      1 limits" against "Homework 1" leaves "limits" unaccounted for, and that
      leftover word is the entire reason they are not the same assignment.
    * **precision** — how much of the label the reference accounts for.
      "milliken" against "Joshua Parker-Milliken" covers everything the
      instructor said but only a third of the title, which is a weaker claim
      than an exact hit and should not outrank one.

    Coverage dominates (it is the multiplier) because an unmatched word in the
    *reference* is a contradiction, while an unmatched word in the *label* is
    just an abbreviation. Precision only modulates, between 0.6 and 1.0 of the
    coverage score, so a real partial match can never be scored as noise.
    """
    normalized_reference = normalize_reference(reference)
    normalized_label = normalize_reference(label)
    if not normalized_reference or not normalized_label:
        return 0.0
    if normalized_reference == normalized_label:
        return 1.0

    reference_tokens = _tokens(normalized_reference)
    label_tokens = _tokens(normalized_label)
    matched = reference_tokens & label_tokens
    if not matched:
        return 0.0

    coverage = len(matched) / len(reference_tokens)
    precision = len(matched) / len(label_tokens)
    return coverage * (0.6 + 0.4 * precision)


@dataclass(frozen=True)
class ReferenceMatch:
    local_course_id: int
    course_name: str
    #: Canvas id, as a string for assignments and students alike — never
    #: coerced to int, so a caller cannot accidentally use it as a local PK.
    entity_id: str
    label: str
    score: float


@dataclass(frozen=True)
class ReferenceCandidates:
    """What matched, split by whether it is in the course you are in.

    Both lists are sorted best-first, so ``here[0]`` / ``elsewhere[0]`` are the
    only entries most callers read.
    """

    reference: str
    here: list[ReferenceMatch]
    elsewhere: list[ReferenceMatch]

    @property
    def best_here(self) -> ReferenceMatch | None:
        return self.here[0] if self.here else None

    @property
    def best_elsewhere(self) -> ReferenceMatch | None:
        return self.elsewhere[0] if self.elsewhere else None

    @property
    def elsewhere_is_better(self) -> bool:
        """True when another course holds a plainly better match.

        Plainly: good in absolute terms AND clear of anything here by the
        margin. A tie leaves the instructor where they are.
        """
        best_elsewhere = self.best_elsewhere
        if best_elsewhere is None or best_elsewhere.score < MIN_CROSS_COURSE_CONFIDENCE:
            return False
        best_here = self.best_here
        if best_here is None:
            return True
        return best_elsewhere.score > best_here.score + CROSS_COURSE_MARGIN

    @property
    def switch_targets(self) -> list[ReferenceMatch]:
        """The other-course matches worth offering, best first.

        Only those within the margin of the best one: with "Quiz 1" in three
        courses all three are real answers, but a 0.9 and a 0.62 are not the
        same question and listing both invites the wrong pick.
        """
        best = self.best_elsewhere
        if best is None:
            return []
        return [
            match
            for match in self.elsewhere
            if match.score >= best.score - CROSS_COURSE_MARGIN
        ]


async def _instructor_courses(db: AsyncSession, user: User) -> list[Course]:
    """Every course this instructor owns, whatever its Canvas workflow_state.

    Deliberately not filtered to "available": an unpublished or concluded
    course still holds the assignment the instructor is asking about, and
    telling them it doesn't exist because Canvas calls the course completed
    is the same dead end this module was written to remove. Whether the
    conversation may *move* there is the caller's decision, made against a
    freshly re-checked Course row.
    """
    return list(
        await db.scalars(select(Course).where(Course.instructor_id == user.id))
    )


async def _assignment_rows(
    db: AsyncSession, course_ids: list[int]
) -> list[tuple[int, str, str]]:
    """(course_id, canvas_assignment_id, title) for active assignments."""
    if not course_ids:
        return []
    rows = await db.execute(
        select(Assignment.course_id, Assignment.canvas_assignment_id, Assignment.title).where(
            Assignment.course_id.in_(course_ids), Assignment.is_active.is_(True)
        )
    )
    return [(course_id, str(canvas_id), title or "") for course_id, canvas_id, title in rows]


async def _student_rows(
    db: AsyncSession, course_ids: list[int]
) -> list[tuple[int, str, str]]:
    """(course_id, canvas_user_id, name) for actively enrolled students."""
    if not course_ids:
        return []
    rows = await db.execute(
        select(Student.course_id, Student.canvas_user_id, Student.name).where(
            Student.course_id.in_(course_ids), Student.enrollment_state == "active"
        )
    )
    return [(course_id, str(canvas_id), name or "") for course_id, canvas_id, name in rows]


_ROW_LOADERS = {
    "assignment": _assignment_rows,
    "student": _student_rows,
}


async def find_reference(
    db: AsyncSession,
    user: User,
    *,
    kind: ReferenceKind,
    reference: str | None,
    current_course_id: int | None,
) -> ReferenceCandidates:
    """Score ``reference`` against every entity of ``kind`` this instructor owns.

    Reads the local index only — no Canvas calls, so this is safe to run on
    the hot path of a chat turn. The index is warmed by
    ``ensure_courses_indexed`` and by ordinary use (every get_assignments /
    get_students call persists what it fetched).
    """
    normalized = normalize_reference(reference)
    if len(normalized.replace(" ", "")) < MIN_REFERENCE_LENGTH:
        return ReferenceCandidates(reference=reference or "", here=[], elsewhere=[])

    courses = await _instructor_courses(db, user)
    if not courses:
        return ReferenceCandidates(reference=reference or "", here=[], elsewhere=[])
    names = {course.id: course.name for course in courses}

    rows = await _ROW_LOADERS[kind](db, list(names))

    here: list[ReferenceMatch] = []
    elsewhere: list[ReferenceMatch] = []
    for course_id, entity_id, label in rows:
        score = score_reference(reference or "", label)
        if score <= 0.0:
            continue
        match = ReferenceMatch(
            local_course_id=course_id,
            course_name=names.get(course_id, "Unknown course"),
            entity_id=entity_id,
            label=label,
            score=score,
        )
        (here if course_id == current_course_id else elsewhere).append(match)

    here.sort(key=lambda match: (-match.score, match.label))
    elsewhere.sort(key=lambda match: (-match.score, match.label))
    return ReferenceCandidates(reference=reference or "", here=here, elsewhere=elsewhere)


# ── warming the index ────────────────────────────────────────────────────────
#
# find_reference is a local read, which makes it fast and makes it blind: a
# course whose assignments have never been fetched has no rows, and "not
# there" is indistinguishable from "never looked". That is what made the old
# cross-course peek answer "which of your courses contains this?" about an
# assignment the instructor plainly had.
#
# Filling it costs one Canvas call per unindexed course, so it is bounded hard
# on both axes and every failure is silent — a slow Canvas degrades this to
# the old blind behaviour rather than hanging a chat turn. The results persist,
# so a course is only ever paid for once and each lookup leaves the index
# warmer than it found it.

#: Most courses touched in one warm-up. An instructor with twenty courses is
#: not worth twenty serial Canvas calls to answer one question.
MAX_COURSES_TO_INDEX = 4

#: Whole-warm-up budget, not per call. Past this the turn continues with
#: whatever was indexed in time.
INDEX_TIMEOUT_SECONDS = 6.0


async def _courses_missing_from_index(
    db: AsyncSession, kind: ReferenceKind, course_ids: list[int]
) -> list[int]:
    rows = await _ROW_LOADERS[kind](db, course_ids)
    seen = {course_id for course_id, _entity_id, _label in rows}
    return [course_id for course_id in course_ids if course_id not in seen]


async def ensure_courses_indexed(
    db: AsyncSession,
    user: User,
    *,
    kind: ReferenceKind,
    exclude_course_id: int | None = None,
) -> int:
    """Fetch entities for this instructor's never-indexed courses. Returns the
    count actually indexed.

    Only courses with *zero* rows are touched. A stale index is not this
    function's problem — an assignment renamed on Canvas an hour ago is a
    tolerable miss, while a course that has never been opened is a systematic
    blind spot that makes the whole cross-course lookup untrustworthy.
    """
    # Imported here rather than at module scope: app.services.canvas imports
    # far more than this module needs, and a top-level import makes a cycle
    # once canvas.py grows anything that wants reference resolution.
    from app.services.canvas import get_assignments
    from app.services.student import get_students

    courses = await _instructor_courses(db, user)
    candidate_ids = [
        course.id for course in courses if course.id != exclude_course_id
    ]
    missing = await _courses_missing_from_index(db, kind, candidate_ids)
    if not missing:
        return 0

    by_id = {course.id: course for course in courses}
    fetch = get_assignments if kind == "assignment" else get_students
    indexed = 0

    async def _index_all() -> None:
        nonlocal indexed
        for course_id in missing[:MAX_COURSES_TO_INDEX]:
            course = by_id.get(course_id)
            if course is None:
                continue
            try:
                await fetch(course_id, user, course.canvas_url, db)
                indexed += 1
            except Exception:
                # Broad on purpose. A missing token, an unenrolled course, a
                # Canvas 500 — none of them are this turn's subject, and any
                # of them escaping here would fail a request the instructor
                # made about something else entirely.
                continue

    try:
        await asyncio.wait_for(_index_all(), timeout=INDEX_TIMEOUT_SECONDS)
    except TimeoutError:
        pass
    return indexed


async def find_reference_across_courses(
    db: AsyncSession,
    user: User,
    *,
    kind: ReferenceKind,
    reference: str | None,
    current_course_id: int | None,
    allow_indexing: bool = True,
) -> ReferenceCandidates:
    """``find_reference``, but willing to go to Canvas once to fill the gaps.

    Every workflow calls this on the hot path of a chat turn, so the local
    pass runs first and usually ends it. Warming only happens when the local
    answer is *mediocre* — nothing anywhere scores as an essentially-exact
    hit — because that is the only state where "or I have simply never looked
    at the course that has it" is a live possibility.

    A perfect local match stops it outright, and correctly: elsewhere_is_better
    demands beating the best local score by a margin, and nothing beats 1.0.
    Fetching more courses to lose to it would be pure latency.
    """
    candidates = await find_reference(
        db, user, kind=kind, reference=reference, current_course_id=current_course_id
    )
    if not allow_indexing or candidates.elsewhere_is_better:
        return candidates

    best_local = max(
        (match.score for match in (*candidates.here, *candidates.elsewhere)), default=0.0
    )
    if best_local >= CONFIDENT_ENOUGH_TO_STOP:
        return candidates

    normalized = normalize_reference(reference)
    if len(normalized.replace(" ", "")) < MIN_REFERENCE_LENGTH:
        return candidates

    if await ensure_courses_indexed(
        db, user, kind=kind, exclude_course_id=current_course_id
    ):
        return await find_reference(
            db, user, kind=kind, reference=reference, current_course_id=current_course_id
        )
    return candidates
