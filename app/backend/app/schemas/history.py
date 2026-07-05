from datetime import datetime
from typing import Any

from pydantic import BaseModel


class WorkflowHistoryResponse(BaseModel):
    id: int
    conversation_id: int
    course_id: int | None
    action_name: str
    user_prompt: str
    proposed_action: dict[str, Any]
    status: str
    error_detail: str | None
    created_at: datetime
    executed_at: datetime | None
    preview_message_id: int
    result_message_id: int | None

    model_config = {"from_attributes": True}


class AuditLogResponse(BaseModel):
    id: int
    user_id: int
    user_email: str
    user_role: str
    workflow_id: int
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
