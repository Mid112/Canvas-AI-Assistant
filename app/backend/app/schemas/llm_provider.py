from typing import Literal

from pydantic import BaseModel, Field, model_validator


class LlmProviderStatus(BaseModel):
    id: str
    name: str
    hosting: Literal["local", "internet", "custom"]
    default_model: str
    configured: bool
    status: Literal["available", "configured", "unavailable", "unconfigured"]
    models: list[str] = Field(default_factory=list)
    detail: str | None = None


class LlmProviderConfig(BaseModel):
    provider: str
    model: str
    fallback_provider: str | None = None
    fallback_model: str | None = None
    cache_enabled: bool = True
    cache_ttl_seconds: int = Field(default=300, ge=30, le=86_400)

    @model_validator(mode="after")
    def validate_fallback(self):
        if self.fallback_provider == self.provider:
            raise ValueError("Fallback provider must differ from the active provider")
        if bool(self.fallback_provider) != bool(self.fallback_model):
            raise ValueError("Fallback provider and fallback model must be configured together")
        return self


class LlmProviderConfigResponse(BaseModel):
    config: LlmProviderConfig
    providers: list[LlmProviderStatus]


class InstructorLlmProvider(BaseModel):
    id: str
    name: str
    hosting: Literal["local", "internet", "custom"]
    default_model: str
    configured: bool
    status: Literal["available", "configured", "unavailable", "unconfigured"]
    models: list[str] = Field(default_factory=list)
    detail: str | None = None
    connected: bool
    requires_api_key: bool
    accepts_api_key: bool = False
    has_api_key: bool
    saved_model: str | None = None
    saved_base_url: str | None = None


class InstructorLlmProviderConfig(BaseModel):
    default_provider: str
    default_model: str
    providers: list[InstructorLlmProvider]


class LlmConnectionUpdate(BaseModel):
    api_key: str | None = None
    model: str | None = None
    base_url: str | None = None


class LlmConnectionResponse(BaseModel):
    provider_id: str
    model: str | None = None
    base_url: str | None = None
    has_api_key: bool
