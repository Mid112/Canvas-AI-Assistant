<!-- Docs note: records project context for the llm providers area; keep this aligned with implementation changes. -->

# LLM providers and response caching

Instructors connect and choose their own AI providers in **Instructor
Settings → AI Models** or directly from the chat model switcher. Administrators
set only the institution default and optional failover/cache policy in **Admin
Settings → AI provider defaults**.

## Supported providers

- Hugging Face and Groq use their OpenAI-compatible hosted APIs.
- OpenAI uses its hosted chat-completions API.
- Anthropic uses its Messages API.
- Ollama and vLLM use local OpenAI-compatible endpoints.
- Custom OpenAI-compatible lets an instructor connect their own endpoint.

Hosted API keys can come from deployment secrets (`HF_TOKEN`, `GROQ_API_KEY`,
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) or from an instructor's own stored key.
Instructor keys are Fernet-encrypted at rest with the same
`CANVAS_TOKEN_ENCRYPTION_KEY` used for Canvas tokens (`encrypt_llm_api_key` /
`decrypt_llm_api_key` in `app.core.security`) and are never returned by the API.
Chat requests that include a client `api_key` are rejected. Exception text that
is logged or stored in conversation history is scrubbed by
`app.core.secret_redaction` so bearer tokens and common API-key shapes cannot
leak into logs or message rows.
Local endpoint URLs and default models are configured in the backend environment.
See `app/backend/.env.example`.

The settings UI keeps the full provider catalog visible. Connected providers
render normally; disconnected providers are greyed out until the instructor
connects them or the server is configured.

## Runtime switching and failover

The server validates every instructor-selected provider against a known provider
id and resolves credentials from stored instructor keys or deployment secrets.
Client-supplied API keys in chat requests are rejected. Client-supplied
`base_url` values in chat are unused; URLs come from server config or the
instructor's stored connection.

Assignment and message drafting use the admin default because those workflows do
not currently expose an instructor model picker.

The in-chat switcher selects among **connected providers** (model is configured
in Settings; the switcher shows `models[0]` as a subtitle). Disconnect applies
when a personal API key is stored (`has_api_key`).

Failover is disabled by default. An administrator may explicitly select a
different configured fallback. Failover only handles provider transport,
timeout, rate-limit, and HTTP failures.

## Response caching

Caching is enabled by default with a five-minute expiration and can be changed
or disabled by an administrator. Cache entries:

- are scoped to one user and one provider/model;
- store a SHA-256 request key rather than raw prompt text;
- are created only for short, first-turn conversational `respond` results;
- bypass conversation history, course-scoped requests, Canvas reads/writes,
  previews, multi-step actions, and prompts with common sensitive-data
  indicators;
- expire automatically and are replaced when the provider, model, prompt, or
  system safety instructions change; and
- are periodically deleted by the backend lifespan background loop
  (`delete_expired_cache_entries`) in addition to on-read expiry cleanup.

The cache uses PostgreSQL (`llm_response_cache`) so behavior is consistent
across backend workers.

## Deployment

1. Configure at least one provider in the backend environment.
2. Start the backend so migrations `024_llm_response_cache.sql`,
   `025_instructor_llm_connections.sql`, and
   `026_deferred_assistant_requests.sql` are applied.
3. Optionally sign in as an administrator and set the institution default.
4. Instructors connect providers and choose a model in Settings or chat.
