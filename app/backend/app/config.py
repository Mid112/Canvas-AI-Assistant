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
    PROJECT_NAME: str = "Canvas Helper API"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False

    # CORS. NoDecode stops pydantic-settings from trying to JSON-parse the env
    # value so our validator can split a plain comma-separated string instead.
    BACKEND_CORS_ORIGINS: Annotated[list[str], NoDecode] = []

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


@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
