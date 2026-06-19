from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, computed_field, field_validator
from app.config import settings


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


class CanvasTokenRequest(BaseModel):
    canvas_token: str = Field(min_length=1)
    # lambda so it reads from settings at request time, not at import time
    canvas_url: str = Field(default_factory=lambda: settings.CANVAS_API_URL)

    @field_validator("canvas_url", mode="before")
    @classmethod
    def _normalize_url(cls, v: str) -> str:
        # strip trailing slash so "https://canvas.ubc.ca/" and "https://canvas.ubc.ca" are the same key
        v = str(v).rstrip("/")
        # block non-https to prevent SSRF — backend would otherwise call arbitrary internal hosts
        if not v.startswith("https://"):
            raise ValueError("canvas_url must be an https:// URL")
        return v


# encrypted_token is intentionally excluded — never expose it in API responses
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

    # computed_field is needed so Pydantic includes this property in the serialized response
    @computed_field
    @property
    def has_canvas_token(self) -> bool:
        return len(self.canvas_connections) > 0
