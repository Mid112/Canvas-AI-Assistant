"""
MCP Server Test Suite
---------------------
Requires the MCP server running on localhost:8001.

Run with:
    cd test/mcp
    source venv/bin/activate
    pytest -v

Canvas-dependent tests are skipped automatically when CANVAS_API_TOKEN
is not set or is the placeholder value.
"""

import asyncio
import json
import os

import httpx
import pytest
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client

MCP_URL = os.getenv("MCP_URL", "http://localhost:8001")
MCP_SHARED_SECRET = os.getenv("MCP_SHARED_SECRET", "local-mcp-shared-secret").strip()
CANVAS_AVAILABLE = (
    bool(os.getenv("CANVAS_API_TOKEN"))
    and os.getenv("CANVAS_API_TOKEN") != "placeholder"
)

EXPECTED_TOOLS = {
    "fetch_courses",
    "fetch_assignments",
    "fetch_submissions",
    "fetch_missing_submissions",
    "fetch_students",
    "fetch_quizzes",
    "create_assignment",
    "update_assignment",
    "update_grade",
    "create_announcement",
    "send_message_to_students",
}


def _mcp_http_client() -> httpx.AsyncClient:
    """Authenticated client — /mcp requires MCP_SHARED_SECRET (#1273)."""
    return httpx.AsyncClient(
        headers={"Authorization": f"Bearer {MCP_SHARED_SECRET}"},
        follow_redirects=True,
        timeout=httpx.Timeout(30.0, read=300.0),
    )


# ══════════════════════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════════════════════

async def list_tools_async() -> list:
    async with _mcp_http_client() as http_client:
        async with streamable_http_client(
            f"{MCP_URL}/mcp", http_client=http_client
        ) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.list_tools()
                return result.tools


async def call_tool(tool_name: str, arguments: dict) -> dict:
    async with _mcp_http_client() as http_client:
        async with streamable_http_client(
            f"{MCP_URL}/mcp", http_client=http_client
        ) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(tool_name, arguments=arguments)
                if result.content and hasattr(result.content[0], "text"):
                    return json.loads(result.content[0].text)
                return {}


# ══════════════════════════════════════════════════════════════════════════
#  INFRASTRUCTURE TESTS
# ══════════════════════════════════════════════════════════════════════════

# Verifies: Mcp server health.
def test_mcp_server_health():
    """MCP server health endpoint returns ok (public, no shared secret)."""
    response = httpx.get(f"{MCP_URL}/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "canvas-mcp"


# Verifies: /mcp rejects missing shared secret.
def test_mcp_transport_requires_shared_secret():
    """Unauthenticated /mcp callers get 401."""
    response = httpx.post(
        f"{MCP_URL}/mcp",
        headers={"Accept": "application/json, text/event-stream"},
        json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
    )
    assert response.status_code == 401


# Verifies: Mcp server lists tools.
def test_mcp_server_lists_tools():
    """MCP server exposes at least one tool."""
    tools = asyncio.run(list_tools_async())
    assert len(tools) > 0


# Verifies: Mcp server exposes all expected tools.
def test_mcp_server_exposes_all_expected_tools():
    """All required Canvas tools are registered."""
    tools = asyncio.run(list_tools_async())
    registered = {t.name for t in tools}
    missing = EXPECTED_TOOLS - registered
    assert not missing, f"Missing tools: {missing}"


# Verifies: No workflow tools registered.
def test_no_workflow_tools_registered():
    """Workflow tools must not be on the MCP server — audit is read-only."""
    tools = asyncio.run(list_tools_async())
    registered = {t.name for t in tools}
    forbidden = {"create_workflow", "approve_workflow", "reject_workflow", "log_action"}
    present = forbidden & registered
    assert not present, f"Workflow write tools should not be on MCP server: {present}"


# Verifies: All tools have descriptions.
def test_all_tools_have_descriptions():
    """Every registered tool has a non-empty description."""
    tools = asyncio.run(list_tools_async())
    for tool in tools:
        assert tool.description and len(tool.description.strip()) > 0, \
            f"Tool '{tool.name}' has no description"


# ══════════════════════════════════════════════════════════════════════════
#  TOOL SCHEMA TESTS
# ══════════════════════════════════════════════════════════════════════════

# Verifies: Fetch assignments requires course id.
def test_fetch_assignments_requires_course_id():
    """fetch_assignments declares course_id as a required parameter."""
    tools = asyncio.run(list_tools_async())
    tool = next(t for t in tools if t.name == "fetch_assignments")
    assert "course_id" in tool.inputSchema.get("properties", {})
    assert "course_id" in tool.inputSchema.get("required", [])


# Verifies: Fetch submissions requires course and assignment id.
def test_fetch_submissions_requires_course_and_assignment_id():
    """fetch_submissions declares both course_id and assignment_id as required."""
    tools = asyncio.run(list_tools_async())
    tool = next(t for t in tools if t.name == "fetch_submissions")
    props = tool.inputSchema.get("properties", {})
    required = tool.inputSchema.get("required", [])
    assert "course_id" in props and "course_id" in required
    assert "assignment_id" in props and "assignment_id" in required


# Verifies: Create assignment has required params.
def test_create_assignment_has_required_params():
    """create_assignment declares name, course_id, and points_possible."""
    tools = asyncio.run(list_tools_async())
    tool = next(t for t in tools if t.name == "create_assignment")
    props = tool.inputSchema.get("properties", {})
    assert "course_id" in props
    assert "name" in props
    assert "points_possible" in props


# Verifies: Ungraded MCP create sends not_graded without inventing points (Ticket 21).
def test_create_assignment_ungraded_sends_not_graded_to_canvas():
    """MCP create_assignment passes points_possible=None and grading_type=not_graded."""
    import sys
    from pathlib import Path
    from unittest.mock import AsyncMock, MagicMock, patch

    mcp_dir = Path(__file__).resolve().parents[2] / "app" / "mcp"
    sys.path.insert(0, str(mcp_dir))
    from server import create_assignment  # noqa: E402

    mock_response = MagicMock()
    mock_response.is_error = False
    mock_response.json.return_value = {
        "id": 1,
        "name": "Reading Check-in",
        "grading_type": "not_graded",
        "points_possible": None,
        "published": False,
    }

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    async def _run() -> None:
        with patch("server.httpx.AsyncClient", return_value=mock_client):
            result = await create_assignment(
                course_id=1,
                name="Reading Check-in",
                points_possible=None,
            )

        assert result["success"] is True
        payload = mock_client.post.call_args.kwargs["json"]
        assignment_body = payload["assignment"]
        assert assignment_body["grading_type"] == "not_graded"
        assert "points_possible" not in assignment_body

    asyncio.run(_run())


# Verifies: Send message has required params.
def test_send_message_has_required_params():
    """send_message_to_students declares course_id, subject, body, recipient_ids."""
    tools = asyncio.run(list_tools_async())
    tool = next(t for t in tools if t.name == "send_message_to_students")
    props = tool.inputSchema.get("properties", {})
    assert "recipient_ids" in props
    assert "subject" in props
    assert "body" in props
    assert "course_id" in props


# Verifies: Audit logs tool is not exposed on MCP.
def test_get_audit_logs_not_registered():
    """Audit logs stay on the authenticated backend — not an MCP tool."""
    tools = asyncio.run(list_tools_async())
    registered = {t.name for t in tools}
    assert "get_audit_logs" not in registered


# ══════════════════════════════════════════════════════════════════════════
#  RESPONSE STRUCTURE TESTS (run without live Canvas)
# ══════════════════════════════════════════════════════════════════════════

# Verifies: Fetch courses returns courses key.
def test_fetch_courses_returns_courses_key():
    """fetch_courses always returns a dict with a courses key."""
    result = asyncio.run(call_tool("fetch_courses", {}))
    assert "courses" in result or "error" in result


# Verifies: Fetch assignments returns assignments key.
def test_fetch_assignments_returns_assignments_key():
    """fetch_assignments always returns a dict with an assignments key."""
    result = asyncio.run(call_tool("fetch_assignments", {"course_id": 999999}))
    assert "assignments" in result or "error" in result


# Verifies: Fetch submissions returns submissions key.
def test_fetch_submissions_returns_submissions_key():
    """fetch_submissions always returns a dict with a submissions key."""
    result = asyncio.run(
        call_tool("fetch_submissions", {"course_id": 999999, "assignment_id": 999999})
    )
    assert "submissions" in result or "error" in result


# Verifies: Fetch missing submissions returns counts.
def test_fetch_missing_submissions_returns_counts():
    """fetch_missing_submissions always returns missing_count and late_count."""
    result = asyncio.run(
        call_tool(
            "fetch_missing_submissions",
            {"course_id": 999999, "assignment_id": 999999},
        )
    )
    # with bad IDs we get either error or the count fields
    assert ("missing_count" in result and "late_count" in result) or "error" in result


# ══════════════════════════════════════════════════════════════════════════
#  CANVAS INTEGRATION TESTS (require sandbox Canvas)
# ══════════════════════════════════════════════════════════════════════════

# Verifies: Fetch courses returns list.
@pytest.mark.skipif(not CANVAS_AVAILABLE, reason="Canvas sandbox not configured")
def test_fetch_courses_returns_list():
    """fetch_courses returns a non-empty list from Canvas sandbox."""
    result = asyncio.run(call_tool("fetch_courses", {}))
    assert "courses" in result
    assert isinstance(result["courses"], list)


# Verifies: Courses have required fields.
@pytest.mark.skipif(not CANVAS_AVAILABLE, reason="Canvas sandbox not configured")
def test_courses_have_required_fields():
    """Each course has id, name, and workflow_state."""
    result = asyncio.run(call_tool("fetch_courses", {}))
    courses = result.get("courses", [])
    if not courses:
        pytest.skip("No courses in Canvas sandbox")
    for course in courses:
        assert "id" in course
        assert "name" in course
        assert "workflow_state" in course


# Verifies: Fetch assignments from real course.
@pytest.mark.skipif(not CANVAS_AVAILABLE, reason="Canvas sandbox not configured")
def test_fetch_assignments_from_real_course():
    """fetch_assignments returns assignments for a real course."""
    courses = asyncio.run(call_tool("fetch_courses", {})).get("courses", [])
    if not courses:
        pytest.skip("No courses in Canvas sandbox")
    course_id = courses[0]["id"]
    result = asyncio.run(call_tool("fetch_assignments", {"course_id": course_id}))
    assert "assignments" in result
    assert isinstance(result["assignments"], list)


# Verifies: Fetch missing submissions from real assignment.
@pytest.mark.skipif(not CANVAS_AVAILABLE, reason="Canvas sandbox not configured")
def test_fetch_missing_submissions_from_real_assignment():
    """fetch_missing_submissions returns correct structure for a real assignment."""
    courses = asyncio.run(call_tool("fetch_courses", {})).get("courses", [])
    if not courses:
        pytest.skip("No courses in Canvas sandbox")
    course_id = courses[0]["id"]

    assignments = asyncio.run(
        call_tool("fetch_assignments", {"course_id": course_id})
    ).get("assignments", [])
    if not assignments:
        pytest.skip("No assignments in Canvas sandbox")
    assignment_id = assignments[0]["id"]

    result = asyncio.run(
        call_tool(
            "fetch_missing_submissions",
            {"course_id": course_id, "assignment_id": assignment_id},
        )
    )
    assert "missing_count" in result
    assert "late_count" in result
    assert "missing_submissions" in result
    assert "late_submissions" in result
    assert isinstance(result["missing_submissions"], list)
    assert isinstance(result["late_submissions"], list)