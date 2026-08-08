# Developer Documentation

| Topic | File |
| --- | --- |
| Backend architecture | [backend-architecture.md](./backend-architecture.md) |
| API endpoints | [api-endpoints.md](./api-endpoints.md) |
| Authentication | [authentication.md](./authentication.md) |
| Canvas integration | [canvas-integration.md](./canvas-integration.md) |
| LLM providers | [llm-providers.md](./llm-providers.md) |
| MCP architecture | [mcp-architecture.md](./mcp-architecture.md) |
| Database schema | [database-schema.md](./database-schema.md) |
| Environment variables | [environment-variables.md](./environment-variables.md) |
| Docker deployment | [docker-deployment.md](./docker-deployment.md) |
| Configuration | [configuration.md](./configuration.md) |

Final packaged copies also live at:
- [`../architecture.md`](../architecture.md)
- [`../api-reference.md`](../api-reference.md)

## Quick start (developers)

```bash
make install
cp .env.example .env
# also configure app/backend/.env from app/backend/.env.example
make e2e-up          # Postgres + Canvas sandbox; API :8000; Vite :5173
make test            # pytest + vitest coverage
```

See [`../deployment/installation-guide.md`](../deployment/installation-guide.md).
