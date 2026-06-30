# app/backend/app/schemas/chat.py
from datetime import datetime

from pydantic import BaseModel


class ConfirmActionRequest(BaseModel):
    conversation_id: int
    proposed_action: dict
    
class ChatRequest(BaseModel):
    message: str
    # If omitted, the service falls back to the user's active course
    # (from user_preferences) or starts a course-less conversation.
    local_course_id: int | None = None
    # If omitted, a new conversation is started.
    conversation_id: int | None = None


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
