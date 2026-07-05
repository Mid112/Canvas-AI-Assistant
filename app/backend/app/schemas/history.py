from datetime import datetime

from pydantic import BaseModel

from app.models.workflow import Workflow


class WorkflowHistoryItem(BaseModel):
    id: int
    conversation_id: int
    action_name: str
    user_prompt: str
    status: str
    proposed_action: dict
    affected_resources: list[dict]
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
