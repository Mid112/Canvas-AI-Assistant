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
    # int | None with no default sentinel: whether this was actually sent is
    # read off model_fields_set in the service, so callers can unassign
    # (assigned_to: null) without that being indistinguishable from "don't
    # touch assignment" (field omitted entirely).
    assigned_to: int | None = None


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
    assigned_to: int | None
    assigned_to_name: str | None = None
    assigned_to_email: str | None = None
    created_at: datetime
    resolved_at: datetime | None


class SupportTicketListResponse(BaseModel):
    items: list[SupportTicketResponse]
    total: int


class AssignableAdmin(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
