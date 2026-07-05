# app/backend/app/services/canvas_status.py
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass
class CanvasExecutionStatus:
    """Wraps a raw httpx.Response from the Canvas integration layer.
    Used when the caller has direct access to the raw response object,
    e.g. future low-level integration functions that return httpx.Response
    rather than parsed Pydantic objects."""
    success: bool
    http_status: int
    action: str
    detail: str | None = None
    data: Any = None




@dataclass
class CanvasWriteResult:
    """Wraps the result of a Canvas write operation at the dispatcher layer.
    Used when services/canvas.py has already parsed the response into a
    Pydantic object (or raised an HTTPException on failure), so the raw
    httpx.Response is no longer available. The dispatcher uses this to
    produce a consistent status envelope for all write actions without
    requiring services/canvas.py to expose raw HTTP details.

    success is always True here — services/canvas.py raises HTTPException
    on any Canvas error before returning, so a returned Pydantic object
    always means the write succeeded.

    reversible/affected_resources are deliberately required (no default)
    rather than action-name-derived internally — this envelope stays
    action-agnostic (SRP: dispatcher.py already knows the action name and
    is the one place that should decide what's reversible and what got
    touched), and a required field forces each write case to wire them
    correctly rather than silently default to something wrong."""
    action: str
    data: Any
    reversible: bool
    affected_resources: list[dict]
    success: bool = True

    def to_dict(self) -> dict:
        result = {
            "success": self.success,
            "action": self.action,
            "data": self.data.model_dump() if hasattr(self.data, "model_dump") else self.data,
            "reversible": self.reversible,
            "affected_resources": self.affected_resources,
        }
        if not self.reversible:
            result["reversibility_note"] = "This action was not reversible."
        return result


def return_execution_status(
    response: httpx.Response,
    action: str,
    data: Any = None,
) -> CanvasExecutionStatus:
    """Wraps a raw httpx.Response. Use this when the integration layer
    returns a raw httpx.Response rather than a parsed Pydantic object.
    For the current Canvas integration (which parses into Pydantic and
    raises HTTPException on error), use CanvasWriteResult instead."""
    success = response.is_success
    return CanvasExecutionStatus(
        success=success,
        http_status=response.status_code,
        action=action,
        detail=None if success else _extract_canvas_error(response),
        data=data if success else None,
    )


def _extract_canvas_error(response: httpx.Response) -> str:
    try:
        body = response.json()
        if "errors" in body and isinstance(body["errors"], list) and body["errors"]:
            return body["errors"][0].get("message", "Unknown Canvas error")
        if "message" in body:
            return body["message"]
        return f"Canvas returned {response.status_code}"

    except Exception:
        return f"Canvas returned {response.status_code}"
