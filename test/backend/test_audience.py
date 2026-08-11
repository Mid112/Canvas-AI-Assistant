"""One resolver decides who a write is for.

The reported failure:

    > now can you send a message to students who submitted to baking 101
      saying good job?
    < [message preview, 3 recipients]
    > instead of a message, can you give them that feedback?
    ...
    < Do you want to give the feedback "good job" to all students who
      submitted to Baking 101, or would you like to specify particular
      students?
    > all students please
    < I found 9 students for Capstone Project.

The assistant's own question named the set — "all students who submitted to
Baking 101" — so "all students please" selects that set. It resolved to 9,
the whole roster, because the grade chain read any phrase starting with "all"
and mentioning a student as everyone. baking 101 had 6 missing, so six people
who submitted nothing were told "good job".

One word carried the whole difference: "students who submitted to baking 101"
without a leading "all" fell through to real resolution and behaved correctly.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.schemas.canvas import SubmissionStatus
from app.services.audience import (
    AudienceScope,
    bank_audience,
    read_audience_phrase,
    recipients_from_rows,
    select_by_status,
)

SUBMISSIONS = [
    {"user_id": 1, "student_name": "Ann", "status": "submitted"},
    {"user_id": 2, "student_name": "Ben", "status": "graded"},
    {"user_id": 3, "student_name": "Cal", "status": "late"},
    {"user_id": 4, "student_name": "Dee", "status": "missing"},
    {"user_id": 5, "student_name": "Eve", "status": "unsubmitted"},
]


# --------------------------------------------------------- reading the phrase


@pytest.mark.parametrize(
    "phrase",
    [
        "all",
        "all students",
        "All Students",
        "everyone",
        "everybody",
        "every student",
        "the whole class",
        "entire class",
        "all of them",
    ],
)
def test_unqualified_phrases_mean_everyone(phrase):
    assert read_audience_phrase(phrase).scope is AudienceScope.EVERYONE


@pytest.mark.parametrize(
    "phrase",
    [
        "all students who submitted to baking 101",
        "all students who are missing lab 4",
        "all students who scored below 50",
        "everyone who handed in the essay",
        "all the students with late work",
    ],
)
def test_a_restrictive_clause_is_never_everyone(phrase):
    """The clause is the sentence. This is the exact defect: each of these
    used to select the whole roster because it began with "all"."""
    assert read_audience_phrase(phrase).scope is not AudienceScope.EVERYONE


def test_the_reported_phrase_selects_only_submitters():
    reading = read_audience_phrase("all students who submitted to baking 101")

    assert reading.scope is AudienceScope.BY_STATUS
    assert SubmissionStatus.submitted in reading.statuses
    assert SubmissionStatus.missing not in reading.statuses


@pytest.mark.parametrize(
    "phrase",
    [
        "students who did not submit",
        "everyone who hasn't submitted",
        "all students who didn't submit the lab",
        "students missing the assignment",
        "the unsubmitted students",
    ],
)
def test_a_negated_or_missing_phrase_selects_non_submitters(phrase):
    reading = read_audience_phrase(phrase)

    assert reading.scope is AudienceScope.BY_STATUS
    assert SubmissionStatus.missing in reading.statuses
    assert SubmissionStatus.submitted not in reading.statuses


@pytest.mark.parametrize("phrase", ["Yerdana", "Michael Jordan", "the top scorer", ""])
def test_anything_else_is_named_and_gets_resolved(phrase):
    """NAMED is the safe default — it routes to the branch that asks when it
    is unsure, rather than the one that writes to the whole class."""
    assert read_audience_phrase(phrase).scope is AudienceScope.NAMED


def test_none_is_not_everyone():
    assert read_audience_phrase(None).scope is AudienceScope.NAMED


def test_a_typo_in_an_all_hands_phrase_still_means_everyone():
    """"all astudent" is a real prompt typo from review. Two words cannot hold
    a restrictive clause, which is what keeps this from being the old prefix
    rule wearing a hat."""
    assert read_audience_phrase("all astudent").scope is AudienceScope.EVERYONE
    assert read_audience_phrase("every studnet").scope is AudienceScope.EVERYONE


def test_the_typo_allowance_cannot_swallow_a_clause():
    for phrase in (
        "all students who submitted",
        "all who are missing",
        "every student without a submission",
    ):
        assert read_audience_phrase(phrase).scope is not AudienceScope.EVERYONE


def test_an_unfamiliar_wording_fails_closed():
    """Whole-phrase matching means a wording nobody anticipated is treated as
    narrower than everyone. The worst case is a question, not a class-wide
    write."""
    assert read_audience_phrase("all y'all students innit").scope is not (
        AudienceScope.EVERYONE
    )


# ------------------------------------------------------------- the selection


def test_submitters_exclude_the_students_who_handed_in_nothing():
    reading = read_audience_phrase("students who submitted")

    selected = select_by_status(SUBMISSIONS, reading.statuses)

    assert [s["student_name"] for s in selected] == ["Ann", "Ben", "Cal"]


def test_missing_selects_the_other_side():
    reading = read_audience_phrase("students who are missing it")

    selected = select_by_status(SUBMISSIONS, reading.statuses)

    assert [s["student_name"] for s in selected] == ["Dee", "Eve"]


def test_submitted_means_what_analytics_says_it_means():
    """Reused from analysis rather than restated, so one question cannot get
    two different counts depending on which feature answered it."""
    from app.services.analysis import SUBMITTED_STATUSES

    reading = read_audience_phrase("who submitted")

    assert set(reading.statuses) == set(SUBMITTED_STATUSES)


# ------------------------------------------------- banking it for the next turn


def test_recipients_survive_a_malformed_row():
    rows = [{"user_id": 1, "student_name": "Ann"}, {"user_id": None}, {"nope": True}]

    assert recipients_from_rows(rows) == [{"user_id": 1, "name": "Ann"}]


def test_a_row_with_no_name_still_gets_one():
    assert recipients_from_rows([{"user_id": 7}]) == [
        {"user_id": 7, "name": "Student 7"}
    ]


@pytest.mark.asyncio
async def test_banking_returns_a_handle_the_other_channel_can_use():
    db = AsyncMock()
    conversation = SimpleNamespace(id=1)

    with patch(
        "app.services.audience.create_resolved_set",
        new=AsyncMock(return_value=SimpleNamespace(handle="rs_abc123")),
    ) as created:
        handle = await bank_audience(
            db, conversation, kind="grade_targets", query={}, rows=SUBMISSIONS[:3]
        )

    assert handle == "rs_abc123"
    assert len(created.await_args.kwargs["recipients"]) == 3


@pytest.mark.asyncio
async def test_an_empty_audience_banks_nothing():
    assert await bank_audience(
        AsyncMock(), SimpleNamespace(id=1), kind="k", query={}, rows=[]
    ) is None


@pytest.mark.asyncio
async def test_a_failed_bank_never_fails_the_turn():
    """Banking is an optimisation for the next turn. Losing it costs a
    re-resolution; raising would cost the instructor the handoff they asked
    for."""
    with patch(
        "app.services.audience.create_resolved_set",
        new=AsyncMock(side_effect=RuntimeError("db gone")),
    ):
        handle = await bank_audience(
            AsyncMock(), SimpleNamespace(id=1), kind="k", query={}, rows=SUBMISSIONS
        )

    assert handle is None


# --------------------------------------------- both channels read it the same


def test_the_grade_chain_reads_phrases_through_the_shared_reader():
    """_is_bulk_student_reference is now a name over read_audience_phrase, so
    the grade chain and the message chain cannot drift into reading the same
    sentence two different ways."""
    from app.services.chat import _is_bulk_student_reference

    assert _is_bulk_student_reference("all students") is True
    assert _is_bulk_student_reference("everyone") is True
    # The reported bug, at the call site that had it.
    assert _is_bulk_student_reference("all students who submitted to baking 101") is False
    assert _is_bulk_student_reference("all students who scored below 50") is False
