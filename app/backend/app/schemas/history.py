from datetime import datetime

from pydantic import BaseModel


class WorkflowHistoryItem(BaseModel):
    id: int
    conversation_id: int
    intent: str
    status: str
    preview_data: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkflowHistoryResponse(BaseModel):
    items: list[WorkflowHistoryItem]
    total: int
