# Browser end-to-end tests (Playwright)

Covers full-app UI flows for Integration Testing (#687):

| Issue | Spec |
|-------|------|
| #711 Instructor | `specs/instructor.spec.ts` |
| #712 Admin | `specs/admin.spec.ts` |
| #713 Preview/confirm | `specs/preview.spec.ts` |
| #714 RBAC | `specs/rbac.spec.ts` |
| Smoke | `specs/landing.spec.ts` |

## Prerequisites

1. Postgres on `:5433` (started by `make e2e-up` / `docker compose -f docker-compose.dev.yml up -d postgres`)
2. Backend Python venv at `app/backend/.venv`
3. Frontend deps installed (`cd app/frontend && npm ci`)
4. Default admin seed available: `admin@example.com` / `AdminPass123!`  
   (created on first backend boot when no admin exists)

Canvas sandbox is **not** required for this suite — instructor flows use “Continue without connecting”. Real Canvas token flows remain covered by API integration tests.

## Run

From repo root (reuses servers if already up via `make e2e-up`):

```bash
make test-e2e
```

Or directly:

```bash
cd test/e2e
npm ci
npx playwright install chromium
npm test
```

Headed / UI mode:

```bash
npm run test:headed
npm run test:ui
```
