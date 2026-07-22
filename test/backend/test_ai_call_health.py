"""Tests for Feature 9 Phase 2's passive AI-call observability:
- app/services/ai_health.py::record_ai_call_outcome (the upsert itself)
- the two real call sites it's wired into (services/messages.py's
  create_message_draft, services/assignment_draft.py's
  generate_assignment_draft) — confirming the observability call happens
  with the right args *and* that existing behavior is completely unchanged.
"""
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.models.ai_call_health import AiCallHealth
from app.models.user import User
from app.schemas.messages import MessageDraftCreate
from app.services.ai_health import record_ai_call_outcome
from app.services.assignment_draft import generate_assignment_draft
from app.services.messages import create_message_draft
from app.schemas.preview import AssignmentDraftRequest


def _make_session():
    engine = create_async_engine(settings.DATABASE_URL)
    return engine, async_sessionmaker(engine, expire_on_commit=False)


def _db_assigning_ids() -> AsyncMock:
    db = AsyncMock()
    created: list = []
    db.add = Mock(side_effect=created.append)

    async def _refresh(obj):
        if getattr(obj, "id", None) is None:
            obj.id = 1

    db.refresh = AsyncMock(side_effect=_refresh)
    return db


# ---------------------------------------------------------------------------
# record_ai_call_outcome — real upsert against Postgres
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_record_ai_call_outcome_upserts_a_single_row_per_user():
    engine, Session = _make_session()
    try:
        async with Session() as db:
            user = User(
                name="AI Health Test User",
                email=f"aihealth_{uuid.uuid4()}@example.com",
                hashed_password="x",
                role="instructor",
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

            await record_ai_call_outcome(db, user.id, "groq")
            row = await db.scalar(select(AiCallHealth).where(AiCallHealth.user_id == user.id))
            assert row.status == "ok"
            assert row.error_detail is None

            await record_ai_call_outcome(db, user.id, "groq", error_detail="rate limited")
            await db.refresh(row)
            assert row.status == "failed"
            assert row.error_detail == "rate limited"

            # Only ever one row per user -- the second call updated it in
            # place rather than inserting a second row.
            all_rows = list(
                await db.scalars(select(AiCallHealth).where(AiCallHealth.user_id == user.id))
            )
            assert len(all_rows) == 1
    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# create_message_draft — wiring, behavior unchanged
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_message_draft_records_success_without_changing_output():
    db = _db_assigning_ids()
    user = SimpleNamespace(id=1)
    body = MessageDraftCreate(course_id=5, prompt="remind about the midterm", template_name="reminder")

    generated = AsyncMock(return_value=("Midterm Reminder", "Don't forget the midterm."))
    with (
        patch("app.services.messages._generate_draft_content", generated),
        patch("app.services.messages.record_ai_call_outcome", new=AsyncMock()) as mock_record,
    ):
        draft = await create_message_draft(db, user, body)

    assert draft.subject == "Midterm Reminder"
    assert draft.body == "Don't forget the midterm."
    mock_record.assert_awaited_once_with(db, user.id, settings.DEFAULT_LLM_PROVIDER)


@pytest.mark.asyncio
async def test_create_message_draft_records_failure_without_changing_fallback():
    db = _db_assigning_ids()
    user = SimpleNamespace(id=1)
    body = MessageDraftCreate(course_id=5, prompt="remind about the midterm", template_name="reminder")

    failing = AsyncMock(side_effect=RuntimeError("LLM unavailable"))
    with (
        patch("app.services.messages._generate_draft_content", failing),
        patch("app.services.messages.record_ai_call_outcome", new=AsyncMock()) as mock_record,
    ):
        draft = await create_message_draft(db, user, body)

    # Existing fallback behavior (test_create_message_draft_falls_back_when_generation_raises)
    # must be completely unaffected by the new observability call.
    assert draft.subject == "reminder Announcement"
    assert draft.body == "remind about the midterm"
    mock_record.assert_awaited_once()
    args = mock_record.await_args.args
    assert args[0] is db
    assert args[1] == user.id
    kwargs = mock_record.await_args.kwargs
    assert "LLM unavailable" in kwargs["error_detail"]


# ---------------------------------------------------------------------------
# generate_assignment_draft — wiring, behavior unchanged
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_generate_assignment_draft_records_success_without_changing_output():
    db = AsyncMock()
    adapter = AsyncMock()
    adapter.generate = AsyncMock(
        return_value='{"title": "Recursion Quiz", "description": "Cover base cases.", '
        '"due_at": null, "points_possible": 20}'
    )
    body = AssignmentDraftRequest(prompt="Create a quiz on recursion")

    with (
        patch("app.services.assignment_draft.get_llm_adapter", return_value=adapter),
        patch("app.services.assignment_draft.record_ai_call_outcome", new=AsyncMock()) as mock_record,
    ):
        result = await generate_assignment_draft(body, db, user_id=42)

    assert result.title == "Recursion Quiz"
    assert result.points_possible == 20
    mock_record.assert_awaited_once_with(db, 42, settings.DEFAULT_LLM_PROVIDER)


@pytest.mark.asyncio
async def test_generate_assignment_draft_records_failure_when_response_is_unparseable():
    """A 200 response that isn't valid JSON still 502s the endpoint -- the
    instructor AI health card must reflect that as a failure, not a false
    "ok" recorded before the parse step even ran."""
    db = AsyncMock()
    adapter = AsyncMock()
    adapter.generate = AsyncMock(return_value="not json at all")
    body = AssignmentDraftRequest(prompt="Create a quiz on recursion")

    with (
        patch("app.services.assignment_draft.get_llm_adapter", return_value=adapter),
        patch("app.services.assignment_draft.record_ai_call_outcome", new=AsyncMock()) as mock_record,
    ):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await generate_assignment_draft(body, db, user_id=42)

    assert exc_info.value.status_code == 502
    mock_record.assert_awaited_once_with(
        db, 42, settings.DEFAULT_LLM_PROVIDER, error_detail="Unparseable model response"
    )


@pytest.mark.asyncio
async def test_generate_assignment_draft_records_failure_and_still_raises_http_exception():
    db = AsyncMock()
    adapter = AsyncMock()
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    response = httpx.Response(429, request=request)
    adapter.generate = AsyncMock(
        side_effect=httpx.HTTPStatusError("rate limited", request=request, response=response)
    )
    body = AssignmentDraftRequest(prompt="Create a quiz on recursion")

    with (
        patch("app.services.assignment_draft.get_llm_adapter", return_value=adapter),
        patch("app.services.assignment_draft.record_ai_call_outcome", new=AsyncMock()) as mock_record,
    ):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await generate_assignment_draft(body, db, user_id=42)

    # Existing rate-limit mapping (test_generate_draft_rate_limited) is
    # completely unaffected by the new observability call.
    assert exc_info.value.status_code == 429
    mock_record.assert_awaited_once()
    kwargs = mock_record.await_args.kwargs
    assert "429" in kwargs["error_detail"]
