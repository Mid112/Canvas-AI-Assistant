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
    # Both optional: the LLM should supply assignment_id directly only when
    # it already has a real Canvas assignment ID from earlier in this
    # conversation (e.g. a previous fetch_assignments/fetch_submissions
    # result). Otherwise it should leave this unset and describe which
    # assignment it means in assignment_reference instead — the app
    # resolves that server-side (see _run_fetch_submissions_chain in
    # services/chat.py), the same way course_name is resolved to
    # local_course_id, so the model never has to guess or invent a
    # numeric ID.
    assignment_id: int | None = None
    # The user's own words for which assignment they mean, e.g. "the latest
    # assignment", "Assignment 2", "the final project" — copied from the
    # user's message, not invented. Ignored once assignment_id is set.
    assignment_reference: str | None = None


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


class RecipientDirective(BaseModel):
    # The user's own words for ONE intended recipient, e.g. "Yerdana" —
    # never a numeric ID. Resolved server-side against the course roster
    # (and, as a fallback, submission records) the same way course_name and
    # assignment_reference are resolved, so the model never has to guess a
    # Canvas user ID.
    student_reference: str
    # The message meant for this recipient. Copy the shared body verbatim
    # across every directive that shares one message; use a distinct body
    # per directive only when the user actually asked for different text
    # for different people.
    body: str


class SendMessageAction(BaseModel):
    action: Literal["send_message"] = "send_message"
    local_course_id: int
    subject: str
    body: str
    # When omitted or empty (and recipient_directives/broadcast_to_all_students
    # are also unset), posts a public class announcement. When provided
    # directly, sends a Canvas conversation to the listed student Canvas user
    # IDs — only ever set this when those IDs are already known from earlier
    # in the conversation (e.g. a prior fetch_students/fetch_submissions
    # result), never guessed.
    recipient_canvas_user_ids: list[int] | None = None
    # Natural-language recipients, used when the user names specific people
    # but their Canvas IDs aren't already known. The app resolves each
    # student_reference to a real ID server-side and groups directives that
    # share identical body text into one message — never invent or guess a
    # numeric ID yourself. Ignored once recipient_canvas_user_ids is set.
    recipient_directives: list[RecipientDirective] | None = None
    # True when the user wants a private Canvas message sent to the entire
    # active roster (as opposed to a public announcement). The app resolves
    # the full roster server-side; never set recipient_canvas_user_ids
    # yourself to try to represent "everyone."
    broadcast_to_all_students: bool = False
    # True when the user wants BOTH a public announcement (using the
    # top-level subject/body) AND one or more targeted messages
    # (recipient_directives) sent in the same turn. Only meaningful
    # alongside recipient_directives or broadcast_to_all_students.
    also_announce_to_class: bool = False


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

# Every read-only Canvas action, derived from ACTION_CLASSIFICATION rather
# than hand-listed a second time. services/chat.py's handle_chat_message
# uses this to execute reads immediately on a normal turn instead of
# gating them behind intent_preview/confirm like every write action still
# is — a read can never mutate Canvas state, so there's nothing for the
# user to review before it runs.
READ_ACTIONS = frozenset(
    name for name, kind in ACTION_CLASSIFICATION.items() if kind == "read_only"
)
