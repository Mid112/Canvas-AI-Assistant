# Configuration Process

Issue: **#1348** · Parent: #1316

## First-time local

1. `make install`
2. Copy `.env.example` → `.env` and generate a unique `CANVAS_TOKEN_ENCRYPTION_KEY`.
3. Copy `app/backend/.env.example` → `app/backend/.env`; set `DATABASE_URL` to compose Postgres (`localhost:5433` for dev) and `SECRET_KEY`.
4. Copy frontend env if needed; default Vite proxy/API URL for local.
5. `make e2e-up` or `make up`.
6. Log in as seeded admin; register an instructor; connect Canvas sandbox or real token.

## Switching LLM backends

- Set institution default in admin settings **or** instructor Settings → AI Models.
- For Ollama/vLLM, start the local process (`make run-ollama` / `make run-vllm`) and point URLs/models at it.

## Enabling MCP

1. Set `MCP_ENABLED=true`.
2. Set `MCP_SHARED_SECRET` and matching backend/MCP env.
3. Set `MCP_ALLOWED_CANVAS_HOSTS` to real Canvas hostnames only.
4. Confirm `MCP_SERVER_URL` routing inside compose.

## Configuration verification (#1362)

- [ ] Backend starts without Settings validation errors
- [ ] CORS allows the frontend origin
- [ ] Fernet key decodes
- [ ] Admin seed works once
- [ ] Instructor Canvas encrypt/decrypt round-trip succeeds
