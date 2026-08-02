# app/backend/app/mcp_tools/schemas.py
import re
from typing import Literal

from dateutil import parser as date_parser
from pydantic import BaseModel, Field, field_validator

# Numeric slash/dash dates like 07/08/2026 are ambiguous (MDY vs DMY).
# Leave them untouched so downstream validation asks for an ISO date.
_AMBIGUOUS_NUMERIC_DATE = re.compile(r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$")


def _normalize_due_date_str(value: str) -> str:
    """The LLM sometimes emits natural-language dates (e.g. "July 30
    2026") instead of ISO 8601. Normalize anything dateutil can parse
    to ISO so validate_assignment_for_create/_update's fromisoformat
    check succeeds; leave unparseable or ambiguous input as-is so that
    check still produces a clean user-facing error instead of this one."""
    raw = value.strip() if isinstance(value, str) else value
    if isinstance(raw, str) and _AMBIGUOUS_NUMERIC_DATE.match(raw):
        return value
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


class ResolveMissingSubmissionsAction(BaseModel):
    action: Literal["resolve_missing_submissions"] = "resolve_missing_submissions"
    local_course_id: int
    # Same convention as FetchSubmissionsAction: pass assignment_id directly
    # only when it's already a real Canvas ID from earlier in this
    # conversation, otherwise describe the assignment in assignment_reference
    # and let the app resolve it server-side (see
    # _run_resolve_missing_submissions_chain in services/chat.py).
    assignment_id: int | None = None
    assignment_reference: str | None = None
    # "missing" (default): students who have not submitted at all.
    # "late": students who DID submit, but after the due date — a
    # separate, mutually exclusive category from "missing". See
    # compute_submissions_by_status in services/resolved_set.py for the
    # exact definitions.
    status: Literal["missing", "late"] = "missing"


class FindAssignmentBySubmissionRateAction(BaseModel):
    action: Literal["find_assignment_by_submission_rate"] = "find_assignment_by_submission_rate"
    local_course_id: int
    # "below" for "fewer than X% submitted", "above" for "more than X%".
    comparator: Literal["below", "above"] = "below"
    # e.g. 30 for "30%" — never a fraction like 0.3.
    threshold_percent: float


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


class QuizQuestionSpec(BaseModel):
    question_text: str
    question_type: Literal[
        "multiple_choice_question",
        "true_false_question",
        "short_answer_question",
        "essay_question",
    ] = "essay_question"
    # Canvas allows any positive points value — do not cap at 1 (Ticket 14).
    points_possible: float = Field(default=1.0, gt=0)
    answers: list[dict] | None = None


class QuizQuestionBankGroupSpec(BaseModel):
    bank_id: int
    bank_name: str | None = None
    pick_count: int
    question_points: float = Field(gt=0)


class CreateQuizAction(BaseModel):
    action: Literal["create_quiz"] = "create_quiz"
    local_course_id: int
    title: str
    description: str = Field(min_length=20)
    due_date: str
    points_possible: float | None = None
    allowed_attempts: int | None = 1
    time_limit: int | None = None
    quiz_engine: Literal["classic", "new_quizzes"] = "classic"
    questions: list[QuizQuestionSpec] | None = None
    question_bank_groups: list[QuizQuestionBankGroupSpec] | None = None

    @field_validator("due_date")
    @classmethod
    def _normalize_due_date(cls, value: str) -> str:
        return _normalize_due_date_str(value)


class FetchQuizzesAction(BaseModel):
    action: Literal["fetch_quizzes"] = "fetch_quizzes"
    local_course_id: int


class UpdateAssignmentAction(BaseModel):
    action: Literal["update_assignment"] = "update_assignment"
    local_course_id: int
    # Canvas assignment ID — same convention as FetchSubmissionsAction.assignment_id,
    # NOT the local Assignment.id. Every function this reuses (get_assignment,
    # update_course_assignment) already takes the Canvas ID, and the LLM already
    # sees this value as "id" in fetch_assignments/fetch_submissions results.
    # Pass this directly only when it's already known from earlier in this
    # conversation; otherwise leave it unset and use assignment_reference
    # instead — the app resolves it server-side (see
    # _run_update_assignment_chain in services/chat.py) before ever
    # building a preview, the same way fetch_submissions resolves a
    # natural-language reference, never guessed.
    assignment_id: int | None = None
    # The user's own words for which assignment they mean, e.g. "the final
    # exam", "assignment 1" — copied verbatim, never invented. Ignored once
    # assignment_id is set.
    assignment_reference: str | None = None
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


class UpdateGradeAction(BaseModel):
    action: Literal["update_grade"] = "update_grade"
    local_course_id: int
    assignment_id: int | None = None
    assignment_reference: str | None = None
    student_id: int | None = None
    student_reference: str | None = None
    new_grade: str
    feedback: str | None = None
    reason: str | None = None

    @field_validator("new_grade", mode="before")
    @classmethod
    def _normalize_grade(cls, value: object) -> str:
        return str(value).strip()


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
    # Subject and body are optional so the LLM can emit a send_message with
    # just a recipient_handle (e.g. from a resolve_missing_submissions turn)
    # and let the user fill in subject/body in the Messages compose form
    # handoff. When the user provides them in the original prompt, the LLM
    # should include them; when omitted, the form handoff handles it (#1310).
    subject: str = ""
    body: str = ""
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
    # A handle from an earlier resolve_missing_submissions result in this
    # conversation, representing a bulk, already-computed recipient set —
    # copy it verbatim, exactly as given, never invent one and never build
    # recipient_directives out of that result's "sample" names instead
    # (sample is a preview excerpt, not the full set). The app materializes
    # the real recipients server-side, scoped to this conversation. Ignored
    # once recipient_canvas_user_ids is set.
    recipient_handle: str | None = None
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
    "fetch_quizzes": FetchQuizzesAction,
    "resolve_missing_submissions": ResolveMissingSubmissionsAction,
    "find_assignment_by_submission_rate": FindAssignmentBySubmissionRateAction,
    "set_active_course": SetActiveCourseAction,
    "get_active_course": GetActiveCourseAction,
    "create_assignment": CreateAssignmentAction,
    "create_quiz": CreateQuizAction,
    "update_assignment": UpdateAssignmentAction,
    "update_grade": UpdateGradeAction,
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
    "fetch_quizzes": "read_only",
    "resolve_missing_submissions": "read_only",
    "find_assignment_by_submission_rate": "read_only",
    "get_active_course": "read_only",
    # Writes a local UserPreference row only — no Canvas footprint, and not
    # gated by the preview/confirm flow at all (not in dispatcher.py's
    # write_actions set, executes immediately). Classified here purely for
    # #863-865 metadata completeness, not because it goes through preview/confirm.
    "set_active_course": "modifying",
    "create_assignment": "modifying",
    "create_quiz": "modifying",
    "update_assignment": "modifying",
    # Grade changes have history, but no automated undo path yet. Classify them
    # as irreversible so safety-facing UI does not imply rollback support.
    "update_grade": "irreversible",
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
UNDOABLE_ACTIONS = frozenset({"update_assignment", "create_assignment", "create_quiz"})


def is_undoable(action_name: str) -> bool:
    return action_name in UNDOABLE_ACTIONS


def get_risk_level(action: str) -> Literal["low", "medium", "high"]:
    """Maps ACTION_CLASSIFICATION into a UI-facing risk indicator."""
    kind = ACTION_CLASSIFICATION.get(action)
    if kind == "read_only":
        return "low"
    if kind == "irreversible":
        return "high"
    return "medium"


# Canvas-mutating actions that must never execute except via the
# intent_preview -> confirm flow. This is the single source of truth for
# that gate: dispatcher.py's intent_preview case uses it to decide which
# proposed actions need write-preview metadata, and services/chat.py's
# handle_chat_message uses it to refuse to execute one of these directly
# on a normal (unconfirmed) turn — even if the LLM skipped intent_preview
# and named the write action outright. set_active_course is deliberately
# excluded: it only writes a local UserPreference row, has no Canvas
# footprint, and always executes immediately regardless of provider.
WRITE_ACTIONS = frozenset(
    {"create_assignment", "create_quiz", "update_assignment", "send_message", "update_grade"}
)

# Every read-only Canvas action, derived from ACTION_CLASSIFICATION rather
# than hand-listed a second time. services/chat.py's handle_chat_message
# uses this to execute reads immediately on a normal turn instead of
# gating them behind intent_preview/confirm like every write action still
# is — a read can never mutate Canvas state, so there's nothing for the
# user to review before it runs.
READ_ACTIONS = frozenset(
    name for name, kind in ACTION_CLASSIFICATION.items() if kind == "read_only"
)
