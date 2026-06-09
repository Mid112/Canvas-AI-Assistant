# Canvas API routes - placeholder
from fastapi import APIRouter

router = APIRouter(prefix="/canvas", tags=["canvas"])


@router.get("/ping")
async def ping() -> dict[str, str]:
    """Temporary endpoint to confirm the canvas router is mounted."""
    return {"router": "canvas", "status": "placeholder"}
