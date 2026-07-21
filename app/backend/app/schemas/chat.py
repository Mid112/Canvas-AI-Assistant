# app/backend/app/schemas/chat.py
import json
from datetime import datetime

from pydantic import BaseModel, model_validator

from app.models.conversation import Conversation
from app.models.message import Message

CONVERSATION_PREVIEW_MAX_CHARS = 160


def _truncate_preview(value: str) -> str:
    normalized = " ".join(value.split())
    if len(normalized) <= CONVERSATION_PREVIEW_MAX_CHARS:
        return normalized
    return f"{normalized[: CONVERSATION_PREVIEW_MAX_CHARS - 1].rstrip()}…"


def _read_named_items(items: list[object], fallback_label: str) -> str:
    if not items:
        return f"No {fallback_label} found"

    names: list[str] = []
    for item in items[:3]:
        if isinstance(item, dict):
            name = item.get("name") or item.get("title") or item.get("course_code")
            if isinstance(name, str) and name.strip():
                names.append(name.strip())

    if not names:
        return f"{len(items)} {fallback_label} found"

    hidden_count = max(len(items) - 3, 0)
    suffix = "" if hidden_count == 0 else f" + {hidden_count} more"
    return f"{fallback_label.capitalize()}: {', '.join(names)}{suffix}"


def _humanize_action(action: str) -> str:
    return action.replace("_", " ").strip().capitalize()


def _parse_readable_preview(content: str) -> str | None:
    stripped = content.strip()
    if not stripped:
        return None

    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError:
        return _truncate_preview(stripped)

    if isinstance(parsed, str):
        return _truncate_preview(parsed)

    if isinstance(parsed, list):
        return _truncate_preview(f"{len(parsed)} results")

    if not isinstance(parsed, dict):
        return None

    for key in ("summary", "message", "question", "error", "detail"):
        value = parsed.get(key)
        if isinstance(value, str) and value.strip():
            return _truncate_preview(value)

    for key, label in (
        ("courses", "courses"),
        ("assignments", "assignments"),
        ("students", "students"),
        ("submissions", "submissions"),
    ):
        value = parsed.get(key)
        if isinstance(value, list):
            return _truncate_preview(_read_named_items(value, label))

    action = parsed.get("action")
    if isinstance(action, str) and action.strip():
        return _truncate_preview(_humanize_action(action))

    if parsed.get("intent_preview"):
        return "Action preview"

    return None


def _conversation_preview(messages: list[Message]) -> str | None:
    for message in reversed(messages):
        stripped = message.content.strip()
        if message.role == "user" and stripped in {
            "[confirmed action]",
            "[cancelled action]",
        }:
            continue
        if message.role == "assistant" and stripped.startswith(
            (
                "Groq rate limit hit",
                "HTTPException ",
                "LLM API error:",
                "LLM request failed:",
                "LLM request timed out",
            )
        ):
            continue

        preview = _parse_readable_preview(stripped)
        if preview:
            return preview

    return None


class ConfirmActionRequest(BaseModel):
    conversation_id: int
    pending_message_id: int


class ModelSettings(BaseModel):
    """Instructor preference. Credentials are resolved server-side only."""

    provider: str
    model: str | None = None
    # Accepted for backwards compatibility with older clients, but ignored:
    # base URLs and API keys always come from server config / stored connections.
    base_url: str | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_client_credentials(cls, data: object) -> object:
        if isinstance(data, dict) and data.get("api_key"):
            raise ValueError(
                "Client-supplied API keys are not accepted. "
                "Connect providers in Settings instead."
            )
        return data


class ChatRequest(BaseModel):
    message: str
    # Explicit course switch from the "set active course" button. If
    # omitted, a conversation that already has a course keeps it; a
    # course-less conversation falls back to the user's persisted
    # active-course preference and only then, if still unset, to the LLM
    # naming one from the user's message (see services/chat.py's COURSE
    # RESOLUTION system-prompt section) — the model itself never sees or
    # produces a course ID either way.
    local_course_id: int | None = None
    # If omitted, a new conversation is started.
    conversation_id: int | None = None
    # If present, this chat turn is modifying a previous intent preview.
    # The content of that message gets overwritten in place rather than
    # a new message being appended, so conversation history stays clean
    # and the LLM sees only the latest agreed plan on the next turn.
    pending_message_id: int | None = None
    # The backend accepts a provider/model preference but resolves credentials
    # server-side. Client base URLs and API keys are never honored directly.
    model_settings: ModelSettings | None = None


class ChatResponse(BaseModel):
    conversation_id: int
    reply: dict
    # True when the assistant call failed (timeout, bad LLM output, etc.)
    # and `reply` is an error payload rather than tool output.
    is_error: bool = False


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime
    pending_action_status: str | None = None

    model_config = {"from_attributes": True}


class WorkflowStatus(BaseModel):
    """Authoritative preview lifecycle state for one Workflow row, keyed
    by preview_message_id on ConversationResponse. Lets a preview card
    render its real pending/executing/executed/failed/cancelled/superseded
    status directly, instead of the frontend reconstructing it from
    transcript marker text ("[confirmed action]"/"[cancelled action]")
    and FIFO-guessing which pending preview a marker belongs to — a guess
    that silently mislabels cards once more than one preview exists in a
    conversation or they're resolved out of order."""

    workflow_id: int
    status: str
    action_name: str
    result_message_id: int | None = None

    model_config = {"from_attributes": True}


class ConversationResponse(BaseModel):
    id: int
    course_id: int | None
    course_name: str | None = None
    created_at: datetime
    messages: list[MessageResponse] = []
    workflow_statuses: dict[int, WorkflowStatus] = {}

    model_config = {"from_attributes": True}

    @classmethod
    def from_conversation(cls, conversation: Conversation) -> "ConversationResponse":
        statuses_by_message_id = {
            workflow.preview_message_id: workflow.status
            for workflow in conversation.workflows
        }

        return cls(
            id=conversation.id,
            course_id=conversation.course_id,
            created_at=conversation.created_at,
            messages=[
                MessageResponse(
                    id=message.id,
                    role=message.role,
                    content=message.content,
                    created_at=message.created_at,
                    pending_action_status=statuses_by_message_id.get(message.id),
                )
                for message in conversation.messages
            ],
        )


class ConversationSummary(BaseModel):
    id: int
    course_id: int | None
    created_at: datetime
    updated_at: datetime
    message_count: int
    preview: str | None = None
    pending_action_count: int = 0

    @classmethod
    def from_conversation(cls, conversation: Conversation) -> "ConversationSummary":
        messages = list(conversation.messages)
        last_message = messages[-1] if messages else None
        pending_actions = [
            workflow
            for workflow in conversation.workflows
            if workflow.status in {"pending", "executing"}
        ]

        return cls(
            id=conversation.id,
            course_id=conversation.course_id,
            created_at=conversation.created_at,
            updated_at=last_message.created_at if last_message else conversation.created_at,
            message_count=len(messages),
            preview=_conversation_preview(messages),
            pending_action_count=len(pending_actions),
        )


class ConversationListResponse(BaseModel):
    items: list[ConversationSummary]
    total: int
