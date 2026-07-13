"""Direct unit tests for services/canvas.py."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from cryptography.fernet import InvalidToken
from fastapi import HTTPException

from app.schemas.canvas import AssignmentCreate, AssignmentUpdate, SubmissionStatus
from app.services.canvas import (
    _fill_submission_contact_fields,
    _parse_submission,
    _parse_submission_status,
    create_course_assignment,
    get_active_course,
    get_assignment,
    get_assignments,
    get_courses,
    get_owned_course,
    get_submissions,
    require_canvas_token,
    send_course_message,
    set_active_course,
    update_course_assignment,
)


def _db_assigning_ids() -> AsyncMock:
    db = AsyncMock()
    created: list = []
    db.add = Mock(side_effect=created.append)
    return db


def _connection(url: str, encrypted_token: str = "enc") -> SimpleNamespace:
    return SimpleNamespace(canvas_url=url, encrypted_token=encrypted_token)


# ---------------------------------------------------------------------------
# require_canvas_token
# ---------------------------------------------------------------------------

def test_require_canvas_token_no_matching_connection_raises_403():
    user = SimpleNamespace(canvas_connections=[_connection("https://other.canvas.edu")])

    with pytest.raises(HTTPException) as exc_info:
        require_canvas_token(user, "https://canvas.ubc.ca")

    assert exc_info.value.status_code == 403


def test_require_canvas_token_corrupted_token_raises_403():
    user = SimpleNamespace(canvas_connections=[_connection("https://canvas.ubc.ca")])

    with patch("app.services.canvas.decrypt_canvas_token", side_effect=InvalidToken):
        with pytest.raises(HTTPException) as exc_info:
            require_canvas_token(user, "https://canvas.ubc.ca")

    assert exc_info.value.status_code == 403


def test_require_canvas_token_success_returns_decrypted_token():
    user = SimpleNamespace(canvas_connections=[_connection("https://canvas.ubc.ca")])

    with patch("app.services.canvas.decrypt_canvas_token", return_value="plain-token"):
        result = require_canvas_token(user, "https://canvas.ubc.ca")

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
        await get_owned_course(1, user, "https://canvas.ubc.ca", db)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_owned_course_url_mismatch_raises_404():
    db = AsyncMock()
    course = SimpleNamespace(id=1, canvas_url="https://canvas.ubc.ca")
    db.scalar = AsyncMock(return_value=course)
    user = SimpleNamespace(id=1)

    with pytest.raises(HTTPException):
        await get_owned_course(1, user, "https://different.instructure.com", db)


@pytest.mark.asyncio
async def test_get_owned_course_updates_stale_url_on_match():
    db = AsyncMock()
    course = SimpleNamespace(id=1, canvas_url="https://canvas.ubc.ca/")
    db.scalar = AsyncMock(return_value=course)
    user = SimpleNamespace(id=1)

    result = await get_owned_course(1, user, "https://canvas.ubc.ca", db)

    assert result is course


# ---------------------------------------------------------------------------
# get_courses
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_courses_inserts_new_and_updates_existing():
    db = _db_assigning_ids()
    user = SimpleNamespace(
        id=1, canvas_connections=[_connection("https://canvas.ubc.ca")]
    )
    existing_course = SimpleNamespace(
        id=5, canvas_course_id="100", name="Old Name", term=None, canvas_url="https://canvas.ubc.ca"
    )
    db.scalars = AsyncMock(return_value=[existing_course])

    async def _refresh_flush():
        return None

    db.flush = AsyncMock(side_effect=_refresh_flush)

    fetched = [
        {"id": 100, "name": "COSC 111 Updated", "course_code": "COSC111", "workflow_state": "available"},
        {"id": 200, "name": "COSC 499", "course_code": "COSC499", "workflow_state": "available"},
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

        result = await get_courses(user, "https://canvas.ubc.ca", db)

    assert existing_course.name == "COSC 111 Updated"
    assert len(result) == 2
    assert {c.canvas_id for c in result} == {100, 200}
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_courses_empty_response_returns_empty_list():
    db = AsyncMock()
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.ubc.ca")])

    with (
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.fetch_courses", new=AsyncMock(return_value=[])),
    ):
        result = await get_courses(user, "https://canvas.ubc.ca", db)

    assert result == []
    db.scalars.assert_not_called()


# ---------------------------------------------------------------------------
# get_assignments
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_assignments_empty_returns_empty_list():
    db = AsyncMock()
    course = SimpleNamespace(
        id=1, canvas_course_id="100", canvas_url="https://canvas.ubc.ca",
        canvas_connections=[],
    )
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.ubc.ca")])

    with (
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.fetch_assignments", new=AsyncMock(return_value=[])),
    ):
        result = await get_assignments(1, user, "https://canvas.ubc.ca", db)

    assert result == []


@pytest.mark.asyncio
async def test_get_assignments_upserts_new_and_existing():
    db = AsyncMock()
    created: list = []
    db.add = Mock(side_effect=created.append)
    course = SimpleNamespace(id=1, canvas_course_id="100", canvas_url="https://canvas.ubc.ca")
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.ubc.ca")])
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
        result = await get_assignments(1, user, "https://canvas.ubc.ca", db)

    assert existing_assignment.title == "HW1 Updated"
    assert len(result) == 2
    db.commit.assert_awaited_once()


# ---------------------------------------------------------------------------
# get_assignment / create_course_assignment / update_course_assignment
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_assignment_returns_parsed_response():
    db = AsyncMock()
    course = SimpleNamespace(id=1, canvas_course_id="100", canvas_url="https://canvas.ubc.ca")
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.ubc.ca")])
    raw = {"id": 10, "name": "HW1", "course_id": 100}

    with (
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.fetch_assignment", new=AsyncMock(return_value=raw)),
    ):
        result = await get_assignment(1, 10, user, "https://canvas.ubc.ca", db)

    assert result.id == 10
    assert result.name == "HW1"


@pytest.mark.asyncio
async def test_create_course_assignment_calls_integration_with_course_id():
    db = AsyncMock()
    course = SimpleNamespace(id=1, canvas_course_id="100", canvas_url="https://canvas.ubc.ca")
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.ubc.ca")])
    raw = {"id": 30, "name": "New Assignment", "course_id": 100}
    payload = AssignmentCreate(name="New Assignment")

    with (
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.create_assignment", new=AsyncMock(return_value=raw)) as mock_create,
    ):
        result = await create_course_assignment(1, payload, user, "https://canvas.ubc.ca", db)

    assert result.id == 30
    mock_create.assert_awaited_once()
    assert mock_create.call_args.args[0] == 100  # canvas_course_id, coerced to int


@pytest.mark.asyncio
async def test_update_course_assignment_calls_integration():
    db = AsyncMock()
    course = SimpleNamespace(id=1, canvas_course_id="100", canvas_url="https://canvas.ubc.ca")
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.ubc.ca")])
    raw = {"id": 30, "name": "Updated", "course_id": 100}
    payload = AssignmentUpdate(name="Updated")

    with (
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.update_assignment", new=AsyncMock(return_value=raw)),
    ):
        result = await update_course_assignment(1, 30, payload, user, "https://canvas.ubc.ca", db)

    assert result.name == "Updated"


# ---------------------------------------------------------------------------
# send_course_message
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_send_course_message_with_recipients_uses_conversation():
    db = AsyncMock()
    course = SimpleNamespace(id=1, canvas_course_id="100", canvas_url="https://canvas.ubc.ca")
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.ubc.ca")])

    with (
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.send_conversation", new=AsyncMock(return_value={})) as mock_conv,
        patch("app.services.canvas.create_announcement", new=AsyncMock()) as mock_announce,
    ):
        result = await send_course_message(
            1, "Subject", "Body", user, "https://canvas.ubc.ca", db,
            recipient_canvas_user_ids=[42, 43],
        )

    assert result.delivery_mode == "conversation"
    assert result.audience_size == 2
    mock_conv.assert_awaited_once()
    mock_announce.assert_not_called()


@pytest.mark.asyncio
async def test_send_course_message_without_recipients_uses_announcement():
    db = AsyncMock()
    course = SimpleNamespace(id=1, canvas_course_id="100", canvas_url="https://canvas.ubc.ca")
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.ubc.ca")])
    roster = [SimpleNamespace(id=1), SimpleNamespace(id=2), SimpleNamespace(id=3)]

    with (
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.create_announcement", new=AsyncMock()) as mock_announce,
        patch("app.services.student.get_students", new=AsyncMock(return_value=roster)),
    ):
        result = await send_course_message(
            1, "Subject", "Body", user, "https://canvas.ubc.ca", db,
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
        await _fill_submission_contact_fields([submission], "tok", "https://canvas.ubc.ca")

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
        await _fill_submission_contact_fields([submission], "tok", "https://canvas.ubc.ca")

    assert submission.student_email is None


@pytest.mark.asyncio
async def test_fill_submission_contact_fields_skips_rows_with_no_name():
    submission = _parse_submission({"id": 1, "assignment_id": 2, "user_id": 3, "workflow_state": "unsubmitted"})

    with patch("app.services.canvas.fetch_user_profile", new=AsyncMock()) as mock_profile:
        await _fill_submission_contact_fields([submission], "tok", "https://canvas.ubc.ca")

    mock_profile.assert_not_called()


# ---------------------------------------------------------------------------
# get_submissions
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_submissions_caches_new_and_updates_existing():
    db = _db_assigning_ids()
    course = SimpleNamespace(id=1, canvas_course_id="100", canvas_url="https://canvas.ubc.ca")
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.ubc.ca")])

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
    ):
        result = await get_submissions(1, 10, user, "https://canvas.ubc.ca", db)

    assert len(result) == 2
    assert existing_submission.status == "graded"
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_submissions_creates_assignment_cache_row_when_missing():
    """First-ever fetch of submissions for an assignment the local cache
    doesn't know about yet — a placeholder Assignment row is created so
    Submission rows have something to key off."""
    db = _db_assigning_ids()
    course = SimpleNamespace(id=1, canvas_course_id="100", canvas_url="https://canvas.ubc.ca")
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.ubc.ca")])

    db.scalar = AsyncMock(return_value=None)  # no cached Assignment row yet
    db.scalars = AsyncMock(return_value=[])  # no cached Submission rows yet

    fetched = [{"id": 1, "assignment_id": 10, "user_id": 100, "workflow_state": "unsubmitted"}]

    with (
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.fetch_submissions", new=AsyncMock(return_value=fetched)),
    ):
        result = await get_submissions(1, 10, user, "https://canvas.ubc.ca", db)

    assert len(result) == 1
    # Two adds: the placeholder Assignment row, then the new Submission row.
    assert db.add.call_count == 2
    db.flush.assert_awaited_once()
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_submissions_rolls_back_and_still_returns_data_on_cache_failure():
    """A caching hiccup must not break the live Canvas view — the parsed
    submissions are still returned even if the local write fails."""
    db = AsyncMock()
    course = SimpleNamespace(id=1, canvas_course_id="100", canvas_url="https://canvas.ubc.ca")
    user = SimpleNamespace(id=1, canvas_connections=[_connection("https://canvas.ubc.ca")])
    db.scalar = AsyncMock(side_effect=RuntimeError("db exploded"))

    fetched = [{"id": 1, "assignment_id": 10, "user_id": 100, "workflow_state": "unsubmitted"}]

    with (
        patch("app.services.canvas.get_owned_course", new=AsyncMock(return_value=course)),
        patch("app.services.canvas.decrypt_canvas_token", return_value="tok"),
        patch("app.services.canvas.fetch_submissions", new=AsyncMock(return_value=fetched)),
    ):
        result = await get_submissions(1, 10, user, "https://canvas.ubc.ca", db)

    assert len(result) == 1
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
    course = SimpleNamespace(id=5, canvas_course_id="100", canvas_url="https://canvas.ubc.ca", name="COSC 111", term="2026W1")
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
    course = SimpleNamespace(id=5, canvas_course_id="100", canvas_url="https://canvas.ubc.ca", name="COSC 111", term=None)
    pref = SimpleNamespace(active_course_id=None, updated_at=None)
    db.scalar = AsyncMock(side_effect=[course, pref])
    user = SimpleNamespace(id=1)

    result = await set_active_course(user, 5, db)

    assert pref.active_course_id == 5
    assert result.local_id == 5


@pytest.mark.asyncio
async def test_set_active_course_creates_new_preference_when_none_exists():
    db = _db_assigning_ids()
    course = SimpleNamespace(id=5, canvas_course_id="100", canvas_url="https://canvas.ubc.ca", name="COSC 111", term=None)
    db.scalar = AsyncMock(side_effect=[course, None])
    user = SimpleNamespace(id=1)

    await set_active_course(user, 5, db)

    db.add.assert_called_once()
