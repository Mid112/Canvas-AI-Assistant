from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.models.workflow import Workflow


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

    if workflow.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot cancel workflow with status '{workflow.status}'",
        )

    workflow.status = "cancelled"
    await db.commit()
    await db.refresh(workflow)
    return workflow
