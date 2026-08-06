# Docker Deployment

Issue: **#1347** · Parent: #1316 · related #1366

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

## Networking checklist (#1355)

- [ ] Frontend reaches API via nginx `/api` or `VITE_API_BASE_URL`
- [ ] Backend reaches Postgres hostname from compose network
- [ ] Backend reaches Canvas URL (public or sandbox)
- [ ] If MCP enabled: backend ↔ MCP on internal network; Canvas hosts allowlisted
- [ ] No accidental publish of MCP/Postgres in locked-down prod

## Container checks (#1358–#1361)

| Check | Issue | Pass criteria |
|-------|-------|---------------|
| Compose up healthy | #1358 | `make up` / compose ps healthy |
| Frontend container | #1359 | UI loads on `:8888` |
| Backend container | #1360 | `/health` OK |
| DB init | #1361 | migrations applied; admin can log in |
| Env config | #1362 | required vars set; app starts |
| Canvas config | #1363 | instructor can validate token |
| Ollama config | #1364 | optional; provider reachable if selected |
| Hosted LLM config | #1365 | API keys present for chosen provider |

Details: [`../deployment/deployment-guide.md`](../deployment/deployment-guide.md).
