"""Direct unit tests for services/student.py's get_students, covering the
new-vs-existing upsert branches and the empty-roster short-circuit that the
TestClient-based tests in test_student.py exercise only indirectly."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.services.student import get_students


def _enrollment(user_id: int, name: str = "Alice Smith", login_id: str | None = "alice@example.com"):
    return {
        "user_id": user_id,
        "enrollment_state": "active",
        "user": {"name": name, "sortable_name": name, "login_id": login_id},
    }


def _db_with_flush_assigning_ids() -> AsyncMock:
    """db.add() is synchronous on a real AsyncSession (unlike every other
    method here) — AsyncMock would otherwise make it an unawaited coroutine.
    db.flush() is where the real DB would assign auto-generated ids to
    newly-added ORM objects; simulate that so StudentResponse.model_validate
    has a real int id to read afterward."""
    db = AsyncMock()
    added: list = []
    db.add = Mock(side_effect=added.append)

    async def _flush():
        next_id = 1000
        for obj in added:
            if getattr(obj, "id", None) is None:
                obj.id = next_id
                next_id += 1

    db.flush = AsyncMock(side_effect=_flush)
    return db


@pytest.mark.asyncio
async def test_get_students_returns_empty_list_when_no_enrollments():
    db = AsyncMock()
    course = SimpleNamespace(id=1, canvas_course_id="500", canvas_url="https://canvas.ubc.ca")
    user = SimpleNamespace(id=1)

    with (
        patch("app.services.student.require_canvas_token", return_value="tok"),
        patch("app.services.student.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.student.fetch_enrollments", new=AsyncMock(return_value=[])),
    ):
        result = await get_students(1, user, "https://canvas.ubc.ca", db)

    assert result == []
    db.scalars.assert_not_called()
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_get_students_inserts_new_student_rows():
    """No existing Student rows match — every enrollment becomes a new insert."""
    db = _db_with_flush_assigning_ids()
    course = SimpleNamespace(id=1, canvas_course_id="500", canvas_url="https://canvas.ubc.ca")
    user = SimpleNamespace(id=1)
    enrollments = [_enrollment(101), _enrollment(102, name="Bob Lee", login_id=None)]

    db.scalars = AsyncMock(return_value=[])  # no existing Student rows for this course

    with (
        patch("app.services.student.require_canvas_token", return_value="tok"),
        patch("app.services.student.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.student.fetch_enrollments", new=AsyncMock(return_value=enrollments)),
    ):
        result = await get_students(1, user, "https://canvas.ubc.ca", db)

    assert db.add.call_count == 2
    assert db.commit.await_count == 1
    assert len(result) == 2
    added_students = [call.args[0] for call in db.add.call_args_list]
    assert {s.canvas_user_id for s in added_students} == {"101", "102"}
    assert all(s.course_id == 1 for s in added_students)


@pytest.mark.asyncio
async def test_get_students_updates_existing_student_in_place():
    """A student already in the DB (re-synced roster) gets its fields
    refreshed on the existing row instead of a duplicate insert."""
    db = AsyncMock()
    course = SimpleNamespace(id=1, canvas_course_id="500", canvas_url="https://canvas.ubc.ca")
    user = SimpleNamespace(id=1)
    existing = SimpleNamespace(
        id=55,
        canvas_user_id="101",
        course_id=1,
        name="Old Name",
        sortable_name="Old, Name",
        login_id="old@example.com",
        enrollment_state="invited",
        updated_at=None,
    )
    db.scalars = AsyncMock(return_value=[existing])

    with (
        patch("app.services.student.require_canvas_token", return_value="tok"),
        patch("app.services.student.get_owned_course", new=AsyncMock(return_value=course)),
        patch(
            "app.services.student.fetch_enrollments",
            new=AsyncMock(return_value=[_enrollment(101, name="New Name")]),
        ),
    ):
        await get_students(1, user, "https://canvas.ubc.ca", db)

    db.add.assert_not_called()
    assert existing.name == "New Name"
    assert existing.enrollment_state == "active"
    assert existing.updated_at is not None


@pytest.mark.asyncio
async def test_get_students_defaults_missing_name_to_unknown():
    db = _db_with_flush_assigning_ids()
    course = SimpleNamespace(id=1, canvas_course_id="500", canvas_url="https://canvas.ubc.ca")
    user = SimpleNamespace(id=1)
    db.scalars = AsyncMock(return_value=[])
    enrollment = {"user_id": 200, "enrollment_state": "active", "user": {}}

    with (
        patch("app.services.student.require_canvas_token", return_value="tok"),
        patch("app.services.student.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.student.fetch_enrollments", new=AsyncMock(return_value=[enrollment])),
    ):
        await get_students(1, user, "https://canvas.ubc.ca", db)

    added = db.add.call_args_list[0].args[0]
    assert added.name == "Unknown"
