from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TicketStatus = Literal["open", "investigating", "resolved"]


class SupportTicketCreate(BaseModel):
    failed_operation_id: int
    admin_notes: str | None = Field(default=None, max_length=4000)


class SupportTicketUpdate(BaseModel):
    status: TicketStatus | None = None
    admin_notes: str | None = Field(default=None, max_length=4000)


class SupportTicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    failed_operation_id: int
    user_id: int | None
    user_name: str | None = None
    status: TicketStatus
    admin_notes: str | None
    created_by: int
    created_by_email: str | None = None
    resolved_by: int | None
    resolved_by_email: str | None = None
    created_at: datetime
    resolved_at: datetime | None


class SupportTicketListResponse(BaseModel):
    items: list[SupportTicketResponse]
    total: int
