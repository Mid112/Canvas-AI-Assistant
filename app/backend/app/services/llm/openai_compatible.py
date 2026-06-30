# app/backend/app/services/llm/openai_compatible.py
import httpx

from app.services.llm.base import LLMAdapter


class OpenAICompatibleAdapter(LLMAdapter):
    """Works for any provider exposing POST {base_url}/chat/completions following the OpenAI API spec"""

    def __init__(self, base_url: str, model: str, api_key: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key

    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        timeout: float = 30.0,
    ) -> str:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        }

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
