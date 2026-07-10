# app/backend/app/schemas/chat.py
import json
from datetime import datetime

from pydantic import BaseModel

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

    suffix = "" if len(items) <= len(names) else f" + {len(items) - len(names)} more"
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
        if message.role == "user" and message.content.strip().startswith("["):
            continue

        preview = _parse_readable_preview(message.content)
        if preview:
            return preview

    return None


class ConfirmActionRequest(BaseModel):
    conversation_id: int
    pending_message_id: int


class ChatRequest(BaseModel):
    message: str
    # If omitted, the service falls back to the user's active course
    # (from user_preferences) or starts a course-less conversation.
    local_course_id: int | None = None
    # If omitted, a new conversation is started.
    conversation_id: int | None = None
    # If present, this chat turn is modifying a previous intent preview.
    # The content of that message gets overwritten in place rather than
    # a new message being appended, so conversation history stays clean
    # and the LLM sees only the latest agreed plan on the next turn.
    pending_message_id: int | None = None


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


class ConversationResponse(BaseModel):
    id: int
    course_id: int | None
    created_at: datetime
    messages: list[MessageResponse] = []

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
            workflow for workflow in conversation.workflows if workflow.status == "pending"
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
