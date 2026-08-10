"""The reference pre-pass — _run_reference_prescan in services/chat.py.

Every other resolver in chat.py runs *after* the model has committed to an
action, so when the model hedges instead ("which student did you mean?" to a
message that named one) the resolver is never reached and the instructor is
asked to repeat themselves. This pass resolves what the raw message already
settles — course, assignment, students, submission — from locally synced rows
before the model sees the turn, with no extra LLM call and no Canvas
round-trip.

Every test asserts on the system prompt the model was actually handed, because
that is the only thing the pass produces. Asserting on the reply would pass
just as well with the block missing, since the mocked model ignores it.
"""
import asyncio
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.main import app

CANVAS_URL = "https://canvas.example.edu"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register(client, extra_course: str | None = None) -> tuple[dict, dict[str, int]]:
    email = f"prescan_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Prescan Instructor", "email": email, "password": "Secret123!"},
    )
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        connected = client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": f"test-token-{uuid.uuid4()}", "canvas_url": CANVAS_URL},
            headers=headers,
        )
    assert connected.status_code == 200, connected.text

    courses = [
        {
            "id": uuid.uuid4().int % 10_000_000,
            "name": "CPSC 310",
            "course_code": "CPSC310",
            "enrollment_term_id": 1,
            "workflow_state": "available",
        }
    ]
    if extra_course:
        courses.append(
            {
                "id": uuid.uuid4().int % 10_000_000,
                "name": extra_course,
                "course_code": "OTHER999",
                "enrollment_term_id": 1,
                "workflow_state": "available",
            }
        )

    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        synced = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
        assert synced.status_code == 200, synced.text
        local_ids = {row["name"]: row["local_id"] for row in synced.json()}
        active = client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_ids["CPSC 310"]},
            headers=headers,
        )
        assert active.status_code == 200, active.text
    return headers, local_ids


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _seed(rows: list) -> None:
    async def _insert():
        engine = create_async_engine(settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                for row in rows:
                    db.add(row)
                await db.commit()
        finally:
            await engine.dispose()

    _run(_insert())


def _student(
    course_id: int,
    canvas_user_id: int,
    name: str,
    *,
    sortable_name: str | None = None,
    enrollment_state: str = "active",
):
    from app.models.student import Student

    return Student(
        canvas_user_id=str(canvas_user_id),
        course_id=course_id,
        name=name,
        sortable_name=sortable_name,
        enrollment_state=enrollment_state,
    )


def _assignment(course_id: int, canvas_assignment_id: int, title: str):
    from app.models.assignment import Assignment

    return Assignment(
        canvas_assignment_id=str(canvas_assignment_id),
        title=title,
        course_id=course_id,
    )


def _seed_submission(
    course_id: int, canvas_assignment_id: int, student_canvas_id: int, canvas_submission_id: int
) -> None:
    """Submissions hang off the local assignment row, so the assignment has to
    exist first and its local id has to be read back."""
    async def _insert():
        from sqlalchemy import select

        from app.models.assignment import Assignment
        from app.models.submission import Submission

        engine = create_async_engine(settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                local_assignment_id = await db.scalar(
                    select(Assignment.id).where(
                        Assignment.course_id == course_id,
                        Assignment.canvas_assignment_id == str(canvas_assignment_id),
                    )
                )
                assert local_assignment_id is not None
                db.add(
                    Submission(
                        canvas_submission_id=str(canvas_submission_id),
                        assignment_id=local_assignment_id,
                        student_canvas_id=str(student_canvas_id),
                        status="submitted",
                    )
                )
                await db.commit()
        finally:
            await engine.dispose()

    _run(_insert())


def _system_prompt_for(client, headers, message: str) -> str:
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "respond", "message": "OK."}'
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/", json={"message": message, "conversation_id": None}, headers=headers
        )
    assert response.status_code == 200, response.text
    return mock_adapter.generate.call_args_list[-1].args[0]


def _prescan_block(prompt: str) -> str:
    """Just the appended block. The base system prompt documents
    recipient_handle and names actions in prose, so a bare substring check
    against the whole prompt matches text this pass never wrote."""
    _, separator, block = prompt.partition("RESOLVED REFERENCES")
    return block if separator else ""


# Verifies a student named in the message arrives resolved. Without this the
# model asks "which student?" about a message that just said which student.
@pytest.mark.requirement("FR3.3")
def test_student_named_in_the_message_is_resolved(client):
    headers, ids = _register(client)
    _seed([_student(ids["CPSC 310"], 4242, "Coin Nakamoto", sortable_name="Nakamoto, Coin")])

    prompt = _system_prompt_for(client, headers, "send feedback to Coin Nakamoto")

    assert "RESOLVED REFERENCES" in prompt
    assert '"student_id": 4242' in prompt


# Verifies the surname alone is enough — instructors rarely type a full name.
@pytest.mark.requirement("FR3.3")
def test_surname_alone_resolves_a_student(client):
    headers, ids = _register(client)
    _seed([_student(ids["CPSC 310"], 5150, "Coin Nakamoto", sortable_name="Nakamoto, Coin")])

    prompt = _system_prompt_for(client, headers, "how did Nakamoto do?")

    assert '"student_id": 5150' in prompt


# Verifies a shared surname is dropped rather than guessed at — and, crucially,
# that dropping it does not take the unambiguous name in the same message with
# it. Resolving one of two Smiths would put the wrong student in a preview.
@pytest.mark.requirement("FR3.4")
def test_ambiguous_surname_is_dropped_without_losing_the_other_name(client):
    headers, ids = _register(client)
    course_id = ids["CPSC 310"]
    _seed([
        _student(course_id, 6001, "Ada Smith", sortable_name="Smith, Ada"),
        _student(course_id, 6002, "Bo Smith", sortable_name="Smith, Bo"),
        _student(course_id, 6003, "Coin Nakamoto", sortable_name="Nakamoto, Coin"),
    ])

    prompt = _system_prompt_for(client, headers, "message Smith and Nakamoto")

    assert '"student_id": 6003' in prompt
    assert '"student_id": 6001' not in prompt
    assert '"student_id": 6002' not in prompt


# Verifies the longer match wins. "Alice Smith" contains "Alice", so a second
# Alice would otherwise be resolved alongside the student actually named.
@pytest.mark.requirement("FR3.3")
def test_full_name_beats_a_different_students_given_name(client):
    headers, ids = _register(client)
    course_id = ids["CPSC 310"]
    _seed([
        _student(course_id, 7001, "Alice Smith", sortable_name="Smith, Alice"),
        _student(course_id, 7002, "Alice Jones", sortable_name="Jones, Alice"),
    ])

    prompt = _system_prompt_for(client, headers, "give Alice Smith an extension")

    assert '"student_id": 7001' in prompt
    assert '"student_id": 7002' not in prompt


# Verifies a withdrawn enrolment is never resolved. A name in the prompt that
# no write could act on is worse than no name at all.
@pytest.mark.requirement("FR3.3")
def test_inactive_enrolment_is_not_resolved(client):
    headers, ids = _register(client)
    _seed([
        _student(
            ids["CPSC 310"], 8001, "Gone Away",
            sortable_name="Away, Gone", enrollment_state="deleted",
        )
    ])

    prompt = _system_prompt_for(client, headers, "message Gone Away about the midterm")

    assert '"student_id": 8001' not in prompt


# Verifies the >5 rule: past the limit the roster goes behind the same handle
# resolve_missing_submissions already uses, and no name reaches the prompt.
@pytest.mark.requirement("FR10.4")
def test_more_than_five_named_students_go_behind_a_handle(client):
    headers, ids = _register(client)
    course_id = ids["CPSC 310"]
    names = [
        "Anderson", "Baxter", "Carlisle", "Donovan", "Ellsworth", "Fitzgerald",
    ]
    _seed([
        _student(course_id, 9100 + index, f"Given {surname}", sortable_name=f"{surname}, Given")
        for index, surname in enumerate(names)
    ])

    prompt = _system_prompt_for(
        client, headers, "message " + ", ".join(names) + " about the midterm"
    )

    block = _prescan_block(prompt)
    assert '"student_count": 6' in block
    assert "recipient_handle" in block
    for surname in names:
        assert surname not in block


# Verifies exactly five still arrive as names — the limit is inclusive, and an
# off-by-one here would hide a roster the model is meant to see.
@pytest.mark.requirement("FR10.4")
def test_five_named_students_are_still_passed_by_name(client):
    headers, ids = _register(client)
    course_id = ids["CPSC 310"]
    names = ["Anderson", "Baxter", "Carlisle", "Donovan", "Ellsworth"]
    _seed([
        _student(course_id, 9200 + index, f"Given {surname}", sortable_name=f"{surname}, Given")
        for index, surname in enumerate(names)
    ])

    prompt = _system_prompt_for(
        client, headers, "message " + ", ".join(names) + " about the midterm"
    )

    block = _prescan_block(prompt)
    assert "recipient_handle" not in block
    assert '"student_id": 9200' in block
    assert '"student_id": 9204' in block


# Verifies the derived submission: assignment plus exactly one student is
# enough to identify which submission the turn is about, so the model does not
# have to ask.
@pytest.mark.requirement("FR3.3")
def test_submission_is_derived_from_assignment_plus_one_student(client):
    headers, ids = _register(client)
    course_id = ids["CPSC 310"]
    _seed([
        _assignment(course_id, 3300, "Midterm Report"),
        _student(course_id, 3301, "Coin Nakamoto", sortable_name="Nakamoto, Coin"),
    ])
    _seed_submission(course_id, 3300, 3301, 3302)

    prompt = _system_prompt_for(client, headers, "regrade Coin Nakamoto's midterm report")

    assert '"assignment_id": 3300' in prompt
    assert '"student_id": 3301' in prompt
    assert '"submission_id": 3302' in prompt


# Verifies two named students means no single submission. Deriving one would
# pick a student the instructor did not single out.
@pytest.mark.requirement("FR3.4")
def test_submission_stays_silent_when_two_students_are_named(client):
    headers, ids = _register(client)
    course_id = ids["CPSC 310"]
    _seed([
        _assignment(course_id, 4400, "Final Report"),
        _student(course_id, 4401, "Coin Nakamoto", sortable_name="Nakamoto, Coin"),
        _student(course_id, 4402, "Ada Lovelace", sortable_name="Lovelace, Ada"),
    ])
    _seed_submission(course_id, 4400, 4401, 4403)

    prompt = _system_prompt_for(
        client, headers, "compare Coin Nakamoto and Ada Lovelace on the final report"
    )

    assert '"submission_id"' not in _prescan_block(prompt)


# Verifies a course named in the message is resolved into the block too, so the
# model is told which course the turn is about rather than inferring it.
@pytest.mark.requirement("FR3.9")
def test_course_named_in_the_message_is_resolved(client):
    headers, ids = _register(client, extra_course="Capstone Project")

    prompt = _system_prompt_for(client, headers, "list assignments for capstone project")

    assert f'"local_course_id": {ids["Capstone Project"]}' in prompt
    assert "Capstone Project" in prompt


# Verifies the pass stays quiet on an ordinary turn. A block on every message
# would train the model to expect one and to distrust turns without it.
def test_prescan_is_silent_when_the_message_names_nothing(client):
    headers, ids = _register(client)
    _seed([_student(ids["CPSC 310"], 9999, "Coin Nakamoto", sortable_name="Nakamoto, Coin")])

    prompt = _system_prompt_for(client, headers, "how are things going?")

    assert "RESOLVED REFERENCES" not in prompt
