# app/backend/app/routers/chat.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.chat import (
    ChatRequest,
    ChatResponse,
    ConfirmActionRequest,
    ConversationListResponse,
    ConversationResponse,
    ConversationSummary,
    MessageResponse,
    ModifyActionRequest,
    WorkflowRenameRequest,
    WorkflowStatus,
    WorkflowTransitionRequest,
)
from app.schemas.deferred_assistant import (
    DeferredAssistantRequestListResponse,
    DeferredAssistantRequestResponse,
)
from app.services.chat import (
    get_conversation_with_messages,
    handle_cancelled_action,
    handle_chat_message,
    handle_confirmed_action,
    handle_modified_action,
    list_conversations,
)
from app.services.deferred_assistant import (
    cancel_deferred_request,
    get_deferred_request_for_resume,
    list_deferred_assistant_requests,
)
from app.services.workflow import pause_workflow, rename_workflow, resume_workflow

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


@router.post("/pause", response_model=WorkflowStatus)
async def pause_action(
    body: WorkflowTransitionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workflow = await pause_workflow(
        db,
        current_user,
        workflow_id=body.workflow_id,
        pending_message_id=body.pending_message_id,
        conversation_id=body.conversation_id,
    )
    return WorkflowStatus(
        workflow_id=workflow.id,
        status=workflow.status,
        action_name=workflow.action_name,
        result_message_id=workflow.result_message_id,
        display_name=workflow.display_name,
    )


@router.post("/resume", response_model=WorkflowStatus)
async def resume_action(
    body: WorkflowTransitionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workflow = await resume_workflow(
        db,
        current_user,
        workflow_id=body.workflow_id,
        pending_message_id=body.pending_message_id,
        conversation_id=body.conversation_id,
    )
    return WorkflowStatus(
        workflow_id=workflow.id,
        status=workflow.status,
        action_name=workflow.action_name,
        result_message_id=workflow.result_message_id,
        display_name=workflow.display_name,
    )


@router.post("/rename", response_model=WorkflowStatus)
async def rename_action(
    body: WorkflowRenameRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workflow = await rename_workflow(
        db,
        current_user,
        display_name=body.display_name,
        workflow_id=body.workflow_id,
        pending_message_id=body.pending_message_id,
        conversation_id=body.conversation_id,
    )
    return WorkflowStatus(
        workflow_id=workflow.id,
        status=workflow.status,
        action_name=workflow.action_name,
        result_message_id=workflow.result_message_id,
        display_name=workflow.display_name,
    )


@router.patch("/preview", response_model=ChatResponse)
async def modify_action_preview(
    body: ModifyActionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation, reply, is_error = await handle_modified_action(
        db,
        current_user,
        body.conversation_id,
        body.pending_message_id,
        body.changes,
    )
    return ChatResponse(
        conversation_id=conversation.id, reply=reply, is_error=is_error
    )


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
        body.model_settings.model_dump(exclude_none=True) if body.model_settings else None,
        body.deferred_request_id,
    )
    return ChatResponse(conversation_id=conversation.id, reply=reply, is_error=is_error)


@router.get("/deferred", response_model=DeferredAssistantRequestListResponse)
async def get_deferred_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = await list_deferred_assistant_requests(db, current_user)
    return DeferredAssistantRequestListResponse(
        items=[DeferredAssistantRequestResponse.model_validate(row) for row in rows],
    )


@router.post(
    "/deferred/{deferred_id}/resume",
    response_model=DeferredAssistantRequestResponse,
)
async def resume_deferred_request(
    deferred_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a queued request for replay without consuming it.

    The row stays ``deferred`` until ``POST /chat/`` succeeds with
    ``deferred_request_id``, so abandoned or failed resumes remain recoverable.
    """
    row = await get_deferred_request_for_resume(db, current_user, deferred_id)
    return DeferredAssistantRequestResponse.model_validate(row)


@router.post(
    "/deferred/{deferred_id}/cancel",
    response_model=DeferredAssistantRequestResponse,
)
async def cancel_deferred_assistant_request(
    deferred_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await cancel_deferred_request(db, current_user, deferred_id)
    await db.commit()
    return DeferredAssistantRequestResponse.model_validate(row)


@router.get("/conversations", response_model=ConversationListResponse)
async def get_conversations(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversations, total = await list_conversations(
        db,
        current_user,
        limit=limit,
        offset=offset,
    )
    return ConversationListResponse(
        items=[ConversationSummary.from_conversation(item) for item in conversations],
        total=total,
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation = await get_conversation_with_messages(db, current_user, conversation_id)
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    workflow_statuses = {
        workflow.preview_message_id: WorkflowStatus(
            workflow_id=workflow.id,
            status=workflow.status,
            action_name=workflow.action_name,
            result_message_id=workflow.result_message_id,
            display_name=workflow.display_name,
        )
        for workflow in conversation.workflows
        if workflow.preview_message_id is not None
    }
    return ConversationResponse(
        id=conversation.id,
        course_id=conversation.course_id,
        course_name=conversation.course_name,
        created_at=conversation.created_at,
        messages=[MessageResponse.model_validate(m) for m in conversation.messages],
        workflow_statuses=workflow_statuses,
    )
