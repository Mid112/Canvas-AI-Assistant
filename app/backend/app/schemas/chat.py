# app/backend/app/schemas/chat.py
from datetime import datetime

from pydantic import BaseModel

from app.models.conversation import Conversation


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
            preview=last_message.content[:160] if last_message else None,
            pending_action_count=len(pending_actions),
        )


class ConversationListResponse(BaseModel):
    items: list[ConversationSummary]
    total: int
