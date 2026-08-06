"""Direct unit tests for services/canvas.py."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from cryptography.fernet import InvalidToken
from fastapi import HTTPException

from app.schemas.canvas import (
    AssignmentCreate,
    AssignmentUpdate,
    CourseCreate,
    CoursePublishUpdate,
    SubmissionStatus,
)
from app.services.canvas import (
    _cache_submissions,
    _fill_submission_contact_fields,
    _parse_submission,
    _parse_submission_status,
    create_canvas_course,
    create_course_assignment,
    get_active_course,
    get_assignment,
    get_assignments,
    get_cached_courses,
    get_courses,
    get_owned_course,
    get_submissions,
    require_canvas_token,
    send_course_message,
    set_active_course,
    set_course_published,
    update_course_assignment,
)


def _db_assigning_ids() -> AsyncMock:
    db = AsyncMock()
    created: list = []
    db.add = Mock(side_effect=created.append)
    return db


def _connection(url: str, encrypted_token: str = "enc") -> SimpleNamespace:
    return SimpleNamespace(
        canvas_url=url,
        encrypted_token=encrypted_token,
        time_zone=None,
    )


# ---------------------------------------------------------------------------
# require_canvas_token
# ---------------------------------------------------------------------------

def test_require_canvas_token_no_matching_connection_raises_403():
    user = SimpleNamespace(canvas_connections=[_connection("https://other.canvas.edu")])

    with pytest.raises(HTTPException) as exc_info:
        require_canvas_token(user, "https://canvas.example.edu")

    assert exc_info.value.status_code == 403


def test_require_canvas_token_corrupted_token_raises_403():
    user = SimpleNamespace(canvas_connections=[_connection("https://canvas.example.edu")])

    with patch("app.services.canvas.decrypt_canvas_token", side_effect=InvalidToken):
        with pytest.raises(HTTPException) as exc_info:
            require_canvas_token(user, "https://canvas.example.edu")

    assert exc_info.value.status_code == 403


def test_require_canvas_token_success_returns_decrypted_token():
    user = SimpleNamespace(canvas_connections=[_connection("https://canvas.example.edu")])

    with patch("app.services.canvas.decrypt_canvas_token", return_value="plain-token"):
        result = require_canvas_token(user, "https://canvas.example.edu")

    assert result == "plain-token"


# ---------------------------------------------------------------------------
# get_owned_course
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_owned_course_not_found_raises_404():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    user = SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as exc_info:
        await get_owned_course(1, user, "https://canvas.example.edu", db)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_owned_course_url_mismatch_raises_404():
    db = AsyncMock()
    course = SimpleNamespace(id=1, canvas_url="https://canvas.example.edu")
    db.scalar = AsyncMock(return_value=course)
    user = SimpleNamespace(id=1)

    with pytest.raises(HTTPException):
        await get_owned_course(1, user, "https://different.instructure.com", db)


@pytest.mark.asyncio
async def test_get_owned_course_updates_stale_url_on_match():
    db = AsyncMock()
    course = SimpleNamespace(id=1, canvas_url="https://canvas.example.edu/")
    db.scalar = AsyncMock(return_value=course)
    user = SimpleNamespace(id=1)

    result = await get_owned_course(1, user, "https://canvas.example.edu", db)

    assert result is course


# ---------------------------------------------------------------------------
# create_canvas_course
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_canvas_course_posts_to_canvas_and_upserts_local():
    db = _db_assigning_ids()
    db.scalars = AsyncMock(return_value=[])
    user = SimpleNamespace(
        id=1, canvas_connections=[_connection("https://canvas.example.edu")]
    )
    created = {
        "id": 555,
        "name": "COSC 499",
        "course_code": "COSC499",
        "workflow_state": "unpublished",
        "total_students": 0,
    }

    async def _commit_side_effect():
        for call in db.add.call_args_list:
            candidate = call.args[0]
            if getattr(candidate, "id", None) is None:
                candidate.id = 42

    db.commit = AsyncMock(side_effect=_commit_side_effect)

    with (
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch(
            "app.services.canvas.fetch_accounts",
            new=AsyncMock(return_value=[{"id": 1, "parent_account_id": None}]),
        ),
        patch(
            "app.services.canvas.create_course",
            new=AsyncMock(return_value=created),
        ) as mock_create,
    ):
        result = await create_canvas_course(
            CourseCreate(name="COSC 499", course_code="COSC499", publish=False),
            user,
            "https://canvas.example.edu",
            db,
        )

    mock_create.assert_awaited_once_with(
        1,
        {"name": "COSC 499", "course_code": "COSC499"},
        "tok",
        "https://canvas.example.edu",
        offer=False,
        enroll_me=True,
    )
    assert result.canvas_id == 555
    assert result.local_id == 42
    assert result.name == "COSC 499"
    db.commit.assert_awaited_once()
    db.flush.assert_not_called()


@pytest.mark.asyncio
async def test_create_canvas_course_does_not_rewrite_other_canvas_url():
    """Same instructor + same Canvas course id on a different host must not
    overwrite the other connection's local course row (#1306 review)."""
    db = _db_assigning_ids()
    other_course = SimpleNamespace(
        id=1,
        canvas_course_id="555",
        canvas_url="https://canvas.institution-a.ca",
        name="Institution A Course",
        term="Fall 2025",
        workflow_state="available",
        course_code="A555",
        total_students=12,
        synced_at=None,
    )
    db.scalars = AsyncMock(return_value=[other_course])
    user = SimpleNamespace(
        id=1,
        canvas_connections=[
            _connection("https://canvas.institution-a.ca"),
            _connection("https://canvas.institution-b.ca"),
        ],
    )
    created = {
        "id": 555,
        "name": "Institution B Course",
        "course_code": "B555",
        "workflow_state": "unpublished",
        "total_students": 0,
    }

    async def _commit_side_effect():
        for call in db.add.call_args_list:
            candidate = call.args[0]
            if getattr(candidate, "id", None) is None:
                candidate.id = 99

    db.commit = AsyncMock(side_effect=_commit_side_effect)

    with (
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch(
            "app.services.canvas.fetch_accounts",
            new=AsyncMock(return_value=[{"id": 1, "parent_account_id": None}]),
        ),
        patch(
            "app.services.canvas.create_course",
            new=AsyncMock(return_value=created),
        ),
    ):
        result = await create_canvas_course(
            CourseCreate(name="Institution B Course", course_code="B555"),
            user,
            "https://canvas.institution-b.ca",
            db,
        )

    assert other_course.name == "Institution A Course"
    assert other_course.canvas_url == "https://canvas.institution-a.ca"
    assert other_course.workflow_state == "available"
    assert other_course.course_code == "A555"
    new_course = next(
        call.args[0]
        for call in db.add.call_args_list
        if getattr(call.args[0], "canvas_course_id", None) == "555"
    )
    assert new_course.canvas_url == "https://canvas.institution-b.ca"
    assert new_course.name == "Institution B Course"
    assert result.local_id == 99
    assert result.name == "Institution B Course"


@pytest.mark.asyncio
async def test_create_canvas_course_no_accounts_raises_403():
    db = AsyncMock()
    user = SimpleNamespace(
        id=1, canvas_connections=[_connection("https://canvas.example.edu")]
    )

    with (
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.fetch_accounts", new=AsyncMock(return_value=[])),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await create_canvas_course(
                CourseCreate(name="Blocked"),
                user,
                "https://canvas.example.edu",
                db,
            )

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_create_canvas_course_treats_zero_parent_account_as_root():
    """Some Canvas installs return parent_account_id 0 / '0' for the root."""
    db = _db_assigning_ids()
    db.scalars = AsyncMock(return_value=[])
    user = SimpleNamespace(
        id=1, canvas_connections=[_connection("https://canvas.example.edu")]
    )
    created = {
        "id": 7,
        "name": "Root Course",
        "course_code": "ROOT",
        "workflow_state": "unpublished",
        "total_students": 0,
    }

    async def _commit_side_effect():
        for call in db.add.call_args_list:
            candidate = call.args[0]
            if getattr(candidate, "id", None) is None:
                candidate.id = 3

    db.commit = AsyncMock(side_effect=_commit_side_effect)

    with (
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch(
            "app.services.canvas.fetch_accounts",
            new=AsyncMock(
                return_value=[
                    {"id": 99, "parent_account_id": 5},
                    {"id": 1, "parent_account_id": 0},
                ]
            ),
        ),
        patch(
            "app.services.canvas.create_course",
            new=AsyncMock(return_value=created),
        ) as mock_create,
    ):
        await create_canvas_course(
            CourseCreate(name="Root Course"),
            user,
            "https://canvas.example.edu",
            db,
        )

    mock_create.assert_awaited_once()
    assert mock_create.await_args.args[0] == 1


# ---------------------------------------------------------------------------
# set_course_published
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_set_course_published_offers_and_updates_local_state():
    db = AsyncMock()
    course = SimpleNamespace(
        id=5,
        canvas_course_id="100",
        canvas_url="https://canvas.example.edu",
        name="Draft",
        course_code="D100",
        workflow_state="unpublished",
        term=None,
        total_students=0,
    )
    user = SimpleNamespace(
        id=1, canvas_connections=[_connection("https://canvas.example.edu")]
    )

    with (
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch(
            "app.services.canvas.update_course",
            new=AsyncMock(
                return_value={
                    "id": 100,
                    "name": "Draft",
                    "course_code": "D100",
                    "workflow_state": "available",
                    "total_students": 0,
                }
            ),
        ) as mock_update,
    ):
        result = await set_course_published(
            5,
            CoursePublishUpdate(published=True),
            user,
            "https://canvas.example.edu",
            db,
        )

    mock_update.assert_awaited_once_with(
        100, {"event": "offer"}, "tok", "https://canvas.example.edu"
    )
    assert course.workflow_state == "available"
    assert result.workflow_state == "available"
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_set_course_published_claims_and_clears_active_preference():
    db = AsyncMock()
    course = SimpleNamespace(
        id=5,
        canvas_course_id="100",
        canvas_url="https://canvas.example.edu",
        name="Live",
        course_code="L100",
        workflow_state="available",
        term=None,
        total_students=3,
    )
    pref = SimpleNamespace(active_course_id=5, updated_at=None)
    db.scalar = AsyncMock(return_value=pref)
    user = SimpleNamespace(
        id=1, canvas_connections=[_connection("https://canvas.example.edu")]
    )

    with (
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch(
            "app.services.canvas.update_course",
            new=AsyncMock(
                return_value={
                    "id": 100,
                    "name": "Live",
                    "course_code": "L100",
                    "workflow_state": "unpublished",
                    "total_students": 3,
                }
            ),
        ) as mock_update,
    ):
        result = await set_course_published(
            5,
            CoursePublishUpdate(published=False),
            user,
            "https://canvas.example.edu",
            db,
        )

    mock_update.assert_awaited_once_with(
        100, {"event": "claim"}, "tok", "https://canvas.example.edu"
    )
    assert course.workflow_state == "unpublished"
    assert pref.active_course_id is None
    assert result.workflow_state == "unpublished"


@pytest.mark.asyncio
async def test_set_course_published_rejects_completed_course():
    db = AsyncMock()
    course = SimpleNamespace(
        id=5,
        canvas_course_id="100",
        canvas_url="https://canvas.example.edu",
        workflow_state="completed",
    )
    user = SimpleNamespace(
        id=1, canvas_connections=[_connection("https://canvas.example.edu")]
    )

    with (
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await set_course_published(
                5,
                CoursePublishUpdate(published=False),
                user,
                "https://canvas.example.edu",
                db,
            )

    assert exc_info.value.status_code == 400


# ---------------------------------------------------------------------------
# get_courses
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_courses_inserts_new_and_updates_existing():
    db = _db_assigning_ids()
    user = SimpleNamespace(
        id=1, canvas_connections=[_connection("https://canvas.example.edu")]
    )
    existing_course = SimpleNamespace(
        id=5, canvas_course_id="100", name="Old Name", term=None,
        canvas_url="https://canvas.example.edu", workflow_state="available",
    )
    db.scalars = AsyncMock(return_value=[existing_course])

    async def _refresh_flush():
        return None

    db.flush = AsyncMock(side_effect=_refresh_flush)

    fetched = [
        {"id": 100, "name": "COSC 111 Updated", "course_code": "COSC111", "workflow_state": "available", "total_students": 42},
        {"id": 200, "name": "COSC 499", "course_code": "COSC499", "workflow_state": "available", "total_students": 10},
    ]

    with (
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.fetch_courses", new=AsyncMock(return_value=fetched)),
    ):
        # New course 200's id gets assigned on flush; simulate that directly.
        async def _flush_side_effect():
            for obj in db.add.call_args_list:
                candidate = obj.args[0]
                if getattr(candidate, "id", None) is None:
                    candidate.id = 999
        db.flush = AsyncMock(side_effect=_flush_side_effect)

        result = await get_courses(user, "https://canvas.example.edu", db)

    assert existing_course.name == "COSC 111 Updated"
    assert existing_course.course_code == "COSC111"
    assert existing_course.total_students == 42
    new_course = next(
        obj.args[0] for obj in db.add.call_args_list
        if getattr(obj.args[0], "canvas_course_id", None) == "200"
    )
    assert new_course.course_code == "COSC499"
    assert new_course.total_students == 10
    assert len(result) == 2
    assert {c.canvas_id for c in result} == {100, 200}
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_courses_empty_response_returns_empty_list():
    """Even an empty Canvas response still queries existing local courses —
    that's what lets a course Canvas stops returning at all (deleted, or lost
    teacher access) get reconciled away instead of lingering forever."""
    db = AsyncMock()
    db.scalars = AsyncMock(return_value=[])
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.example.edu")])

    with (
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.fetch_courses", new=AsyncMock(return_value=[])),
    ):
        result = await get_courses(user, "https://canvas.example.edu", db)

    assert result == []
    db.scalars.assert_awaited_once()


# ---------------------------------------------------------------------------
# get_cached_courses
# ---------------------------------------------------------------------------

def _cached_course_row(
    id: int, canvas_course_id: str, canvas_url: str = "https://canvas.example.edu",
    workflow_state: str = "available", course_code: str | None = "COSC111",
    total_students: int | None = 42, name: str = "COSC 111", term: str | None = "2025W",
) -> SimpleNamespace:
    return SimpleNamespace(
        id=id, canvas_course_id=canvas_course_id, canvas_url=canvas_url,
        name=name, term=term, workflow_state=workflow_state,
        course_code=course_code, total_students=total_students,
    )


@pytest.mark.asyncio
async def test_get_cached_courses_returns_local_rows_without_calling_canvas():
    db = AsyncMock()
    db.scalars = AsyncMock(return_value=[_cached_course_row(5, "100")])
    user = SimpleNamespace(id=1)

    with patch("app.services.canvas.fetch_courses", new=AsyncMock()) as fetch_mock:
        result = await get_cached_courses(user, "https://canvas.example.edu", db)

    fetch_mock.assert_not_awaited()
    assert len(result) == 1
    assert result[0].canvas_id == 100
    assert result[0].local_id == 5
    assert result[0].course_code == "COSC111"
    assert result[0].total_students == 42
    assert result[0].term_name == "2025W"


@pytest.mark.asyncio
async def test_get_cached_courses_excludes_deleted_and_filters_by_canvas_url():
    db = AsyncMock()
    db.scalars = AsyncMock(return_value=[
        _cached_course_row(1, "100", workflow_state="deleted"),
        _cached_course_row(2, "200", canvas_url="https://other.instructure.com"),
        _cached_course_row(3, "300"),
    ])
    user = SimpleNamespace(id=1)

    result = await get_cached_courses(user, "https://canvas.example.edu", db)

    assert [c.canvas_id for c in result] == [300]


@pytest.mark.asyncio
async def test_get_cached_courses_empty_when_nothing_synced():
    db = AsyncMock()
    db.scalars = AsyncMock(return_value=[])
    user = SimpleNamespace(id=1)

    result = await get_cached_courses(user, "https://canvas.example.edu", db)

    assert result == []


@pytest.mark.asyncio
async def test_get_cached_courses_coalesces_null_course_code_to_empty_string():
    db = AsyncMock()
    db.scalars = AsyncMock(return_value=[
        _cached_course_row(5, "100", course_code=None, total_students=None),
    ])
    user = SimpleNamespace(id=1)

    result = await get_cached_courses(user, "https://canvas.example.edu", db)

    assert result[0].course_code == ""
    assert result[0].total_students is None


# ---------------------------------------------------------------------------
# get_assignments
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_assignments_empty_returns_empty_list():
    db = AsyncMock()
    course = SimpleNamespace(
        id=1, canvas_course_id="100", canvas_url="https://canvas.example.edu",
        canvas_connections=[],
    )
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.example.edu")])

    with (
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=[])),
    ):
        result = await get_assignments(1, user, "https://canvas.example.edu", db)

    assert result == []


@pytest.mark.asyncio
async def test_get_assignments_upserts_new_and_existing():
    db = AsyncMock()
    created: list = []
    db.add = Mock(side_effect=created.append)
    course = SimpleNamespace(
        id=1, canvas_course_id="100", canvas_url="https://canvas.example.edu", workflow_state="available",
    )
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.example.edu")])
    existing_assignment = SimpleNamespace(
        id=50, canvas_assignment_id="10", title="Old", description=None, due_date=None, points_possible=None,
    )
    db.scalars = AsyncMock(return_value=[existing_assignment])

    async def _flush_side_effect():
        for obj in db.add.call_args_list:
            candidate = obj.args[0]
            if getattr(candidate, "id", None) is None:
                candidate.id = 888
    db.flush = AsyncMock(side_effect=_flush_side_effect)

    fetched = [
        {"id": 10, "name": "HW1 Updated", "course_id": 100, "due_at": None, "points_possible": 10},
        {"id": 20, "name": "HW2", "course_id": 100, "due_at": "2026-09-01T00:00:00", "points_possible": 20},
    ]

    with (
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=fetched)),
    ):
        result = await get_assignments(1, user, "https://canvas.example.edu", db)

    assert existing_assignment.title == "HW1 Updated"
    assert len(result) == 2
    db.commit.assert_awaited_once()


# ---------------------------------------------------------------------------
# get_assignment / create_course_assignment / update_course_assignment
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_assignment_returns_parsed_response():
    db = AsyncMock()
    course = SimpleNamespace(
        id=1, canvas_course_id="100", canvas_url="https://canvas.example.edu", workflow_state="available",
    )
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.example.edu")])
    raw = {"id": 10, "name": "HW1", "course_id": 100}

    with (
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.fetch_assignment", new=AsyncMock(return_value=raw)),
    ):
        result = await get_assignment(1, 10, user, "https://canvas.example.edu", db)

    assert result.id == 10
    assert result.name == "HW1"


@pytest.mark.asyncio
async def test_create_course_assignment_calls_integration_with_course_id():
    db = AsyncMock()
    course = SimpleNamespace(
        id=1, canvas_course_id="100", canvas_url="https://canvas.example.edu", workflow_state="available",
    )
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.example.edu")])
    raw = {"id": 30, "name": "New Assignment", "course_id": 100}
    payload = AssignmentCreate(
        name="New Assignment",
        description="Write up your findings.",
        due_at="2030-12-15T23:59:00Z",
        points_possible=25,
    )

    with (
        patch(
            "app.services.assignment_validation.get_owned_course_or_404",
            new=AsyncMock(return_value=course),
        ),
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.create_assignment", new=AsyncMock(return_value=raw)) as mock_create,
    ):
        result = await create_course_assignment(1, payload, user, "https://canvas.example.edu", db)

    assert result.id == 30
    mock_create.assert_awaited_once()
    assert mock_create.call_args.args[0] == 100  # canvas_course_id, coerced to int


@pytest.mark.asyncio
async def test_create_course_assignment_rejects_missing_due_date_before_canvas():
    """Ticket 22: REST create validates required fields before Canvas."""
    db = AsyncMock()
    course = SimpleNamespace(
        id=1, canvas_course_id="100", canvas_url="https://canvas.example.edu", workflow_state="available",
    )
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.example.edu")])
    payload = AssignmentCreate(name="Missing Due", description="Needs a due date")

    with (
        patch(
            "app.services.assignment_validation.get_owned_course_or_404",
            new=AsyncMock(return_value=course),
        ),
        patch("app.services.canvas.create_assignment", new=AsyncMock()) as mock_create,
        pytest.raises(HTTPException) as exc,
    ):
        await create_course_assignment(1, payload, user, "https://canvas.example.edu", db)

    assert exc.value.status_code == 422
    assert "due date" in exc.value.detail.lower()
    mock_create.assert_not_called()


@pytest.mark.asyncio
async def test_update_course_assignment_calls_integration():
    db = AsyncMock()
    course = SimpleNamespace(
        id=1, canvas_course_id="100", canvas_url="https://canvas.example.edu", workflow_state="available",
    )
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.example.edu")])
    raw = {"id": 30, "name": "Updated", "course_id": 100}
    payload = AssignmentUpdate(name="Updated")
    current = SimpleNamespace(points_possible=50.0)

    with (
        patch(
            "app.services.assignment_validation.get_owned_course_or_404",
            new=AsyncMock(return_value=course),
        ),
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.get_assignment", new=AsyncMock(return_value=current)),
        patch("app.services.canvas.update_assignment", new=AsyncMock(return_value=raw)) as mock_update,
    ):
        result = await update_course_assignment(1, 30, payload, user, "https://canvas.example.edu", db)

    assert result.name == "Updated"
    assert mock_update.await_args.args[2]["points_possible"] == 50.0


# ---------------------------------------------------------------------------
# send_course_message
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_send_course_message_with_recipients_uses_conversation():
    db = AsyncMock()
    course = SimpleNamespace(
        id=1, canvas_course_id="100", canvas_url="https://canvas.example.edu", workflow_state="available",
    )
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.example.edu")])

    with (
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.send_conversation", new=AsyncMock(return_value={})) as mock_conv,
        patch("app.services.canvas.create_announcement", new=AsyncMock()) as mock_announce,
    ):
        result = await send_course_message(
            1, "Subject", "Body", user, "https://canvas.example.edu", db,
            recipient_canvas_user_ids=[42, 43],
        )

    assert result.delivery_mode == "conversation"
    assert result.audience_size == 2
    mock_conv.assert_awaited_once()
    mock_announce.assert_not_called()


@pytest.mark.asyncio
async def test_send_course_message_without_recipients_uses_announcement():
    db = AsyncMock()
    course = SimpleNamespace(
        id=1, canvas_course_id="100", canvas_url="https://canvas.example.edu", workflow_state="available",
    )
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.example.edu")])
    roster = [SimpleNamespace(id=1), SimpleNamespace(id=2), SimpleNamespace(id=3)]

    with (
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.create_announcement", new=AsyncMock()) as mock_announce,
        patch("app.services.student.get_students", new=AsyncMock(return_value=roster)),
    ):
        result = await send_course_message(
            1, "Subject", "Body", user, "https://canvas.example.edu", db,
        )

    assert result.delivery_mode == "announcement"
    assert result.audience_size == 3
    mock_announce.assert_awaited_once()


# ---------------------------------------------------------------------------
# _parse_submission_status / _parse_submission
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "raw,expected",
    [
        ({"excused": True}, SubmissionStatus.excused),
        ({"missing": True}, SubmissionStatus.missing),
        ({"workflow_state": "graded"}, SubmissionStatus.graded),
        ({"workflow_state": "submitted", "late": True}, SubmissionStatus.late),
        ({"workflow_state": "submitted", "late": False}, SubmissionStatus.submitted),
        ({"workflow_state": "pending_review"}, SubmissionStatus.submitted),
        ({"workflow_state": "unsubmitted"}, SubmissionStatus.unsubmitted),
        ({}, SubmissionStatus.unsubmitted),
    ],
)
def test_parse_submission_status_priority_order(raw, expected):
    assert _parse_submission_status(raw) == expected


def test_parse_submission_extracts_user_contact_fields():
    raw = {
        "id": 1,
        "assignment_id": 2,
        "user_id": 3,
        "user": {"name": "Alice", "email": "alice@example.com", "login_id": "alice"},
        "workflow_state": "submitted",
    }
    result = _parse_submission(raw)
    assert result.student_name == "Alice"
    assert result.student_email == "alice@example.com"


def test_parse_submission_handles_missing_user():
    raw = {"id": 1, "assignment_id": 2, "user_id": 3, "workflow_state": "unsubmitted"}
    result = _parse_submission(raw)
    assert result.student_name is None


# ---------------------------------------------------------------------------
# _fill_submission_contact_fields
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fill_submission_contact_fields_enriches_sparse_rows():
    submission = _parse_submission(
        {"id": 1, "assignment_id": 2, "user_id": 3, "user": {"name": "Alice"}, "workflow_state": "submitted"}
    )
    assert submission.student_email is None

    with patch(
        "app.services.canvas.fetch_user_profile",
        new=AsyncMock(return_value={"primary_email": "alice@example.com", "login_id": "alice"}),
    ):
        await _fill_submission_contact_fields([submission], "tok", "https://canvas.example.edu")

    assert submission.student_email == "alice@example.com"
    assert submission.student_login_id == "alice"


@pytest.mark.asyncio
async def test_fill_submission_contact_fields_swallows_profile_fetch_failure():
    submission = _parse_submission(
        {"id": 1, "assignment_id": 2, "user_id": 3, "user": {"name": "Alice"}, "workflow_state": "submitted"}
    )

    with patch(
        "app.services.canvas.fetch_user_profile",
        new=AsyncMock(side_effect=HTTPException(status_code=404, detail="not found")),
    ):
        await _fill_submission_contact_fields([submission], "tok", "https://canvas.example.edu")

    assert submission.student_email is None


@pytest.mark.asyncio
async def test_fill_submission_contact_fields_skips_rows_with_no_name():
    submission = _parse_submission({"id": 1, "assignment_id": 2, "user_id": 3, "workflow_state": "unsubmitted"})

    with patch("app.services.canvas.fetch_user_profile", new=AsyncMock()) as mock_profile:
        await _fill_submission_contact_fields([submission], "tok", "https://canvas.example.edu")

    mock_profile.assert_not_called()


# ---------------------------------------------------------------------------
# get_submissions
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_submissions_caches_new_and_updates_existing():
    db = _db_assigning_ids()
    course = SimpleNamespace(
        id=1, canvas_course_id="100", canvas_url="https://canvas.example.edu", workflow_state="available",
    )
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.example.edu")])

    existing_assignment_row = SimpleNamespace(id=77)
    existing_submission = SimpleNamespace(
        canvas_submission_id="1", status=None, score=None, grade=None,
        graded_at=None, submitted_at=None, student_name=None,
    )
    # First db.scalar call finds the cached Assignment row; db.scalars finds existing Submissions.
    db.scalar = AsyncMock(return_value=existing_assignment_row)
    db.scalars = AsyncMock(return_value=[existing_submission])

    fetched = [
        {"id": 1, "assignment_id": 10, "user_id": 100, "workflow_state": "graded", "user": {"name": "Alice"}},
        {"id": 2, "assignment_id": 10, "user_id": 200, "workflow_state": "unsubmitted"},
    ]

    with (
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.fetch_submissions", new=AsyncMock(return_value=fetched)),
        patch("app.services.canvas.fetch_user_profile", new=AsyncMock()),
        patch("app.services.canvas._cache_submissions_safely", new=AsyncMock()) as mock_cache,
    ):
        result = await get_submissions(1, 10, user, "https://canvas.example.edu", db)

    assert len(result) == 2
    mock_cache.assert_awaited_once()
    db.commit.assert_not_called()
    db.rollback.assert_not_called()


@pytest.mark.asyncio
async def test_get_submissions_creates_assignment_cache_row_when_missing():
    """First-ever fetch of submissions for an assignment the local cache
    doesn't know about yet — a placeholder Assignment row is created so
    Submission rows have something to key off."""
    db = _db_assigning_ids()
    course = SimpleNamespace(
        id=1, canvas_course_id="100", canvas_url="https://canvas.example.edu", workflow_state="available",
    )
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.example.edu")])

    db.scalar = AsyncMock(return_value=None)  # no cached Assignment row yet
    db.scalars = AsyncMock(return_value=[])  # no cached Submission rows yet

    fetched = [{"id": 1, "assignment_id": 10, "user_id": 100, "workflow_state": "unsubmitted"}]

    with (
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.fetch_submissions", new=AsyncMock(return_value=fetched)),
        patch("app.services.canvas._cache_submissions_safely", new=AsyncMock()) as mock_cache,
    ):
        result = await get_submissions(1, 10, user, "https://canvas.example.edu", db)

    assert len(result) == 1
    mock_cache.assert_awaited_once()
    db.add.assert_not_called()
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_get_submissions_authorization_stops_before_canvas_fetch():
    db = AsyncMock()
    user = SimpleNamespace(id=2, canvas_connections=[_connection("https://canvas.example.edu")])

    with (
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch(
            "app.services.canvas.get_owned_course",
            new=AsyncMock(
                side_effect=HTTPException(
                    status_code=404,
                    detail="Course not found or does not belong to you.",
                )
            ),
        ),
        patch("app.services.canvas.fetch_submissions", new=AsyncMock()) as fetch_mock,
        patch(
            "app.services.canvas._cache_submissions_safely",
            new=AsyncMock(),
        ) as cache_mock,
    ):
        with pytest.raises(HTTPException) as exc_info:
            await get_submissions(999, 10, user, "https://canvas.example.edu", db)

    assert exc_info.value.status_code == 404
    fetch_mock.assert_not_awaited()
    cache_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_get_submissions_cache_failure_does_not_touch_caller_transaction():
    """A caching hiccup must not break the live Canvas view — the parsed
    submissions are still returned even if the local write fails."""
    db = AsyncMock()
    course = SimpleNamespace(
        id=1, canvas_course_id="100", canvas_url="https://canvas.example.edu", workflow_state="available",
    )
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.example.edu")])
    fetched = [{"id": 1, "assignment_id": 10, "user_id": 100, "workflow_state": "unsubmitted"}]

    with (
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.fetch_submissions", new=AsyncMock(return_value=fetched)),
        patch("app.services.canvas._cache_submissions_safely", new=AsyncMock()) as mock_cache,
    ):
        result = await get_submissions(1, 10, user, "https://canvas.example.edu", db)

    assert len(result) == 1
    mock_cache.assert_awaited_once()
    db.rollback.assert_not_called()
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_cache_submissions_caches_new_and_updates_existing():
    db = _db_assigning_ids()
    existing_assignment_row = SimpleNamespace(id=77)
    existing_submission = SimpleNamespace(
        canvas_submission_id="1", status=None, score=None, grade=None,
        graded_at=None, submitted_at=None, student_name=None,
    )
    db.scalar = AsyncMock(return_value=existing_assignment_row)
    db.scalars = AsyncMock(return_value=[existing_submission])
    submissions = [
        _parse_submission(
            {"id": 1, "assignment_id": 10, "user_id": 100, "workflow_state": "graded", "user": {"name": "Alice"}}
        ),
        _parse_submission({"id": 2, "assignment_id": 10, "user_id": 200, "workflow_state": "unsubmitted"}),
    ]

    await _cache_submissions(db, 1, 10, submissions)

    assert existing_submission.status == "graded"
    assert db.add.call_count == 1
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_cache_submissions_rolls_back_its_own_session_on_failure():
    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=RuntimeError("db exploded"))
    submissions = [_parse_submission({"id": 1, "assignment_id": 10, "user_id": 100, "workflow_state": "unsubmitted"})]

    with pytest.raises(RuntimeError, match="db exploded"):
        await _cache_submissions(db, 1, 10, submissions)

    db.rollback.assert_awaited_once()
    db.commit.assert_not_called()


# ---------------------------------------------------------------------------
# get_active_course / set_active_course
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_active_course_returns_none_when_no_preference():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    user = SimpleNamespace(id=1)

    assert await get_active_course(user, db) is None


@pytest.mark.asyncio
async def test_get_active_course_returns_none_when_preference_has_no_course():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=SimpleNamespace(active_course=None))
    user = SimpleNamespace(id=1)

    assert await get_active_course(user, db) is None


@pytest.mark.asyncio
async def test_get_active_course_returns_parsed_response():
    db = AsyncMock()
    course = SimpleNamespace(id=5, canvas_course_id="100", canvas_url="https://canvas.example.edu", name="COSC 111", term="2026W1")
    db.scalar = AsyncMock(return_value=SimpleNamespace(active_course=course))
    user = SimpleNamespace(id=1)

    result = await get_active_course(user, db)

    assert result.local_id == 5
    assert result.name == "COSC 111"


@pytest.mark.asyncio
async def test_set_active_course_not_found_raises_404():
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)
    user = SimpleNamespace(id=1)

    with pytest.raises(HTTPException) as exc_info:
        await set_active_course(user, 999, db)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_set_active_course_updates_existing_preference():
    db = AsyncMock()
    course = SimpleNamespace(id=5, canvas_course_id="100", canvas_url="https://canvas.example.edu", name="COSC 111", term=None)
    pref = SimpleNamespace(active_course_id=None, updated_at=None)
    db.scalar = AsyncMock(side_effect=[course, pref])
    user = SimpleNamespace(id=1)

    result = await set_active_course(user, 5, db)

    assert pref.active_course_id == 5
    assert result.local_id == 5


@pytest.mark.asyncio
async def test_set_active_course_creates_new_preference_when_none_exists():
    db = _db_assigning_ids()
    course = SimpleNamespace(id=5, canvas_course_id="100", canvas_url="https://canvas.example.edu", name="COSC 111", term=None)
    db.scalar = AsyncMock(side_effect=[course, None])
    user = SimpleNamespace(id=1)

    await set_active_course(user, 5, db)

    db.add.assert_called_once()
