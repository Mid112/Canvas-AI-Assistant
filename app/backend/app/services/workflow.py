from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.models.workflow import Workflow
from app.services.chat import _claim_pending_workflow


async def list_workflow_history(
    db: AsyncSession,
    user: User,
    *,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Workflow], int]:
    query = (
        select(Workflow)
        .where(Workflow.user_id == user.id)
        .options(selectinload(Workflow.user))
    )
    total = await db.scalar(
        select(func.count()).select_from(Workflow).where(Workflow.user_id == user.id)
    )
    rows = await db.scalars(
        query.order_by(desc(Workflow.created_at)).offset(offset).limit(limit)
    )
    return list(rows), int(total or 0)


async def cancel_workflow(db: AsyncSession, user: User, workflow_id: int) -> Workflow:
    workflow = await db.scalar(
        select(Workflow)
        .where(Workflow.id == workflow_id, Workflow.user_id == user.id)
        .options(selectinload(Workflow.user))
    )
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    # Atomic conditional UPDATE, not a read-then-check race — see
    # _claim_pending_workflow's docstring in services/chat.py. A plain
    # "if workflow.status != 'pending'" check here would let this race
    # against handle_confirmed_action/handle_cancelled_action and
    # potentially overwrite an already-executed workflow's status back to
    # "cancelled" after its Canvas action already succeeded.
    if not await _claim_pending_workflow(db, workflow, "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot cancel workflow with status '{workflow.status}'",
        )
    await db.commit()
    workflow.status = "cancelled"
    return workflow
