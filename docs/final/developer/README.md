# Developer Documentation

Parent: **#1316**

| Topic | File | Issue |
|-------|------|-------|
| Backend architecture | [backend-architecture.md](./backend-architecture.md) | #1339 |
| API endpoints | [api-endpoints.md](./api-endpoints.md) | #1340 |
| Authentication | [authentication.md](./authentication.md) | #1341 |
| Canvas integration | [canvas-integration.md](./canvas-integration.md) | #1342 |
| LLM providers | [llm-providers.md](./llm-providers.md) | #1343 |
| MCP architecture | [mcp-architecture.md](./mcp-architecture.md) | #1344 |
| Database schema | [database-schema.md](./database-schema.md) | #1345 |
| Environment variables | [environment-variables.md](./environment-variables.md) | #1346 |
| Docker deployment | [docker-deployment.md](./docker-deployment.md) | #1347 |
| Configuration | [configuration.md](./configuration.md) | #1348 |

Final packaged copies also live at:
- [`../architecture.md`](../architecture.md) (#1407)
- [`../api-reference.md`](../api-reference.md) (#1408)

## Quick start (developers)

```bash
make install
cp .env.example .env
# also configure app/backend/.env from app/backend/.env.example
make e2e-up          # Postgres + Canvas sandbox; API :8000; Vite :5173
make test            # pytest + vitest coverage
```

See [`../deployment/installation-guide.md`](../deployment/installation-guide.md).
