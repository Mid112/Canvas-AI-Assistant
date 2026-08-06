from pydantic import BaseModel, ConfigDict


class StudentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore", from_attributes=True)

    id: int
    canvas_user_id: str
    course_id: int
    name: str
    sortable_name: str | None = None
    login_id: str | None = None
    enrollment_state: str
