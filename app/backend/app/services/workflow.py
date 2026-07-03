from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.workflow import Workflow


async def list_workflow_history(
    db: AsyncSession,
    user: User,
    *,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Workflow], int]:
    query = select(Workflow).where(Workflow.user_id == user.id)
    total = await db.scalar(
        select(func.count()).select_from(Workflow).where(Workflow.user_id == user.id)
    )
    rows = await db.scalars(
        query.order_by(desc(Workflow.created_at)).offset(offset).limit(limit)
    )
    return list(rows), int(total or 0)


async def cancel_workflow(db: AsyncSession, user: User, workflow_id: int) -> Workflow:
    workflow = await db.scalar(
        select(Workflow).where(Workflow.id == workflow_id, Workflow.user_id == user.id)
    )
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    if workflow.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot cancel workflow with status '{workflow.status}'",
        )

    workflow.status = "rejected"
    db.add(
        AuditLog(
            user_id=user.id,
            workflow_id=workflow.id,
            action="workflow_cancelled",
            details={"intent": workflow.intent},
        )
    )
    await db.commit()
    await db.refresh(workflow)
    return workflow


async def record_workflow_from_chat(
    db: AsyncSession,
    user: User,
    conversation_id: int,
    intent: str,
    preview_data: dict,
    status: str = "pending",
) -> Workflow:
    workflow = Workflow(
        conversation_id=conversation_id,
        user_id=user.id,
        intent=intent,
        preview_data=preview_data,
        generated_query=preview_data.get("proposed_action"),
        status=status,
    )
    db.add(workflow)
    await db.flush()
    return workflow
