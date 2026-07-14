# Automated tests

Tests live under `test/` by category.

## Backend API integration (`test/backend/`)

```bash
make test
```

Feature suites for #687: `test_integration_*.py` (instructor, admin, preview, RBAC).

## Frontend unit/component (`test/frontend/`)

```bash
cd app/frontend && npm run test
```

## Browser E2E / Playwright (`test/e2e/`)

Full-app UI coverage for #711–#714. Requires Postgres (`:5433`).

```bash
make test-e2e
```

See `test/e2e/README.md`.
