# app/backend/app/mcp_tools/schemas.py
from collections.abc import Iterable
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, Field, field_validator


def _normalize_due_date_str(value: str) -> str:
    """Strip whitespace; instructor-timezone normalization happens at execution."""
    return value.strip()


SubmissionStatusFilter = Literal["missing", "late"]

# Canonical order, so the same request always produces the same handle kind
# and the same wording regardless of the order the model emitted the
# categories in ("late,missing" and "missing,late" are one query).
_STATUS_ORDER: tuple[SubmissionStatusFilter, ...] = ("missing", "late")


def normalize_status_filters(
    value: SubmissionStatusFilter | Iterable[SubmissionStatusFilter] | None,
) -> tuple[SubmissionStatusFilter, ...]:
    """One or more status categories, deduped and in canonical order.

    Normalized here at the trust boundary rather than at each use, so no call
    site can be the one that forgets and produces a differently-ordered slug.
    Accepts the bare string every existing prompt and caller still emits, so
    single-status behaviour is unchanged. An empty or unrecognized request
    falls back to "missing" rather than matching nothing — the schema's
    long-standing default.
    """
    if value is None:
        return ("missing",)
    requested = {value} if isinstance(value, str) else set(value)
    ordered = tuple(status for status in _STATUS_ORDER if status in requested)
    return ordered or ("missing",)


# The unit a score range is read in. Both spellings the model plausibly
# emits ("percent", "pts", "marks") collapse to one of two values here, at
# the trust boundary, so no downstream comparison has to know the synonyms.
# Anything unrecognized is passed through untouched for the Literal to
# reject — quietly mapping an unknown word to a default would turn a
# malformed request into a confidently wrong set of students.
_BASIS_SYNONYMS = {
    "percent": "percentage", "percentage": "percentage", "%": "percentage",
    "pct": "percentage", "percent_based": "percentage",
    "point": "points", "points": "points", "pts": "points", "pt": "points",
    "mark": "points", "marks": "points", "raw": "points", "points_based": "points",
}


def normalize_score_basis(value: object) -> object:
    if not isinstance(value, str):
        return value
    cleaned = value.strip().lower()
    if not cleaned:
        return None
    return _BASIS_SYNONYMS.get(cleaned, cleaned)


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
    #
    # Pass BOTH (["missing", "late"]) when the instructor asks about both at
    # once — they resolve to the union, and the reply says the group is a
    # combination. Emitting a single category for a request that named two
    # silently drops half the students, which is why a list is accepted.
    status: tuple[SubmissionStatusFilter, ...] = ("missing",)

    @field_validator("status", mode="before")
    @classmethod
    def _normalize_status(cls, value):
        return normalize_status_filters(value)


class ResolveScoreRangeAction(BaseModel):
    """Students whose score on one assignment falls in a band.

    Separate from ResolveMissingSubmissionsAction rather than another
    `status` category: that action's categories are about whether work
    arrived, this one is about how it was graded, and the two need different
    inputs (a band, and a decision about what the band's units are).
    """

    action: Literal["resolve_score_range"] = "resolve_score_range"
    local_course_id: int
    # Same convention as the other resolvers: only pass assignment_id when
    # it's already a real Canvas ID from earlier in this conversation,
    # otherwise describe the assignment and let the app resolve it.
    assignment_id: int | None = None
    assignment_reference: str | None = None
    # The band, inclusive at both ends. Copy the instructor's numbers as
    # they said them — do NOT convert between percent and points, that
    # decision is made server-side where points_possible is known (see
    # services/score_range.py). Order is normalized, so 90/70 is fine.
    min_score: float
    max_score: float
    # Set ONLY when the instructor named the unit outright ("70 percent",
    # "70 points", "70 marks"). Leave it null when they just said "between
    # 70 and 90" — the app then compares what each reading would select and
    # either resolves it or asks. Guessing here defeats that entirely: on an
    # assignment out of 200, the two readings pick opposite groups of
    # students.
    basis: Literal["percentage", "points"] | None = None

    @field_validator("basis", mode="before")
    @classmethod
    def _normalize_basis(cls, value):
        return normalize_score_basis(value)


class AnalyzeCourseSubmissionsAction(BaseModel):
    """Course-wide submission overview, across every assignment at once.

    Deliberately separate from ResolveMissingSubmissionsAction rather than
    making that action's assignment optional: widening it would let the
    model silently drop an assignment the instructor *did* name and answer
    a broader question than was asked. This action takes no assignment at
    all, so the two intents can't be confused.
    """

    action: Literal["analyze_course_submissions"] = "analyze_course_submissions"
    local_course_id: int
    # Same categories as resolve_missing_submissions — see
    # compute_submissions_by_status in services/resolved_set.py for exactly
    # what each one means, and pass both to get their union.
    status: tuple[SubmissionStatusFilter, ...] = ("missing",)

    @field_validator("status", mode="before")
    @classmethod
    def _normalize_status(cls, value):
        return normalize_status_filters(value)


class FindAssignmentsBySubmissionStatusAction(BaseModel):
    """Find published assignments matching an explicit submission state."""

    action: Literal["find_assignments_by_submission_status"] = (
        "find_assignments_by_submission_status"
    )
    local_course_id: int
    status: Literal[
        "any_submissions",
        "no_submissions",
        "missing_submissions",
        "late_submissions",
    ]


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
    # A handle from an earlier resolver turn in this conversation
    # (resolve_missing_submissions / resolve_score_range), used to grade or
    # give feedback to that whole set at once — "give everyone who scored
    # below 50 another attempt", "add 5 marks to everyone missing lab 4".
    # Copy the handle string verbatim from that result; never invent one, and
    # never rebuild the group out of the result's "sample" names, which is a
    # truncated preview rather than the full set.
    recipient_handle: str | None = None
    new_grade: str
    # `reason` is the deprecated spelling of this field. It stays accepted here
    # — and only here — because the model still occasionally emits it from
    # older prompt phrasings, and dropping an incoming value would silently
    # lose the instructor's feedback text. Everything downstream reads
    # `feedback`; there is no `.reason` attribute to fall back to.
    feedback: str | None = Field(
        default=None, validation_alias=AliasChoices("feedback", "reason")
    )

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


class SemanticIntentAction(BaseModel):
    """A language-facing intent envelope, kept separate from executable tools.

    The model may understand a request in this loose shape when the user's
    wording does not map cleanly to one of the strict Canvas actions. The
    chat service normalizes this envelope into an existing action before any
    dispatcher code runs. It deliberately has no Canvas/local IDs: those are
    resolved and injected by the server after course ownership checks.

    ``fields`` and ``criteria`` are untrusted language output. The semantic
    mapper only copies an explicit allowlist into a strict action, so this
    envelope cannot become an arbitrary tool call.
    """

    action: Literal["semantic_intent"] = "semantic_intent"
    intent: Literal[
        "read_courses",
        "read_assignments",
        "read_submissions",
        "read_students",
        "read_quizzes",
        "analyze_submissions",
        "find_missing_submissions",
        "find_score_range",
        "find_assignments_by_submission_status",
        "find_assignment_by_rate",
        "create_assignment",
        "create_quiz",
        "update_assignment",
        "update_grade",
        "send_message",
        "respond",
        "clarify",
        "unsupported",
    ]
    course_name: str | None = None
    assignment_reference: str | None = None
    student_reference: str | None = None
    delivery_mode: Literal["announcement", "private_message"] | None = None
    # Accepts a list ("missing and late") as well as a single category — this
    # is the path the prompt actually steers the model down, so it has to be
    # able to express the union or the combined request dies here instead of
    # reaching resolve_missing_submissions. None stays None (meaning "not
    # specified"), distinct from an explicit ["missing"].
    status: tuple[SubmissionStatusFilter, ...] | None = None

    @field_validator("status", mode="before")
    @classmethod
    def _normalize_status(cls, value):
        return None if value is None else normalize_status_filters(value)
    submission_status: Literal[
        "any_submissions",
        "no_submissions",
        "missing_submissions",
        "late_submissions",
    ] | None = None
    comparator: Literal["below", "above"] | None = None
    threshold_percent: float | None = None
    # Score band for find_score_range. Copy the instructor's numbers
    # verbatim and leave `basis` null unless they named the unit — see
    # ResolveScoreRangeAction for why converting here would be wrong.
    min_score: float | None = None
    max_score: float | None = None
    basis: Literal["percentage", "points"] | None = None

    @field_validator("basis", mode="before")
    @classmethod
    def _normalize_basis(cls, value):
        return normalize_score_basis(value)
    # Natural-language extraction only. Values are copied selectively by the
    # mapper; raw IDs and unknown keys are never trusted downstream.
    fields: dict[str, Any] = Field(default_factory=dict)
    criteria: dict[str, Any] = Field(default_factory=dict)
    message: str | None = None
    question: str | None = None
    partial_plan: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


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
    "resolve_score_range": ResolveScoreRangeAction,
    "analyze_course_submissions": AnalyzeCourseSubmissionsAction,
    "find_assignments_by_submission_status": FindAssignmentsBySubmissionStatusAction,
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
    "semantic_intent": SemanticIntentAction,
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
    "resolve_score_range": "read_only",
    "analyze_course_submissions": "read_only",
    "find_assignments_by_submission_status": "read_only",
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
