# auth API routes - placeholder
from fastapi import APIRouter

router = APIRouter(prefix="/auth", tags=["auth"])

@router.get("/ping")
async def ping() -> dict[str, str]:
    """Temporary endpoint to confirm the auth router is mounted."""
    return {"router": "auth", "status": "placeholder"}
