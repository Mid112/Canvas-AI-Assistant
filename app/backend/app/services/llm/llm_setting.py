# app/backend/app/services/llm/llm_setting.py
from app.config import settings
from app.services.llm.base import LLMAdapter
from app.services.llm.openai_compatible import OpenAICompatibleAdapter
from app.services.llm.anthropic_adapter import AnthropicAdapter


def get_llm_adapter(llm_settings: dict) -> LLMAdapter:
    """llm_settings is whatever the settings page persisted for this user
    (or a global default for now, before per-user settings exist)."""
    provider = llm_settings.get("provider", "vllm")

    if provider == "vllm":
        return OpenAICompatibleAdapter(
            base_url=settings.VLLM_BASE_URL,
            model=settings.VLLM_MODEL,
        )

    if provider == "openai":
        return OpenAICompatibleAdapter(
            base_url="https://api.openai.com/v1",
            model=llm_settings["model"],
            api_key=llm_settings["api_key"],
        )

    if provider == "openai_compatible_custom":
        # any other provider exposing the OpenAI shape, e.g. Groq, Together
        return OpenAICompatibleAdapter(
            base_url=llm_settings["base_url"],
            model=llm_settings["model"],
            api_key=llm_settings.get("api_key"),
        )

    if provider == "anthropic":
        return AnthropicAdapter(
            api_key=llm_settings["api_key"],
            model=llm_settings["model"],
        )

    raise ValueError(f"Unknown LLM provider: {provider}")