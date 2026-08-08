# Docker Deployment

## Dev compose (`docker-compose.dev.yml`)

Typical services: Postgres (`5433`), Canvas sandbox (`3000`), optional MCP. Used by `make dev`, `make e2e-up`, `make db-ensure`.

## Prod-style compose (`docker-compose.yml`)

Builds frontend + backend (+ MCP as configured), Postgres, nginx on **`:8888`** proxying `/` and `/api`.

```bash
make build
make up
make logs
make down
```

## Networking checklist

- [ ] Frontend reaches API via nginx `/api` or `VITE_API_BASE_URL`
- [ ] Backend reaches Postgres hostname from compose network
- [ ] Backend reaches Canvas URL (public or sandbox)
- [ ] If MCP enabled: backend ↔ MCP on internal network; Canvas hosts allowlisted
- [ ] No accidental publish of MCP/Postgres in locked-down prod

## Container checks

| Check | Pass criteria |
| --- | --- |
| Compose up healthy | `make up` / compose ps healthy |
| Frontend container | UI loads on `:8888` |
| Backend container | `/health` OK |
| DB init | migrations applied; admin can log in |
| Env config | required vars set; app starts |
| Canvas config | instructor can validate token |
| Ollama config | optional; provider reachable if selected |
| Hosted LLM config | API keys present for chosen provider |

Details: [`../deployment/deployment-guide.md`](../deployment/deployment-guide.md).
