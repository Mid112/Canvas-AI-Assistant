# app/backend/app/services/llm/llm_setting.py
from app.config import settings
from app.services.llm.anthropic_adapter import AnthropicAdapter
from app.services.llm.base import LLMAdapter
from app.services.llm.openai_compatible import OpenAICompatibleAdapter


def get_llm_adapter(llm_settings: dict) -> LLMAdapter:
    """llm_settings is whatever the settings page persisted for this user
    (or a global default for now, before per-user settings exist)."""
    provider = llm_settings.get("provider", "vllm")

    if provider == "vllm":
        return OpenAICompatibleAdapter(
            base_url=settings.VLLM_BASE_URL,
            model=llm_settings.get("model", settings.VLLM_MODEL),
        )

    if provider == "ollama":
        return OpenAICompatibleAdapter(
            base_url=settings.OLLAMA_BASE_URL,
            model=llm_settings.get("model", settings.OLLAMA_MODEL),
        )

    if provider == "groq":
        return OpenAICompatibleAdapter(
            base_url="https://api.groq.com/openai/v1",
            model=llm_settings.get("model", settings.GROQ_MODEL),
            api_key=llm_settings.get("api_key", settings.GROQ_API_KEY),
        )

    if provider == "huggingface":
        # https://router.huggingface.co/v1 — HF's own router, not a
        # specific inference provider. No ":provider" suffix on the model
        # id (e.g. ":nscale") so HF picks whichever provider currently
        # backs the model rather than pinning one.
        return OpenAICompatibleAdapter(
            base_url="https://router.huggingface.co/v1",
            model=llm_settings.get("model", settings.HF_MODEL),
            api_key=llm_settings.get("api_key", settings.HF_TOKEN),
        )

    if provider == "openai":
        return OpenAICompatibleAdapter(
            base_url="https://api.openai.com/v1",
            model=llm_settings.get("model", settings.OPENAI_MODEL),
            api_key=llm_settings.get("api_key") or settings.OPENAI_API_KEY,
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
            api_key=llm_settings.get("api_key") or settings.ANTHROPIC_API_KEY,
            model=llm_settings.get("model", settings.ANTHROPIC_MODEL),
        )

    raise ValueError(f"Unknown LLM provider: {provider}")
