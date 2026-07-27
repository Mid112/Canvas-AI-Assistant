# Automated tests

Tests live under `test/` by category.

## Backend API integration (`test/backend/`)

```bash
make test
```

Runs pytest from `app/backend` with coverage (`fail_under` from `pyproject.toml`), matching CI. Starts/repairs dev Postgres via `make db-ensure` (port `:5433`), including the idempotent `submissions.grade` migration that ancient local volumes can miss.

Feature suites for #687: `test_integration_*.py` (instructor, admin, preview, RBAC).

Windows: `make test-windows`.

## Frontend unit/component (`test/frontend/`)

```bash
cd app/frontend && npm run test:coverage
```

Or via `make test` / `make test-windows` (same coverage thresholds as CI).

## Browser E2E / Playwright (`test/e2e/`)

Full-app UI coverage for #711–#714. Requires Postgres (`:5433`).

```bash
make test-e2e
```

See `test/e2e/README.md`.
