"""Router note: exposes HTTP endpoints for messages workflows while delegating business rules to services."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.inbox import (
    InboxReplyDraftRequest,
    InboxReplyDraftResponse,
    InboxReplyPreviewRequest,
    InboxReplyPreviewResponse,
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
from app.services.inbox import (
    get_inbox_thread,
    list_inbox_threads,
    reply_to_inbox_thread,
)
from app.services.inbox_reply_draft import (
    generate_inbox_reply_draft,
    preview_inbox_reply,
)
from app.services.messages import (
    create_message_draft,
    get_message_draft,
    list_message_drafts,
    send_message_draft,
    to_message_draft_response,
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
    return to_message_draft_response(draft)


@router.get("/drafts", response_model=list[MessageDraftResponse])
async def list_drafts(
    current_user: User = Depends(get_current_user),
    status_filter: str | None = Query(default=None, alias="status"),
    course_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """List the instructor's message drafts (use status=sent for Sent tab)."""
    drafts = await list_message_drafts(
        db,
        current_user,
        status_filter=status_filter,
        course_id=course_id,
    )
    return [to_message_draft_response(draft) for draft in drafts]


@router.get("/drafts/{draft_id}", response_model=MessageDraftResponse)
async def get_draft(
    draft_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    draft = await get_message_draft(db, current_user, draft_id)
    return to_message_draft_response(draft)


@router.patch("/drafts/{draft_id}", response_model=MessageDraftResponse)
async def update_draft(
    draft_id: int,
    body: MessageDraftUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    draft = await update_message_draft(db, current_user, draft_id, body)
    return to_message_draft_response(draft)


@router.post("/drafts/{draft_id}/send", response_model=MessageSendResponse)
async def send_draft(
    draft_id: int,
    current_user: User = Depends(get_current_user),
    canvas_url: str | None = Query(default=None),
    conversation_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    draft = await send_message_draft(
        db,
        current_user,
        draft_id,
        canvas_url,
        conversation_id=conversation_id,
    )
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
    canvas_url: str | None = Query(default=None),
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
    canvas_url: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    return await get_inbox_thread(
        conversation_id, current_user, canvas_url, db, local_course_id=course_id
    )


@router.post(
    "/inbox/{conversation_id}/generate-reply-draft",
    response_model=InboxReplyDraftResponse,
)
async def generate_inbox_reply_draft_endpoint(
    conversation_id: int,
    body: InboxReplyDraftRequest,
    current_user: User = Depends(get_current_user),
    course_id: int | None = Query(default=None),
    canvas_url: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    return await generate_inbox_reply_draft(
        conversation_id,
        body,
        current_user,
        canvas_url,
        db,
        local_course_id=course_id,
    )


@router.post(
    "/inbox/{conversation_id}/reply/preview",
    response_model=InboxReplyPreviewResponse,
)
async def preview_inbox_reply_endpoint(
    conversation_id: int,
    body: InboxReplyPreviewRequest,
    current_user: User = Depends(get_current_user),
    course_id: int | None = Query(default=None),
    canvas_url: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    return await preview_inbox_reply(
        conversation_id,
        body,
        current_user,
        canvas_url,
        db,
        local_course_id=course_id,
    )


@router.post("/inbox/{conversation_id}/reply", response_model=InboxThreadDetail)
async def reply_to_inbox_conversation(
    conversation_id: int,
    body: InboxReplyRequest,
    current_user: User = Depends(get_current_user),
    course_id: int | None = Query(default=None),
    canvas_url: str | None = Query(default=None),
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
