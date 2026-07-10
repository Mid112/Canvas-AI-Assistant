from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.workflow import Workflow


class WorkflowHistoryItem(BaseModel):
    id: int
    conversation_id: int
    action_name: str
    user_prompt: str
    status: str
    proposed_action: dict[str, Any]
    affected_resources: list[dict[str, Any]]
    created_at: datetime
    executed_at: datetime | None = None
    user_name: str

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
