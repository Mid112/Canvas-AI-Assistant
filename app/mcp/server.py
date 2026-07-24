# Canvas MCP server implementation using FastMCP.
# Exposes tools for reading/writing Canvas data and fetching audit logs.

import os
from contextvars import ContextVar
from typing import Any, Awaitable, Callable

import httpx
import uvicorn
from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse

# ── Config from environment ────────────────────────────────────────────────
CANVAS_API_URL = os.getenv("CANVAS_API_URL", "http://localhost:4000/api/v1")
CANVAS_API_TOKEN = os.getenv("CANVAS_API_TOKEN", "placeholder")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
MCP_PORT = int(os.getenv("MCP_PORT", "8001"))

_request_canvas_token: ContextVar[str | None] = ContextVar("canvas_token", default=None)
_request_canvas_url: ContextVar[str | None] = ContextVar("canvas_url", default=None)

ALLOWED_TOOLS = frozenset(
    {
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
        "get_audit_logs",
    }
)


def _effective_canvas_api_url() -> str:
    override = _request_canvas_url.get()
    if override:
        base = override.rstrip("/")
        return base if base.endswith("/api/v1") else f"{base}/api/v1"
    return CANVAS_API_URL


def _canvas_headers() -> dict[str, str]:
    token = _request_canvas_token.get() or CANVAS_API_TOKEN
    return {"Authorization": f"Bearer {token}"}


# ── FastMCP instance ───────────────────────────────────────────────────────
mcp = FastMCP("canvas-mcp")


# Canvas read tools: fetch courses, assignments, submissions, and missing submissions.

@mcp.tool()
async def fetch_courses() -> dict[str, Any]:
    """
    Fetch all active courses for the authenticated instructor from Canvas.
    Returns a list of courses with id, name, course_code, and workflow_state.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{_effective_canvas_api_url()}/courses",
                headers=_canvas_headers(),
                params={"enrollment_type": "teacher", "state[]": "available"},
                timeout=10.0,
            )
        if response.status_code == 401:
            return {"error": "Invalid Canvas API token", "courses": []}
        if response.is_error:
            return {"error": f"Canvas API error: {response.status_code}", "courses": []}

        courses = response.json()
        return {
            "courses": [
                {
                    "id": c.get("id"),
                    "name": c.get("name"),
                    "course_code": c.get("course_code"),
                    "workflow_state": c.get("workflow_state"),
                    "enrollment_term_id": c.get("enrollment_term_id"),
                }
                for c in courses
            ]
        }
    except httpx.RequestError as e:
        return {"error": f"Could not reach Canvas: {str(e)}", "courses": []}


@mcp.tool()
async def fetch_assignments(course_id: int) -> dict[str, Any]:
    """
    Fetch all assignments for a given course from Canvas.
    Returns id, name, description, due_at, and points_possible.

    Args:
        course_id: The Canvas course ID.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{_effective_canvas_api_url()}/courses/{course_id}/assignments",
                headers=_canvas_headers(),
                timeout=10.0,
            )
        if response.is_error:
            return {"error": f"Canvas API error: {response.status_code}", "assignments": []}

        assignments = response.json()
        return {
            "course_id": course_id,
            "assignments": [
                {
                    "id": a.get("id"),
                    "name": a.get("name"),
                    "description": a.get("description"),
                    "due_at": a.get("due_at"),
                    "points_possible": a.get("points_possible"),
                    "course_id": course_id,
                }
                for a in assignments
            ],
        }
    except httpx.RequestError as e:
        return {"error": f"Could not reach Canvas: {str(e)}", "assignments": []}


@mcp.tool()
async def fetch_submissions(course_id: int, assignment_id: int) -> dict[str, Any]:
    """
    Fetch all student submissions for a specific assignment.
    Returns submission status, score, and student info.

    Args:
        course_id: The Canvas course ID.
        assignment_id: The Canvas assignment ID.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{_effective_canvas_api_url()}/courses/{course_id}/assignments/{assignment_id}/submissions",
                headers=_canvas_headers(),
                timeout=10.0,
            )
        if response.is_error:
            return {"error": f"Canvas API error: {response.status_code}", "submissions": []}

        submissions = response.json()
        return {
            "course_id": course_id,
            "assignment_id": assignment_id,
            "submissions": [
                {
                    "id": s.get("id"),
                    "user_id": s.get("user_id"),
                    "score": s.get("score"),
                    "grade": s.get("grade"),
                    "submitted_at": s.get("submitted_at"),
                    "workflow_state": s.get("workflow_state"),
                    "late": s.get("late", False),
                    "missing": s.get("missing", False),
                }
                for s in submissions
            ],
        }
    except httpx.RequestError as e:
        return {"error": f"Could not reach Canvas: {str(e)}", "submissions": []}


@mcp.tool()
async def fetch_missing_submissions(course_id: int, assignment_id: int) -> dict[str, Any]:
    """
    Fetch only the missing or late submissions for an assignment.
    Useful for generating targeted student reminders.

    Args:
        course_id: The Canvas course ID.
        assignment_id: The Canvas assignment ID.
    """
    result = await fetch_submissions(course_id, assignment_id)
    if "error" in result:
        return result

    all_subs = result["submissions"]
    missing = [s for s in all_subs if s.get("missing") or s.get("workflow_state") == "unsubmitted"]
    late = [s for s in all_subs if s.get("late")]

    return {
        "course_id": course_id,
        "assignment_id": assignment_id,
        "missing_count": len(missing),
        "late_count": len(late),
        "missing_submissions": missing,
        "late_submissions": late,
    }


@mcp.tool()
async def fetch_students(course_id: int) -> dict[str, Any]:
    """
    Fetch students enrolled in a course (teacher view).
    Returns id, name, and enrollment_state only — no email/login.

    Args:
        course_id: The Canvas course ID.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{_effective_canvas_api_url()}/courses/{course_id}/users",
                headers=_canvas_headers(),
                params={"enrollment_type[]": "student", "per_page": 100},
                timeout=15.0,
            )
        if response.is_error:
            return {"error": f"Canvas API error: {response.status_code}", "students": []}

        students = []
        for item in response.json():
            if not isinstance(item, dict):
                continue
            students.append(
                {
                    "id": item.get("id"),
                    "canvas_user_id": item.get("id"),
                    "name": item.get("name"),
                    "enrollment_state": "active",
                    "course_id": course_id,
                }
            )
        return {"course_id": course_id, "students": students, "count": len(students)}
    except httpx.RequestError as e:
        return {"error": f"Could not reach Canvas: {str(e)}", "students": []}


@mcp.tool()
async def fetch_quizzes(course_id: int) -> dict[str, Any]:
    """
    Fetch classic quizzes for a course.

    Args:
        course_id: The Canvas course ID.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{_effective_canvas_api_url()}/courses/{course_id}/quizzes",
                headers=_canvas_headers(),
                timeout=15.0,
            )
        if response.is_error:
            return {"error": f"Canvas API error: {response.status_code}", "quizzes": []}

        quizzes = []
        for item in response.json():
            if not isinstance(item, dict):
                continue
            quizzes.append(
                {
                    "id": item.get("id"),
                    "title": item.get("title"),
                    "description": item.get("description"),
                    "due_at": item.get("due_at"),
                    "points_possible": item.get("points_possible"),
                    "published": item.get("published"),
                    "course_id": course_id,
                }
            )
        return {"course_id": course_id, "quizzes": quizzes, "count": len(quizzes)}
    except httpx.RequestError as e:
        return {"error": f"Could not reach Canvas: {str(e)}", "quizzes": []}


# Canvas write tools: create / update assignments, grades, and messages.

@mcp.tool()
async def create_assignment(
    course_id: int,
    name: str,
    points_possible: float,
    due_at: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    """
    Create a new assignment in Canvas for a given course.
    Always created as a draft (published: false) — the instructor must
    publish it manually after reviewing.

    Args:
        course_id: The Canvas course ID.
        name: Assignment name.
        points_possible: Maximum points for the assignment.
        due_at: ISO 8601 due date string e.g. '2026-07-01T23:59:00Z'. Optional.
        description: Assignment description. Optional.
    """
    payload: dict[str, Any] = {
        "assignment": {
            "name": name,
            "points_possible": points_possible,
            "published": False,
        }
    }
    if due_at:
        payload["assignment"]["due_at"] = due_at
    if description:
        payload["assignment"]["description"] = description

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{_effective_canvas_api_url()}/courses/{course_id}/assignments",
                headers=_canvas_headers(),
                json=payload,
                timeout=10.0,
            )
        if response.is_error:
            return {"error": f"Canvas API error: {response.status_code}", "assignment": None}

        created = response.json()
        return {
            "success": True,
            "assignment": {
                "id": created.get("id"),
                "name": created.get("name"),
                "due_at": created.get("due_at"),
                "points_possible": created.get("points_possible"),
                "published": created.get("published"),
                "course_id": course_id,
            },
        }
    except httpx.RequestError as e:
        return {"error": f"Could not reach Canvas: {str(e)}", "assignment": None}


@mcp.tool()
async def update_assignment(
    course_id: int,
    assignment_id: int,
    name: str | None = None,
    points_possible: float | None = None,
    due_at: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    """
    Update an existing Canvas assignment. Only provided fields are changed.

    Args:
        course_id: The Canvas course ID.
        assignment_id: The Canvas assignment ID.
        name: New assignment name. Optional.
        points_possible: New points value. Optional.
        due_at: ISO 8601 due date. Optional.
        description: New description. Optional.
    """
    assignment_body: dict[str, Any] = {}
    if name is not None:
        assignment_body["name"] = name
    if points_possible is not None:
        assignment_body["points_possible"] = points_possible
    if due_at is not None:
        assignment_body["due_at"] = due_at
    if description is not None:
        assignment_body["description"] = description

    try:
        async with httpx.AsyncClient() as client:
            response = await client.put(
                f"{_effective_canvas_api_url()}/courses/{course_id}/assignments/{assignment_id}",
                headers=_canvas_headers(),
                json={"assignment": assignment_body},
                timeout=10.0,
            )
        if response.is_error:
            return {"error": f"Canvas API error: {response.status_code}", "assignment": None}
        updated = response.json()
        return {
            "success": True,
            "assignment": {
                "id": updated.get("id"),
                "name": updated.get("name"),
                "due_at": updated.get("due_at"),
                "points_possible": updated.get("points_possible"),
                "published": updated.get("published"),
                "description": updated.get("description"),
                "course_id": course_id,
            },
        }
    except httpx.RequestError as e:
        return {"error": f"Could not reach Canvas: {str(e)}", "assignment": None}


@mcp.tool()
async def update_grade(
    course_id: int,
    assignment_id: int,
    user_id: int,
    posted_grade: str | None = None,
    comment: str | None = None,
) -> dict[str, Any]:
    """
    Update a student's submission grade and/or comment on Canvas.

    Args:
        course_id: The Canvas course ID.
        assignment_id: The Canvas assignment ID.
        user_id: The Canvas user ID of the student.
        posted_grade: Grade string to post. Optional for comment-only updates.
        comment: Submission comment / feedback. Optional.
    """
    payload: dict[str, Any] = {}
    if posted_grade is not None:
        payload["submission"] = {"posted_grade": posted_grade}
    if comment:
        payload["comment"] = {"text_comment": comment}

    try:
        async with httpx.AsyncClient() as client:
            response = await client.put(
                f"{_effective_canvas_api_url()}/courses/{course_id}/assignments/"
                f"{assignment_id}/submissions/{user_id}",
                headers=_canvas_headers(),
                json=payload,
                timeout=10.0,
            )
        if response.is_error:
            return {"error": f"Canvas API error: {response.status_code}", "submission": None}
        raw = response.json()
        return {
            "success": True,
            "submission": {
                "id": raw.get("id"),
                "user_id": raw.get("user_id") or user_id,
                "assignment_id": assignment_id,
                "score": raw.get("score"),
                "grade": raw.get("grade"),
                "workflow_state": raw.get("workflow_state"),
            },
        }
    except httpx.RequestError as e:
        return {"error": f"Could not reach Canvas: {str(e)}", "submission": None}


@mcp.tool()
async def create_announcement(
    course_id: int,
    subject: str,
    body: str,
) -> dict[str, Any]:
    """
    Post a public course announcement (discussion topic) on Canvas.

    Args:
        course_id: The Canvas course ID.
        subject: Announcement title.
        body: Announcement body HTML/text.
    """
    payload = {
        "title": subject,
        "message": body,
        "is_announcement": True,
        "published": True,
    }
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{_effective_canvas_api_url()}/courses/{course_id}/discussion_topics",
                headers=_canvas_headers(),
                json=payload,
                timeout=10.0,
            )
        if response.is_error:
            return {"error": f"Canvas API error: {response.status_code}", "sent": False}
        return {"success": True, "sent": True, "delivery_mode": "announcement", "subject": subject}
    except httpx.RequestError as e:
        return {"error": f"Could not reach Canvas: {str(e)}", "sent": False}


@mcp.tool()
async def send_message_to_students(
    course_id: int,
    subject: str,
    body: str,
    recipient_ids: list[int],
) -> dict[str, Any]:
    """
    Send a Canvas conversation message to a list of students.
    recipient_ids should be Canvas user IDs obtained from submission data.

    Args:
        course_id: The Canvas course ID (used for context).
        subject: Message subject line.
        body: Message body text.
        recipient_ids: List of Canvas user IDs to message.
    """
    payload = {
        "recipients": [str(uid) for uid in recipient_ids],
        "subject": subject,
        "body": body,
        "context_code": f"course_{course_id}",
        "group_conversation": False,
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{_effective_canvas_api_url()}/conversations",
                headers=_canvas_headers(),
                json=payload,
                timeout=10.0,
            )
        if response.is_error:
            return {"error": f"Canvas API error: {response.status_code}", "sent": False}

        return {
            "success": True,
            "sent": True,
            "recipient_count": len(recipient_ids),
            "subject": subject,
        }
    except httpx.RequestError as e:
        return {"error": f"Could not reach Canvas: {str(e)}", "sent": False}


# read-only tool to fetch recent audit log entries for a user.

@mcp.tool()
async def get_audit_logs(user_id: int, limit: int = 20) -> dict[str, Any]:
    """
    Retrieve recent audit log entries for a user.
    Read-only — MCP never writes to the audit log directly.
    The FastAPI backend writes audit entries; MCP only reads them.

    Args:
        user_id: The user whose audit logs to retrieve.
        limit: Maximum number of entries to return. Defaults to 20.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BACKEND_URL}/api/v1/audit/logs",
                params={"user_id": user_id, "limit": limit},
                timeout=5.0,
            )
        if response.is_error:
            return {"error": f"Backend error: {response.status_code}", "logs": []}
        return {"logs": response.json()}
    except httpx.RequestError as e:
        return {"error": str(e), "logs": []}


_TOOL_DISPATCH: dict[str, Callable[..., Awaitable[dict[str, Any]]]] = {
    "fetch_courses": fetch_courses,
    "fetch_assignments": fetch_assignments,
    "fetch_submissions": fetch_submissions,
    "fetch_missing_submissions": fetch_missing_submissions,
    "fetch_students": fetch_students,
    "fetch_quizzes": fetch_quizzes,
    "create_assignment": create_assignment,
    "update_assignment": update_assignment,
    "update_grade": update_grade,
    "create_announcement": create_announcement,
    "send_message_to_students": send_message_to_students,
    "get_audit_logs": get_audit_logs,
}


@mcp.custom_route("/tools/call", methods=["POST"])
async def tools_call(request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON body"}, status_code=400)

    if not isinstance(body, dict):
        return JSONResponse({"error": "Request body must be a JSON object"}, status_code=400)

    name = body.get("name")
    if not isinstance(name, str) or name not in ALLOWED_TOOLS:
        return JSONResponse({"error": f"Unsupported tool: {name!r}"}, status_code=400)

    arguments = body.get("arguments") or {}
    if not isinstance(arguments, dict):
        return JSONResponse({"error": "arguments must be an object"}, status_code=400)

    token = body.get("canvas_token")
    canvas_url = body.get("canvas_url")
    token_ctx = _request_canvas_token.set(token if isinstance(token, str) else None)
    url_ctx = _request_canvas_url.set(canvas_url if isinstance(canvas_url, str) else None)
    try:
        result = await _TOOL_DISPATCH[name](**arguments)
    except TypeError as exc:
        return JSONResponse({"error": f"Invalid arguments for {name}: {exc}"}, status_code=400)
    finally:
        _request_canvas_token.reset(token_ctx)
        _request_canvas_url.reset(url_ctx)

    return JSONResponse(result)


@mcp.custom_route("/health", methods=["GET"])
async def health(request: Request) -> JSONResponse:
    return JSONResponse({
        "status": "ok",
        "service": "canvas-mcp",
        "canvas_url": CANVAS_API_URL,
        "tools": sorted(ALLOWED_TOOLS),
    })


if __name__ == "__main__":
    app = mcp.streamable_http_app()
    uvicorn.run(app, host="0.0.0.0", port=MCP_PORT)
