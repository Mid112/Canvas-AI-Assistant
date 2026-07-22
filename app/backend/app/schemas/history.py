from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.mcp_tools.schemas import is_undoable
from app.models.workflow import Workflow


class WorkflowHistoryItem(BaseModel):
    id: int
    # Null for form-created writes that were never tied to a chat turn.
    conversation_id: int | None
    action_name: str
    user_prompt: str
    status: str
    proposed_action: dict[str, Any]
    affected_resources: list[dict[str, Any]]
    created_at: datetime
    executed_at: datetime | None = None
    user_name: str
    # Whether this action *type* has a working undo path at all (see
    # mcp_tools.schemas.UNDOABLE_ACTIONS) — the frontend still also checks
    # status == "executed" and undone_at is None before showing an Undo
    # affordance, since undoable-in-principle isn't the same as undoable
    # right now.
    undoable: bool = False
    undone_at: datetime | None = None

    @classmethod
    def from_workflow(cls, workflow: Workflow) -> "WorkflowHistoryItem":
        return cls(
            id=workflow.id,
            conversation_id=workflow.conversation_id,
            action_name=workflow.action_name,
            user_prompt=workflow.user_prompt,
            status=workflow.status,
            proposed_action=workflow.proposed_action,
            affected_resources=workflow.affected_resources,
            created_at=workflow.created_at,
            executed_at=workflow.executed_at,
            user_name=workflow.user.name,
            undoable=is_undoable(workflow.action_name),
            undone_at=workflow.undone_at,
        )


class WorkflowHistoryResponse(BaseModel):
    items: list[WorkflowHistoryItem]
    total: int


class AuditLogResponse(BaseModel):
    id: int
    user_id: int
    user_email: str
    user_role: str
    workflow_id: int | None
    course_id: int | None
    action: str
    resource_type: str
    resource_id: str | None
    operation: str
    status: str
    before_data: dict[str, Any] | None
    after_data: dict[str, Any] | None
    request_payload: dict[str, Any] | None
    timestamp: datetime
