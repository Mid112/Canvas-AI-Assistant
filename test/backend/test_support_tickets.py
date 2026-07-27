"""Tests for Feature 12 (Secure Troubleshooting) admin-side support tickets:
- app/services/support_tickets.py (create/get-or-create, list, update, resolve)
- GET/POST/PATCH /admin/support-tickets admin endpoints
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.main import app
from app.models.failed_operation import FailedOperation
from app.models.support_ticket import SupportTicket
from app.models.user import User
from app.schemas.support_ticket import SupportTicketCreate, SupportTicketUpdate
from app.services.failed_operations import record_failed_operation
from app.services.support_tickets import (
    create_ticket,
    get_ticket,
    get_ticket_for_failed_operation,
    list_tickets,
    update_ticket,
)


def _make_session():
    engine = create_async_engine(settings.DATABASE_URL)
    return engine, async_sessionmaker(engine, expire_on_commit=False)


@pytest.mark.asyncio
async def test_create_ticket_is_idempotent_per_failed_operation():
    engine, Session = _make_session()
    try:
        async with Session() as db:
            admin = User(
                name="Ticket Admin",
                email=f"ticket_admin_{uuid.uuid4()}@example.com",
                hashed_password="x",
                role="admin",
            )
            reporter = User(
                name="Ticket Reporter",
                email=f"ticket_reporter_{uuid.uuid4()}@example.com",
                hashed_password="x",
                role="instructor",
            )
            db.add(admin)
            db.add(reporter)
            await db.commit()
            await db.refresh(admin)
            await db.refresh(reporter)

            failed_op = await record_failed_operation(
                db,
                source="canvas",
                operation="update_assignment",
                error_detail="Canvas 500",
                user_id=reporter.id,
            )
            await db.commit()

            first = await create_ticket(
                db,
                SupportTicketCreate(failed_operation_id=failed_op.id),
                created_by=admin,
            )
            assert first.status == "open"
            assert first.failed_operation_id == failed_op.id
            assert first.user_id == reporter.id
            assert first.created_by == admin.id

            # Escalating the same failure again returns the existing ticket
            # rather than creating a duplicate (UNIQUE failed_operation_id).
            second = await create_ticket(
                db,
                SupportTicketCreate(failed_operation_id=failed_op.id),
                created_by=admin,
            )
            assert second.id == first.id

            lookup = await get_ticket_for_failed_operation(db, failed_op.id)
            assert lookup is not None
            assert lookup.id == first.id

            fetched = await get_ticket(db, first.id)
            assert fetched.id == first.id

            await db.execute(delete(SupportTicket).where(SupportTicket.id == first.id))
            await db.execute(delete(FailedOperation).where(FailedOperation.id == failed_op.id))
            await db.execute(delete(User).where(User.id.in_([admin.id, reporter.id])))
            await db.commit()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_create_ticket_recovers_from_unique_constraint_race():
    """Concurrent escalate of the same failed_operation_id: loser of the UNIQUE
    race must return the winner's ticket, not a 500 (#1284 review)."""
    from datetime import UTC, datetime
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, MagicMock

    from sqlalchemy.exc import IntegrityError

    from app.services import support_tickets as support_tickets_service

    existing = SimpleNamespace(
        id=7,
        failed_operation_id=42,
        user_id=3,
        user=SimpleNamespace(name="Reporter"),
        status="open",
        admin_notes=None,
        created_by=1,
        creator=SimpleNamespace(email="admin@example.com"),
        resolved_by=None,
        resolver=None,
        created_at=datetime.now(UTC),
        resolved_at=None,
    )
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[None, existing])
    db.get = AsyncMock(return_value=SimpleNamespace(user_id=3))
    db.add = MagicMock()
    db.commit = AsyncMock(
        side_effect=IntegrityError("INSERT", {}, Exception("unique"))
    )
    db.rollback = AsyncMock()

    result = await support_tickets_service.create_ticket(
        db,
        SupportTicketCreate(failed_operation_id=42),
        created_by=SimpleNamespace(id=1),
    )

    assert result.id == 7
    assert result.failed_operation_id == 42
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_ticket_resolves_and_reopens():
    engine, Session = _make_session()
    try:
        async with Session() as db:
            admin = User(
                name="Ticket Admin 2",
                email=f"ticket_admin2_{uuid.uuid4()}@example.com",
                hashed_password="x",
                role="admin",
            )
            db.add(admin)
            await db.commit()
            await db.refresh(admin)

            failed_op = await record_failed_operation(
                db,
                source="ai",
                operation="assistant_chat",
                error_detail="LLM timeout",
            )
            await db.commit()

            ticket = await create_ticket(
                db, SupportTicketCreate(failed_operation_id=failed_op.id), created_by=admin
            )

            resolved = await update_ticket(
                db,
                ticket.id,
                SupportTicketUpdate(status="resolved", admin_notes="Fixed upstream"),
                acting_admin=admin,
            )
            assert resolved.status == "resolved"
            assert resolved.admin_notes == "Fixed upstream"
            assert resolved.resolved_by == admin.id
            assert resolved.resolved_at is not None

            reopened = await update_ticket(
                db,
                ticket.id,
                SupportTicketUpdate(status="investigating"),
                acting_admin=admin,
            )
            assert reopened.status == "investigating"
            assert reopened.resolved_by is None
            assert reopened.resolved_at is None

            listing = await list_tickets(db, ticket_status="investigating")
            assert any(item.id == ticket.id for item in listing.items)

            await db.execute(delete(SupportTicket).where(SupportTicket.id == ticket.id))
            await db.execute(delete(FailedOperation).where(FailedOperation.id == failed_op.id))
            await db.execute(delete(User).where(User.id == admin.id))
            await db.commit()
    finally:
        await engine.dispose()


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def admin_token(client, admin_credentials):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": admin_credentials["email"], "password": admin_credentials["password"]},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def test_support_tickets_endpoints_require_auth(client):
    assert client.get("/api/v1/admin/support-tickets").status_code == 401
    assert client.post("/api/v1/admin/support-tickets", json={"failed_operation_id": 1}).status_code == 401


def test_support_tickets_endpoints_require_admin(client):
    email = f"inst_{uuid.uuid4()}@example.com"
    token = client.post(
        "/api/v1/auth/register",
        json={"name": "I", "email": email, "password": "pass"},
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    assert client.get("/api/v1/admin/support-tickets", headers=headers).status_code == 403


def test_create_ticket_404s_for_missing_failed_operation(client, admin_headers):
    response = client.post(
        "/api/v1/admin/support-tickets",
        json={"failed_operation_id": 999999999},
        headers=admin_headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_support_ticket_full_lifecycle_via_router(client, admin_headers):
    engine, Session = _make_session()
    try:
        async with Session() as db:
            failed_op = await record_failed_operation(
                db,
                source="canvas",
                operation="create_quiz",
                error_detail="Canvas 502",
            )
            await db.commit()
            failed_op_id = failed_op.id

        create_response = client.post(
            "/api/v1/admin/support-tickets",
            json={"failed_operation_id": failed_op_id},
            headers=admin_headers,
        )
        assert create_response.status_code == 200
        ticket_body = create_response.json()
        assert ticket_body["status"] == "open"
        ticket_id = ticket_body["id"]

        by_failed_op = client.get(
            f"/api/v1/admin/support-tickets/by-failed-operation/{failed_op_id}",
            headers=admin_headers,
        )
        assert by_failed_op.status_code == 200
        assert by_failed_op.json()["id"] == ticket_id

        patch_response = client.patch(
            f"/api/v1/admin/support-tickets/{ticket_id}",
            json={"status": "resolved"},
            headers=admin_headers,
        )
        assert patch_response.status_code == 200
        assert patch_response.json()["status"] == "resolved"
        assert patch_response.json()["resolved_at"] is not None

        async with Session() as db:
            await db.execute(delete(SupportTicket).where(SupportTicket.id == ticket_id))
            await db.execute(delete(FailedOperation).where(FailedOperation.id == failed_op_id))
            await db.commit()
    finally:
        await engine.dispose()
