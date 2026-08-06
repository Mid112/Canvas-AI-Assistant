"""Service note: owns backend openai compatible business logic behind routers, tests, and assistant tool execution."""

import httpx

from app.services.llm.base import LLMAdapter


class OpenAICompatibleAdapter(LLMAdapter):
    """Works for any provider exposing POST {base_url}/chat/completions
    following the OpenAI API spec. Covers vLLM (local) and any third-party
    provider with an OpenAI-compatible endpoint (Groq, Together, etc.)."""

    def __init__(self, base_url: str, model: str, api_key: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key

    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        timeout: float = 30.0,
        history: list[dict] | None = None,
    ) -> str:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        messages = [{"role": "system", "content": system_prompt}]
        if history:
            # inject previous turns between the system prompt and the
            # current user message so the LLM sees the full conversation
            # context for follow up and refinement turns
            messages.extend(history)
        messages.append({"role": "user", "content": user_message})

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                # "Thinking" models (e.g. Qwen3) spend several hundred to a few
                # thousand tokens on <think> reasoning before ever emitting the
                # answer — too low a cap truncates mid-thought and the caller
                # never sees any JSON. 2048 was still not enough for requests
                # reasoning over several parameters at once (e.g. assignment
                # creation with name+course+points+due date, or composing a
                # message body); 4096 in turn wasn't enough once course-name
                # resolution (reasoning over a candidate list of course names
                # on every turn, see services/chat.py) was added on top —
                # raised to 8192.
                json={"model": self.model, "messages": messages, "max_tokens": 8192},
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]
