# app/backend/app/schemas/chat.py
from datetime import datetime

from pydantic import BaseModel


class ConfirmActionRequest(BaseModel):
    conversation_id: int
    pending_message_id: int


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
