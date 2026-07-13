"""Direct unit tests for services/dashboard.py's get_instructor_dashboard.

Unlike the TestClient-based tests in test_instructor_dashboard.py, these call
the service function directly with a mocked AsyncSession so every branch
(courses with/without assignments, missing/late submission counts, recent
workflow rows) is exercised without needing real Canvas data seeded through
the full HTTP+DB round trip.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services.dashboard import get_instructor_dashboard


def _course(course_id: int, name: str, assignment_ids: list[int], student_count: int = 0):
    return SimpleNamespace(
        id=course_id,
        name=name,
        assignments=[SimpleNamespace(id=aid) for aid in assignment_ids],
        students=[SimpleNamespace(id=i) for i in range(student_count)],
    )


def _workflow(workflow_id: int, action_name: str, status: str):
    return SimpleNamespace(
        id=workflow_id,
        action_name=action_name,
        user_prompt="do something",
        status=status,
        created_at="2026-01-01T00:00:00Z",
    )


@pytest.mark.asyncio
async def test_get_instructor_dashboard_empty_state():
    """No courses at all — every count is zero, no per-course queries run."""
    db = AsyncMock()
    db.scalars = AsyncMock(side_effect=[[], []])  # courses, then recent workflows
    db.scalar = AsyncMock(return_value=0)  # pending_workflows count

    user = SimpleNamespace(id=1)

    with patch("app.services.dashboard.get_active_course", new=AsyncMock(return_value=None)):
        result = await get_instructor_dashboard(user, db)

    assert result.course_count == 0
    assert result.student_count == 0
    assert result.assignment_count == 0
    assert result.missing_submissions == 0
    assert result.late_submissions == 0
    assert result.pending_workflows == 0
    assert result.active_course is None
    assert result.courses == []
    assert result.recent_workflows == []


@pytest.mark.asyncio
async def test_get_instructor_dashboard_aggregates_across_courses_with_assignments():
    """A course with assignments triggers the missing/late count sub-queries,
    and totals must sum correctly across multiple courses."""
    db = AsyncMock()
    courses = [
        _course(1, "COSC 111", assignment_ids=[10, 11], student_count=20),
        _course(2, "COSC 499", assignment_ids=[], student_count=5),
    ]
    workflows = [_workflow(100, "create_assignment", "pending")]
    db.scalars = AsyncMock(side_effect=[courses, workflows])
    # Course 1 has assignments -> missing_count, late_count queried.
    # Course 2 has no assignments -> the two count queries are skipped entirely.
    # Then pending_workflows count is queried once at the end.
    db.scalar = AsyncMock(side_effect=[3, 1, 2])

    user = SimpleNamespace(id=1)

    with patch("app.services.dashboard.get_active_course", new=AsyncMock(return_value=None)):
        result = await get_instructor_dashboard(user, db)

    assert result.course_count == 2
    assert result.student_count == 25
    assert result.assignment_count == 2
    assert result.missing_submissions == 3
    assert result.late_submissions == 1
    assert result.pending_workflows == 2
    assert len(result.courses) == 2
    assert result.courses[0].missing_submissions == 3
    assert result.courses[0].late_submissions == 1
    assert result.courses[1].missing_submissions == 0
    assert result.courses[1].late_submissions == 0
    assert len(result.recent_workflows) == 1
    assert result.recent_workflows[0].action_name == "create_assignment"


@pytest.mark.asyncio
async def test_get_instructor_dashboard_null_counts_default_to_zero():
    """db.scalar() returning None (COUNT with no matching rows can surface as
    NULL through the ORM in some drivers) must not propagate None into the
    response — it should coalesce to 0."""
    db = AsyncMock()
    courses = [_course(1, "COSC 111", assignment_ids=[10])]
    db.scalars = AsyncMock(side_effect=[courses, []])
    db.scalar = AsyncMock(side_effect=[None, None, None])

    user = SimpleNamespace(id=1)

    with patch("app.services.dashboard.get_active_course", new=AsyncMock(return_value=None)):
        result = await get_instructor_dashboard(user, db)

    assert result.missing_submissions == 0
    assert result.late_submissions == 0
    assert result.pending_workflows == 0


@pytest.mark.asyncio
async def test_get_instructor_dashboard_includes_active_course():
    db = AsyncMock()
    db.scalars = AsyncMock(side_effect=[[], []])
    db.scalar = AsyncMock(return_value=0)
    active = SimpleNamespace(
        local_id=7,
        name="COSC 310",
        canvas_course_id="998877",
        canvas_url="https://canvas.ubc.ca",
        term=None,
    )

    user = SimpleNamespace(id=1)

    with patch("app.services.dashboard.get_active_course", new=AsyncMock(return_value=active)):
        result = await get_instructor_dashboard(user, db)

    assert result.active_course is not None
    assert result.active_course.local_id == 7
    assert result.active_course.name == "COSC 310"
