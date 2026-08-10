from canvas_test_utils import unique_canvas_token

"""Workflow + AuditLog recording for the assignment creation form.

The REST create endpoint used to be a bare passthrough to Canvas, which left
two holes found in manual QA:

* Every assignment created through the wizard hit Canvas with **no AuditLog
  row at all** — real writes with no audit trail.
* When the wizard was reached from an assistant intent_preview, chat had
  already opened a *pending* Workflow for that preview (create_assignment is
  not in the form-handoff exclusion set in services/chat.py, unlike
  create_quiz). Approving in the form never resolved it, so workflow history
  showed "pending" for an assignment that plainly existed in Canvas.

These pin both routes: with a preview to close out, and standalone.
"""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app

CANVAS_URL = "https://canvas.example.edu"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _mock_assignment(canvas_id: int | None = None) -> dict:
    cid = canvas_id if canvas_id is not None else uuid.uuid4().int % 1_000_000
    return {
        "id": cid,
        "name": "Object Segmentation",
        "description": "<p>Segment the objects.</p>",
        "due_at": "2026-10-15T23:59:00Z",
        "points_possible": 120.0,
        "course_id": 9999,
    }


def _register_with_canvas(client, *, token_suffix: str = "") -> tuple[dict, int]:
    email = f"createaudit_{uuid.uuid4()}@example.com"
    reg = client.post(
        "/api/v1/auth/register",
        json={"name": "Instructor", "email": email, "password": "Secret123!"},
    )
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    with patch("app.services.auth.validate_token", new_callable=AsyncMock):
        client.patch(
            "/api/v1/auth/me/canvas-token",
            json={"canvas_token": unique_canvas_token() + token_suffix, "canvas_url": CANVAS_URL},
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
        resp = client.get(
            f"/api/v1/canvas/courses?canvas_url={CANVAS_URL}", headers=headers
        )
        local_course_id = resp.json()[0]["local_id"]
        # Without an active course the chat turn resolves to a clarify
        # ("Which course is this about?") and never opens a preview Workflow.
        client.patch(
            "/api/v1/canvas/active-course",
            json={"local_course_id": local_course_id},
            headers=headers,
        )

    return headers, local_course_id


def _create(client, headers, local_course_id, query: str = "") -> object:
    with patch(
        "app.services.canvas.create_assignment", new_callable=AsyncMock
    ) as mock:
        mock.return_value = _mock_assignment()
        return client.post(
            f"/api/v1/canvas/courses/{local_course_id}/assignments"
            f"?canvas_url={CANVAS_URL}{query}",
            json={
                "name": "Object Segmentation",
                "description": "Segment the objects.",
                "due_at": "2026-10-15T23:59:00Z",
                "points_possible": 120,
            },
            headers=headers,
        )


def _rows(model, **filters):
    """Reads rows directly — same raw-engine-per-call pattern the other
    workflow tests use."""
    import asyncio

    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.config import settings as _settings

    async def _query():
        engine = create_async_engine(_settings.DATABASE_URL)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                stmt = select(model)
                for key, value in filters.items():
                    stmt = stmt.where(getattr(model, key) == value)
                return list(await db.scalars(stmt))
        finally:
            await engine.dispose()

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_query())
    finally:
        loop.close()


# Verifies: the plain "+ Create Assignment" path records an executed
# Workflow and an AuditLog. Previously it wrote to Canvas and recorded
# neither.
def test_form_create_records_workflow_and_audit(client):
    from app.models.audit_log import AuditLog
    from app.models.workflow import Workflow

    headers, local_course_id = _register_with_canvas(client)
    response = _create(client, headers, local_course_id)
    assert response.status_code in (200, 201), response.text

    workflows = _rows(Workflow, course_id=local_course_id)
    assert len(workflows) == 1
    workflow = workflows[0]
    assert workflow.action_name == "create_assignment"
    assert workflow.status == "executed"
    assert workflow.executed_at is not None
    assert workflow.conversation_id is None

    audits = _rows(AuditLog, workflow_id=workflow.id)
    assert len(audits) == 1
    assert audits[0].action == "create_assignment"
    assert audits[0].resource_type == "assignment"
    assert audits[0].operation == "create"
    assert audits[0].status == "success"


# Verifies: approving a chat-originated draft in the form closes out the
# pending Workflow chat opened for that preview, rather than leaving it
# pending forever and creating a second, unrelated row.
def test_create_from_preview_closes_the_pending_workflow(client):
    from app.models.audit_log import AuditLog
    from app.models.workflow import Workflow

    headers, local_course_id = _register_with_canvas(client)

    llm_output = (
        '{"action": "intent_preview", "summary": "Create it.", '
        '"proposed_action": {"action": "create_assignment", '
        '"course_name": "CPSC 310", "title": "Object Segmentation", '
        '"description": "Segment the objects.", '
        '"due_date": "2026-10-15T23:59:00", "points_possible": 120}}'
    )
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = llm_output
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        chat = client.post(
            "/api/v1/chat/",
            json={"message": "create an assignment about object segmentation"},
            headers=headers,
        )
    assert chat.status_code == 200, chat.text
    conversation_id = chat.json()["conversation_id"]

    pending = _rows(Workflow, conversation_id=conversation_id)
    assert len(pending) == 1, pending
    assert pending[0].status == "pending"
    preview_message_id = pending[0].preview_message_id

    response = _create(
        client,
        headers,
        local_course_id,
        query=(
            f"&conversation_id={conversation_id}"
            f"&preview_message_id={preview_message_id}"
        ),
    )
    assert response.status_code in (200, 201), response.text

    after = _rows(Workflow, conversation_id=conversation_id)
    # Same row, closed out — not a second one alongside a stuck pending.
    assert len(after) == 1, after
    assert after[0].id == pending[0].id
    assert after[0].status == "executed"
    assert after[0].executed_at is not None

    audits = _rows(AuditLog, workflow_id=after[0].id)
    assert len(audits) == 1
    assert audits[0].action == "create_assignment"


# Verifies: a preview already settled in chat is not rewritten. The Canvas
# write still succeeded, so it is recorded standalone rather than failing
# after the fact or reopening settled history.
def test_already_settled_preview_records_standalone_workflow(client):
    from app.models.workflow import Workflow

    headers, local_course_id = _register_with_canvas(client)

    llm_output = (
        '{"action": "intent_preview", "summary": "Create it.", '
        '"proposed_action": {"action": "create_assignment", '
        '"course_name": "CPSC 310", "title": "Object Segmentation", '
        '"description": "Segment the objects.", '
        '"due_date": "2026-10-15T23:59:00", "points_possible": 120}}'
    )
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = llm_output
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        chat = client.post(
            "/api/v1/chat/",
            json={"message": "create an assignment about object segmentation"},
            headers=headers,
        )
    conversation_id = chat.json()["conversation_id"]
    pending = _rows(Workflow, conversation_id=conversation_id)
    preview_message_id = pending[0].preview_message_id

    cancel = client.post(
        "/api/v1/chat/cancel",
        json={
            "conversation_id": conversation_id,
            "pending_message_id": preview_message_id,
        },
        headers=headers,
    )
    assert cancel.status_code == 200, cancel.text

    response = _create(
        client,
        headers,
        local_course_id,
        query=(
            f"&conversation_id={conversation_id}"
            f"&preview_message_id={preview_message_id}"
        ),
    )
    assert response.status_code in (200, 201), response.text

    after = _rows(Workflow, conversation_id=conversation_id)
    assert len(after) == 2, after
    statuses = sorted(workflow.status for workflow in after)
    assert statuses == ["cancelled", "executed"]


# Verifies: a conversation belonging to someone else is rejected outright,
# matching create_quiz_endpoint's ownership check.
def test_create_rejects_another_instructors_conversation(client):
    from app.models.workflow import Workflow

    headers_a, _ = _register_with_canvas(client)
    headers_b, course_b = _register_with_canvas(client, token_suffix="-second")

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "respond", "message": "hi"}'
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        chat = client.post(
            "/api/v1/chat/", json={"message": "hello"}, headers=headers_a
        )
    conversation_a = chat.json()["conversation_id"]

    response = _create(
        client, headers_b, course_b, query=f"&conversation_id={conversation_a}"
    )
    assert response.status_code == 404, response.text
    assert _rows(Workflow, conversation_id=conversation_a) == []


# Verifies: the ownership 404 is raised before Canvas is touched. Rejecting
# afterwards left a real assignment in Canvas with no Workflow and no
# AuditLog behind it — an unaudited write, which is what this endpoint
# exists to prevent. Asserting on the mock is the point: the row assertions
# above pass either way, so only this pins the ordering.
def test_foreign_conversation_is_rejected_before_the_canvas_write(client):
    headers_a, _ = _register_with_canvas(client)
    headers_b, course_b = _register_with_canvas(client, token_suffix="-second")

    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = '{"action": "respond", "message": "hi"}'
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        chat = client.post(
            "/api/v1/chat/", json={"message": "hello"}, headers=headers_a
        )
    conversation_a = chat.json()["conversation_id"]

    with patch(
        "app.services.canvas.create_assignment", new_callable=AsyncMock
    ) as canvas_write:
        canvas_write.return_value = _mock_assignment()
        response = client.post(
            f"/api/v1/canvas/courses/{course_b}/assignments"
            f"?canvas_url={CANVAS_URL}&conversation_id={conversation_a}",
            json={
                "name": "Object Segmentation",
                "description": "Segment the objects.",
                "due_at": "2026-10-15T23:59:00Z",
                "points_possible": 120,
            },
            headers=headers_b,
        )

    assert response.status_code == 404, response.text
    canvas_write.assert_not_awaited()


# Verifies: a failure after the workflow claim cannot revert it to "pending".
# The claim must be committed on its own (_claim_pending_workflow's contract);
# deferring that commit past the audit insert meant an error in between rolled
# the transition back while the Canvas write stayed durable, leaving "pending"
# for an assignment that exists — the precise bug this endpoint fixes.
def test_claim_survives_a_failure_before_the_audit_commit(client):
    from app.models.audit_log import AuditLog
    from app.models.workflow import Workflow

    headers, local_course_id = _register_with_canvas(client)

    llm_output = (
        '{"action": "intent_preview", "summary": "Create it.", '
        '"proposed_action": {"action": "create_assignment", '
        '"course_name": "CPSC 310", "title": "Object Segmentation", '
        '"description": "Segment the objects.", '
        '"due_date": "2026-10-15T23:59:00", "points_possible": 120}}'
    )
    mock_adapter = AsyncMock()
    mock_adapter.generate.return_value = llm_output
    with patch("app.services.chat.get_llm_adapter", return_value=mock_adapter):
        chat = client.post(
            "/api/v1/chat/",
            json={"message": "create an assignment about object segmentation"},
            headers=headers,
        )
    conversation_id = chat.json()["conversation_id"]

    pending = _rows(Workflow, conversation_id=conversation_id)
    assert len(pending) == 1 and pending[0].status == "pending", pending
    preview_message_id = pending[0].preview_message_id

    # Fail in the window between the claim and the final commit.
    with patch(
        "app.services.chat.record_write_audit",
        new_callable=AsyncMock,
        side_effect=RuntimeError("audit insert exploded"),
    ):
        with pytest.raises(RuntimeError):
            _create(
                client,
                headers,
                local_course_id,
                query=(
                    f"&conversation_id={conversation_id}"
                    f"&preview_message_id={preview_message_id}"
                ),
            )

    after = _rows(Workflow, conversation_id=conversation_id)
    assert len(after) == 1, after
    # The Canvas write is durable, so the workflow must not read "pending".
    assert after[0].status == "executed", after[0].status
    # The audit row is the casualty, and that is the acceptable loss here.
    assert _rows(AuditLog, workflow_id=after[0].id) == []
