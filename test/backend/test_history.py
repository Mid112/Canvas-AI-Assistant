import asyncio
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.main import app
from app.models.audit_log import AuditLog
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user import User
from app.models.workflow import Workflow


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _register(client: TestClient) -> dict:
    email = f"history_{uuid.uuid4()}@example.com"
    resp = client.post(
        "/api/v1/auth/register",
        json={"name": "History User", "email": email, "password": "secret123"},
    )
    assert resp.status_code == 201
    return {"email": email, "token": resp.json()["access_token"]}


async def _create_workflow_and_audit(email: str) -> tuple[int, int]:
    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            user = await db.scalar(select(User).where(User.email == email))
            conversation = Conversation(user_id=user.id)
            db.add(conversation)
            await db.flush()

            source = Message(conversation_id=conversation.id, role="user", content="create quiz")
            preview = Message(
                conversation_id=conversation.id,
                role="assistant",
                content='{"intent_preview": true}',
            )
            db.add_all([source, preview])
            await db.flush()

            workflow = Workflow(
                conversation_id=conversation.id,
                user_id=user.id,
                source_user_message_id=source.id,
                preview_message_id=preview.id,
                action_name="create_assignment",
                user_prompt="create quiz",
                proposed_action={"action": "create_assignment"},
                status="executed",
            )
            db.add(workflow)
            await db.flush()

            audit_log = AuditLog(
                user_id=user.id,
                workflow_id=workflow.id,
                action="create_assignment",
                resource_type="assignment",
                resource_id="123",
                operation="create",
                status="success",
                request_payload=workflow.proposed_action,
            )
            db.add(audit_log)
            await db.commit()
            return workflow.id, audit_log.id
    finally:
        await engine.dispose()


# Verifies: Workflow history is scoped to current user.
def test_workflow_history_is_scoped_to_current_user(client):
    user_a = _register(client)
    user_b = _register(client)
    workflow_a, _ = asyncio.run(_create_workflow_and_audit(user_a["email"]))
    workflow_b, _ = asyncio.run(_create_workflow_and_audit(user_b["email"]))

    resp = client.get("/api/v1/workflows/history", headers=_auth(user_a["token"]))

    assert resp.status_code == 200
    ids = {item["id"] for item in resp.json()}
    assert workflow_a in ids
    assert workflow_b not in ids


# Verifies: User audit logs are scoped to current user.
def test_user_audit_logs_are_scoped_to_current_user(client):
    user_a = _register(client)
    user_b = _register(client)
    _, audit_a = asyncio.run(_create_workflow_and_audit(user_a["email"]))
    _, audit_b = asyncio.run(_create_workflow_and_audit(user_b["email"]))

    resp = client.get("/api/v1/audit/logs", headers=_auth(user_a["token"]))

    assert resp.status_code == 200
    ids = {item["id"] for item in resp.json()}
    assert audit_a in ids
    assert audit_b not in ids
    assert all(item["user_email"] == user_a["email"] for item in resp.json())


# Verifies: Admin audit logs requires admin.
def test_admin_audit_logs_requires_admin(client, admin_credentials):
    instructor = _register(client)
    client.post(
        "/api/v1/auth/admin/login",
        json=admin_credentials,
    )

    denied = client.get("/api/v1/admin/audit/logs", headers=_auth(instructor["token"]))
    assert denied.status_code == 403


# Verifies: Admin can list audit logs.
def test_admin_can_list_audit_logs(client, admin_credentials):
    instructor = _register(client)
    _, audit_id = asyncio.run(_create_workflow_and_audit(instructor["email"]))
    login = client.post("/api/v1/auth/admin/login", json=admin_credentials)
    assert login.status_code == 200

    resp = client.get("/api/v1/admin/audit/logs", headers=_auth(login.json()["access_token"]))

    assert resp.status_code == 200
    assert audit_id in {item["id"] for item in resp.json()}
