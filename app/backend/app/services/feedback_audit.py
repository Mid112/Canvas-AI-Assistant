"""Record feedback wizard posts in workflow history and audit logs."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.conversation import Conversation
from app.models.user import User
from app.models.workflow import Workflow
from app.services.chat import _json_dumps, log_message


async def record_feedback_post_history(
    db: AsyncSession,
    user: User,
    *,
    course_id: int,
    course_name: str | None,
    proposed_action: dict,
    submission_result: dict,
    user_prompt: str,
) -> Workflow:
    """Persist an executed update_grade workflow for direct feedback posts."""
    conversation = Conversation(
        user_id=user.id,
        course_id=course_id,
        course_name=course_name,
    )
    db.add(conversation)
    await db.flush()

    source_msg = await log_message(db, conversation, "user", user_prompt)
    preview_msg = await log_message(
        db,
        conversation,
        "assistant",
        _json_dumps(
            {
                "action": "intent_preview",
                "summary": (
                    "Post feedback for "
                    f"{proposed_action.get('student_reference', 'student')}"
                ),
                "proposed_action": proposed_action,
            }
        ),
    )
    result_msg = await log_message(
        db,
        conversation,
        "assistant",
        _json_dumps(
            {
                "action": "update_grade",
                "success": True,
                "data": submission_result,
            }
        ),
    )

    workflow = Workflow(
        conversation_id=conversation.id,
        user_id=user.id,
        course_id=course_id,
        source_user_message_id=source_msg.id,
        preview_message_id=preview_msg.id,
        result_message_id=result_msg.id,
        action_name="update_grade",
        user_prompt=user_prompt,
        proposed_action=proposed_action,
        affected_resources=[],
        status="executed",
        executed_at=datetime.now(UTC),
    )
    db.add(workflow)
    await db.flush()

    resource_id = (
        str(submission_result["id"])
        if isinstance(submission_result, dict) and submission_result.get("id") is not None
        else None
    )
    db.add(
        AuditLog(
            user_id=user.id,
            workflow_id=workflow.id,
            course_id=course_id,
            action="update_grade",
            resource_type="submission",
            resource_id=resource_id,
            operation="update",
            status="success",
            after_data=submission_result,
            request_payload=proposed_action,
        )
    )
    return workflow
