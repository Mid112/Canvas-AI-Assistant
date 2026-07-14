# app/backend/app/mcp_tools/schemas.py
from typing import Literal

from dateutil import parser as date_parser
from pydantic import BaseModel, field_validator


def _normalize_due_date_str(value: str) -> str:
    """The LLM sometimes emits natural-language dates (e.g. "July 30
    2026") instead of ISO 8601. Normalize anything dateutil can parse
    to ISO so validate_assignment_for_create/_update's fromisoformat
    check succeeds; leave unparseable input as-is so that check still
    produces a clean user-facing error instead of this one."""
    try:
        return date_parser.parse(value).isoformat()
    except (date_parser.ParserError, ValueError, OverflowError, TypeError):
        return value


class FetchCoursesAction(BaseModel):
    action: Literal["fetch_courses"] = "fetch_courses"


class FetchAssignmentsAction(BaseModel):
    action: Literal["fetch_assignments"] = "fetch_assignments"
    local_course_id: int


class FetchSubmissionsAction(BaseModel):
    action: Literal["fetch_submissions"] = "fetch_submissions"
    local_course_id: int
    assignment_id: int


class FetchStudentsAction(BaseModel):
    action: Literal["fetch_students"] = "fetch_students"
    local_course_id: int


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
        return _normalize_due_date_str(value)


class UpdateAssignmentAction(BaseModel):
    action: Literal["update_assignment"] = "update_assignment"
    local_course_id: int
    # Canvas assignment ID — same convention as FetchSubmissionsAction.assignment_id,
    # NOT the local Assignment.id. Every function this reuses (get_assignment,
    # update_course_assignment) already takes the Canvas ID, and the LLM already
    # sees this value as "id" in fetch_assignments/fetch_submissions results.
    assignment_id: int
    # All optional — natural-language updates are almost always partial
    # (e.g. "push the due date back a week"). None means "leave unchanged";
    # the dispatcher merges omitted fields in from the current Canvas state.
    title: str | None = None
    description: str | None = None
    due_date: str | None = None
    points_possible: float | None = None

    @field_validator("due_date")
    @classmethod
    def _normalize_due_date(cls, value: str | None) -> str | None:
        return value if value is None else _normalize_due_date_str(value)


class SendMessageAction(BaseModel):
    action: Literal["send_message"] = "send_message"
    local_course_id: int
    subject: str
    body: str
    # When omitted or empty, posts a public class announcement. When provided,
    # sends a Canvas conversation to the listed student Canvas user IDs.
    recipient_canvas_user_ids: list[int] | None = None


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
    "fetch_students": FetchStudentsAction,
    "set_active_course": SetActiveCourseAction,
    "get_active_course": GetActiveCourseAction,
    "create_assignment": CreateAssignmentAction,
    "update_assignment": UpdateAssignmentAction,
    "send_message": SendMessageAction,
    "out_of_scope": OutOfScopeAction,
    "clarify": ClarifyAction,
    "intent_preview": IntentPreviewAction,
    "respond": RespondAction,
}


ActionClassification = Literal["read_only", "modifying", "irreversible"]

# Classifies every Canvas-touching action (conversational/meta actions like
# out_of_scope/clarify/intent_preview/respond are intentionally absent —
# they're not Canvas operations). "modifying" covers every reversible
# write, both creating new resources (create_assignment) and updating
# existing ones (update_assignment, set_active_course, update_grade) —
# there's no separate "creating" bucket. "irreversible" is only actions
# that can never be undone once submitted (send_message — posts a public
# announcement that can't be un-sent).
ACTION_CLASSIFICATION: dict[str, ActionClassification] = {
    "fetch_courses": "read_only",
    "fetch_assignments": "read_only",
    "fetch_submissions": "read_only",
    "fetch_students": "read_only",
    "get_active_course": "read_only",
    # Writes a local UserPreference row only — no Canvas footprint, and not
    # gated by the preview/confirm flow at all (not in dispatcher.py's
    # write_actions set, executes immediately). Classified here purely for
    # #863-865 metadata completeness, not because it goes through preview/confirm.
    "set_active_course": "modifying",
    "create_assignment": "modifying",
    "update_assignment": "modifying",
    # Dangling pre-existing action: previewable (write_preview.py has a
    # builder for it) but never confirmable (no schema in ACTION_SCHEMAS,
    # no execute case in dispatcher.py). Classified for consistency, not
    # newly wired up here.
    "update_grade": "modifying",
    "send_message": "irreversible",
}


def is_reversible(action: str) -> bool:
    """Fail-closed on unrecognized actions — this drives safety-facing
    "can this be undone" messaging, so an unknown action should never be
    silently treated as reversible."""
    return ACTION_CLASSIFICATION.get(action) in ("read_only", "modifying")


# Actions with a working undo path (see services/workflow.py::undo_workflow):
# update_assignment re-applies the pre-write state; create_assignment deletes
# the assignment that was created (there's no "prior state" to re-apply — it
# didn't exist before). send_message is excluded since it's classified
# "irreversible" above (a sent Canvas announcement/message can't be un-sent),
# and is deliberately not extended to a standalone user-facing "delete
# assignment" action — delete_course_assignment exists only for undo to call.
UNDOABLE_ACTIONS = frozenset({"update_assignment", "create_assignment"})


def is_undoable(action_name: str) -> bool:
    return action_name in UNDOABLE_ACTIONS


# Canvas-mutating actions that must never execute except via the
# intent_preview -> confirm flow. This is the single source of truth for
# that gate: dispatcher.py's intent_preview case uses it to decide which
# proposed actions need write-preview metadata, and services/chat.py's
# handle_chat_message uses it to refuse to execute one of these directly
# on a normal (unconfirmed) turn — even if the LLM skipped intent_preview
# and named the write action outright. set_active_course is deliberately
# excluded: it only writes a local UserPreference row, has no Canvas
# footprint, and always executes immediately regardless of provider.
WRITE_ACTIONS = frozenset({"create_assignment", "update_assignment", "send_message", "update_grade"})
