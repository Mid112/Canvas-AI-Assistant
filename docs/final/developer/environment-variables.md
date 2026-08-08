# Environment Variables

Copy from the `*.example` files — **never commit real secrets**.

## Root (`.env.example`)

| Name | Notes |
| --- | --- |
| `CANVAS_TOKEN_ENCRYPTION_KEY` | Fernet key (required) |
| `CANVAS_API_URL` | Optional system Canvas URL |
| `MCP_ENABLED` | Default false |
| `MCP_ALLOWED_CANVAS_HOSTS` | Hostnames when MCP on |

## Backend (`app/backend/.env.example`)

| Group | Names |
| --- | --- |
| Core | `DATABASE_URL`, `SECRET_KEY`, `BACKEND_CORS_ORIGINS`, `ENVIRONMENT` |
| Canvas | `CANVAS_API_URL`, `CANVAS_API_TOKEN`, `CANVAS_TOKEN_ENCRYPTION_KEY` |
| Admin seed | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` |
| LLM | `DEFAULT_LLM_PROVIDER`, `HF_TOKEN`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `VLLM_*`, `OLLAMA_*` |
| MCP | `MCP_SERVER_URL`, `MCP_ENABLED`, `MCP_SHARED_SECRET` |

## Frontend (`app/frontend/.env.example`)

| Name | Notes |
| --- | --- |
| `VITE_API_BASE_URL` | API base |
| `VITE_CANVAS_UBC_URL` | Helper link |
| `VITE_CANVAS_UBCO_URL` | Helper link |

## Compose

Also uses `POSTGRES_*`, published ports, and injects backend CORS / encryption keys. See `docker-compose.yml` and `docker-compose.dev.yml`.
