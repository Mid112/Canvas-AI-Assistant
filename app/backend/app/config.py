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
    DEFAULT_LLM_PROVIDER: str = "huggingface"

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
    CANVAS_API_URL: str | None = None
    CANVAS_API_TOKEN: str = ""
    CANVAS_TOKEN_ENCRYPTION_KEY: str = ""

    @field_validator("CANVAS_API_URL", mode="before")
    @classmethod
    def _empty_canvas_url_to_none(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            stripped = v.strip()
            return stripped or None
        return v

    # LLM
    VLLM_BASE_URL: str = "http://host.docker.internal:8001/v1"
    VLLM_MODEL: str = "Qwen/Qwen3-4B"
    OLLAMA_BASE_URL: str = "http://localhost:11434/v1"
    OLLAMA_MODEL: str = "llama3.2"

    # LLM — Groq (hosted, OpenAI-compatible)
    GROQ_API_KEY: str = ""
    # qwen/qwen3.6-27b: a "thinking" model (reasons in a <think> block
    # before answering). Reintroduced as the default because course-name
    # resolution (services/chat.py) needs real reasoning over a candidate
    # list — e.g. deciding whether "Introduction to Programming" uniquely
    # matches one course or is ambiguous between two — which
    # meta-llama/llama-4-scout-17b-16e-instruct (a plain instruct model,
    # the previous default) could not do reliably. The earlier switch away
    # from qwen was to dodge free-tier rate limits and truncated
    # mid-response output; both are mitigated now by the raised max_tokens
    # in openai_compatible.py. meta-llama/llama-4-scout-17b-16e-instruct is
    # still fully supported, pass {"model":
    # "meta-llama/llama-4-scout-17b-16e-instruct"} to get_llm_adapter() to
    # use it.
    GROQ_MODEL: str = "qwen/qwen3.6-27b"

    # LLM — Hugging Face Inference Router (hosted, OpenAI-compatible)
    # https://router.huggingface.co/v1. HF_MODEL is pinned to Groq's
    # backing via the ":groq" suffix — unpinned (HF picking whichever
    # provider currently backs the model) was tried first with
    # Qwen/Qwen3-4B-Thinking-2507 and was unusably slow (one real request
    # hit the 90s LLM_TIMEOUT_SECONDS outright, and even a trivial
    # fetch_courses turn took ~20s) — pinning to Groq's inference restores
    # the sub-2s latency the app depends on, at the cost of losing
    # automatic provider failover.
    HF_TOKEN: str = ""
    HF_MODEL: str = "openai/gpt-oss-20b:groq"

    # Optional hosted providers. Keys remain server-side and are never returned
    # by the provider configuration API.
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-4-5"

    # Both the tick interval of the background course-name sync loop
    # (app.main's lifespan) and the per-connection cooldown
    # sync_courses_if_stale enforces before making a real Canvas call —
    # the same window doubles as both so the periodic sweep does real
    # work on (roughly) every tick instead of mostly no-oping. The chat
    # pipeline itself never triggers this fetch; it only reads whatever
    # the sweep (or a just-completed write, or the "set active course"
    # button) last populated.
    CANVAS_COURSE_SYNC_COOLDOWN_SECONDS: int = 60

    # System Health Monitoring (Feature 9) — timeouts for GET /admin/health's
    # per-service checks. AI gets a longer budget since a real chat-completion
    # round trip is inherently slower than a DB ping or a Canvas GET.
    HEALTH_CHECK_TIMEOUT_SECONDS: float = 5.0
    HEALTH_CHECK_AI_TIMEOUT_SECONDS: float = 8.0

    # MCP integration (optional — disabled by default for unit tests)
    MCP_SERVER_URL: str = ""
    MCP_ENABLED: bool = False
    # Must match MCP_SHARED_SECRET on the mcp_server sidecar.
    MCP_SHARED_SECRET: str = ""

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
