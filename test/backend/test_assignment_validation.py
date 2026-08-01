"""
Unit tests for app.services.assignment_validation (#708).

These exercise semantic checks (empty strings, past due dates, points)
without going through HTTP — Pydantic already covers type errors upstream.
"""
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.models.course import Course
from app.models.user import User
from app.services.assignment_validation import (
    validate_assignment_for_create,
    validate_assignment_for_update,
)

COURSE = Course(
    id=1,
    canvas_course_id="99",
    canvas_url="https://canvas.example.edu",
    name="CPSC 310",
    instructor_id=1,
)
USER = User(id=1, name="Instructor", email="i@example.com", hashed_password="x", role="instructor")
FUTURE = (datetime.now(UTC) + timedelta(days=30)).strftime("%Y-%m-%dT23:59:00")
PAST = (datetime.now(UTC) - timedelta(days=1)).strftime("%Y-%m-%dT23:59:00")


@pytest.fixture
def db():
    return AsyncMock()


async def _create(db, **overrides):
    kwargs = {
        "local_course_id": 1,
        "user": USER,
        "title": "Midterm",
        "description": "Chapters 1-3",
        "due_date": FUTURE,
        "points_possible": 100.0,
        "db": db,
    }
    kwargs.update(overrides)
    with patch(
        "app.services.assignment_validation.get_owned_course_or_404",
        new=AsyncMock(return_value=COURSE),
    ):
        return await validate_assignment_for_create(**kwargs)


async def _update(db, **overrides):
    kwargs = {
        "local_course_id": 1,
        "user": USER,
        "title": None,
        "description": None,
        "due_date": None,
        "points_possible": None,
        "db": db,
    }
    kwargs.update(overrides)
    with patch(
        "app.services.assignment_validation.get_owned_course_or_404",
        new=AsyncMock(return_value=COURSE),
    ):
        return await validate_assignment_for_update(**kwargs)


@pytest.mark.asyncio
async def test_create_returns_owned_course(db):
    course = await _create(db)
    assert course is COURSE


@pytest.mark.asyncio
async def test_create_rejects_empty_title(db):
    with pytest.raises(HTTPException) as exc:
        await _create(db, title="   ")
    assert exc.value.status_code == 422
    assert "title" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_create_rejects_empty_description(db):
    with pytest.raises(HTTPException) as exc:
        await _create(db, description="")
    assert exc.value.status_code == 422
    assert "description" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_create_rejects_profanity_in_description(db):
    with pytest.raises(HTTPException) as exc:
        await _create(db, description="Complete this fucking worksheet.")
    assert exc.value.status_code == 422
    assert "appropriate" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_update_rejects_profanity_in_title(db):
    with pytest.raises(HTTPException) as exc:
        await _update(db, title="Midterm shit review")
    assert exc.value.status_code == 422
    assert "appropriate" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_create_requires_due_date(db):
    with pytest.raises(HTTPException) as exc:
        await _create(db, due_date=None)
    assert exc.value.status_code == 422
    assert "due date is required" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_create_rejects_past_due_date(db):
    with pytest.raises(HTTPException) as exc:
        await _create(db, due_date=PAST)
    assert exc.value.status_code == 422
    assert "future" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_create_rejects_invalid_due_date_format(db):
    with pytest.raises(HTTPException) as exc:
        await _create(db, due_date="next friday")
    assert exc.value.status_code == 422
    assert "invalid due date" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_create_rejects_non_positive_points(db):
    with pytest.raises(HTTPException) as exc:
        await _create(db, points_possible=0)
    assert exc.value.status_code == 422
    assert "points" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_update_requires_at_least_one_field(db):
    with pytest.raises(HTTPException) as exc:
        await _update(db)
    assert exc.value.status_code == 422
    assert "no fields" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_update_title_only_skips_due_date_check(db):
    """Updating title on an overdue assignment must not re-validate an absent due_date."""
    course = await _update(db, title="Renamed")
    assert course is COURSE


@pytest.mark.asyncio
async def test_update_rejects_past_due_date_when_provided(db):
    with pytest.raises(HTTPException) as exc:
        await _update(db, due_date=PAST)
    assert exc.value.status_code == 422
    assert "future" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_update_rejects_empty_title_when_provided(db):
    with pytest.raises(HTTPException) as exc:
        await _update(db, title="")
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_create_propagates_course_not_found(db):
    with patch(
        "app.services.assignment_validation.get_owned_course_or_404",
        new=AsyncMock(
            side_effect=HTTPException(status_code=404, detail="Course not found or does not belong to you.")
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            await validate_assignment_for_create(
                999, USER, "T", "D", FUTURE, 10.0, db
            )
    assert exc.value.status_code == 404
