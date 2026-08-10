"""Feature 13 #1174 — prove chat Canvas reads go through MCP when enabled."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.mcp_tools.dispatcher import ToolExecutionError, execute_tool
from app.mcp_tools.schemas import FetchCoursesAction


@pytest.mark.asyncio
async def test_fetch_courses_uses_mcp_when_enabled_and_tags_via_mcp():
    user = SimpleNamespace(
        id=1,
        canvas_connections=[
            SimpleNamespace(canvas_url="https://canvas.example.edu", encrypted_token="x")
        ],
    )
    db = MagicMock()
    action = FetchCoursesAction()

    with (
        patch("app.mcp_tools.dispatcher.settings.MCP_ENABLED", True),
        patch(
            "app.mcp_tools.dispatcher.require_canvas_token",
            return_value="tok",
        ),
        patch(
            "app.mcp_tools.dispatcher.call_tool",
            AsyncMock(
                return_value={
                    "courses": [
                        {
                            "id": 9,
                            "name": "COSC 111",
                            "course_code": "COSC 111",
                            "workflow_state": "available",
                        }
                    ]
                }
            ),
        ) as call_tool,
        patch(
            "app.mcp_tools.dispatcher.get_courses",
            AsyncMock(),
        ) as get_courses,
    ):
        result = await execute_tool(db, user, action)

    call_tool.assert_awaited_once()
    get_courses.assert_not_awaited()
    assert result["via_mcp"] is True
    assert result["courses"][0]["name"] == "COSC 111"


@pytest.mark.asyncio
async def test_fetch_courses_fails_closed_when_mcp_unreachable():
    user = SimpleNamespace(
        id=1,
        canvas_connections=[
            SimpleNamespace(canvas_url="https://canvas.example.edu", encrypted_token="x")
        ],
    )
    db = MagicMock()
    action = FetchCoursesAction()

    from app.integrations.mcp_client import MCPClientError

    with (
        patch("app.mcp_tools.dispatcher.settings.MCP_ENABLED", True),
        patch(
            "app.mcp_tools.dispatcher.require_canvas_token",
            return_value="tok",
        ),
        patch(
            "app.mcp_tools.dispatcher.call_tool",
            AsyncMock(side_effect=MCPClientError("unreachable")),
        ),
        patch(
            "app.mcp_tools.dispatcher.get_courses",
            AsyncMock(),
        ) as get_courses,
    ):
        with pytest.raises(ToolExecutionError, match="MCP"):
            await execute_tool(db, user, action)

    get_courses.assert_not_awaited()


@pytest.mark.asyncio
async def test_fetch_courses_uses_direct_canvas_when_mcp_disabled():
    user = SimpleNamespace(
        id=1,
        canvas_connections=[
            SimpleNamespace(canvas_url="https://canvas.example.edu", encrypted_token="x")
        ],
    )
    db = MagicMock()
    action = FetchCoursesAction()
    course = MagicMock()
    course.model_dump.return_value = {"id": 1, "name": "Direct"}

    with (
        patch("app.mcp_tools.dispatcher.settings.MCP_ENABLED", False),
        patch(
            "app.mcp_tools.dispatcher.get_courses",
            AsyncMock(return_value=[course]),
        ) as get_courses,
        patch(
            "app.mcp_tools.dispatcher.call_tool",
            AsyncMock(),
        ) as call_tool,
    ):
        result = await execute_tool(db, user, action)

    get_courses.assert_awaited_once()
    call_tool.assert_not_awaited()
    assert result["courses"][0]["name"] == "Direct"
    assert "via_mcp" not in result


@pytest.mark.asyncio
async def test_create_assignment_mcp_path_uses_idempotency_guards():
    """MCP writes must still claim/idempotency-guard before mutating Canvas."""
    from app.mcp_tools.schemas import CreateAssignmentAction
    from app.schemas.canvas import AssignmentResponse

    course = SimpleNamespace(
        id=1,
        canvas_url="https://canvas.example.edu",
        name="COSC 111",
        canvas_course_id="42",
    )
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=course)
    user = SimpleNamespace(id=7)
    action = CreateAssignmentAction(
        local_course_id=1,
        title="HW1",
        description="desc",
        due_date="2030-01-01T00:00:00",
        points_possible=10,
    )
    cached = AssignmentResponse(
        id=99,
        name="HW1",
        description="desc",
        due_at="2030-01-01T00:00:00",
        points_possible=10,
        course_id=42,
        published=False,
    ).model_dump(mode="json")

    with (
        patch("app.mcp_tools.dispatcher.settings.MCP_ENABLED", True),
        patch("app.mcp_tools.dispatcher.validate_assignment_for_create", new=AsyncMock()),
        patch(
            "app.mcp_tools.dispatcher._assert_no_executing_write",
            new=AsyncMock(),
        ) as assert_no_executing,
        patch(
            "app.mcp_tools.dispatcher.run_idempotent_canvas_write",
            new=AsyncMock(return_value=cached),
        ) as run_idempotent,
        patch(
            "app.mcp_tools.dispatcher._call_mcp_tool",
            new=AsyncMock(),
        ) as call_mcp,
        patch(
            "app.mcp_tools.dispatcher.create_course_assignment",
            new=AsyncMock(),
        ) as create_direct,
    ):
        result = await execute_tool(db, user, action)

    assert_no_executing.assert_awaited_once()
    run_idempotent.assert_awaited_once()
    # Write callable is deferred until run_idempotent runs it; since we stubbed
    # the helper to return cached, MCP should not have been called yet.
    call_mcp.assert_not_awaited()
    create_direct.assert_not_awaited()
    assert result["via_mcp"] is True
    assert result["data"]["id"] == 99


@pytest.mark.asyncio
async def test_create_ungraded_assignment_mcp_args_send_not_graded():
    """Ticket 21: MCP create must pass points_possible=None + grading_type=not_graded."""
    from app.mcp_tools.schemas import CreateAssignmentAction

    course = SimpleNamespace(
        id=1,
        canvas_url="https://canvas.example.edu",
        name="COSC 111",
        canvas_course_id="42",
    )
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=course)
    user = SimpleNamespace(id=7)
    action = CreateAssignmentAction(
        local_course_id=1,
        title="Reading Check-in",
        description="ungraded participation",
        due_date="2030-01-01T00:00:00",
        points_possible=None,
    )

    async def _run_write(*_args, **kwargs):
        return await kwargs["write"]()

    with (
        patch("app.mcp_tools.dispatcher.settings.MCP_ENABLED", True),
        patch("app.mcp_tools.dispatcher.validate_assignment_for_create", new=AsyncMock()),
        patch(
            "app.mcp_tools.dispatcher._assert_no_executing_write",
            new=AsyncMock(),
        ),
        patch(
            "app.mcp_tools.dispatcher.run_idempotent_canvas_write",
            new=AsyncMock(side_effect=_run_write),
        ),
        patch(
            "app.mcp_tools.dispatcher._call_mcp_tool",
            new=AsyncMock(
                return_value={
                    "success": True,
                    "assignment": {
                        "id": 88,
                        "name": "Reading Check-in",
                        "due_at": "2030-01-01T00:00:00Z",
                        "points_possible": None,
                        "published": False,
                    },
                }
            ),
        ) as call_mcp,
        patch(
            "app.mcp_tools.dispatcher.create_course_assignment",
            new=AsyncMock(),
        ) as create_direct,
    ):
        result = await execute_tool(db, user, action)

    create_direct.assert_not_awaited()
    call_mcp.assert_awaited_once()
    _user, canvas_url, tool_name, mcp_arguments = call_mcp.await_args.args
    assert canvas_url == "https://canvas.example.edu"
    assert tool_name == "create_assignment"
    assert mcp_arguments["course_id"] == 42
    assert mcp_arguments["name"] == "Reading Check-in"
    assert mcp_arguments["points_possible"] is None
    assert mcp_arguments["grading_type"] == "not_graded"
    assert result["via_mcp"] is True
    assert result["data"]["id"] == 88
    assert result["data"]["points_possible"] is None


@pytest.mark.asyncio
async def test_create_quiz_stays_on_direct_canvas_when_mcp_enabled():
    from app.mcp_tools.schemas import CreateQuizAction

    course = SimpleNamespace(
        id=1,
        canvas_url="https://canvas.example.edu",
        name="COSC 111",
        canvas_course_id="42",
    )
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=course)
    user = SimpleNamespace(id=7)
    action = CreateQuizAction(
        local_course_id=1,
        title="Quiz",
        description="Covers base cases and recursive definitions.",
        due_date="2030-01-01T00:00:00",
        points_possible=10,
        questions=[
            {
                "question_text": "Q1?",
                "question_type": "essay_question",
                "points_possible": 10,
            }
        ],
    )
    quiz = SimpleNamespace(id=5, title="Quiz")

    with (
        patch("app.mcp_tools.dispatcher.settings.MCP_ENABLED", True),
        patch("app.mcp_tools.dispatcher.validate_quiz_for_create", new=AsyncMock()),
        patch(
            "app.mcp_tools.dispatcher.create_course_quiz",
            new=AsyncMock(return_value=quiz),
        ) as create_quiz,
        patch(
            "app.mcp_tools.dispatcher._call_mcp_tool",
            new=AsyncMock(),
        ) as call_mcp,
    ):
        result = await execute_tool(db, user, action)

    create_quiz.assert_awaited_once()
    call_mcp.assert_not_awaited()
    assert result["action"] == "create_quiz"
    assert "via_mcp" not in result
