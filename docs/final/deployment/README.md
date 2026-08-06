# Deployment Package

Parents: **#1318** Deployment Package · **#1319** Deployment Validation  
Finalize: **#1366**, **#1409**, **#1410**

| Doc | Purpose |
|-----|---------|
| [installation-guide.md](./installation-guide.md) | Clean install from clone |
| [deployment-guide.md](./deployment-guide.md) | Compose / nginx production-style deploy |
| [validation-checklist.md](./validation-checklist.md) | #1353–#1357, #1358–#1365 verification |

## Package contents (what reviewers need)

- This documentation tree under `docs/final/`
- `Makefile`, `docker-compose.yml`, `docker-compose.dev.yml`
- `.env.example` files (root, backend, frontend)
- `db/init`, `db/migrations`
- `app/backend`, `app/frontend`, `app/mcp`, `nginx/`
- Test entrypoints: `make test`, `test/README.md`
