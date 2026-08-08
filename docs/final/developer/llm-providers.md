# LLM Provider Architecture

Authoritative deep-dive: [`../../design/llm-providers.md`](../../design/llm-providers.md)

## Summary

Supported providers include Hugging Face, Groq, OpenAI, Anthropic, Ollama, vLLM, and custom OpenAI-compatible endpoints.

- **Institution defaults** — admin settings / failover / response cache.
- **Instructor connections** — `/api/v1/llm` CRUD; keys encrypted.
- **Response cache** — `llm_response_cache` table; cleanup on app lifespan.

## Local helpers

- `make install-ollama` / `make run-ollama`
- `make install-vllm` / `make run-vllm`

## Safety

LLM output is interpreted into structured actions and validated; it cannot directly call Canvas. Only allowlisted action kinds reach preview/confirm.
