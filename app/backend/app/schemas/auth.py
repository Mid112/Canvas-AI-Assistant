from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, computed_field, field_validator

from app.config import settings

_LOCAL_HTTP_HOSTS = {"localhost", "127.0.0.1", "canvas_lms"}


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class ProfileUpdateRequest(BaseModel):
    name: str | None = None
    email: EmailStr | None = None


class DeleteAccountRequest(BaseModel):
    password: str


class NotificationSettingsUpdate(BaseModel):
    settings: dict


class SessionResponse(BaseModel):
    id: int
    created_at: datetime
    expires_at: datetime
    is_current: bool


class SecurityStatusResponse(BaseModel):
    two_factor_enabled: bool = False
    active_session_count: int


class CanvasTokenRequest(BaseModel):
    canvas_token: str = Field(min_length=1)
    canvas_url: str = Field(default_factory=lambda: settings.CANVAS_API_URL)

    @field_validator("canvas_url", mode="before")
    @classmethod
    def _normalize_url(cls, v: str) -> str:
        from urllib.parse import urlparse

        v = str(v).rstrip("/")
        if not v.startswith("https://"):
            parsed_url = urlparse(v)
            if not (settings.DEBUG and parsed_url.scheme == "http" and parsed_url.hostname in _LOCAL_HTTP_HOSTS):
                raise ValueError("canvas_url must be an https:// URL")
        return v


class CanvasTokenValidationResponse(BaseModel):
    status: Literal["valid", "expired", "invalid"]


class CanvasConnectionResponse(BaseModel):
    id: int
    canvas_url: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool
    canvas_connections: list[CanvasConnectionResponse] = []

    model_config = {"from_attributes": True}

    @computed_field
    @property
    def has_canvas_token(self) -> bool:
        return len(self.canvas_connections) > 0
