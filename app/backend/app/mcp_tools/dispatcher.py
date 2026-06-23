# app/backend/app/mcp_tools/dispatcher.py
import json
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.user import User
from app.mcp_tools.schemas import ACTION_SCHEMAS
from app.services.canvas import (
    get_active_course,
    get_assignments,
    get_courses,
    get_submissions,
    set_active_course,
)

import re

def _extract_json(raw_llm_output: str) -> str:
    """Qwen3 and similar 'thinking' models wrap reasoning in <think>...</think>
    before the actual answer. Strip that block, then pull out the first
    {...} object found in what remains — handles both thinking-model output
    and any incidental prose/markdown fences around the JSON."""

    without_thinking = re.sub(r"<think>.*?</think>", "", raw_llm_output, flags=re.DOTALL)

    match = re.search(r"\{.*\}", without_thinking, re.DOTALL)
    if match:
        return match.group(0)

    return without_thinking.strip()





class ToolExecutionError(Exception):
    """Callers catch this and turn it into a user-facing message —
    the raw exception text is for logs, not for the chatbox."""

    def __init__(self, message: str, *, log_detail: str | None = None):
        super().__init__(message)
        self.user_message = message
        self.log_detail = log_detail or message


def parse_action(raw_llm_output: str) -> Any:
    """Step 1: the LLM's raw text must be valid JSON.
    Step 2: that JSON must have an 'action' field naming a known tool.
    Step 3: the rest of the JSON must validate against that tool's schema.
    Any failure raises ToolExecutionError with a message safe to show
    the user, plus a more detailed message for the audit log."""

    cleaned = _extract_json(raw_llm_output)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise ToolExecutionError(
            "The assistant's response could not be understood. Please try rephrasing.",
            log_detail=f"JSON parse error: {e}. Raw output: {raw_llm_output!r}",
        )

    if not isinstance(data, dict) or "action" not in data:
        raise ToolExecutionError(
            "The assistant's response was missing required information. Please try again.",
            log_detail=f"Missing 'action' field. Raw output: {raw_llm_output!r}",
        )

    action_name = data["action"]
    schema_cls = ACTION_SCHEMAS.get(action_name)
    if schema_cls is None:
        raise ToolExecutionError(
            "The assistant tried to perform an action that isn't supported.",
            log_detail=f"Unknown action '{action_name}'. Raw output: {raw_llm_output!r}",
        )

    try:
        return schema_cls.model_validate(data)
    except ValidationError as e:
        raise ToolExecutionError(
            "The assistant's response was missing required details. Please try rephrasing your request.",
            log_detail=f"Validation error for action '{action_name}': {e}. Raw output: {raw_llm_output!r}",
        )


async def _resolve_course(db: AsyncSession, user: User, local_course_id: int) -> Course:
    """Shared ownership check used by every action that takes a course ID.
    Centralizing this means the 'is this course actually yours' check
    can never be forgotten in a new tool."""
    course = await db.scalar(
        select(Course).where(Course.id == local_course_id, Course.instructor_id == user.id)
    )
    if not course:
        raise ToolExecutionError(
            "That course could not be found in your account.",
            log_detail=f"local_course_id={local_course_id} not found or not owned by user_id={user.id}",
        )
    return course


async def execute_tool(db: AsyncSession, user: User, action: Any) -> dict:
    """Dispatch on the validated action's type. Each branch calls straight
    into the existing services/canvas.py functions — no Canvas-calling
    logic is duplicated here, this function only resolves IDs and routes."""

    match action.action:
        case "fetch_courses":
            courses = await get_courses(user, course.canvas_url if (course := None) else _default_canvas_url(user), db)
            return {"courses": [c.model_dump() for c in courses]}

        case "fetch_assignments":
            course = await _resolve_course(db, user, action.local_course_id)
            assignments = await get_assignments(
                int(course.canvas_course_id), user, course.canvas_url
            )
            return {"assignments": [a.model_dump() for a in assignments]}

        case "fetch_submissions":
            course = await _resolve_course(db, user, action.local_course_id)
            submissions = await get_submissions(
                int(course.canvas_course_id), action.assignment_id, user, course.canvas_url
            )
            return {"submissions": [s.model_dump() for s in submissions]}

        case "set_active_course":
            result = await set_active_course(user, action.local_course_id, db)
            return {"active_course": result.model_dump()}

        case "get_active_course":
            result = await get_active_course(user, db)
            return {"active_course": result.model_dump() if result else None}

        case _:
            # unreachable given parse_action's validation, but keeps mypy/runtime honest
            raise ToolExecutionError(f"No handler implemented for action '{action.action}'.")


def _default_canvas_url(user: User) -> str:
    """fetch_courses doesn't take a course ID so it needs a canvas_url from the user's first
    connected Canvas school, for now. Once multi-school selection exists
    in the chat flow itself, this should take an explicit param instead."""
    if not user.canvas_connections:
        raise ToolExecutionError(
            "You haven't connected a Canvas account yet. Please connect one in Settings first.",
            log_detail=f"user_id={user.id} has no canvas_connections",
        )
    return user.canvas_connections[0].canvas_url