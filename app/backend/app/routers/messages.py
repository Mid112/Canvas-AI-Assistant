from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.canvas import ConversationSummary, ConversationThreadResponse
from app.schemas.inbox import (
    InboxReplyRequest,
    InboxThreadDetail,
    InboxThreadList,
)
from app.schemas.messages import (
    MessageDraftCreate,
    MessageDraftResponse,
    MessageDraftUpdate,
    MessageSendResponse,
)
from app.services.canvas import get_conversation_thread, get_conversations
from app.services.inbox import (
    get_inbox_thread,
    list_inbox_threads,
    reply_to_inbox_thread,
)
from app.services.messages import (
    create_message_draft,
    get_message_draft,
    send_message_draft,
    update_message_draft,
)

router = APIRouter(prefix="/messages", tags=["messages"])


@router.get("/conversations", response_model=list[ConversationSummary])
async def list_conversations(
    local_course_id: int = Query(...),
    canvas_url: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_conversations(local_course_id, current_user, canvas_url, db)


@router.get("/conversations/{conversation_id}", response_model=ConversationThreadResponse)
async def get_conversation_thread_endpoint(
    conversation_id: int,
    local_course_id: int = Query(...),
    canvas_url: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_conversation_thread(local_course_id, conversation_id, current_user, canvas_url, db)


@router.post("/drafts", response_model=MessageDraftResponse, status_code=status.HTTP_201_CREATED)
async def create_draft(
    body: MessageDraftCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    draft = await create_message_draft(db, current_user, body)
    return MessageDraftResponse.model_validate(draft)


@router.get("/drafts/{draft_id}", response_model=MessageDraftResponse)
async def get_draft(
    draft_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    draft = await get_message_draft(db, current_user, draft_id)
    return MessageDraftResponse.model_validate(draft)


@router.patch("/drafts/{draft_id}", response_model=MessageDraftResponse)
async def update_draft(
    draft_id: int,
    body: MessageDraftUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    draft = await update_message_draft(db, current_user, draft_id, body)
    return MessageDraftResponse.model_validate(draft)


@router.post("/drafts/{draft_id}/send", response_model=MessageSendResponse)
async def send_draft(
    draft_id: int,
    current_user: User = Depends(get_current_user),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    draft = await send_message_draft(db, current_user, draft_id, canvas_url)
    return MessageSendResponse(
        draft_id=draft.id,
        status=draft.status,
        canvas_topic_id=getattr(draft, "canvas_topic_id", None),
        delivery_mode=getattr(draft, "delivery_mode", None),
        recipient_count=getattr(draft, "recipient_count", None),
    )


@router.get("/inbox", response_model=InboxThreadList)
async def list_inbox(
    current_user: User = Depends(get_current_user),
    course_id: int | None = Query(default=None),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    return await list_inbox_threads(
        current_user, canvas_url, db, local_course_id=course_id
    )


@router.get("/inbox/{conversation_id}", response_model=InboxThreadDetail)
async def get_inbox_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    course_id: int | None = Query(default=None),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    return await get_inbox_thread(
        conversation_id, current_user, canvas_url, db, local_course_id=course_id
    )


@router.post("/inbox/{conversation_id}/reply", response_model=InboxThreadDetail)
async def reply_to_inbox_conversation(
    conversation_id: int,
    body: InboxReplyRequest,
    current_user: User = Depends(get_current_user),
    course_id: int | None = Query(default=None),
    canvas_url: str = Query(default=settings.CANVAS_API_URL),
    db: AsyncSession = Depends(get_db),
):
    return await reply_to_inbox_thread(
        conversation_id,
        body.body,
        current_user,
        canvas_url,
        db,
        local_course_id=course_id,
    )
