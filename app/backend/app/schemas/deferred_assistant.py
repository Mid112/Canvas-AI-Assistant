"""Schema note: shapes saved assistant requests that wait for a Canvas connection or course context before they can be resumed."""
from datetime import datetime

from pydantic import BaseModel


class DeferredAssistantRequestResponse(BaseModel):
    id: int
    conversation_id: int | None
    message: str
    proposed_action: dict | None = None
    status: str
    created_at: datetime
    resumed_at: datetime | None = None

    model_config = {"from_attributes": True}


class DeferredAssistantRequestListResponse(BaseModel):
    items: list[DeferredAssistantRequestResponse]
