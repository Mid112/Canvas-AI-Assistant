"""Schema note: defines API-facing admin request/response shapes; changes here affect frontend service contracts."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.password_policy import validate_password_strength


class AdminDashboardResponse(BaseModel):
    instructor_count: int
    admin_count: int
    active_workflows: int
    audit_events_last_7_days: int


class AdminSettingsResponse(BaseModel):
    settings: dict


class AdminSettingsUpdate(BaseModel):
    settings: dict = Field(default_factory=dict)


class CreateAdminRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        return validate_password_strength(value)


class CreateInstructorRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        return validate_password_strength(value)


class UpdateInstructorRequest(BaseModel):
    name: str | None = None
    email: EmailStr | None = None


class InstructorResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminCanvasConnectionResponse(BaseModel):
    id: int
    canvas_url: str
    last_sync_error: str | None
    courses_synced_at: datetime | None
    created_at: datetime
    time_zone: str | None = None

    model_config = {"from_attributes": True}


class AdminUserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
