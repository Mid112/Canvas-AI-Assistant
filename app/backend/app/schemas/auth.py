from typing import Any
from pydantic import BaseModel, EmailStr, Field, model_validator


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


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool
    has_canvas_token: bool

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _compute_has_canvas_token(cls, data: Any) -> Any:
        if hasattr(data, "canvas_token"):
            return {
                "id": data.id,
                "email": data.email,
                "name": data.name,
                "role": data.role,
                "is_active": data.is_active,
                "has_canvas_token": data.canvas_token is not None,
            }
        return data
