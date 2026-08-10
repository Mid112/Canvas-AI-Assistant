# Deployment Guide

## Architecture (deployed)

```
Browser → nginx :8888 → frontend static
                      → /api → FastAPI → Postgres
                                       → Canvas
                                       → MCP (optional)
                                       → LLM providers
```

## Production-oriented steps

1. Provision host with Docker.
2. Set strong secrets: `SECRET_KEY`, `CANVAS_TOKEN_ENCRYPTION_KEY`, `ADMIN_PASSWORD`, provider keys, `MCP_SHARED_SECRET` if used.
3. Configure `BACKEND_CORS_ORIGINS` to the public UI origin.
4. Set `CANVAS_API_URL` **or** rely on per-instructor Canvas URLs.
5. If MCP: enable allowlist of real Canvas hostnames only.
6. `make build && make up` (or equivalent CI/CD compose deploy).
7. Restrict published ports; keep Postgres/MCP internal.
8. Backup Postgres volumes; monitor `/health` and admin System Health.

## Configuration matrices

See [../developer/environment-variables.md](../developer/environment-variables.md) and [../developer/docker-deployment.md](../developer/docker-deployment.md).

## Rollback

- Redeploy previous image tags / git SHA.
- Restore Postgres from backup if schema migrated forward incompatibly.
- Prefer forward-fix migrations; test `make migrate` on staging first.
