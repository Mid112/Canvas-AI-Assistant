"""Router note: exposes HTTP endpoints for message templates workflows while delegating business rules to services."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.message_template import (
    MessageTemplateCreate,
    MessageTemplateResponse,
    MessageTemplateUpdate,
)
from app.services.message_template import (
    create_message_template,
    delete_message_template,
    get_message_template,
    list_message_templates,
    update_message_template,
)

router = APIRouter(prefix="/message-templates", tags=["message-templates"])


@router.get("/", response_model=list[MessageTemplateResponse])
async def list_templates(
    course_id: int | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Returns templates for the active user, optionally filtered to one course.
    return await list_message_templates(db, current_user, course_id)


@router.post("/", response_model=MessageTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    body: MessageTemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Creates a new template owned by the authenticated user.
    return await create_message_template(db, current_user, body)


@router.get("/{template_id}", response_model=MessageTemplateResponse)
async def get_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Fetches one template after ownership checks.
    return await get_message_template(db, current_user, template_id)


@router.patch("/{template_id}", response_model=MessageTemplateResponse)
async def update_template(
    template_id: int,
    body: MessageTemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Updates the template fields that the caller is allowed to edit.
    return await update_message_template(db, current_user, template_id, body)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Deletes the template and returns no response body.
    await delete_message_template(db, current_user, template_id)
