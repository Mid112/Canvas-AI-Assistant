"""Schema note: defines API-facing auth request/response shapes; changes here affect frontend service contracts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, computed_field, field_validator

from app.core.password_policy import validate_password_strength

_LOCAL_HTTP_HOSTS = {"localhost", "127.0.0.1", "canvas_lms"}


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        return validate_password_strength(value)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    email: EmailStr | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetRequestResponse(BaseModel):
    # Always the same generic acknowledgement so responses do not reveal
    # whether the email matched an account. ``reset_token`` is only populated
    # when settings.DEBUG is true (local/e2e without SMTP); production never
    # returns the raw token on this public endpoint.
    message: str = (
        "If an account exists for that email, a password reset was started."
    )
    reset_token: str | None = None


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(min_length=1)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        return validate_password_strength(value)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        return validate_password_strength(value)


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
    canvas_url: str

    @field_validator("canvas_url", mode="before")
    @classmethod
    def _normalize_url(cls, v: str) -> str:
        from urllib.parse import urlparse

        v = str(v).rstrip("/")
        if not v.startswith("https://"):
            parsed_url = urlparse(v)
            # localhost, 127.0.0.1, and canvas_lms are internal Docker/dev
            # hosts that can never be reached from the public internet, so
            # allowing http:// for them is always safe regardless of DEBUG.
            if not (parsed_url.scheme == "http" and parsed_url.hostname in _LOCAL_HTTP_HOSTS):
                raise ValueError("canvas_url must be an https:// URL")
        return v


class CanvasTokenValidationResponse(BaseModel):
    status: Literal["valid", "expired", "invalid"]


class CanvasConnectionResponse(BaseModel):
    id: int
    canvas_url: str
    created_at: datetime
    time_zone: str | None = None

    model_config = {"from_attributes": True}


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool
    canvas_connections: list[CanvasConnectionResponse] = []

    model_config = {"from_attributes": True}

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_canvas_token(self) -> bool:
        return len(self.canvas_connections) > 0
