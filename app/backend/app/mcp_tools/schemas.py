# app/backend/app/mcp_tools/schemas.py
from typing import Literal

from pydantic import BaseModel


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
    # basically if a user asks a related or a meta question on canvas or this chat's capabilities, it should generate some action plan
    # in json format that will guide the user towards available functions
    message: str

# Every action the LLM is allowed to request. Adding a new tool means
# adding one class above and one entry here
ACTION_SCHEMAS: dict[str, type[BaseModel]] = {
    "fetch_courses": FetchCoursesAction,
    "fetch_assignments": FetchAssignmentsAction,
    "fetch_submissions": FetchSubmissionsAction,
    "set_active_course": SetActiveCourseAction,
    "get_active_course": GetActiveCourseAction,
    "out_of_scope": OutOfScopeAction,
    "clarify": ClarifyAction,
    "intent_preview": IntentPreviewAction,
    "respond": RespondAction,
}
