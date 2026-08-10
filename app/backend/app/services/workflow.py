import json
from datetime import UTC, datetime
from typing import cast

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy import update as sa_update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.mcp_tools.schemas import is_undoable
from app.models.audit_log import AuditLog
from app.models.message import Message
from app.models.user import User
from app.models.workflow import Workflow
from app.schemas.canvas import AssignmentUpdate
from app.services.canvas import delete_course_assignment, delete_course_quiz, update_course_assignment
from app.services.chat import _claim_pending_workflow, _json_dumps
from app.services.course_access import get_owned_course_or_404


def _reversal_chat_message(workflow: Workflow) -> str:
    """Return the persisted assistant transcript message for a completed reversal.

    Audit logs and workflow history remain the structured source of truth; this
    message gives instructors the same visible chat confirmation they get after
    approving an action.
    """
    action_label = workflow.action_name.replace("_", " ").title()
    if workflow.action_name == "create_assignment":
        return f"Reversed {action_label}: the created assignment was deleted from Canvas."
    if workflow.action_name == "create_quiz":
        return f"Reversed {action_label}: the created quiz was deleted from Canvas."
    return f"Reversed {action_label}: the previous Canvas state was restored."


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


async def _get_user_workflow(
    db: AsyncSession,
    user: User,
    *,
    workflow_id: int | None = None,
    pending_message_id: int | None = None,
    conversation_id: int | None = None,
) -> Workflow:
    if workflow_id is not None:
        workflow = await db.scalar(
            select(Workflow)
            .where(Workflow.id == workflow_id, Workflow.user_id == user.id)
            .options(selectinload(Workflow.user))
        )
    elif pending_message_id is not None:
        if conversation_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="conversation_id is required when using pending_message_id.",
            )
        workflow = await db.scalar(
            select(Workflow)
            .where(
                Workflow.preview_message_id == pending_message_id,
                Workflow.conversation_id == conversation_id,
                Workflow.user_id == user.id,
            )
            .options(selectinload(Workflow.user))
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="workflow_id or pending_message_id is required.",
        )

    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return workflow


async def _transition_workflow_status(
    db: AsyncSession,
    workflow: Workflow,
    *,
    expected_status: str,
    new_status: str,
) -> bool:
    claim = await db.execute(
        sa_update(Workflow)
        .where(Workflow.id == workflow.id, Workflow.status == expected_status)
        .values(status=new_status)
    )
    if cast(CursorResult, claim).rowcount > 0:
        workflow.status = new_status
        return True
    await db.refresh(workflow, attribute_names=["status"])
    return False


async def pause_workflow(
    db: AsyncSession,
    user: User,
    *,
    workflow_id: int | None = None,
    pending_message_id: int | None = None,
    conversation_id: int | None = None,
) -> Workflow:
    workflow = await _get_user_workflow(
        db,
        user,
        workflow_id=workflow_id,
        pending_message_id=pending_message_id,
        conversation_id=conversation_id,
    )
    if not await _transition_workflow_status(
        db, workflow, expected_status="pending", new_status="paused"
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot pause workflow with status '{workflow.status}'",
        )
    await db.commit()
    return workflow


async def resume_workflow(
    db: AsyncSession,
    user: User,
    *,
    workflow_id: int | None = None,
    pending_message_id: int | None = None,
    conversation_id: int | None = None,
) -> Workflow:
    workflow = await _get_user_workflow(
        db,
        user,
        workflow_id=workflow_id,
        pending_message_id=pending_message_id,
        conversation_id=conversation_id,
    )
    if not await _transition_workflow_status(
        db, workflow, expected_status="paused", new_status="pending"
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot resume workflow with status '{workflow.status}'",
        )
    await db.commit()
    return workflow


async def rename_workflow(
    db: AsyncSession,
    user: User,
    *,
    display_name: str,
    workflow_id: int | None = None,
    pending_message_id: int | None = None,
    conversation_id: int | None = None,
) -> Workflow:
    """Sets an instructor-facing label for switching among open workflows."""
    trimmed = display_name.strip()
    if not trimmed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="display_name cannot be empty",
        )
    if len(trimmed) > 120:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="display_name must be 120 characters or fewer",
        )

    workflow = await _get_user_workflow(
        db,
        user,
        workflow_id=workflow_id,
        pending_message_id=pending_message_id,
        conversation_id=conversation_id,
    )
    if workflow.status not in {"pending", "paused"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot rename workflow with status '{workflow.status}'",
        )
    workflow.display_name = trimmed
    await db.commit()
    await db.refresh(workflow)
    return workflow


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


async def reverse_workflow(db: AsyncSession, user: User, workflow_id: int) -> Workflow:
    """Reverses a supported, already-executed Canvas action. Scoped to
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
    if cast(CursorResult, claim).rowcount == 0:
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

    if workflow.course_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="No course was recorded for this action — it cannot be undone.",
        )
    if audit_row.resource_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="No Canvas resource was recorded for this action — it cannot be undone.",
        )

    course_id = workflow.course_id
    course = await get_owned_course_or_404(course_id, user, db)
    assignment_id = int(audit_row.resource_id)

    if workflow.action_name == "create_assignment":
        # No "before" state to re-apply — the assignment didn't exist
        # before this action. Undoing it means deleting it.
        await delete_course_assignment(course_id, assignment_id, user, course.canvas_url, db)
        db.add(
            AuditLog(
                user_id=user.id,
                workflow_id=workflow.id,
                course_id=course_id,
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
    elif workflow.action_name == "create_quiz":
        await delete_course_quiz(
            course_id,
            assignment_id,
            user,
            course.canvas_url,
            db,
            quiz_engine=(audit_row.after_data or {}).get(
                "quiz_engine", "classic"
            ),
        )
        db.add(
            AuditLog(
                user_id=user.id,
                workflow_id=workflow.id,
                course_id=course_id,
                action="undo_quiz",
                resource_type="quiz",
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
            course_id, assignment_id, payload, user, course.canvas_url, db
        )
        db.add(
            AuditLog(
                user_id=user.id,
                workflow_id=workflow.id,
                course_id=course_id,
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

    if workflow.conversation_id is not None:
        db.add(
            Message(
                conversation_id=workflow.conversation_id,
                role="assistant",
                content=_reversal_chat_message(workflow),
            )
        )

    await db.commit()
    return workflow


async def undo_workflow(db: AsyncSession, user: User, workflow_id: int) -> Workflow:
    """Backward-compatible alias for the original /undo route.

    UR2.28 names the feature "action reversal"; older UI/tests still call the
    endpoint "undo". Keeping this tiny wrapper avoids breaking clients while
    making reverse_workflow the primary service name.
    """
    return await reverse_workflow(db, user, workflow_id)
