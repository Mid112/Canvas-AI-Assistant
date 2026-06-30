from datetime import datetime

from pydantic import BaseModel, EmailStr


class CreateAdminRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class CreateInstructorRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


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


class AdminUserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
