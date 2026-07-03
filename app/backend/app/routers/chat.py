# app/backend/app/routers/chat.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.chat import ChatRequest, ChatResponse, ConfirmActionRequest, ConversationResponse
from app.services.chat import (
    get_conversation_with_messages,
    handle_cancelled_action,
    handle_chat_message,
    handle_confirmed_action,
)

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/confirm", response_model=ChatResponse)
async def confirm_action(
    body: ConfirmActionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation, reply, is_error = await handle_confirmed_action(
        db, current_user, body.conversation_id, body.pending_message_id
    )
    return ChatResponse(conversation_id=conversation.id, reply=reply, is_error=is_error)


@router.post("/cancel", response_model=ChatResponse)
async def cancel_action(
    body: ConfirmActionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation, reply, is_error = await handle_cancelled_action(
        db, current_user, body.conversation_id, body.pending_message_id
    )
    return ChatResponse(conversation_id=conversation.id, reply=reply, is_error=is_error)




@router.post("/", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation, reply, is_error = await handle_chat_message(
        db,
        current_user,
        body.message,
        body.local_course_id,
        body.conversation_id,
        body.pending_message_id,
    )
    return ChatResponse(conversation_id=conversation.id, reply=reply, is_error=is_error)


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation = await get_conversation_with_messages(db, current_user, conversation_id)
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    return conversation
