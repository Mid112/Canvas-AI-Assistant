from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.llm_provider import (
    InstructorLlmProviderConfig,
    LlmConnectionResponse,
    LlmConnectionUpdate,
)
from app.services.llm.llm_connections import (
    build_instructor_provider_catalog,
    delete_llm_connection,
    upsert_llm_connection,
)
from app.services.llm.provider_registry import get_active_llm_config

router = APIRouter(prefix="/llm", tags=["llm"])


@router.get("/providers", response_model=InstructorLlmProviderConfig)
async def instructor_llm_providers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    config = await get_active_llm_config(db)
    providers = await build_instructor_provider_catalog(db, current_user.id)
    return InstructorLlmProviderConfig(
        default_provider=config.provider,
        default_model=config.model,
        providers=providers,
    )


@router.put(
    "/connections/{provider_id}",
    response_model=LlmConnectionResponse,
    status_code=status.HTTP_200_OK,
)
async def save_llm_connection(
    provider_id: str,
    body: LlmConnectionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    connection = await upsert_llm_connection(
        db,
        current_user.id,
        provider_id,
        api_key=body.api_key,
        model=body.model,
        base_url=body.base_url,
    )
    return LlmConnectionResponse(
        provider_id=connection.provider_id,
        model=connection.model,
        base_url=connection.base_url,
        has_api_key=bool(connection.encrypted_api_key),
    )


@router.delete("/connections/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_llm_connection(
    provider_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await delete_llm_connection(db, current_user.id, provider_id)
