from datetime import datetime

from pydantic import BaseModel, Field


class AssignmentDraftRequest(BaseModel):
    prompt: str = Field(min_length=1)


class AssignmentDraftResponse(BaseModel):
    title: str
    description: str
    due_at: datetime | None = None
    points_possible: float | None = None


class AssignmentPreviewRequest(BaseModel):
    title: str
    description: str | None = None
    due_at: datetime | None = None
    points_possible: float | None = None


class ActionPreviewResponse(BaseModel):
    action: str
    summary: str
    metadata: dict
    reversible: bool
    affected_resources: list[dict]
