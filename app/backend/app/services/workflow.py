import json
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.mcp_tools.schemas import is_undoable
from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.workflow import Workflow
from app.schemas.canvas import AssignmentUpdate
from app.services.canvas import delete_course_assignment, update_course_assignment
from app.services.chat import _claim_pending_workflow, _json_dumps
from app.services.course_access import get_owned_course_or_404


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


async def undo_workflow(db: AsyncSession, user: User, workflow_id: int) -> Workflow:
    """Reverts a reversible, already-executed action. Scoped to
    update_assignment and create_assignment (see mcp_tools.schemas.
    UNDOABLE_ACTIONS): update_assignment re-applies its AuditLog row's
    before_data; create_assignment has no "prior state" to re-apply (the
    assignment didn't exist before), so undoing it deletes the assignment
    that was created instead."""
    workflow = await db.scalar(
        select(Workflow)
        .where(Workflow.id == workflow_id, Workflow.user_id == user.id)
        .options(selectinload(Workflow.user))
    )
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    if not is_undoable(workflow.action_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Actions of type '{workflow.action_name}' cannot be undone.",
        )
    if workflow.status != "executed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot undo a workflow with status '{workflow.status}'.",
        )

    # Atomic conditional UPDATE — same race-safety rationale as
    # _claim_pending_workflow: two simultaneous undo requests on the same
    # workflow must not both succeed. Deliberately NOT committed here: the
    # UPDATE's row lock is what serializes concurrent undo attempts, but
    # undone_at must not become durable until the Canvas revert below has
    # actually succeeded — otherwise a failed revert (missing before_data,
    # a Canvas API error, etc.) would permanently hide the Undo button
    # while Canvas itself was never reverted. Any exception raised before
    # the final commit rolls this claim back along with everything else.
    claim = await db.execute(
        sa_update(Workflow)
        .where(
            Workflow.id == workflow.id,
            Workflow.status == "executed",
            Workflow.undone_at.is_(None),
        )
        .values(undone_at=datetime.now(UTC))
    )
    if claim.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This action has already been undone.",
        )
    workflow.undone_at = datetime.now(UTC)

    # The original write's AuditLog row (action == workflow.action_name,
    # not a prior "undo_assignment" row) is where before_data/resource_id
    # live — order by timestamp ascending so a workflow that's already been
    # undone once (which would add a second, later AuditLog row for the
    # undo itself) still resolves to the original write's row, not the undo's.
    audit_row = await db.scalar(
        select(AuditLog)
        .where(AuditLog.workflow_id == workflow.id, AuditLog.action == workflow.action_name)
        .order_by(AuditLog.timestamp.asc())
    )
    if not audit_row:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="No prior state was recorded for this action — it cannot be undone.",
        )

    course = await get_owned_course_or_404(workflow.course_id, user, db)
    assignment_id = int(audit_row.resource_id)

    if workflow.action_name == "create_assignment":
        # No "before" state to re-apply — the assignment didn't exist
        # before this action. Undoing it means deleting it.
        await delete_course_assignment(workflow.course_id, assignment_id, user, course.canvas_url, db)
        db.add(
            AuditLog(
                user_id=user.id,
                workflow_id=workflow.id,
                course_id=workflow.course_id,
                action="undo_assignment",
                resource_type="assignment",
                resource_id=audit_row.resource_id,
                operation="delete",
                status="success",
                before_data=json.loads(_json_dumps(audit_row.after_data)),
                after_data=None,
                request_payload=None,
            )
        )
    else:
        if not audit_row.before_data:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="No prior state was recorded for this action — it cannot be undone.",
            )
        before = audit_row.before_data
        payload = AssignmentUpdate(
            name=before["name"],
            description=before.get("description"),
            due_at=before.get("due_at"),
            points_possible=before.get("points_possible"),
        )
        restored = await update_course_assignment(
            workflow.course_id, assignment_id, payload, user, course.canvas_url, db
        )
        db.add(
            AuditLog(
                user_id=user.id,
                workflow_id=workflow.id,
                course_id=workflow.course_id,
                action="undo_assignment",
                resource_type="assignment",
                resource_id=audit_row.resource_id,
                operation="update",
                status="success",
                before_data=json.loads(_json_dumps(audit_row.after_data)),
                after_data=json.loads(_json_dumps(restored.model_dump())),
                request_payload=payload.model_dump(mode="json"),
            )
        )

    await db.commit()
    return workflow
