from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    PROJECT_NAME: str = "Canvas Helper AI Assistant"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False
    DEFAULT_LLM_PROVIDER: str = "groq"

    # CORS. NoDecode stops pydantic-settings from trying to JSON-parse the env
    # value so our validator can split a plain comma-separated string instead.
    BACKEND_CORS_ORIGINS: Annotated[list[str], NoDecode] = []

    @field_validator("DEBUG", mode="before")
    @classmethod
    def _normalize_debug(cls, v: bool | str) -> bool | str:
        if isinstance(v, str):
            normalized = v.strip().lower()
            if normalized in {"debug", "development", "dev"}:
                return True
            if normalized in {"release", "production", "prod"}:
                return False
        return v

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v: "str | list[str]") -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://appuser:localdev@localhost:5432/appdb"

    # Auth
    SECRET_KEY: str = "localdevsecret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Seed admin — set both to auto-create the first admin on startup.
    # Unset (or leave empty) in production once the account exists.
    ADMIN_EMAIL: str | None = None
    ADMIN_PASSWORD: str | None = None
    ADMIN_NAME: str = "Administrator"

    # Canvas API
    # base domain only — /api/v1 is appended by the integration layer
    CANVAS_API_URL: str = "https://canvas.ubc.ca"
    CANVAS_API_TOKEN: str = ""
    CANVAS_TOKEN_ENCRYPTION_KEY: str = ""

    # LLM
    VLLM_BASE_URL: str = "http://host.docker.internal:8001/v1"
    VLLM_MODEL: str = "Qwen/Qwen3-4B"
    OLLAMA_BASE_URL: str = "http://localhost:11434/v1"
    OLLAMA_MODEL: str = "llama3.2"

    # LLM — Groq (hosted, OpenAI-compatible)
    GROQ_API_KEY: str = ""

    @field_validator("CANVAS_TOKEN_ENCRYPTION_KEY", mode="before")
    @classmethod
    def _validate_encryption_key(cls, v: str) -> str:
        if not v:
            raise ValueError(
                "CANVAS_TOKEN_ENCRYPTION_KEY must be set. "
                'Generate one with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
            )
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
