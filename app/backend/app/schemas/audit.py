"""Schema note: defines API-facing audit request/response shapes; changes here affect frontend service contracts."""

from datetime import datetime

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: int
    # Nullable for anonymous failed-login attempts against unknown emails.
    user_id: int | None
    # Nullable because rows sourced from audit_logs_session (admin/security
    # events) have no associated Workflow.
    workflow_id: int | None
    course_id: int | None
    action: str
    resource_type: str
    resource_id: str | None
    operation: str
    status: str
    timestamp: datetime
    user_email: str
    user_role: str
    # Passthrough context: audit_logs_session.details for session-sourced
    # rows, unset for workflow-sourced rows.
    details: dict | None = None


class AuditLogListResponse(BaseModel):
    items: list[AuditLogResponse]
    total: int
