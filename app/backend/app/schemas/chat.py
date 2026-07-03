# app/backend/app/schemas/chat.py
from datetime import datetime

from pydantic import BaseModel


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

    model_config = {"from_attributes": True}


class ConversationResponse(BaseModel):
    id: int
    course_id: int | None
    created_at: datetime
    messages: list[MessageResponse] = []

    model_config = {"from_attributes": True}