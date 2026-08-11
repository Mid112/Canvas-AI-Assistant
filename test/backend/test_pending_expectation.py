"""The pending-expectation record and the clarify retry budget.

Nothing in the schema links a reply to what it replies to. messages holds
role + text; the only cross-turn pointer is pending_message_id, which points
at a preview. So "the second one" reaches the model as three words with no
record of what was on offer, and it either re-derives the list from history or
asks again.

record_pending_expectation stores the outstanding question and its candidates
in conversations.field_memory (already JSONB — no migration), and the reference
pre-pass reads a short reply against it before matching anything from scratch.

The unit tests here cover the matching rules directly; resolve_against_expectation
is pure, and driving it through the chat endpoint would test the plumbing
around it rather than the rules themselves.
"""
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.field_memory import (
    clear_pending_expectation,
    pending_expectation,
    record_pending_expectation,
    resolve_against_expectation,
)

CANVAS_URL = "https://canvas.example.edu"


def _conversation(memory: dict | None = None):
    return SimpleNamespace(field_memory=memory)


def _expectation(labels: list[str], field: str = "assignment_reference") -> dict:
    conversation = _conversation()
    record_pending_expectation(
        conversation,
        field=field,
        question="Which one did you mean?",
        candidates=[
            {"id": 100 + index, "label": label} for index, label in enumerate(labels)
        ],
    )
    return pending_expectation(conversation.field_memory)


# Verifies an ordinal is read against the list as it was offered. "the second
# one" has no title in it to match — without the record there is nothing for
# any resolver to work with.
@pytest.mark.requirement("FR3.4")
def test_ordinal_reply_selects_the_offered_candidate():
    expectation = _expectation(["Lab Report A", "Lab Report B", "Final"])

    assert resolve_against_expectation(expectation, "the second one") == {
        "field": "assignment_reference",
        "id": 101,
        "label": "Lab Report B",
    }
    assert resolve_against_expectation(expectation, "2")["id"] == 101


# Verifies a named label wins over an ordinal reading of the same reply, and
# that the longer label wins when one contains another.
@pytest.mark.requirement("FR3.4")
def test_label_reply_prefers_the_longest_match():
    expectation = _expectation(["Lab Report", "Lab Report Two"])

    assert resolve_against_expectation(expectation, "lab report two")["id"] == 101


# Verifies a bare "yes" only resolves when there was one thing to say yes to.
# Against three options it says nothing about which, and guessing would put
# the wrong assignment into a preview the instructor is about to approve.
@pytest.mark.requirement("FR3.4")
def test_yes_resolves_only_against_a_single_candidate():
    assert resolve_against_expectation(_expectation(["Only One"]), "yes")["id"] == 100
    assert resolve_against_expectation(_expectation(["A One", "B Two"]), "yes") is None


# Verifies a reply that changes the subject is not forced into an answer.
# Instructors abandon questions mid-thread; reading "actually show me the
# roster" as a choice of assignment would be worse than asking again.
@pytest.mark.requirement("FR3.4")
def test_unrelated_reply_does_not_resolve():
    expectation = _expectation(["Lab Report A", "Lab Report B"])

    assert resolve_against_expectation(expectation, "actually show me the roster") is None


# Verifies an out-of-range ordinal is refused rather than clamped. "the fifth
# one" against three options is a misunderstanding, not a vote for the third.
@pytest.mark.requirement("FR3.4")
def test_out_of_range_ordinal_does_not_resolve():
    expectation = _expectation(["A One", "B Two", "C Three"])

    assert resolve_against_expectation(expectation, "the fifth one") is None


# Verifies an ordinary sentence containing "one"/"two" is not read as an
# ordinal. Scanning for those cardinals anywhere in the reply made "which one
# has more students?" — a question — resolve to candidate 1, and "no one
# submitted yet" do the same. On a yes/no course-switch offer that false
# positive doesn't just pick the wrong item, it consents: the conversation
# moves to another Canvas course and replays the request there.
@pytest.mark.requirement("FR3.4")
def test_a_cardinal_inside_a_sentence_is_not_an_ordinal():
    expectation = _expectation(["Lab Report A", "Lab Report B", "Final"])

    assert resolve_against_expectation(expectation, "which one has more students?") is None
    assert resolve_against_expectation(expectation, "no one submitted yet") is None
    assert resolve_against_expectation(expectation, "can you show me the two students") is None
    # Still an answer when the whole reply IS the word — that is unambiguous.
    assert resolve_against_expectation(expectation, "two")["id"] == 101
    assert resolve_against_expectation(expectation, "the second one")["id"] == 101


# Verifies two equally-long labels stay ambiguous — the same rule the rest of
# the pre-pass follows.
@pytest.mark.requirement("FR3.4")
def test_equal_length_label_matches_stay_ambiguous():
    expectation = _expectation(["Lab Report A", "Lab Report B"])

    assert resolve_against_expectation(expectation, "lab report a lab report b") is None


# Verifies clearing works, so a much later "yes" cannot reattach to a question
# from several turns ago.
def test_clearing_removes_the_expectation():
    conversation = _conversation()
    record_pending_expectation(
        conversation, field="assignment_reference", question="Which?",
        candidates=[{"id": 1, "label": "Only One"}],
    )
    clear_pending_expectation(conversation)

    assert pending_expectation(conversation.field_memory) is None


# Verifies a clarify with nothing to choose between records nothing. A
# missing-field question ("what should the due date be?") has no candidates,
# and an empty expectation would make every later "yes" look answerable.
def test_expectation_with_no_candidates_never_resolves():
    conversation = _conversation()
    record_pending_expectation(
        conversation, field="due_date", question="What due date?", candidates=[]
    )

    assert resolve_against_expectation(
        pending_expectation(conversation.field_memory), "yes"
    ) is None


# ---------------------------------------------------------------------------
# End to end: the record is written on a clarify and read on the next turn.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register(client) -> tuple[dict, int]:
    email = f"expect_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Expectation Instructor", "email": email, "password": "Secret123!"},
    )
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        connected = client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": f"test-token-{uuid.uuid4()}", "canvas_url": CANVAS_URL},
            headers=headers,
        )
    assert connected.status_code == 200, connected.text

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = [{
            "id": uuid.uuid4().int % 10_000_000, "name": "CPSC 310",
            "course_code": "CPSC310", "enrollment_term_id": 1,
            "workflow_state": "available",
        }]
        synced = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
        local_course_id = synced.json()[0]["local_id"]
        active = client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_course_id},
            headers=headers,
        )
        assert active.status_code == 200, active.text
    return headers, local_course_id


def _assignments() -> list[dict]:
    return [
        {"id": 111, "name": "Lab Report A", "description": None,
         "due_at": None, "points_possible": 10.0, "course_id": 1},
        {"id": 222, "name": "Lab Report B", "description": None,
         "due_at": None, "points_possible": 10.0, "course_id": 1},
    ]


def _chat(client, headers, message, llm_output, conversation_id=None):
    mock_adapter = AsyncMock()
    if isinstance(llm_output, list):
        mock_adapter.generate.side_effect = llm_output
    else:
        mock_adapter.generate.return_value = llm_output
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/",
            json={"message": message, "conversation_id": conversation_id},
            headers=headers,
        )
    assert response.status_code == 200, response.text
    return response.json(), mock_adapter


_FETCH_SUBMISSIONS = (
    '{"action": "fetch_submissions", "course_name": "CPSC 310", '
    '"assignment_reference": "the lab report"}'
)


# Verifies the loop of the whole feature: an ambiguous reference produces a
# clarify carrying candidates, and the follow-up "the second one" arrives at
# the model with that assignment already resolved.
@pytest.mark.requirement("FR3.4")
def test_ordinal_follow_up_resolves_against_the_recorded_question(client):
    headers, _ = _register(client)

    with patch(
        "app.services.canvas.fetch_assignments",
        new=AsyncMock(return_value=_assignments()),
    ):
        first, _ = _chat(client, headers, "show submissions for the lab report", _FETCH_SUBMISSIONS)

    reply = first["reply"]
    assert reply.get("clarify") is True, reply
    assert [c["label"] for c in reply["clarify_candidates"]] == ["Lab Report A", "Lab Report B"]

    second, mock_adapter = _chat(
        client, headers, "the second one",
        '{"action": "respond", "message": "OK."}',
        conversation_id=first["conversation_id"],
    )

    assert second["is_error"] is False, second
    prompt = mock_adapter.generate.call_args_list[-1].args[0]
    block = prompt.partition("RESOLVED REFERENCES")[2]
    assert '"assignment_id": 222' in block
    assert "Lab Report B" in block


# Verifies the point of the retry budget: a resolver clarify no longer ends the
# turn. The server could not choose between two assignments, so the model gets
# another pass to call a tool and settle it — the instructor is never shown the
# question.
#
# Asserted on the reply the instructor sees, not on the call count alone: a
# turn that retried and still clarified would have the same count.
@pytest.mark.requirement("FR3.4")
def test_resolver_clarify_gives_the_model_another_pass(client):
    headers, _ = _register(client)

    with patch(
        "app.services.canvas.fetch_assignments",
        new=AsyncMock(return_value=_assignments()),
    ):
        body, mock_adapter = _chat(
            client, headers, "show submissions for the lab report",
            [
                _FETCH_SUBMISSIONS,
                # _resolve_assignment_reference's own small call — it cannot
                # choose, which is what produces the clarify being retried.
                '{"assignment_id": null}',
                '{"action": "respond", "message": "Resolved on the retry."}',
            ],
        )

    assert body["is_error"] is False, body
    assert body["reply"]["message"] == "Resolved on the retry."
    assert body["reply"].get("clarify") is not True
    # Two main calls, plus the one resolver call in between.
    assert mock_adapter.generate.await_count == 3


# Verifies the budget actually caps. A model that keeps returning the same
# unresolvable action must reach the instructor quickly rather than spending
# the whole MAX_TURN_STEPS allowance asking itself the same question — one
# initial call plus exactly two retries.
@pytest.mark.requirement("FR3.4")
def test_clarify_retries_are_capped_and_then_reach_the_instructor(client):
    headers, _ = _register(client)

    with patch(
        "app.services.canvas.fetch_assignments",
        new=AsyncMock(return_value=_assignments()),
    ):
        body, mock_adapter = _chat(
            client, headers, "show submissions for the lab report", _FETCH_SUBMISSIONS
        )

    assert body["reply"].get("clarify") is True, body
    # Four calls, pinned as a number because the cap is the whole point:
    # without it this turn would keep going to MAX_TURN_STEPS.
    #
    # It used to be six — three passes at a main call plus one
    # _resolve_assignment_reference call each. The model here returns the
    # byte-identical action every time, so the in-turn dedupe now serves the
    # second and third passes from the result already in hand instead of
    # re-running the resolver, and the third repeat ends the turn. Same
    # clarify reaches the instructor, two fewer calls to get there.
    #
    # The retry budget still does its job for what it is actually for: a model
    # that goes back and calls a DIFFERENT tool has a different signature, so
    # dedupe never fires (see the test above, still three calls).
    assert mock_adapter.generate.await_count == 4


# Verifies a missing-field clarify is still terminal. It has no candidates
# because there is nothing to look up — only the instructor knows the answer,
# and retrying would spend calls to ask them the same thing anyway.
@pytest.mark.requirement("FR3.4")
def test_missing_field_clarify_is_still_terminal(client):
    headers, local_course_id = _register(client)

    body, mock_adapter = _chat(
        client, headers, "create an assignment called Final",
        '{"action": "intent_preview", "summary": "Creating it.", "proposed_action": '
        '{"action": "create_assignment", "local_course_id": ' + str(local_course_id) +
        ', "title": "Final", "description": "A final assessment for the term."}}',
    )

    assert body["reply"].get("clarify") is True, body
    assert "clarify_candidates" not in body["reply"]
    assert mock_adapter.generate.await_count == 1
