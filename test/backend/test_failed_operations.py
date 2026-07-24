"""Tests for Feature 11 (Failed Operation Monitoring, UR1.6):
- app/services/failed_operations.py (redaction, truncation, source validation, filters)
- course_sync spam-guard helper
- app/services/ai_health.py wiring into failed_operations on error
- GET /admin/failed-operations admin endpoints
"""
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.main import app
from app.models.failed_operation import FailedOperation
from app.models.user import User
from app.services.ai_health import record_ai_call_outcome
from app.services.failed_operations import (
    record_failed_operation,
    should_record_course_sync_failure,
)


@pytest.fixture(autouse=True)
def reset_llm_system_settings_module():
    yield


def _db_mock() -> AsyncMock:
    db = AsyncMock()
    db.add = Mock()
    return db


def _make_session():
    engine = create_async_engine(settings.DATABASE_URL)
    return engine, async_sessionmaker(engine, expire_on_commit=False)


@pytest.mark.asyncio
async def test_record_failed_operation_redacts_secrets_and_truncates():
    db = _db_mock()
    long_error = "Bearer sk-ant-test1234567890abcdef " + ("x" * 3000)

    row = await record_failed_operation(
        db,
        source="ai",
        operation="assistant_chat",
        error_detail=long_error,
        user_id=7,
        provider="openai",
    )

    assert "[REDACTED" in row.error_detail
    assert "sk-ant-test1234567890abcdef" not in row.error_detail
    assert len(row.error_detail) <= 2000
    db.add.assert_called_once()
    db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_record_failed_operation_redacts_secrets_in_context_json():
    db = _db_mock()
    row = await record_failed_operation(
        db,
        source="canvas",
        operation="fetch_assignments",
        error_detail="Canvas 401",
        context_json={
            "parameters": {
                "token": "super-secret-token-value",
                "note": "Bearer sk-ant-contextleak123456",
            },
            "nested": ["ok", {"api_key": "abc123"}],
        },
    )

    params = row.context_json["parameters"]
    assert "super-secret-token-value" not in str(params)
    assert "sk-ant-contextleak123456" not in str(params)
    assert "[REDACTED" in str(params)


@pytest.mark.asyncio
async def test_record_failed_operation_rejects_invalid_source():
    db = _db_mock()
    with pytest.raises(ValueError, match="source must be"):
        await record_failed_operation(
            db,
            source="webhook",
            operation="ping",
            error_detail="nope",
        )
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_record_failed_operation_empty_error_becomes_unknown():
    db = _db_mock()
    row = await record_failed_operation(
        db,
        source="ai",
        operation="   ",
        error_detail="   ",
    )
    assert row.operation == "unknown"
    assert row.error_detail == "Unknown error"


@pytest.mark.asyncio
async def test_record_failed_operation_stores_user_name_in_context():
    db = _db_mock()
    user = SimpleNamespace(name="Instructor One")
    db.get = AsyncMock(return_value=user)

    row = await record_failed_operation(
        db,
        source="canvas",
        operation="fetch_assignments",
        error_detail="Canvas 401",
        user_id=3,
    )

    assert row.context_json["user_name"] == "Instructor One"


@pytest.mark.parametrize(
    ("expected_token_issue", "previous_error", "error_detail", "should_record"),
    [
        (True, None, "403: No Canvas token", False),
        (True, "old", "403: Canvas token is corrupted", False),
        (False, "Canvas 500", "Canvas 500", False),
        (False, None, "Canvas 500", True),
        (False, "Canvas 500", "Canvas 502", True),
    ],
)
def test_should_record_course_sync_failure(
    expected_token_issue,
    previous_error,
    error_detail,
    should_record,
):
    assert (
        should_record_course_sync_failure(
            expected_token_issue=expected_token_issue,
            previous_error=previous_error,
            error_detail=error_detail,
        )
        is should_record
    )


@pytest.mark.asyncio
async def test_record_ai_call_outcome_records_failed_operation_before_commit():
    db = _db_mock()

    with patch(
        "app.services.failed_operations.record_failed_operation",
        new=AsyncMock(),
    ) as mock_record:
        await record_ai_call_outcome(
            db,
            user_id=12,
            provider="groq",
            error_detail="rate limited",
            operation="message_draft",
        )

    mock_record.assert_awaited_once_with(
        db,
        source="ai",
        operation="message_draft",
        error_detail="rate limited",
        user_id=12,
        provider="groq",
    )
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_record_and_list_failed_operations_against_db():
    engine, Session = _make_session()
    try:
        async with Session() as db:
            user = User(
                name="Failed Ops Filter User",
                email=f"failedops_{uuid.uuid4()}@example.com",
                hashed_password="x",
                role="instructor",
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

            canvas_row = await record_failed_operation(
                db,
                source="canvas",
                operation="course_sync",
                error_detail="Canvas 502 Bad Gateway",
                user_id=user.id,
                context_json={"canvas_connection_id": 42},
            )
            ai_row = await record_failed_operation(
                db,
                source="ai",
                operation="assistant_chat",
                error_detail="LLM request timed out",
                user_id=user.id,
                provider="openai",
            )
            await db.commit()

            from app.services.failed_operations import (
                get_failed_operation,
                get_failed_operations_summary,
                list_failed_operations,
            )

            listing = await list_failed_operations(db, user_id=user.id, hours=24)
            assert listing.total == 2
            assert listing.canvas_count == 1
            assert listing.ai_count == 1
            assert {item.id for item in listing.items} == {canvas_row.id, ai_row.id}
            assert all(item.user_name == "Failed Ops Filter User" for item in listing.items)

            canvas_only = await list_failed_operations(
                db, user_id=user.id, source="canvas", hours=24
            )
            assert canvas_only.total == 1
            assert canvas_only.items[0].operation == "course_sync"
            assert canvas_only.ai_count == 0

            detail = await get_failed_operation(db, canvas_row.id)
            assert detail.context_json["canvas_connection_id"] == 42
            assert detail.user_name == "Failed Ops Filter User"

            summary = await get_failed_operations_summary(db, hours=24)
            assert summary.total >= 2
            assert summary.canvas_count >= 1
            assert summary.ai_count >= 1

            await db.execute(
                delete(FailedOperation).where(FailedOperation.user_id == user.id)
            )
            await db.execute(delete(User).where(User.id == user.id))
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


def test_failed_operations_endpoints_require_auth(client):
    assert client.get("/api/v1/admin/failed-operations/summary").status_code == 401
    assert client.get("/api/v1/admin/failed-operations").status_code == 401
    assert client.get("/api/v1/admin/failed-operations/1").status_code == 401


def test_failed_operations_endpoints_require_admin(client):
    email = f"inst_{uuid.uuid4()}@example.com"
    token = client.post(
        "/api/v1/auth/register",
        json={"name": "I", "email": email, "password": "pass"},
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    assert client.get("/api/v1/admin/failed-operations/summary", headers=headers).status_code == 403
    assert client.get("/api/v1/admin/failed-operations", headers=headers).status_code == 403
    assert client.get("/api/v1/admin/failed-operations/1", headers=headers).status_code == 403


def test_failed_operations_summary_and_list_shape(client, admin_headers):
    summary = client.get("/api/v1/admin/failed-operations/summary", headers=admin_headers)
    assert summary.status_code == 200
    body = summary.json()
    assert set(body.keys()) == {"total", "canvas_count", "ai_count", "hours"}

    listing = client.get("/api/v1/admin/failed-operations", headers=admin_headers)
    assert listing.status_code == 200
    list_body = listing.json()
    assert set(list_body.keys()) == {"items", "total", "canvas_count", "ai_count"}
    assert isinstance(list_body["items"], list)


def test_failed_operations_rejects_invalid_source_filter(client, admin_headers):
    response = client.get(
        "/api/v1/admin/failed-operations?source=webhook",
        headers=admin_headers,
    )
    assert response.status_code == 422


def test_failed_operations_rejects_hours_out_of_range(client, admin_headers):
    assert (
        client.get(
            "/api/v1/admin/failed-operations/summary?hours=0",
            headers=admin_headers,
        ).status_code
        == 422
    )
    assert (
        client.get(
            "/api/v1/admin/failed-operations/summary?hours=200",
            headers=admin_headers,
        ).status_code
        == 422
    )


def test_failed_operations_detail_returns_404_for_missing_row(client, admin_headers):
    response = client.get("/api/v1/admin/failed-operations/999999999", headers=admin_headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Failed operation not found."


@pytest.mark.asyncio
async def test_admin_list_endpoint_returns_seeded_rows(client, admin_headers):
    engine, Session = _make_session()
    try:
        async with Session() as db:
            marker = f"seeded_ops_{uuid.uuid4().hex[:8]}"
            row = await record_failed_operation(
                db,
                source="ai",
                operation=marker,
                error_detail="seeded failure for admin list",
                provider="groq",
            )
            await db.commit()
            row_id = row.id

        listing = client.get(
            f"/api/v1/admin/failed-operations?operation={marker}",
            headers=admin_headers,
        )
        assert listing.status_code == 200
        body = listing.json()
        assert body["total"] >= 1
        assert any(item["id"] == row_id for item in body["items"])

        detail = client.get(f"/api/v1/admin/failed-operations/{row_id}", headers=admin_headers)
        assert detail.status_code == 200
        assert detail.json()["operation"] == marker

        async with Session() as db:
            await db.execute(delete(FailedOperation).where(FailedOperation.id == row_id))
            await db.commit()
    finally:
        await engine.dispose()
