"""Tests for POST /history/workflows/{id}/undo — Feature D (undo action).
Scoped to update_assignment (re-applies prior state) and create_assignment
(deletes the created assignment); send_message is not undoable (see
mcp_tools.schemas.UNDOABLE_ACTIONS — it's classified "irreversible")."""
import asyncio
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException, status as http_status
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.main import app
from app.models.assignment import Assignment
from app.models.audit_log import AuditLog
from app.models.message import Message
from app.models.workflow import Workflow
from app.schemas.canvas import AssignmentResponse, MessageSendResult

CANVAS_URL = "https://canvas.ubc.ca"


def _make_session():
    engine = create_async_engine(settings.DATABASE_URL)
    return engine, async_sessionmaker(engine, expire_on_commit=False)


def _seed_local_assignment(
    local_course_id: int,
    canvas_assignment_id: int,
    *,
    title: str = "Seeded Assignment",
) -> None:
    """Mirror an assignment locally so update_assignment resolver can verify
    a known assignment_id without calling Canvas."""

    async def _insert():
        engine, Session = _make_session()
        try:
            async with Session() as db:
                db.add(
                    Assignment(
                        canvas_assignment_id=str(canvas_assignment_id),
                        title=title,
                        course_id=local_course_id,
                    )
                )
                await db.commit()
        finally:
            await engine.dispose()

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_insert())
    finally:
        loop.close()


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register_with_canvas(client) -> tuple[dict, int]:
    """Register a fresh instructor, connect Canvas, seed one course, and
    set it active — the active-course PATCH also seeds canvas_course_names
    (see set_active_course's sync_courses_if_stale call), which is what
    lets a chat turn with no explicit local_course_id and no course_name
    in the mocked LLM reply still resolve a course via the
    UserPreference.active_course_id fallback in get_or_create_conversation."""
    email = f"undo_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Undo Instructor", "email": email, "password": "secret123"},
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": "test-token", "canvas_url": CANVAS_URL},
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


def _create_executed_update_assignment_workflow(
    client, headers, local_course_id, assignment_id: int | None = None
) -> tuple[int, int]:
    """Drives a full chat -> intent_preview -> confirm cycle for an
    update_assignment action, mocking the pre-update fetch and the actual
    Canvas write. Returns (workflow_id, assignment_id)."""
    aid = assignment_id if assignment_id is not None else uuid.uuid4().int % 10_000_000
    # Resolver always verifies assignment_id against the local mirror.
    _seed_local_assignment(local_course_id, aid, title="Old Title")

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "intent_preview", "summary": "Rename assignment", '
        '"proposed_action": {"action": "update_assignment", '
        f'"local_course_id": {local_course_id}, "assignment_id": {aid}, '
        '"title": "New Title"}}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        preview = client.post(
            "/api/v1/chat/",
            json={"message": "rename the assignment to New Title"},
            headers=headers,
        )
    body = preview.json()
    conversation_id = body["conversation_id"]
    pending_message_id = body["reply"]["pending_message_id"]

    current_assignment = AssignmentResponse(
        id=aid, name="Old Title", description="Original description",
        due_at=None, points_possible=50.0, course_id=local_course_id,
    )
    updated_assignment = AssignmentResponse(
        id=aid, name="New Title", description="Original description",
        due_at=None, points_possible=50.0, course_id=local_course_id,
    )
    with patch(
        "app.mcp_tools.dispatcher.get_assignment", new=AsyncMock(return_value=current_assignment)
    ), patch(
        "app.mcp_tools.dispatcher.update_course_assignment",
        new=AsyncMock(return_value=updated_assignment),
    ):
        confirm = client.post(
            "/api/v1/chat/confirm",
            json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
            headers=headers,
        )
    assert confirm.status_code == 200, confirm.json()

    history = client.get("/api/v1/history/workflows", headers=headers)
    workflow_id = next(
        item["id"] for item in history.json()["items"]
        if item["conversation_id"] == conversation_id
    )
    return workflow_id, aid


def _create_executed_create_assignment_workflow(client, headers, local_course_id) -> int:
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "intent_preview", "summary": "Create Midterm Exam", '
        '"proposed_action": {"action": "create_assignment", '
        f'"local_course_id": {local_course_id}, "title": "Midterm Exam", '
        '"description": "Covers chapters 1 through 5", "due_date": "2030-01-01T00:00:00", '
        '"points_possible": 100}}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        preview = client.post(
            "/api/v1/chat/",
            json={"message": "create a midterm exam"},
            headers=headers,
        )
    body = preview.json()
    conversation_id = body["conversation_id"]
    pending_message_id = body["reply"]["pending_message_id"]

    fake_assignment = AssignmentResponse(
        id=uuid.uuid4().int % 10_000_000, name="Midterm Exam",
        description="Covers chapters 1 through 5", due_at="2030-01-01T00:00:00",
        points_possible=100.0, course_id=local_course_id,
    )
    with patch(
        "app.mcp_tools.dispatcher.create_course_assignment",
        new=AsyncMock(return_value=fake_assignment),
    ):
        confirm = client.post(
            "/api/v1/chat/confirm",
            json={"conversation_id": conversation_id, "pending_message_id": pending_message_id},
            headers=headers,
        )
    assert confirm.status_code == 200, confirm.json()

    history = client.get("/api/v1/history/workflows", headers=headers)
    return next(
        item["id"] for item in history.json()["items"]
        if item["conversation_id"] == conversation_id
    )


async def _get_reversal_chat_messages(workflow_id: int) -> list[Message]:
    engine, Session = _make_session()
    try:
        async with Session() as db:
            workflow = await db.get(Workflow, workflow_id)
            rows = await db.scalars(
                select(Message)
                .where(
                    Message.conversation_id == workflow.conversation_id,
                    Message.role == "assistant",
                    Message.content.ilike("Reversed %"),
                )
                .order_by(Message.created_at.asc())
            )
            return list(rows)
    finally:
        await engine.dispose()


def _create_executed_send_message_workflow(client, headers, local_course_id) -> int:
    """send_message is classified "irreversible" (mcp_tools.schemas.
    ACTION_CLASSIFICATION) and deliberately excluded from UNDOABLE_ACTIONS —
    a sent Canvas announcement can't be un-sent.

    Form-handoff records the executed Workflow via the Messages draft send
    path rather than chat confirm."""
    create = client.post(
        "/api/v1/messages/drafts",
        json={
            "course_id": local_course_id,
            "subject": "Reminder",
            "body": "Please submit your work.",
        },
        headers=headers,
    )
    assert create.status_code == 201, create.json()
    draft_id = create.json()["id"]

    fake_result = MessageSendResult(
        course_id=local_course_id, subject="Reminder", body="Please submit your work.",
        audience_size=30, delivery_mode="announcement",
    )
    with (
        patch(
            "app.services.canvas.send_course_message",
            new=AsyncMock(return_value=fake_result),
        ),
    ):
        send = client.post(
            f"/api/v1/messages/drafts/{draft_id}/send",
            headers=headers,
        )
    assert send.status_code == 200, send.json()

    history = client.get("/api/v1/history/workflows", headers=headers)
    return next(
        item["id"] for item in history.json()["items"]
        if item["action_name"] == "send_message"
    )


async def _null_out_before_data(workflow_id: int) -> None:
    engine, Session = _make_session()
    try:
        async with Session() as db:
            row = await db.scalar(select(AuditLog).where(AuditLog.workflow_id == workflow_id))
            row.before_data = None
            await db.commit()
    finally:
        await engine.dispose()


async def _get_undone_at(workflow_id: int):
    engine, Session = _make_session()
    try:
        async with Session() as db:
            workflow = await db.get(Workflow, workflow_id)
            return workflow.undone_at
    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

# Verifies: Undo re-applies the prior assignment state via Canvas.
def test_undo_reapplies_prior_assignment_state(client):
    headers, local_course_id = _register_with_canvas(client)
    workflow_id, assignment_id = _create_executed_update_assignment_workflow(
        client, headers, local_course_id
    )

    reverted_assignment = AssignmentResponse(
        id=assignment_id, name="Old Title", description="Original description",
        due_at=None, points_possible=50.0, course_id=local_course_id,
    )
    with patch(
        "app.services.workflow.update_course_assignment",
        new=AsyncMock(return_value=reverted_assignment),
    ) as mock_revert:
        response = client.post(f"/api/v1/history/workflows/{workflow_id}/undo", headers=headers)

    assert response.status_code == 200
    mock_revert.assert_called_once()
    call_args = mock_revert.call_args
    payload = call_args.args[2] if len(call_args.args) > 2 else call_args.kwargs["payload"]
    assert payload.name == "Old Title"


# Verifies: Undo of a create_assignment action deletes the created assignment.
def test_undo_create_assignment_deletes_it(client):
    headers, local_course_id = _register_with_canvas(client)
    workflow_id = _create_executed_create_assignment_workflow(client, headers, local_course_id)

    with patch(
        "app.services.workflow.delete_course_assignment",
        new=AsyncMock(return_value=None),
    ) as mock_delete:
        response = client.post(f"/api/v1/history/workflows/{workflow_id}/undo", headers=headers)

    assert response.status_code == 200
    mock_delete.assert_called_once()


# Verifies: Undo of a create_assignment action does not require before_data
# (a create's audit row legitimately has none — the assignment didn't exist
# before it was created).
def test_undo_create_assignment_does_not_require_before_data(client):
    headers, local_course_id = _register_with_canvas(client)
    workflow_id = _create_executed_create_assignment_workflow(client, headers, local_course_id)

    async def _assert_before_data_is_none():
        engine, Session = _make_session()
        try:
            async with Session() as db:
                row = await db.scalar(select(AuditLog).where(AuditLog.workflow_id == workflow_id))
                assert row.before_data is None
        finally:
            await engine.dispose()

    asyncio.run(_assert_before_data_is_none())

    with patch(
        "app.services.workflow.delete_course_assignment",
        new=AsyncMock(return_value=None),
    ):
        response = client.post(f"/api/v1/history/workflows/{workflow_id}/undo", headers=headers)

    assert response.status_code == 200


# Verifies: Undoing a create_assignment writes a distinct delete-operation audit row.
def test_undo_create_assignment_writes_delete_audit_row(client):
    headers, local_course_id = _register_with_canvas(client)
    workflow_id = _create_executed_create_assignment_workflow(client, headers, local_course_id)

    with patch(
        "app.services.workflow.delete_course_assignment",
        new=AsyncMock(return_value=None),
    ):
        response = client.post(f"/api/v1/history/workflows/{workflow_id}/undo", headers=headers)
    assert response.status_code == 200

    async def _get_rows():
        engine, Session = _make_session()
        try:
            async with Session() as db:
                rows = await db.scalars(
                    select(AuditLog)
                    .where(AuditLog.workflow_id == workflow_id)
                    .order_by(AuditLog.timestamp.asc())
                )
                return list(rows)
        finally:
            await engine.dispose()

    rows = asyncio.run(_get_rows())
    assert len(rows) == 2
    assert rows[0].action == "create_assignment"
    assert rows[1].action == "undo_assignment"
    assert rows[1].operation == "delete"
    assert rows[1].after_data is None


# Verifies: A successful undo writes a WorkflowHistoryItem with undone_at set.
def test_undo_sets_undone_at_in_history(client):
    headers, local_course_id = _register_with_canvas(client)
    workflow_id, assignment_id = _create_executed_update_assignment_workflow(
        client, headers, local_course_id
    )

    reverted_assignment = AssignmentResponse(
        id=assignment_id, name="Old Title", description="Original description",
        due_at=None, points_possible=50.0, course_id=local_course_id,
    )
    with patch(
        "app.services.workflow.update_course_assignment",
        new=AsyncMock(return_value=reverted_assignment),
    ):
        response = client.post(f"/api/v1/history/workflows/{workflow_id}/undo", headers=headers)

    assert response.status_code == 200
    assert response.json()["undone_at"] is not None

    history = client.get("/api/v1/history/workflows", headers=headers)
    item = next(i for i in history.json()["items"] if i["id"] == workflow_id)
    assert item["undone_at"] is not None
    assert item["undoable"] is True


# Verifies: A successful undo is persisted into the originating chat transcript,
# not only reflected in frontend-only state.
def test_undo_writes_reversal_message_to_chat_history(client):
    headers, local_course_id = _register_with_canvas(client)
    workflow_id, assignment_id = _create_executed_update_assignment_workflow(
        client, headers, local_course_id
    )

    reverted_assignment = AssignmentResponse(
        id=assignment_id, name="Old Title", description="Original description",
        due_at=None, points_possible=50.0, course_id=local_course_id,
    )
    with patch(
        "app.services.workflow.update_course_assignment",
        new=AsyncMock(return_value=reverted_assignment),
    ):
        response = client.post(f"/api/v1/history/workflows/{workflow_id}/undo", headers=headers)

    assert response.status_code == 200
    reversal_messages = asyncio.run(_get_reversal_chat_messages(workflow_id))
    assert len(reversal_messages) == 1
    assert reversal_messages[0].content == (
        "Reversed Update Assignment: the previous Canvas state was restored."
    )


# ---------------------------------------------------------------------------
# Failure cases
# ---------------------------------------------------------------------------

# Verifies: Undo only available for executed workflows.
def test_undo_only_available_for_executed_status(client):
    headers, local_course_id = _register_with_canvas(client)
    workflow_id, _ = _create_executed_update_assignment_workflow(client, headers, local_course_id)

    cancel = client.post(f"/api/v1/history/workflows/{workflow_id}/cancel", headers=headers)
    assert cancel.status_code == 409  # already executed, can't cancel — sanity check only

    # Use a genuinely pending workflow instead: propose but never confirm.
    pending_assignment_id = 999
    _seed_local_assignment(local_course_id, pending_assignment_id, title="Pending Source")
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = (
        '{"action": "intent_preview", "summary": "Rename assignment", '
        '"proposed_action": {"action": "update_assignment", '
        f'"local_course_id": {local_course_id}, "assignment_id": {pending_assignment_id}, '
        '"title": "Pending Title"}}'
    )
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        preview = client.post(
            "/api/v1/chat/",
            json={"message": "rename to Pending Title"},
            headers=headers,
        )
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["is_error"] is False, body
    conversation_id = body["conversation_id"]
    history = client.get("/api/v1/history/workflows", headers=headers)
    pending_workflow_id = next(
        item["id"] for item in history.json()["items"]
        if item["conversation_id"] == conversation_id
    )

    response = client.post(f"/api/v1/history/workflows/{pending_workflow_id}/undo", headers=headers)
    assert response.status_code == 409


# Verifies: Undo rejects a non-undoable action type.
def test_undo_rejects_non_undoable_action(client):
    headers, local_course_id = _register_with_canvas(client)
    workflow_id = _create_executed_send_message_workflow(client, headers, local_course_id)

    response = client.post(f"/api/v1/history/workflows/{workflow_id}/undo", headers=headers)
    assert response.status_code == 400


# Verifies: Undoing an already-undone workflow is unambiguous, not a silent double-apply.
def test_undo_twice_is_unambiguous(client):
    headers, local_course_id = _register_with_canvas(client)
    workflow_id, assignment_id = _create_executed_update_assignment_workflow(
        client, headers, local_course_id
    )

    reverted_assignment = AssignmentResponse(
        id=assignment_id, name="Old Title", description="Original description",
        due_at=None, points_possible=50.0, course_id=local_course_id,
    )
    with patch(
        "app.services.workflow.update_course_assignment",
        new=AsyncMock(return_value=reverted_assignment),
    ) as mock_revert:
        first = client.post(f"/api/v1/history/workflows/{workflow_id}/undo", headers=headers)
        assert first.status_code == 200
        mock_revert.assert_called_once()

        second = client.post(f"/api/v1/history/workflows/{workflow_id}/undo", headers=headers)
        assert second.status_code == 409
        # still exactly one Canvas write — the second undo never reached Canvas
        mock_revert.assert_called_once()

    async def _count_audit_rows():
        engine, Session = _make_session()
        try:
            async with Session() as db:
                rows = await db.scalars(
                    select(AuditLog).where(AuditLog.workflow_id == workflow_id)
                )
                return list(rows)
        finally:
            await engine.dispose()

    rows = asyncio.run(_count_audit_rows())
    assert len(rows) == 2  # original update_assignment row + one undo_assignment row


# Verifies: Undo without recorded before_data returns 422.
def test_undo_without_before_data_returns_422(client):
    headers, local_course_id = _register_with_canvas(client)
    workflow_id, _ = _create_executed_update_assignment_workflow(client, headers, local_course_id)

    asyncio.run(_null_out_before_data(workflow_id))

    response = client.post(f"/api/v1/history/workflows/{workflow_id}/undo", headers=headers)
    assert response.status_code == 422


# Verifies: A 422 (missing before_data) must not leave the workflow
# permanently marked undone — the Canvas assignment was never touched, so
# the Undo button must stay available for a retry once before_data exists
# again, rather than silently claiming the action was undone.
def test_undo_missing_before_data_does_not_set_undone_at(client):
    headers, local_course_id = _register_with_canvas(client)
    workflow_id, _ = _create_executed_update_assignment_workflow(client, headers, local_course_id)

    asyncio.run(_null_out_before_data(workflow_id))

    response = client.post(f"/api/v1/history/workflows/{workflow_id}/undo", headers=headers)
    assert response.status_code == 422
    assert asyncio.run(_get_undone_at(workflow_id)) is None

    history = client.get("/api/v1/history/workflows", headers=headers)
    item = next(i for i in history.json()["items"] if i["id"] == workflow_id)
    assert item["undone_at"] is None


# Verifies: A Canvas API failure during the revert must not leave the
# workflow permanently marked undone either — same failure mode as the
# missing-before_data case, but triggered by the Canvas write itself
# failing (e.g. a 502/504 from Canvas) instead of a local data problem.
# The workflow must remain retryable.
def test_undo_canvas_failure_does_not_set_undone_at(client):
    headers, local_course_id = _register_with_canvas(client)
    workflow_id, assignment_id = _create_executed_update_assignment_workflow(
        client, headers, local_course_id
    )

    with patch(
        "app.services.workflow.update_course_assignment",
        new=AsyncMock(
            side_effect=HTTPException(
                status_code=http_status.HTTP_502_BAD_GATEWAY,
                detail="Canvas server error",
            )
        ),
    ) as mock_revert:
        response = client.post(f"/api/v1/history/workflows/{workflow_id}/undo", headers=headers)

    assert response.status_code == 502
    mock_revert.assert_called_once()
    assert asyncio.run(_get_undone_at(workflow_id)) is None

    # Retry succeeds once Canvas is healthy again — a false "already undone"
    # 409 here would mean the earlier failed attempt permanently claimed it.
    reverted_assignment = AssignmentResponse(
        id=assignment_id, name="Old Title", description="Original description",
        due_at=None, points_possible=50.0, course_id=local_course_id,
    )
    with patch(
        "app.services.workflow.update_course_assignment",
        new=AsyncMock(return_value=reverted_assignment),
    ):
        retry = client.post(f"/api/v1/history/workflows/{workflow_id}/undo", headers=headers)
    assert retry.status_code == 200
    assert asyncio.run(_get_undone_at(workflow_id)) is not None


# Verifies: Undo is scoped to the owning user.
def test_undo_scoped_to_owning_user(client):
    headers_a, local_course_id_a = _register_with_canvas(client)
    workflow_id, _ = _create_executed_update_assignment_workflow(
        client, headers_a, local_course_id_a
    )

    headers_b, _ = _register_with_canvas(client)
    response = client.post(f"/api/v1/history/workflows/{workflow_id}/undo", headers=headers_b)
    assert response.status_code == 404


# Verifies: Undo requires auth.
def test_undo_requires_auth(client):
    response = client.post("/api/v1/history/workflows/1/undo")
    assert response.status_code == 401


# Verifies: The undo writes a new, distinct AuditLog row rather than mutating the original.
def test_undo_creates_distinct_audit_row(client):
    headers, local_course_id = _register_with_canvas(client)
    workflow_id, assignment_id = _create_executed_update_assignment_workflow(
        client, headers, local_course_id
    )

    reverted_assignment = AssignmentResponse(
        id=assignment_id, name="Old Title", description="Original description",
        due_at=None, points_possible=50.0, course_id=local_course_id,
    )
    with patch(
        "app.services.workflow.update_course_assignment",
        new=AsyncMock(return_value=reverted_assignment),
    ):
        response = client.post(f"/api/v1/history/workflows/{workflow_id}/undo", headers=headers)
    assert response.status_code == 200

    async def _get_rows():
        engine, Session = _make_session()
        try:
            async with Session() as db:
                rows = await db.scalars(
                    select(AuditLog)
                    .where(AuditLog.workflow_id == workflow_id)
                    .order_by(AuditLog.timestamp.asc())
                )
                return list(rows)
        finally:
            await engine.dispose()

    rows = asyncio.run(_get_rows())
    assert len(rows) == 2
    assert rows[0].action == "update_assignment"
    assert rows[1].action == "undo_assignment"
    assert rows[1].operation == "update"
    assert rows[1].resource_type == "assignment"
