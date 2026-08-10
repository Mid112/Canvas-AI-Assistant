"""Course resolution for create_assignment / create_quiz — see
_run_create_chain in app/backend/app/services/chat.py.

These two writes had no resolver in front of them at all: the model's action
went straight to a preview, and the intent_preview dispatch resolved
local_course_id only to check ownership, never to check it was the course the
instructor meant. The failure is silent by construction — the confirm card
names whatever course it was handed, so the wrong one looks right.

Every test here therefore asserts on the *resolved course*, not on the status
code: a 200 proves nothing about which Canvas course the assignment lands in.
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

# "no switch" from _resolve_course_switch. Returned deliberately in the
# mismatch tests: the point is that the create chain is a *second* line of
# defence, so it has to hold when the LLM switch resolver has already missed.
NO_SWITCH = '{"switched_to": null}'


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_two_courses(
    client, *, set_active: bool = True
) -> tuple[dict, dict[str, int]]:
    """An instructor with Capstone Project active and COSTCO 101 also synced.

    Two courses is the minimum that can show the bug: with one, every wrong
    answer is also the right one.
    """
    email = f"createres_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Create Chain Instructor", "email": email, "password": "Secret123!"},
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
            "name": "Capstone Project",
            "course_code": "CAPS499",
            "enrollment_term_id": 1,
            "workflow_state": "available",
        },
        {
            "id": uuid.uuid4().int % 10_000_000,
            "name": "COSTCO 101",
            "course_code": "COSTCO101",
            "enrollment_term_id": 1,
            "workflow_state": "available",
        },
    ]
    # Setting the active course re-enters sync_courses_if_stale, so it has to
    # stay inside the patch or it reaches for the real Canvas.
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = courses
        synced = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
        assert synced.status_code == 200, synced.text
        local_ids = {row["name"]: row["local_id"] for row in synced.json()}
        if set_active:
            active = client.patch(
                "/api/v1/canvas/active-course",
                json={"local_course_id": local_ids["COSTCO 101"]},
                headers=headers,
            )
            assert active.status_code == 200, active.text
    return headers, local_ids


def _chat(client, headers, message, llm_output) -> dict:
    mock_adapter = AsyncMock()
    if isinstance(llm_output, list):
        mock_adapter.generate.side_effect = llm_output
    else:
        mock_adapter.generate.return_value = llm_output
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        response = client.post(
            "/api/v1/chat/", json={"message": message}, headers=headers
        )
    assert response.status_code == 200, response.text
    # The endpoint wraps the assistant payload; every assertion here is about
    # the payload, not the envelope.
    return response.json()["reply"]


def _create_assignment_preview(local_course_id: int, *, title: str = "Assignment 3") -> str:
    """What the model emits: an intent_preview wrapping the create, which is
    the shape the system prompt asks for."""
    return (
        '{"action": "intent_preview", "summary": "I will create it.",'
        ' "proposed_action": {"action": "create_assignment",'
        f' "local_course_id": {local_course_id},'
        f' "title": "{title}", "description": "It is a great way to train",'
        ' "due_date": "2027-11-05T23:59:00", "points_possible": 6}}'
    )


def _course_name_of(local_course_id: int) -> str:
    async def _read() -> str:
        engine = create_async_engine(settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                from app.models.course import Course

                course = await db.get(Course, local_course_id)
                assert course is not None
                return course.name
        finally:
            await engine.dispose()

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_read())
    finally:
        loop.close()


# Verifies the exact reported failure: the message names Capstone Project, the
# active course is COSTCO 101, and the model echoes the active course back.
# Before _run_create_chain the assignment was built against COSTCO 101 and the
# confirm card said so, which reads as correct unless you already knew.
@pytest.mark.requirement("FR3.9")
def test_named_course_in_message_overrides_the_models_active_course(client):
    headers, local_ids = _register_with_two_courses(client)

    reply = _chat(
        client,
        headers,
        "create an assignment for capstone project",
        [NO_SWITCH, _create_assignment_preview(local_ids["COSTCO 101"])],
    )

    proposed = reply["proposed_action"]
    assert proposed["local_course_id"] == local_ids["Capstone Project"]
    assert reply["preview_metadata"]["course"] == "Capstone Project"


# Verifies the same guard on create_quiz. A rule enforced for one of two
# actions that share the defect is not enforced.
@pytest.mark.requirement("FR3.9")
def test_create_quiz_also_resolves_the_named_course(client):
    headers, local_ids = _register_with_two_courses(client)

    reply = _chat(
        client,
        headers,
        "create a quiz for capstone project",
        [
            NO_SWITCH,
            '{"action": "intent_preview", "summary": "I will create it.",'
            ' "proposed_action": {"action": "create_quiz",'
            f' "local_course_id": {local_ids["COSTCO 101"]},'
            ' "title": "Quiz 1",'
            ' "description": "A quiz covering the first unit of the course.",'
            ' "due_date": "2027-11-05T23:59:00", "points_possible": 10}}',
        ],
    )

    assert reply["proposed_action"]["local_course_id"] == local_ids["Capstone Project"]


# Verifies the bare-action route is guarded too. The system prompt asks the
# model to wrap creates in intent_preview, but smaller models often name the
# write directly and get auto-wrapped further down — that path skipped
# resolution entirely.
@pytest.mark.requirement("FR3.9")
def test_unwrapped_create_action_is_resolved_before_the_auto_wrap(client):
    headers, local_ids = _register_with_two_courses(client)

    reply = _chat(
        client,
        headers,
        "create an assignment for capstone project",
        [
            NO_SWITCH,
            '{"action": "create_assignment",'
            f' "local_course_id": {local_ids["COSTCO 101"]},'
            ' "title": "Assignment 3", "description": "It is a great way to train",'
            ' "due_date": "2027-11-05T23:59:00", "points_possible": 6}',
        ],
    )

    assert reply["proposed_action"]["local_course_id"] == local_ids["Capstone Project"]


# Verifies the ordinary case is untouched: a message naming no course keeps the
# conversation's course. The guard must not turn every create into a course
# argument.
@pytest.mark.requirement("FR3.9")
def test_message_naming_no_course_keeps_the_active_course(client):
    headers, local_ids = _register_with_two_courses(client)

    reply = _chat(
        client,
        headers,
        "create an assignment worth 6 points",
        _create_assignment_preview(local_ids["COSTCO 101"]),
    )

    assert reply["proposed_action"]["local_course_id"] == local_ids["COSTCO 101"]
    assert reply["preview_metadata"]["course"] == "COSTCO 101"


# Verifies another instructor's course id never reaches the preview. The
# precedence order is itself the defence here: the conversation's own resolved
# course outranks the model's echo, so a foreign id is dropped before the
# ownership check rather than being caught by it.
@pytest.mark.requirement("FR1.9")
def test_course_owned_by_another_instructor_is_never_previewed(client):
    headers, local_ids = _register_with_two_courses(client)
    _, other_ids = _register_with_two_courses(client)

    reply = _chat(
        client,
        headers,
        "create an assignment worth 6 points",
        _create_assignment_preview(other_ids["COSTCO 101"]),
    )

    assert reply["proposed_action"]["local_course_id"] == local_ids["COSTCO 101"]
    assert reply["preview_metadata"]["course"] == "COSTCO 101"


# Verifies an instructor with no active course cannot have a foreign course id
# previewed either. The chat endpoint's own "which course is this about?" gate
# fires before the create chain here, so the model's id is never reached — the
# assertion is on that, not on an error, because an error is not what happens.
@pytest.mark.requirement("FR1.9")
def test_no_active_course_clarifies_rather_than_using_a_foreign_id(client):
    headers, _ = _register_with_two_courses(client, set_active=False)
    _, other_ids = _register_with_two_courses(client)
    foreign_course_id = other_ids["COSTCO 101"]

    reply = _chat(
        client,
        headers,
        "create an assignment worth 6 points",
        _create_assignment_preview(foreign_course_id),
    )

    assert reply.get("clarify") is True, reply
    assert "proposed_action" not in reply
    # Never leaks the other instructor's course name.
    assert _course_name_of(foreign_course_id) not in str(reply)
