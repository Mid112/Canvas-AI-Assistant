from datetime import datetime

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: int
    user_id: int
    workflow_id: int
    course_id: int | None
    action: str
    resource_type: str
    resource_id: str | None
    operation: str
    status: str
    timestamp: datetime
    user_email: str
    user_role: str


class AuditLogListResponse(BaseModel):
    items: list[AuditLogResponse]
    total: int
