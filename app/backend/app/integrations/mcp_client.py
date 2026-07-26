"""HTTP client for the optional Canvas MCP sidecar."""

from __future__ import annotations

from typing import Any

import httpx

from app.config import settings

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


class MCPClientError(Exception):
    """Raised when MCP is disabled, misconfigured, or unreachable."""


# Dispatcher actions that must go through MCP when MCP_ENABLED is true.
# Local DB-only actions (get/set active course) stay on backend services.
# create_quiz is intentionally excluded: classic/New Quizzes creation is a
# multi-step Canvas flow (quiz shell + questions / bank groups) that the MCP
# sidecar does not expose, so quiz writes always use create_course_quiz
# (direct Canvas) even when MCP is enabled — with the same idempotency and
# in-flight guards as other service-layer writes.
MCP_REQUIRED_ACTIONS = frozenset(
    {
        "fetch_courses",
        "fetch_assignments",
        "fetch_submissions",
        "fetch_students",
        "fetch_quizzes",
        "create_assignment",
        "update_assignment",
        "update_grade",
        "send_message",
    }
)


async def call_tool(
    name: str,
    arguments: dict[str, Any],
    *,
    canvas_token: str,
    canvas_url: str,
) -> dict[str, Any]:
    if not settings.MCP_ENABLED:
        raise MCPClientError("MCP integration is disabled.")
    if not settings.MCP_SERVER_URL.strip():
        raise MCPClientError("MCP_SERVER_URL is not configured.")
    if name not in ALLOWED_TOOLS:
        raise MCPClientError(f"Tool {name!r} is not allowed via MCP client.")

    if not settings.MCP_SHARED_SECRET.strip():
        raise MCPClientError("MCP_SHARED_SECRET is not configured.")

    url = f"{settings.MCP_SERVER_URL.rstrip('/')}/tools/call"
    payload = {
        "name": name,
        "arguments": arguments,
        "canvas_token": canvas_token,
        "canvas_url": canvas_url,
    }
    headers = {"Authorization": f"Bearer {settings.MCP_SHARED_SECRET.strip()}"}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload, headers=headers)
    except httpx.RequestError as exc:
        raise MCPClientError(f"MCP server unreachable: {exc}") from exc

    if response.is_error:
        detail = response.text.strip() or response.reason_phrase
        raise MCPClientError(f"MCP server error ({response.status_code}): {detail}")

    data = response.json()
    if not isinstance(data, dict):
        raise MCPClientError("MCP server returned a non-object response.")
    if data.get("error"):
        raise MCPClientError(str(data["error"]))
    return data
