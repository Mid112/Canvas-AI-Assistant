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


# Every action the LLM is allowed to request. Adding a new tool means
# adding one class above and one entry here
ACTION_SCHEMAS: dict[str, type[BaseModel]] = {
    "fetch_courses": FetchCoursesAction,
    "fetch_assignments": FetchAssignmentsAction,
    "fetch_submissions": FetchSubmissionsAction,
    "set_active_course": SetActiveCourseAction,
    "get_active_course": GetActiveCourseAction,
}
