"""One place that answers "who is this for?".

Every write to students needs three things: who it goes to, what it says, and
which channel carries it. The what and the channel were already well handled —
drafters write the content, FORM_HANDOFF_ACTIONS routes the channel — but the
who was worked out separately inside each chain, and the copies disagreed.

The disagreement was not theoretical. The grade chain read any phrase starting
with "all" and mentioning a student as the entire roster, so

    "all students who submitted to baking 101"

selected all nine students on the assignment rather than the three who had
submitted, and six people who handed in nothing were told "good job". One word
was the whole difference: without the leading "all", the same phrase fell
through to real resolution and behaved correctly. Meanwhile the message chain
had no reading of group phrases at all and hunted for a student *named* "all
students who submitted to baking 101".

So this module owns the reading of a "who" phrase, the selection that follows
from it, and the banking of the result for reuse — the same way course and
assignment references already resolve in one place instead of once per caller.
It deliberately does no fetching: callers already hold the roster or the
submissions they resolved against, and a resolver that re-fetched would be
both slower and capable of disagreeing with the data its caller is looking at.

Reuse across channels is the other half. An audience is expensive to work out
and easy to get subtly wrong twice, so once resolved it is stored and
addressable by handle. recipient_handle is a field on both SendMessageAction
and UpdateGradeAction, and materialize_resolved_set checks ownership and expiry
rather than which feature produced the set — so "message everyone who missed
lab 4, actually give them feedback instead" and the same sentence with the two
halves swapped both reuse one resolved group instead of re-deriving it.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from enum import Enum
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversation import Conversation
from app.schemas.canvas import SubmissionStatus
from app.services.analysis import MISSING_STATUSES, SUBMITTED_STATUSES
from app.services.resolved_set import create_resolved_set

logger = logging.getLogger(__name__)


class AudienceScope(str, Enum):
    """What kind of group a phrase names."""

    EVERYONE = "everyone"
    BY_STATUS = "by_status"
    NAMED = "named"


@dataclass(frozen=True)
class AudienceReading:
    """What a "who" phrase means, before any Canvas data is consulted.

    Separated from the selection on purpose: reading the sentence and applying
    it to real students are different jobs, and only the first one is worth
    testing exhaustively against wording.
    """

    scope: AudienceScope
    statuses: tuple[SubmissionStatus, ...] | None = None


# Phrases that mean the whole roster and nothing narrower. Matched whole rather
# than by prefix, so a restrictive clause can never be read as decoration on an
# otherwise-bulk phrase. Whole-phrase matching also fails closed: an unfamiliar
# wording is treated as narrower than everyone, so the worst case is asking
# rather than writing to the entire class.
EVERYONE_PHRASES = frozenset(
    {
        "all",
        "all students",
        "all the students",
        "all of them",
        "all of the students",
        "every student",
        "everyone",
        "everybody",
        "the class",
        "the students",
        "whole class",
        "the whole class",
        "entire class",
        "the entire class",
    }
)

# "didn't" and "hasn't" survive normalisation as "didn t" and "hasn t", so the
# contraction marker deliberately has no leading space — requiring one matched
# neither, since the letter before the "n" is part of the verb.
_NEGATION_MARKERS = (" not ", "n t ", " never ", " no ", " without ")
# "submit" rather than "submitted", so "did not submit", "submits" and
# "submitting" all count. Checked after the missing markers because
# "unsubmitted" contains it.
_SUBMITTED_MARKERS = ("submit", "handed in", "turned in")
_MISSING_MARKERS = ("missing", "unsubmitted", "no submission")


def _normalize(reference: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", reference.lower()).strip()


def read_audience_phrase(reference: str | None) -> AudienceReading:
    """Read a "who" phrase into the group it names.

    NAMED is the default and the safe one: it means "this describes particular
    people, go and resolve them", which is the branch that asks when it is
    unsure. EVERYONE and BY_STATUS are only returned when the phrase says so.
    """
    if not reference or not reference.strip():
        return AudienceReading(AudienceScope.NAMED)

    normalized = _normalize(reference)
    if normalized in EVERYONE_PHRASES:
        return AudienceReading(AudienceScope.EVERYONE)

    padded = f" {normalized} "
    negated = any(marker in padded for marker in _NEGATION_MARKERS)

    # "all astudent" is a real typo seen in review, and an all-hands phrase
    # should survive one. Length is what keeps this from becoming the prefix
    # rule again: a restrictive clause cannot fit in two words, so "all
    # <something>" that short has nothing narrowing it, while "all students
    # who submitted to baking 101" is well past the limit and stays out.
    tokens = normalized.split()
    if (
        len(tokens) <= 2
        and tokens
        and tokens[0] in {"all", "every", "any"}
        and not negated
    ):
        return AudienceReading(AudienceScope.EVERYONE)

    if any(marker in padded for marker in _MISSING_MARKERS):
        return AudienceReading(AudienceScope.BY_STATUS, tuple(MISSING_STATUSES))
    if any(marker in padded for marker in _SUBMITTED_MARKERS):
        # "students who have not submitted" names the submitted set and then
        # negates it. The negation is what the instructor meant.
        return AudienceReading(
            AudienceScope.BY_STATUS,
            tuple(MISSING_STATUSES if negated else SUBMITTED_STATUSES),
        )
    return AudienceReading(AudienceScope.NAMED)


def select_by_status(
    submissions: list[dict], statuses: tuple[SubmissionStatus, ...]
) -> list[dict]:
    """The submissions whose status is in the wanted set.

    Statuses come from analysis, so "submitted" means the same thing here as in
    every analytics answer the instructor has already been shown. A count that
    changes depending on which feature asked is worse than either count.
    """
    wanted = {status.value for status in statuses}
    return [s for s in submissions if s.get("status") in wanted]


def recipients_from_rows(rows: list[dict]) -> list[dict]:
    """The {user_id, name} pairs a resolved set stores.

    Tolerates malformed rows rather than failing the whole audience over one
    bad snapshot entry, matching how the grade handoff already treats them.
    """
    recipients = []
    for row in rows:
        raw = row.get("user_id")
        try:
            user_id = int(raw)
        except (TypeError, ValueError):
            continue
        recipients.append(
            {
                "user_id": user_id,
                "name": row.get("student_name") or row.get("name") or f"Student {user_id}",
            }
        )
    return recipients


async def bank_audience(
    db: AsyncSession,
    conversation: Conversation,
    *,
    kind: str,
    query: dict[str, Any],
    rows: list[dict],
) -> str | None:
    """Store a resolved audience and return the handle that addresses it.

    None on an empty audience or on any failure. Banking is an optimisation
    for the next turn — losing it costs a re-resolution, while failing the turn
    over it would cost the instructor the thing they actually asked for.
    """
    recipients = recipients_from_rows(rows)
    if not recipients:
        return None
    try:
        resolved_set = await create_resolved_set(
            db, conversation, kind=kind, query=query, recipients=recipients
        )
    except Exception:
        logger.warning("Could not bank resolved audience for reuse", exc_info=True)
        return None
    return resolved_set.handle
