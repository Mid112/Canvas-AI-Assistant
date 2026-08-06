# Authentication Flow

Issue: **#1341** · Parent: #1316

## Roles

- **Instructor** — teaching workflows; must complete Canvas onboarding for full Canvas features.
- **Admin** — governance, health, audit, instructor management.

## Instructor auth

1. `POST /api/v1/auth/register` / `POST /api/v1/auth/login`
2. Receive JWT; frontend stores and sends Bearer token.
3. `GET /api/v1/auth/me` for profile + onboarding state.
4. Canvas token: `PATCH /api/v1/auth/me/canvas-token` (encrypted at rest).
5. Logout / session revoke endpoints invalidate server-side session state where tracked.

Password reset: request + confirm endpoints under `/auth` (wired to email/token table `password_reset_tokens`).

### Password policy

Shared rules in `app/core/password_policy.py` for register / reset / change:

- Minimum **8** characters
- At least one uppercase, one lowercase, one digit, and one symbol (non-alphanumeric)

Frontend surfaces a live requirements checklist. Changing password may **revoke other sessions**.

## Admin auth

- `POST /api/v1/auth/admin/login`
- Admin sessions recorded in `sessions` (and related audit session tables).
- Seeded via `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` on startup when configured.

## Frontend gates

- `ProtectedRoute` — must be logged in; instructors redirected through Canvas onboarding when incomplete.
- `RoleRoute` — `instructor` vs `admin` path trees.

## Security notes

- JWT `SECRET_KEY` required.
- Canvas tokens never returned to the LLM.
- Client-supplied chat API keys for providers are rejected; instructors use stored encrypted connections.
