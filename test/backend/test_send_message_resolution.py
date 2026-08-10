from canvas_test_utils import unique_canvas_token

"""Tests for send_message's recipient-name resolution, message grouping,
and multi-preview behavior (see RecipientDirective / _run_send_message_chain
/ _resolve_recipient_directives / _build_grouped_send_message_result in
app/backend/app/services/chat.py)."""
import asyncio
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.canvas import AssignmentResponse
from app.schemas.student import StudentResponse

CANVAS_URL = "https://canvas.example.edu"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> tuple[dict, int]:
    """Register a fresh instructor, connect Canvas, seed one course, and
    set it active — mirrors test_read_actions.py's helper so a chat turn
    with no explicit local_course_id still resolves via course_name."""
    email = f"sendres_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Send Resolution Instructor", "email": email, "password": "Secret123!"},
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": unique_canvas_token(), "canvas_url": CANVAS_URL},
            headers=headers,
        )

    canvas_course_id = uuid.uuid4().int % 10_000_000
    with patch("app.services.canvas.fetch_courses", new_callable=AsyncMock) as mock:
        mock.return_value = [{
            "id": canvas_course_id,
            "name": "CPSC 310",
            "course_code": "CPSC310",
            "enrollment_term_id": 1,
            "workflow_state": "available",
        }]
        resp = client.get(f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers)
        local_course_id = resp.json()[0]["local_id"]
        active_resp = client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_course_id},
            headers=headers,
        )
        assert active_resp.status_code == 200, active_resp.text

    return headers, local_course_id


def _chat(client, headers, message, llm_output, conversation_id=None) -> dict:
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
    return response.json()


def _student(canvas_user_id: str, course_id: int, name: str, enrollment_state: str = "active") -> StudentResponse:
    return StudentResponse(
        id=1,
        canvas_user_id=canvas_user_id,
        course_id=course_id,
        name=name,
        enrollment_state=enrollment_state,
    )


def _tool_call_logs(conversation_id: int) -> list[dict]:
    """Reads tool_call_logs rows directly, same pattern as
    test_read_actions.py's helper — no HTTP endpoint exposes this table."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.config import settings as _settings
    from app.models.tool_call_log import ToolCallLog

    async def _query():
        engine = create_async_engine(_settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                rows = await db.scalars(
                    select(ToolCallLog)
                    .where(ToolCallLog.conversation_id == conversation_id)
                    .order_by(ToolCallLog.id)
                )
                return [{"action_name": r.action_name, "parameters": r.parameters} for r in rows]
        finally:
            await engine.dispose()

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_query())
    finally:
        loop.close()


# Verifies: recipient_directives that all share one body resolve via the
# roster alone and collapse into a single preview — no additional_previews,
# and no submissions-fallback scan since the roster resolved everyone.
def test_shared_body_directives_resolve_to_single_preview(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice"), _student("502", local_course_id, "Bob")]

    llm_outputs = [
        '{"action": "send_message", "course_name": "CPSC 310", "subject": "Reminder", '
        '"body": "Do not forget the quiz.", "recipient_directives": '
        '[{"student_reference": "Alice", "body": "Do not forget the quiz."}, '
        '{"student_reference": "Bob", "body": "Do not forget the quiz."}]}',
        '{"resolutions": [{"student_reference": "Alice", "canvas_user_id": 501}, '
        '{"student_reference": "Bob", "canvas_user_id": 502}]}',
    ]

    with patch("app.mcp_tools.dispatcher.get_students", new=AsyncMock(return_value=students)):
        body = _chat(client, headers, "message alice and bob about the quiz", llm_outputs)

    assert body["is_error"] is False, body
    reply = body["reply"]
    assert reply["action"] == "intent_preview"
    assert sorted(reply["proposed_action"]["recipient_canvas_user_ids"]) == [501, 502]
    # Form-handoff: send_message is reviewed in Messages compose, not chat confirm.
    assert "pending_message_id" not in reply
    assert "additional_previews" not in reply

    logs = _tool_call_logs(body["conversation_id"])
    assert [row["action_name"] for row in logs] == ["fetch_students"]


# Verifies: recipient_directives with distinct message bodies produce one
# grouped preview per distinct body (informational under form-handoff).
def test_distinct_body_directives_produce_additional_previews(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice"), _student("502", local_course_id, "Bob")]

    llm_outputs = [
        '{"action": "send_message", "course_name": "CPSC 310", "subject": "Follow-up", '
        '"body": "placeholder", "recipient_directives": '
        '[{"student_reference": "Alice", "body": "Message for Alice"}, '
        '{"student_reference": "Bob", "body": "Message for Bob"}]}',
        '{"resolutions": [{"student_reference": "Alice", "canvas_user_id": 501}, '
        '{"student_reference": "Bob", "canvas_user_id": 502}]}',
    ]

    with patch("app.mcp_tools.dispatcher.get_students", new=AsyncMock(return_value=students)):
        body = _chat(client, headers, "message alice and bob with different notes", llm_outputs)

    assert body["is_error"] is False, body
    reply = body["reply"]
    assert "additional_previews" in reply
    assert len(reply["additional_previews"]) == 1

    all_previews = [reply, *reply["additional_previews"]]
    bodies = {p["proposed_action"]["body"] for p in all_previews}
    assert bodies == {"Message for Alice", "Message for Bob"}
    recipient_ids = {p["proposed_action"]["recipient_canvas_user_ids"][0] for p in all_previews}
    assert recipient_ids == {501, 502}
    # Form-handoff: no chat-confirmable pending ids on any group.
    assert all("pending_message_id" not in p for p in all_previews)
    assert all(p["preview_metadata"]["message_count"] == 2 for p in all_previews)


# Verifies: broadcast_to_all_students resolves the full active roster,
# excluding inactive enrollments, with no recipient-resolver LLM call needed.
def test_broadcast_to_all_students_resolves_active_roster(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [
        _student("501", local_course_id, "Alice", enrollment_state="active"),
        _student("502", local_course_id, "Bob", enrollment_state="active"),
        _student("503", local_course_id, "Charlie", enrollment_state="inactive"),
    ]

    llm_output = (
        '{"action": "send_message", "course_name": "CPSC 310", "subject": "Update", '
        '"body": "Hello everyone", "broadcast_to_all_students": true}'
    )

    with patch("app.mcp_tools.dispatcher.get_students", new=AsyncMock(return_value=students)):
        body = _chat(client, headers, "message everyone privately", llm_output)

    assert body["is_error"] is False, body
    reply = body["reply"]
    assert sorted(reply["proposed_action"]["recipient_canvas_user_ids"]) == [501, 502]
    assert "additional_previews" not in reply


# Verifies: also_announce_to_class alongside recipient_directives produces
# an extra class-wide announcement group.
def test_also_announce_to_class_adds_announcement_group(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice")]

    llm_outputs = [
        '{"action": "send_message", "course_name": "CPSC 310", "subject": "Update", '
        '"body": "General class update.", "also_announce_to_class": true, '
        '"recipient_directives": [{"student_reference": "Alice", "body": "A personal note for you."}]}',
        '{"resolutions": [{"student_reference": "Alice", "canvas_user_id": 501}]}',
    ]

    with patch("app.mcp_tools.dispatcher.get_students", new=AsyncMock(return_value=students)):
        body = _chat(client, headers, "announce this and also message alice separately", llm_outputs)

    assert body["is_error"] is False, body
    reply = body["reply"]
    assert "additional_previews" in reply
    assert len(reply["additional_previews"]) == 1

    all_previews = [reply, *reply["additional_previews"]]
    recipient_lists = [p["proposed_action"]["recipient_canvas_user_ids"] for p in all_previews]
    assert [] in recipient_lists  # the announcement group
    assert [501] in recipient_lists  # the targeted group


# Verifies: a student_reference that matches nobody (roster or submissions
# fallback) returns clarify, not a preview, and the fallback scan still runs.
def test_unresolvable_reference_returns_clarify(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice")]

    llm_outputs = [
        '{"action": "send_message", "course_name": "CPSC 310", "subject": "Hi", '
        '"body": "placeholder", "recipient_directives": '
        '[{"student_reference": "Zzyzx", "body": "placeholder"}]}',
        '{"resolutions": [{"student_reference": "Zzyzx", "canvas_user_id": null}]}',
    ]

    with (
        patch("app.mcp_tools.dispatcher.get_students", new=AsyncMock(return_value=students)),
        patch("app.services.chat.get_submission_derived_students", new=AsyncMock(return_value=[])),
    ):
        body = _chat(client, headers, "message zzyzx", llm_outputs)

    assert body["is_error"] is False, body
    assert body["reply"]["clarify"] is True
    assert "Zzyzx" in body["reply"]["question"]
    assert "pending_message_id" not in body["reply"]

    logs = _tool_call_logs(body["conversation_id"])
    assert [row["action_name"] for row in logs] == ["fetch_students", "fetch_submissions"]
    assert logs[1]["parameters"]["scope"] == "all_assignments"


# Verifies: a name the roster can't match but the submissions-derived
# fallback corpus can is still resolved successfully.
def test_unresolved_against_roster_falls_back_to_submissions_corpus(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice")]
    fallback_students = [{"user_id": 777, "name": "Charlie Chaplin", "email": None, "login_id": None}]

    llm_outputs = [
        '{"action": "send_message", "course_name": "CPSC 310", "subject": "Hi", '
        '"body": "Please see me.", "recipient_directives": '
        '[{"student_reference": "Charlie", "body": "Please see me."}]}',
        '{"resolutions": [{"student_reference": "Charlie", "canvas_user_id": null}]}',
        '{"resolutions": [{"student_reference": "Charlie", "canvas_user_id": 777}]}',
    ]

    with (
        patch("app.mcp_tools.dispatcher.get_students", new=AsyncMock(return_value=students)),
        patch("app.services.chat.get_submission_derived_students", new=AsyncMock(return_value=fallback_students)),
    ):
        body = _chat(client, headers, "message charlie", llm_outputs)

    assert body["is_error"] is False, body
    assert body["reply"]["proposed_action"]["recipient_canvas_user_ids"] == [777]

    logs = _tool_call_logs(body["conversation_id"])
    assert [row["action_name"] for row in logs] == ["fetch_students", "fetch_submissions"]


# Verifies: a plain send_message with none of the new fields set is
# completely unaffected — still the existing single-preview auto-wrap path.
def test_plain_send_message_without_new_fields_is_unaffected(client):
    headers, _ = _register_with_canvas(client)

    llm_output = (
        '{"action": "send_message", "course_name": "CPSC 310", "subject": "Hi class", '
        '"body": "Welcome back."}'
    )

    body = _chat(client, headers, "post an announcement", llm_output)

    assert body["is_error"] is False, body
    reply = body["reply"]
    assert reply["action"] == "intent_preview"
    assert reply["proposed_action"]["recipient_canvas_user_ids"] is None
    assert "additional_previews" not in reply
    # send_message is a write action — never tracked in tool_call_logs.
    assert _tool_call_logs(body["conversation_id"]) == []


# Verifies: a grouped send_message batch is form-handoff only — no chat
# confirm/cancel path, and distinct bodies still surface as additional_previews.
def test_grouped_send_message_previews_are_not_chat_confirmable(client):
    headers, local_course_id = _register_with_canvas(client)
    students = [_student("501", local_course_id, "Alice"), _student("502", local_course_id, "Bob")]

    llm_outputs = [
        '{"action": "send_message", "course_name": "CPSC 310", "subject": "Reminder", '
        '"body": "placeholder", "recipient_directives": '
        '[{"student_reference": "Alice", "body": "Message for Alice"}, '
        '{"student_reference": "Bob", "body": "Message for Bob"}]}',
        '{"resolutions": [{"student_reference": "Alice", "canvas_user_id": 501}, '
        '{"student_reference": "Bob", "canvas_user_id": 502}]}',
    ]

    with patch("app.mcp_tools.dispatcher.get_students", new=AsyncMock(return_value=students)):
        body = _chat(client, headers, "message alice and bob with different notes", llm_outputs)

    assert body["is_error"] is False, body
    reply = body["reply"]
    assert reply["proposed_action"]["action"] == "send_message"
    assert "pending_message_id" not in reply
    assert len(reply["additional_previews"]) == 1
    assert "pending_message_id" not in reply["additional_previews"][0]

    # Chat confirm must reject — there is no pending workflow for form-handoff.
    confirm_resp = client.post(
        "/api/v1/chat/confirm",
        json={"conversation_id": body["conversation_id"], "pending_message_id": 1},
        headers=headers,
    )
    assert confirm_resp.status_code in {404, 409}


# Verifies: a fresh send_message in the same conversation leaves an
# unrelated pending create_assignment preview untouched (send_message
# itself no longer stages a chat-confirmable workflow).
def test_send_message_does_not_supersede_unrelated_create_assignment_preview(client):
    headers, local_course_id = _register_with_canvas(client)
    students_v1 = [_student("501", local_course_id, "Alice")]

    first_outputs = [
        '{"action": "send_message", "course_name": "CPSC 310", "subject": "First", '
        '"body": "First body", "recipient_directives": '
        '[{"student_reference": "Alice", "body": "First body"}]}',
        '{"resolutions": [{"student_reference": "Alice", "canvas_user_id": 501}]}',
    ]
    with patch("app.mcp_tools.dispatcher.get_students", new=AsyncMock(return_value=students_v1)):
        first = _chat(client, headers, "message alice", first_outputs)
    assert first["is_error"] is False, first
    conversation_id = first["conversation_id"]
    assert "pending_message_id" not in first["reply"]

    create_output = (
        '{"action": "intent_preview", "summary": "Create Quiz", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "Quiz", '
        '"description": "A short quiz on course topics.", "due_date": "2030-01-01T00:00:00", '
        '"points_possible": 10}}'
    )
    create = _chat(client, headers, "create a quiz", create_output, conversation_id=conversation_id)
    assert create["is_error"] is False, create
    create_pending_id = create["reply"]["pending_message_id"]

    students_v2 = students_v1 + [_student("502", local_course_id, "Bob")]
    second_outputs = [
        # By this turn the conversation has real prior history (the first
        # send_message batch, plus the create_assignment turn), so
        # _resolve_course_switch runs first — "actually message bob
        # instead" names no course, so it reports no switch.
        '{"switched_to": null}',
        '{"action": "send_message", "course_name": "CPSC 310", "subject": "Second", '
        '"body": "Second body", "recipient_directives": '
        '[{"student_reference": "Bob", "body": "Second body"}]}',
        '{"resolutions": [{"student_reference": "Bob", "canvas_user_id": 502}]}',
    ]
    with patch("app.mcp_tools.dispatcher.get_students", new=AsyncMock(return_value=students_v2)):
        second = _chat(
            client, headers, "actually message bob instead", second_outputs,
            conversation_id=conversation_id,
        )
    assert second["is_error"] is False, second
    assert "pending_message_id" not in second["reply"]

    # The unrelated create_assignment preview is untouched.
    with patch(
        "app.mcp_tools.dispatcher.create_course_assignment",
        new=AsyncMock(return_value=AssignmentResponse(
            id=1, course_id=local_course_id, name="Quiz", description="A short quiz on course topics.",
            due_at="2030-01-01T00:00:00", points_possible=10,
        )),
    ):
        create_confirm = client.post(
            "/api/v1/chat/confirm",
            json={"conversation_id": conversation_id, "pending_message_id": create_pending_id},
            headers=headers,
        )
    assert create_confirm.status_code == 200, create_confirm.text
    assert create_confirm.json()["is_error"] is False
