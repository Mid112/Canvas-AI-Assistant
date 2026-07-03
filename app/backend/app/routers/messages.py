from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.messages import (
    MessageDraftCreate,
    MessageDraftResponse,
    MessageDraftUpdate,
    MessageSendResponse,
)
from app.services.messages import (
    create_message_draft,
    get_message_draft,
    send_message_draft,
    update_message_draft,
)

router = APIRouter(prefix="/messages", tags=["messages"])


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
    )
