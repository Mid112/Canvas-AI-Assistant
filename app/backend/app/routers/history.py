from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.history import WorkflowHistoryItem, WorkflowHistoryResponse
from app.services.workflow import cancel_workflow, list_workflow_history, undo_workflow

router = APIRouter(tags=["history"])


async def _workflow_history_response(
    limit: int,
    offset: int,
    current_user: User,
    db: AsyncSession,
) -> WorkflowHistoryResponse:
    items, total = await list_workflow_history(db, current_user, limit=limit, offset=offset)
    return WorkflowHistoryResponse(
        items=[WorkflowHistoryItem.from_workflow(i) for i in items],
        total=total,
    )


@router.get("/history/workflows", response_model=WorkflowHistoryResponse)
async def get_workflow_history(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _workflow_history_response(limit, offset, current_user, db)


@router.get("/workflows/history", response_model=list[WorkflowHistoryItem])
async def get_workflow_history_legacy(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return (await _workflow_history_response(limit, offset, current_user, db)).items


@router.post("/history/workflows/{workflow_id}/cancel", response_model=WorkflowHistoryItem)
async def cancel_workflow_endpoint(
    workflow_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workflow = await cancel_workflow(db, current_user, workflow_id)
    return WorkflowHistoryItem.from_workflow(workflow)


@router.post("/history/workflows/{workflow_id}/undo", response_model=WorkflowHistoryItem)
async def undo_workflow_endpoint(
    workflow_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workflow = await undo_workflow(db, current_user, workflow_id)
    return WorkflowHistoryItem.from_workflow(workflow)
