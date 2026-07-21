"""Direct unit tests for mcp_tools/dispatcher.py's execute_tool, covering
every case in its match statement. test_dispatcher.py already covers
parse_action's parsing branches and the standalone helper functions;
test_execute.py has one execute_tool smoke test. This file fills in every
remaining case (read actions, PATH B write actions, and the intent_preview
branches) using the same AsyncMock(db) / MagicMock(user, id=1) pattern
test_execute.py already established.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.mcp_tools.dispatcher import ToolExecutionError, _default_canvas_url, execute_tool
from app.mcp_tools.schemas import (
    ClarifyAction,
    CreateAssignmentAction,
    CreateQuizAction,
    FetchAssignmentsAction,
    FetchCoursesAction,
    FetchStudentsAction,
    FetchSubmissionsAction,
    GetActiveCourseAction,
    IntentPreviewAction,
    OutOfScopeAction,
    RespondAction,
    SendMessageAction,
    SetActiveCourseAction,
    UpdateAssignmentAction,
    UpdateGradeAction,
)
from app.schemas.canvas import SubmissionStatus


def _course(course_id: int = 1, canvas_url: str = "https://canvas.ubc.ca", name: str = "COSC 111"):
    return SimpleNamespace(id=course_id, canvas_url=canvas_url, name=name)


def _db_with_course(course) -> AsyncMock:
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=course)
    return db


# ---------------------------------------------------------------------------
# Read actions
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_execute_fetch_courses_uses_default_canvas_url():
    db = AsyncMock()
    user = MagicMock(id=1, canvas_connections=[SimpleNamespace(canvas_url="https://canvas.ubc.ca")])
    action = FetchCoursesAction()
    courses = [SimpleNamespace(model_dump=lambda: {"name": "COSC 111"})]

    with patch("app.mcp_tools.dispatcher.get_courses", new=AsyncMock(return_value=courses)) as mock_get:
        result = await execute_tool(db, user, action)

    assert result["courses"] == [{"name": "COSC 111"}]
    mock_get.assert_awaited_once_with(user, "https://canvas.ubc.ca", db)


@pytest.mark.asyncio
async def test_execute_fetch_assignments():
    course = _course()
    db = _db_with_course(course)
    user = MagicMock(id=1)
    action = FetchAssignmentsAction(local_course_id=1)
    assignments = [SimpleNamespace(model_dump=lambda: {"name": "HW1"})]

    with patch("app.mcp_tools.dispatcher.get_assignments", new=AsyncMock(return_value=assignments)):
        result = await execute_tool(db, user, action)

    assert result["assignments"] == [{"name": "HW1"}]


@pytest.mark.asyncio
async def test_execute_fetch_submissions_builds_person_summary():
    course = _course()
    db = _db_with_course(course)
    user = MagicMock(id=1)
    action = FetchSubmissionsAction(local_course_id=1, assignment_id=10)

    submissions = [
        SimpleNamespace(
            student_name="Alice", user_id=1, status=SubmissionStatus.submitted, model_dump=lambda: {},
        ),
        SimpleNamespace(
            student_name=None, user_id=2, status=SubmissionStatus.unsubmitted, model_dump=lambda: {},
        ),
    ]

    with patch("app.mcp_tools.dispatcher.get_submissions", new=AsyncMock(return_value=submissions)):
        result = await execute_tool(db, user, action)

    assert result["submitted_students"] == [{"user_id": 1, "name": "Alice"}]
    assert result["pending_students"] == [{"user_id": 2, "name": "Student 2"}]
    assert result["counts"]["submitted"] == 1
    assert result["counts"]["unsubmitted"] == 1


@pytest.mark.asyncio
async def test_execute_fetch_students_computes_active_count():
    course = _course()
    db = _db_with_course(course)
    user = MagicMock(id=1)
    action = FetchStudentsAction(local_course_id=1)

    students = [
        SimpleNamespace(enrollment_state="active", model_dump=lambda: {}),
        SimpleNamespace(enrollment_state="invited", model_dump=lambda: {}),
    ]

    with patch("app.mcp_tools.dispatcher.get_students", new=AsyncMock(return_value=students)):
        result = await execute_tool(db, user, action)

    assert result["count"] == 2
    assert result["active_count"] == 1
    assert course.name in result["summary"]


@pytest.mark.asyncio
async def test_execute_set_active_course():
    db = AsyncMock()
    user = MagicMock(id=1)
    action = SetActiveCourseAction(local_course_id=1)
    active = SimpleNamespace(model_dump=lambda: {"local_id": 1, "name": "COSC 111"})

    with patch("app.mcp_tools.dispatcher.set_active_course", new=AsyncMock(return_value=active)):
        result = await execute_tool(db, user, action)

    assert result["active_course"]["local_id"] == 1


@pytest.mark.asyncio
async def test_execute_get_active_course_none():
    db = AsyncMock()
    user = MagicMock(id=1)
    action = GetActiveCourseAction()

    with patch("app.mcp_tools.dispatcher.get_active_course", new=AsyncMock(return_value=None)):
        result = await execute_tool(db, user, action)

    assert result["active_course"] is None


@pytest.mark.asyncio
async def test_execute_get_active_course_present():
    db = AsyncMock()
    user = MagicMock(id=1)
    action = GetActiveCourseAction()
    active = SimpleNamespace(model_dump=lambda: {"local_id": 1})

    with patch("app.mcp_tools.dispatcher.get_active_course", new=AsyncMock(return_value=active)):
        result = await execute_tool(db, user, action)

    assert result["active_course"] == {"local_id": 1}


# ---------------------------------------------------------------------------
# Write actions (PATH B — real Canvas execution)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_execute_create_assignment_writes_and_wraps_result():
    course = _course()
    db = _db_with_course(course)
    user = MagicMock(id=1)
    action = CreateAssignmentAction(
        local_course_id=1, title="HW1", description="desc", due_date="2030-01-01T00:00:00",
        points_possible=10,
    )
    assignment = SimpleNamespace(id=99, name="HW1")

    with (
        patch("app.mcp_tools.dispatcher.validate_assignment_for_create", new=AsyncMock()),
        patch("app.mcp_tools.dispatcher.create_course_assignment", new=AsyncMock(return_value=assignment)),
    ):
        result = await execute_tool(db, user, action)

    assert result["action"] == "create_assignment"
    assert result["data"].id == 99
    resource_types = [r["type"] for r in result["affected_resources"]]
    assert resource_types == ["course", "assignment"]
    assert result["affected_resources"][1]["status"] == "created"


@pytest.mark.asyncio
async def test_execute_create_quiz_writes_only_after_confirm_path():
    course = _course()
    db = _db_with_course(course)
    user = MagicMock(id=1)
    action = CreateQuizAction(
        local_course_id=1,
        title="Recursion Quiz",
        description="Covers base cases and recursive definitions.",
        due_date="2030-01-01T00:00:00",
        points_possible=10,
        questions=[
            {
                "question_text": "What is a base case?",
                "question_type": "essay_question",
                "points_possible": 10,
            }
        ],
    )
    quiz = SimpleNamespace(id=77, title="Recursion Quiz")

    with (
        patch(
            "app.mcp_tools.dispatcher.validate_quiz_for_create",
            new=AsyncMock(),
        ),
        patch(
            "app.mcp_tools.dispatcher.create_course_quiz",
            new=AsyncMock(return_value=quiz),
        ) as create_quiz,
    ):
        result = await execute_tool(db, user, action)

    assert result["action"] == "create_quiz"
    assert result["affected_resources"][1]["id"] == 77
    assert result["reversible"] is True
    create_quiz.assert_awaited_once()


@pytest.mark.asyncio
async def test_execute_update_assignment_merges_current_state():
    course = _course()
    db = _db_with_course(course)
    user = MagicMock(id=1)
    action = UpdateAssignmentAction(local_course_id=1, assignment_id=50, title="New Title")

    current = SimpleNamespace(name="Old Title", description="Old desc", due_at="2030-01-01T00:00:00", points_possible=5)
    updated = SimpleNamespace(id=50, name="New Title")

    with (
        patch("app.mcp_tools.dispatcher.validate_assignment_for_update", new=AsyncMock()),
        patch("app.mcp_tools.dispatcher.get_assignment", new=AsyncMock(return_value=current)),
        patch("app.mcp_tools.dispatcher.update_course_assignment", new=AsyncMock(return_value=updated)) as mock_update,
    ):
        result = await execute_tool(db, user, action)

    assert result["data"].name == "New Title"
    # Only the field the user actually asked to change is reported.
    assert result["affected_resources"][1]["changed_fields"] == ["title"]
    payload = mock_update.call_args.args[2]
    assert payload.name == "New Title"
    assert payload.description == "Old desc"  # carried over, not blanked


@pytest.mark.asyncio
async def test_execute_update_grade_calls_canvas_with_feedback():
    course = _course()
    db = _db_with_course(course)
    user = MagicMock(id=1)
    action = UpdateGradeAction(
        local_course_id=1,
        assignment_id=50,
        assignment_reference="Midterm",
        student_id=25,
        student_reference="Alex",
        new_grade="85",
        feedback="Strong improvement",
    )

    with patch(
        "app.mcp_tools.dispatcher.update_course_grade",
        new=AsyncMock(return_value={"id": 10, "score": 85}),
    ) as update_grade:
        result = await execute_tool(db, user, action)

    update_grade.assert_awaited_once_with(
        1,
        50,
        25,
        "85",
        user,
        course.canvas_url,
        db,
        feedback="Strong improvement",
    )
    assert result["action"] == "update_grade"
    assert result["affected_resources"][1]["changed_fields"] == [
        "grade",
        "feedback",
    ]


@pytest.mark.asyncio
async def test_execute_send_message_announcement_mode():
    course = _course()
    db = _db_with_course(course)
    user = MagicMock(id=1)
    action = SendMessageAction(local_course_id=1, subject="Reminder", body="Please submit")

    message_result = SimpleNamespace(delivery_mode="announcement")

    with (
        patch("app.mcp_tools.dispatcher.validate_message_for_send", new=AsyncMock()),
        patch("app.mcp_tools.dispatcher.send_course_message", new=AsyncMock(return_value=message_result)),
    ):
        result = await execute_tool(db, user, action)

    assert result["action"] == "send_message"
    assert result["affected_resources"][1]["type"] == "announcement"


@pytest.mark.asyncio
async def test_execute_send_message_conversation_mode():
    course = _course()
    db = _db_with_course(course)
    user = MagicMock(id=1)
    action = SendMessageAction(
        local_course_id=1, subject="Hi", body="Hello", recipient_canvas_user_ids=[10, 11],
    )
    message_result = SimpleNamespace(delivery_mode="conversation")

    with (
        patch("app.mcp_tools.dispatcher.validate_message_for_send", new=AsyncMock()),
        patch("app.mcp_tools.dispatcher.send_course_message", new=AsyncMock(return_value=message_result)),
    ):
        result = await execute_tool(db, user, action)

    assert result["affected_resources"][1]["type"] == "conversation"


# ---------------------------------------------------------------------------
# intent_preview — write-action branch
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_execute_intent_preview_rejects_non_numeric_local_course_id():
    db = AsyncMock()
    user = MagicMock(id=1)
    action = IntentPreviewAction(
        summary="do a thing",
        proposed_action={
            "action": "create_assignment",
            "local_course_id": "not-a-number",
            "title": "HW1", "description": "d", "due_date": "2030-01-01T00:00:00",
            "points_possible": 10,
        },
    )

    with pytest.raises(ToolExecutionError) as exc_info:
        await execute_tool(db, user, action)

    assert "valid course reference" in exc_info.value.user_message


@pytest.mark.asyncio
async def test_execute_intent_preview_write_action_resolves_course_and_preview():
    course = _course()
    db = _db_with_course(course)
    user = MagicMock(id=1)
    action = IntentPreviewAction(
        summary="do a thing",
        proposed_action={
            "action": "create_assignment",
            "local_course_id": 1,
            "title": "HW1", "description": "d", "due_date": "2030-01-01T00:00:00",
            "points_possible": 10,
        },
    )

    with patch(
        "app.mcp_tools.dispatcher.generate_write_preview",
        return_value={"course": "COSC 111"},
    ) as mock_preview:
        result = await execute_tool(db, user, action)

    assert result["intent_preview"] is True
    assert result["preview_metadata"] == {"course": "COSC 111"}
    mock_preview.assert_called_once()


@pytest.mark.asyncio
async def test_execute_intent_preview_rejects_nested_non_action():
    db = AsyncMock()
    user = MagicMock(id=1)
    action = IntentPreviewAction(
        summary="do a thing",
        proposed_action={"action": "clarify", "question": "which course?", "partial_plan": {}},
    )

    with pytest.raises(ToolExecutionError) as exc_info:
        await execute_tool(db, user, action)

    assert "could not be understood" in exc_info.value.user_message


# ---------------------------------------------------------------------------
# intent_preview — read-action branch
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_execute_intent_preview_read_action_no_course_id_uses_generic_metadata():
    db = AsyncMock()
    user = MagicMock(id=1)
    action = IntentPreviewAction(
        summary="list my courses",
        proposed_action={"action": "fetch_courses"},
    )

    result = await execute_tool(db, user, action)

    assert result["preview_metadata"] == {"action": "fetch_courses"}


@pytest.mark.asyncio
async def test_execute_intent_preview_read_action_with_course_id_resolves_name():
    course = _course(name="COSC 499")
    db = _db_with_course(course)
    user = MagicMock(id=1)
    action = IntentPreviewAction(
        summary="show assignments",
        proposed_action={"action": "fetch_assignments", "local_course_id": 1},
    )

    result = await execute_tool(db, user, action)

    assert result["preview_metadata"]["course"] == "COSC 499"


@pytest.mark.asyncio
async def test_execute_intent_preview_read_action_unowned_course_falls_back_silently():
    """A read-action preview referencing a course the user doesn't own must
    not blow up the whole preview — it just omits the course name."""
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)  # _resolve_course finds nothing
    user = MagicMock(id=1)
    action = IntentPreviewAction(
        summary="show assignments",
        proposed_action={"action": "fetch_assignments", "local_course_id": 999},
    )

    result = await execute_tool(db, user, action)

    assert "course" not in result["preview_metadata"]


@pytest.mark.asyncio
async def test_execute_intent_preview_read_action_non_numeric_course_id_treated_as_none():
    db = AsyncMock()
    user = MagicMock(id=1)
    action = IntentPreviewAction(
        summary="show assignments",
        proposed_action={"action": "fetch_assignments", "local_course_id": "garbage"},
    )

    result = await execute_tool(db, user, action)

    assert "course" not in result["preview_metadata"]
    db.scalar.assert_not_called()


@pytest.mark.asyncio
async def test_execute_intent_preview_create_assignment_missing_field_downgrades_to_clarify():
    db = AsyncMock()
    user = MagicMock(id=1)
    action = IntentPreviewAction(
        summary="create an assignment",
        proposed_action={
            "action": "create_assignment", "local_course_id": 1,
            "title": "HW1", "description": "d", "due_date": "2030-01-01T00:00:00",
            # points_possible omitted — the missing required field
        },
    )

    result = await execute_tool(db, user, action)

    assert result["action"] == "clarify"
    assert "points" in result["question"].lower()
    assert result["partial_plan"]["title"] == "HW1"


@pytest.mark.asyncio
async def test_execute_intent_preview_create_assignment_past_due_date_downgrades_to_clarify():
    db = AsyncMock()
    user = MagicMock(id=1)
    action = IntentPreviewAction(
        summary="create an assignment",
        proposed_action={
            "action": "create_assignment", "local_course_id": 1,
            "title": "HW1", "description": "d", "due_date": "2020-01-01T00:00:00",
            "points_possible": 10,
        },
    )

    result = await execute_tool(db, user, action)

    assert result["action"] == "clarify"
    assert "already" in result["question"].lower()
    assert "due_date" not in result["partial_plan"]


@pytest.mark.asyncio
async def test_execute_intent_preview_create_quiz_routes_with_empty_fields():
    """Chat never clarifies quiz fields — the form owns validation."""
    course = _course()
    db = _db_with_course(course)
    user = MagicMock(id=1)
    action = IntentPreviewAction(
        summary="I'll help you create a quiz...",
        proposed_action={
            "action": "create_quiz",
            "local_course_id": 1,
            "title": "",
            "description": "",
            "due_date": "",
            "points_possible": None,
        },
    )

    result = await execute_tool(db, user, action)

    assert result.get("intent_preview") is True
    assert result["proposed_action"]["action"] == "create_quiz"
    assert result["action"] != "clarify"


@pytest.mark.asyncio
async def test_execute_intent_preview_create_quiz_without_questions_routes_to_form():
    """Questions are added in the quiz form — preview must not clarify for them."""
    course = _course()
    db = _db_with_course(course)
    user = MagicMock(id=1)
    action = IntentPreviewAction(
        summary="create a quiz",
        proposed_action={
            "action": "create_quiz",
            "local_course_id": 1,
            "title": "Quiz 1",
            "description": "Covers recursion concepts in depth.",
            "due_date": "2030-01-01T00:00:00",
            "points_possible": 10,
        },
    )

    result = await execute_tool(db, user, action)

    assert result.get("intent_preview") is True
    assert result["proposed_action"]["action"] == "create_quiz"
    assert result["proposed_action"]["title"] == "Quiz 1"
    assert result["action"] != "clarify"


@pytest.mark.asyncio
async def test_execute_intent_preview_create_quiz_past_date_still_routes_to_form():
    """Past due dates are validated in the form, not via chat clarify."""
    course = _course()
    db = _db_with_course(course)
    user = MagicMock(id=1)
    action = IntentPreviewAction(
        summary="create a quiz",
        proposed_action={
            "action": "create_quiz",
            "local_course_id": 1,
            "title": "Quiz 1",
            "description": "Covers recursion concepts in depth.",
            "due_date": "2020-01-01T00:00:00",
            "points_possible": 10,
        },
    )

    result = await execute_tool(db, user, action)

    assert result.get("intent_preview") is True
    assert result["proposed_action"]["action"] == "create_quiz"
    assert result["action"] != "clarify"


# ---------------------------------------------------------------------------
# Conversational actions
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_execute_out_of_scope():
    db = AsyncMock()
    user = MagicMock(id=1)
    action = OutOfScopeAction(message="write me a poem")

    result = await execute_tool(db, user, action)

    assert result["action"] == "out_of_scope"
    assert result["detail"] == "write me a poem"


@pytest.mark.asyncio
async def test_execute_clarify():
    db = AsyncMock()
    user = MagicMock(id=1)
    action = ClarifyAction(question="Which course?", partial_plan={"title": "HW1"})

    result = await execute_tool(db, user, action)

    assert result["action"] == "clarify"
    assert result["question"] == "Which course?"


@pytest.mark.asyncio
async def test_execute_respond():
    db = AsyncMock()
    user = MagicMock(id=1)
    action = RespondAction(message="Here's what I can do.")

    result = await execute_tool(db, user, action)

    assert result == {"action": "respond", "message": "Here's what I can do."}


@pytest.mark.asyncio
async def test_execute_unhandled_action_raises():
    db = AsyncMock()
    user = MagicMock(id=1)
    action = SimpleNamespace(action="not_a_real_action")

    with pytest.raises(ToolExecutionError) as exc_info:
        await execute_tool(db, user, action)

    assert "No handler implemented" in exc_info.value.user_message


# ---------------------------------------------------------------------------
# _default_canvas_url
# ---------------------------------------------------------------------------

def test_default_canvas_url_no_connections_raises():
    user = SimpleNamespace(id=1, canvas_connections=[])

    with pytest.raises(ToolExecutionError):
        _default_canvas_url(user)


def test_default_canvas_url_returns_first_connection():
    user = SimpleNamespace(
        id=1,
        canvas_connections=[
            SimpleNamespace(canvas_url="https://canvas.ubc.ca"),
            SimpleNamespace(canvas_url="https://canvas.other.edu"),
        ],
    )

    assert _default_canvas_url(user) == "https://canvas.ubc.ca"
