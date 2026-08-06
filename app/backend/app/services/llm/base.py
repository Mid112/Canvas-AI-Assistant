"""LLM note: defines provider-neutral request/response contracts used by OpenAI-compatible and Anthropic adapters."""
from abc import ABC, abstractmethod


class LLMAdapter(ABC):
    """Every LLM backend (local or third-party) implements this interface.
    The rest of the app only ever talks to this interface, never to a
    specific provider's SDK or request shape directly."""

    @abstractmethod
    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        timeout: float = 30.0,
        history: list[dict] | None = None,
    ) -> str:
        """Returns the raw text response from the LLM. Raises on timeout
        or HTTP failure — callers handle those, adapters don't swallow them."""
        ...
