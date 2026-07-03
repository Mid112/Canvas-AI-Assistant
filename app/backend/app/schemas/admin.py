from pydantic import BaseModel, Field


class AdminDashboardResponse(BaseModel):
    instructor_count: int
    admin_count: int
    active_workflows: int
    audit_events_last_7_days: int


class AdminSettingsResponse(BaseModel):
    settings: dict


class AdminSettingsUpdate(BaseModel):
    settings: dict
