# Canvas MCP server implementation using FastMCP.
# Exposes tools for reading/writing Canvas data.

import os
import secrets
from contextvars import ContextVar
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

import httpx
import uvicorn
from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

# ── Config from environment ────────────────────────────────────────────────
CANVAS_API_URL = os.getenv("CANVAS_API_URL", "http://localhost:4000/api/v1")
CANVAS_API_TOKEN = os.getenv("CANVAS_API_TOKEN", "placeholder")
MCP_PORT = int(os.getenv("MCP_PORT", "8001"))
# Shared with the backend — /tools/call and /mcp reject callers without this secret.
MCP_SHARED_SECRET = os.getenv("MCP_SHARED_SECRET", "").strip()

_request_canvas_token: ContextVar[str | None] = ContextVar("canvas_token", default=None)
_request_canvas_url: ContextVar[str | None] = ContextVar("canvas_url", default=None)


def _allowed_canvas_hosts() -> set[str]:
    hosts: set[str] = set()
    for raw in (CANVAS_API_URL, *os.getenv("MCP_ALLOWED_CANVAS_HOSTS", "").split(",")):
        value = raw.strip()
        if not value:
            continue
        parsed = urlparse(value if "://" in value else f"https://{value}")
        host = (parsed.hostname or "").lower()
        if host:
            hosts.add(host)
    return hosts


def _canvas_url_allowed(canvas_url: str | None) -> bool:
    """Block SSRF via arbitrary canvas_url in /tools/call bodies."""
    if canvas_url is None or not str(canvas_url).strip():
        return True
    if not isinstance(canvas_url, str):
        return False
    parsed = urlparse(canvas_url if "://" in canvas_url else f"https://{canvas_url}")
    host = (parsed.hostname or "").lower()
    if not host:
        return False
    allowed = _allowed_canvas_hosts()
    return bool(allowed) and host in allowed


def _header_value(scope: Scope, name: str) -> str | None:
    target = name.lower().encode("latin-1")
    for key, value in scope.get("headers") or []:
        if key == target:
            return value.decode("latin-1").strip()
    return None


def _shared_secret_from_headers(authorization: str | None, x_secret: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    if isinstance(x_secret, str) and x_secret.strip():
        return x_secret.strip()
    return None


def _authorize_shared_secret(
    *,
    authorization: str | None,
    x_secret: str | None,
) -> JSONResponse | None:
    """Require MCP_SHARED_SECRET so MCP HTTP surfaces are not open proxies."""
    if not MCP_SHARED_SECRET:
        return JSONResponse(
            {"error": "MCP_SHARED_SECRET is not configured on the MCP server"},
            status_code=503,
        )
    provided = _shared_secret_from_headers(authorization, x_secret)
    if provided is None or not secrets.compare_digest(provided, MCP_SHARED_SECRET):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    return None


def _authorize_tools_call(request: Request) -> JSONResponse | None:
    return _authorize_shared_secret(
        authorization=request.headers.get("authorization"),
        x_secret=request.headers.get("x-mcp-shared-secret"),
    )


class SharedSecretASGIMiddleware:
    """Gate /mcp and /tools/call with the shared secret (pure ASGI — safe with SSE)."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path") or ""
        if path == "/health" or path.endswith("/health"):
            await self.app(scope, receive, send)
            return

        if path.startswith("/mcp") or path.startswith("/tools/call"):
            auth_error = _authorize_shared_secret(
                authorization=_header_value(scope, "authorization"),
                x_secret=_header_value(scope, "x-mcp-shared-secret"),
            )
            if auth_error is not None:
                await auth_error(scope, receive, send)
                return

        await self.app(scope, receive, send)


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
    points_possible: float | None = None,
    due_at: str | None = None,
    description: str | None = None,
    grading_type: str | None = None,
) -> dict[str, Any]:
    """
    Create a new assignment in Canvas for a given course.
    Always created as a draft (published: false) — the instructor must
    publish it manually after reviewing.

    Args:
        course_id: The Canvas course ID.
        name: Assignment name.
        points_possible: Maximum points for a graded assignment. Omit or null
            for ungraded (Ticket 21) — do not invent a default like 10.
        due_at: ISO 8601 due date string e.g. '2026-07-01T23:59:00Z'. Optional.
        description: Assignment description. Optional.
        grading_type: Canvas grading_type. Use 'not_graded' for ungraded
            assignments; defaults to 'points' when points_possible is set.
    """
    resolved_grading_type = grading_type
    if resolved_grading_type is None:
        resolved_grading_type = (
            "not_graded" if points_possible is None else "points"
        )

    assignment_body: dict[str, Any] = {
        "name": name,
        "published": False,
        "grading_type": resolved_grading_type,
    }
    if points_possible is not None:
        assignment_body["points_possible"] = points_possible
    if due_at:
        assignment_body["due_at"] = due_at
    if description:
        assignment_body["description"] = description

    payload: dict[str, Any] = {"assignment": assignment_body}

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
                "grading_type": created.get("grading_type", resolved_grading_type),
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


# Audit logs stay on the authenticated backend (/api/v1/audit/logs). The MCP
# sidecar previously exposed get_audit_logs without a backend token and with a
# misleading user_id query — removed rather than paper over confused auth.

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
}


@mcp.custom_route("/tools/call", methods=["POST"])
async def tools_call(request: Request) -> JSONResponse:
    auth_error = _authorize_tools_call(request)
    if auth_error is not None:
        return auth_error

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
    if not _canvas_url_allowed(canvas_url if isinstance(canvas_url, str) else None):
        return JSONResponse(
            {"error": "canvas_url host is not allowlisted"},
            status_code=400,
        )
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
    app = SharedSecretASGIMiddleware(mcp.streamable_http_app())
    uvicorn.run(app, host="0.0.0.0", port=MCP_PORT)
