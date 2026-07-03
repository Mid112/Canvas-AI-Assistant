# app/backend/app/mcp_tools/schemas.py
from typing import Literal

from dateutil import parser as date_parser
from pydantic import BaseModel, field_validator


class FetchCoursesAction(BaseModel):
    action: Literal["fetch_courses"] = "fetch_courses"


class FetchAssignmentsAction(BaseModel):
    action: Literal["fetch_assignments"] = "fetch_assignments"
    local_course_id: int


class FetchSubmissionsAction(BaseModel):
    action: Literal["fetch_submissions"] = "fetch_submissions"
    local_course_id: int
    assignment_id: int


class SetActiveCourseAction(BaseModel):
    action: Literal["set_active_course"] = "set_active_course"
    local_course_id: int


class GetActiveCourseAction(BaseModel):
    action: Literal["get_active_course"] = "get_active_course"


class CreateAssignmentAction(BaseModel):
    action: Literal["create_assignment"] = "create_assignment"
    # local DB course ID — dispatcher resolves canvas_course_id and
    # canvas_url from this, so the LLM never has to know either value
    local_course_id: int
    title: str
    description: str
    # ISO 8601 string, e.g. "2026-09-01T23:59:00" — validated by
    # validate_assignment_for_create before any Canvas call is made
    due_date: str
    points_possible: float | None = None

    @field_validator("due_date")
    @classmethod
    def _normalize_due_date(cls, value: str) -> str:
        """The LLM sometimes emits natural-language dates (e.g. "July 30
        2026") instead of ISO 8601. Normalize anything dateutil can parse
        to ISO so validate_assignment_for_create's fromisoformat check
        succeeds; leave unparseable input as-is so that check still
        produces a clean user-facing error instead of this one."""
        try:
            return date_parser.parse(value).isoformat()
        except (date_parser.ParserError, ValueError, OverflowError, TypeError):
            return value


class OutOfScopeAction(BaseModel):
    action: Literal["out_of_scope"] = "out_of_scope"
    # to filter out completely unrelated topics from starting and potentially diluting the chat
    message: str


class ClarifyAction(BaseModel):
    action: Literal["clarify"] = "clarify"
    # the question the LLM wants to ask the user before proceeding
    question: str
    # whatever the LLM could figure out so far — stored in the messages
    # table so the next turn can pick up where this one left off without
    # the user having to repeat themselves
    partial_plan: dict


class IntentPreviewAction(BaseModel):
    action: Literal["intent_preview"] = "intent_preview"
    # Regular summary shown to the user before anything executes,
    # for example, "I will fetch all assignments for cosc 501 due this week"
    # this is in regular english because it will be used during the testing before the intent UI is developed
    summary: str
    # the actual structured action that will run after the user sees this, and this will go into intent UI/preview page
    proposed_action: dict


class RespondAction(BaseModel):
    action: Literal["respond"] = "respond"
    # for meta/related questions about Canvas or this assistant's own
    # capabilities and guides the user toward what they can actually ask
    message: str


# Every action the LLM is allowed to request. Adding a new tool means
# adding one class above and one entry here — nothing else in the
# dispatcher or schema-generation step needs to change.
ACTION_SCHEMAS: dict[str, type[BaseModel]] = {
    "fetch_courses": FetchCoursesAction,
    "fetch_assignments": FetchAssignmentsAction,
    "fetch_submissions": FetchSubmissionsAction,
    "set_active_course": SetActiveCourseAction,
    "get_active_course": GetActiveCourseAction,
    "create_assignment": CreateAssignmentAction,
    "out_of_scope": OutOfScopeAction,
    "clarify": ClarifyAction,
    "intent_preview": IntentPreviewAction,
    "respond": RespondAction,
}
