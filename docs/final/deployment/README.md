# Deployment Package

| Doc | Purpose |
| --- | --- |
| [installation-guide.md](./installation-guide.md) | Clean install from clone |
| [deployment-guide.md](./deployment-guide.md) | Compose / nginx production-style deploy |

## Package contents (what reviewers need)

- This documentation tree under `docs/final/`
- `Makefile`, `docker-compose.yml`, `docker-compose.dev.yml`
- `.env.example` files (root, backend, frontend)
- `db/init`, `db/migrations`
- `app/backend`, `app/frontend`, `app/mcp`, `nginx/`
- Test entrypoints: `make test`, `test/README.md`
