# app/backend/app/services/llm/anthropic_adapter.py
import httpx

from app.services.llm.base import LLMAdapter


# Anthropic uses different request/response naming than OpenAI-compatible
# providers, so it needs a separate adapter.
class AnthropicAdapter(LLMAdapter):
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        timeout: float = 30.0,
    ) -> str:
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "max_tokens": 1024,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_message}],
        }

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return data["content"][0]["text"]
