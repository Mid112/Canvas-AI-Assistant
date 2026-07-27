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
2. **Canvas sandbox** on `:3000` (`canvas_lms` / `make e2e-up`)
3. Backend Python venv at `app/backend/.venv`
4. Frontend deps installed (`cd app/frontend && npm ci`)
5. Demo logins (optional, for manual login): `make seed-demo-users`
   - `admin@example.com` / `AdminPass123!` (admin)
   - `instructor@example.com` / `InstructorPass123!` (instructor)
   - `student1@example.com` / `StudentPass123!` (instructor demo login)
   - `student2@example.com` / `StudentPass123!` (instructor demo login)
   Admin is also created on first backend boot when no admin exists (`ensure_admin.py` / env seed).
6. Live Canvas API token for instructor onboarding:
   - Default sandbox token: `canvas-docker` (lbjay/canvas-docker)
   - Override with `E2E_CANVAS_TOKEN` / `E2E_CANVAS_URL` (default URL `http://localhost:3000`)

Instructor e2e covers both skip/limited-mode onboarding (“Continue without connecting” /
`completeOnboardingWithoutCanvas`) and live Canvas-connected onboarding. A live Canvas
token is required only for the connected specs.

## Run

From repo root (reuses servers if already up via `make e2e-up`):

```bash
make test-e2e
```

Or directly:

```bash
# Ensure Canvas sandbox is up
docker start canvas_lms 2>/dev/null || docker compose -f docker-compose.dev.yml up -d canvas-docker

export E2E_CANVAS_URL=http://localhost:3000
export E2E_CANVAS_TOKEN=canvas-docker

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
