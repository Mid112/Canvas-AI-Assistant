"""Tests for the small dedicated LLM resolvers' robustness (see
_coerce_int, _resolve_assignment_reference, _resolve_students_via_llm,
_resolve_course_switch in app/backend/app/services/chat.py): every
resolver must genuinely never raise — a provider/network failure outside
the narrow (TimeoutError, httpx.HTTPStatusError, json.JSONDecodeError)
set previously caught (e.g. httpx.ConnectError, httpx.ReadTimeout,
httpx.RemoteProtocolError) used to escape and 500 the whole chat turn —
and must accept a numeric id the model returns as a JSON string ("222")
just as readily as a real number, since both are semantically the exact
same answer."""
from unittest.mock import AsyncMock

import httpx
import pytest

from app.models.canvas_course_name import CanvasCourseName
from app.services.chat import (
    _resolve_assignment_reference,
    _resolve_course_switch,
    _resolve_students_via_llm,
)


def _assignments() -> list[dict]:
    return [
        {"id": 111, "name": "Assignment 1", "due_at": "2026-01-01T00:00:00+00:00", "points_possible": 10.0},
        {"id": 222, "name": "Final Project", "due_at": "2026-06-01T00:00:00+00:00", "points_possible": 100.0},
    ]


def _students() -> list[dict]:
    return [
        {"user_id": 501, "name": "Alice", "login_id": "alice", "email": "alice@example.com"},
        {"user_id": 502, "name": "Bob", "login_id": "bob", "email": "bob@example.com"},
    ]


def _course_names() -> list[CanvasCourseName]:
    return [
        CanvasCourseName(canvas_connection_id=1, canvas_course_id="1", local_course_id=1, name="CPSC 310"),
        CanvasCourseName(canvas_connection_id=1, canvas_course_id="2", local_course_id=2, name="CPSC 320"),
    ]


# ── Broad exception handling ────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize("exc", [
    httpx.ConnectError("connection reset"),
    httpx.ReadTimeout("timed out"),
    httpx.RemoteProtocolError("server disconnected"),
    ValueError("some unexpected parsing failure"),
])
async def test_assignment_resolver_survives_any_provider_failure(exc):
    adapter = AsyncMock()
    adapter.generate.side_effect = exc
    result = await _resolve_assignment_reference(
        _assignments(), "the final project", "show me the final project", adapter
    )
    assert result is None


@pytest.mark.asyncio
@pytest.mark.parametrize("exc", [
    httpx.ConnectError("connection reset"),
    httpx.ReadTimeout("timed out"),
    httpx.RemoteProtocolError("server disconnected"),
])
async def test_student_resolver_survives_any_provider_failure(exc):
    adapter = AsyncMock()
    adapter.generate.side_effect = exc
    result = await _resolve_students_via_llm(_students(), ["Alice"], "message alice", adapter)
    assert result == {"Alice": None}


@pytest.mark.asyncio
@pytest.mark.parametrize("exc", [
    httpx.ConnectError("connection reset"),
    httpx.ReadTimeout("timed out"),
    httpx.RemoteProtocolError("server disconnected"),
])
async def test_course_switch_resolver_survives_any_provider_failure(exc):
    adapter = AsyncMock()
    adapter.generate.side_effect = exc
    result = await _resolve_course_switch(_course_names(), "CPSC 310", "switch to CPSC 320", adapter)
    assert result is None


# A malformed candidate dict (missing keys the old bracket-access code
# would have KeyError'd on) must not escape either — the whole resolver
# body is wrapped, not just the LLM call.
@pytest.mark.asyncio
async def test_assignment_resolver_survives_a_malformed_candidate_dict():
    adapter = AsyncMock()
    adapter.generate.return_value = '{"assignment_id": 222}'
    malformed = [{"name": "Untitled"}, {"id": 222, "name": "Final Project"}]
    result = await _resolve_assignment_reference(malformed, "final project", "show final project", adapter)
    assert result == 222


# ── Int coercion ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_assignment_resolver_accepts_a_string_id():
    adapter = AsyncMock()
    adapter.generate.return_value = '{"assignment_id": "222"}'
    result = await _resolve_assignment_reference(
        _assignments(), "the final project", "show me the final project", adapter
    )
    assert result == 222


@pytest.mark.asyncio
async def test_assignment_resolver_rejects_a_bool_masquerading_as_an_id():
    # bool is a subclass of int in Python — a real assignment id of 1 must
    # never be matched by a stray `true` in the model's JSON output. Needs
    # >1 assignment so the single-candidate shortcut (which never calls
    # the LLM at all) doesn't mask this — the LLM response is what's
    # actually under test here.
    adapter = AsyncMock()
    adapter.generate.return_value = '{"assignment_id": true}'
    assignments = [
        {"id": 1, "name": "Assignment 1", "due_at": None, "points_possible": 10.0},
        {"id": 2, "name": "Assignment 2", "due_at": None, "points_possible": 10.0},
    ]
    result = await _resolve_assignment_reference(assignments, "assignment 1", "show assignment 1", adapter)
    assert result is None


@pytest.mark.asyncio
async def test_student_resolver_accepts_a_string_id():
    adapter = AsyncMock()
    adapter.generate.return_value = (
        '{"resolutions": [{"student_reference": "Alice", "canvas_user_id": "501"}]}'
    )
    result = await _resolve_students_via_llm(_students(), ["Alice"], "message alice", adapter)
    assert result == {"Alice": 501}


@pytest.mark.asyncio
async def test_student_resolver_still_rejects_an_id_outside_the_candidate_list():
    adapter = AsyncMock()
    adapter.generate.return_value = (
        '{"resolutions": [{"student_reference": "Alice", "canvas_user_id": "999"}]}'
    )
    result = await _resolve_students_via_llm(_students(), ["Alice"], "message alice", adapter)
    assert result == {"Alice": None}
