# Automated tests

Tests live under `test/` by category.

## Backend API integration (`test/backend/`)

```bash
make test
```

Runs pytest from `app/backend` with coverage (`fail_under` from `pyproject.toml`), matching CI. Starts/repairs dev Postgres via `make db-ensure` (port `:5433`), including the idempotent `submissions.grade` migration that ancient local volumes can miss.

Feature suites for #687: `test_integration_*.py` (instructor, admin, preview, RBAC).

Windows: `make test-windows`.

### Fuzz / property-based (`make test-fuzz`)

Hypothesis harness for pure parsers and validators (JSON extraction, MCP
`parse_action`, Canvas URL normalize, secret redaction). The helpers under
test do not hit the network or DB, but `make test-fuzz` still runs
`db-ensure` because shared `test/backend/conftest.py` autouse fixtures expect
Postgres. Marked `fuzz` and excluded from default `make test` / CI (#1301).

After merge, refresh the backend venv so Hypothesis is installed:

```bash
cd app/backend && .venv/bin/pip install -r requirements.txt
make test-fuzz
```

## Frontend unit/component (`test/frontend/`)

```bash
cd app/frontend && npm run test:coverage
```

Or via `make test` / `make test-windows` (same coverage thresholds as CI).

## Browser E2E / Playwright (`test/e2e/`)

Full-app UI coverage for #711–#714. Requires Postgres (`:5433`).

### Canvas sandbox logins

| Email | Password | Role |
|---|---|---|
| `canvas@example.edu` | `canvas-docker` | instructor/admin (ships with image) |
| `student1@example.edu` | `canvas-docker` | student (via `make seed-canvas-students`) |
| `student2@example.edu` | `canvas-docker` | student (via `make seed-canvas-students`) |

`make seed-canvas-students` upserts the two students, creates/reuses **Capstone Project** (`COSC 499`), and enrolls them only in that course.

```bash
make test-e2e
```

See `test/e2e/README.md`.
