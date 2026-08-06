# Canvas Connection Guide

Issue: **#1330** · Parent: #1315

## Why connect Canvas

The assistant and course UIs read (and, after confirm, write) Canvas data using **your** instructor token. Tokens are stored **encrypted** (Fernet) and are not sent to the LLM.

## First-time onboarding

1. After login, open **Canvas info** (`/canvas-info`).
2. Continue to **Connect Canvas** (`/connect-canvas`).
3. Paste a Canvas access token with the permissions your institution requires for the supported workflows.
4. **Review permissions** (`/review-permissions`) and continue.

> **Screenshot placeholder:** `canvas-connect.png`  
> *[Add screenshot here]*

> **Screenshot placeholder:** `canvas-permissions.png`  
> *[Add screenshot here]*

## Managing the connection later

**Settings → Canvas Connection**
- Validate the current token.
- Replace an expired/revoked token.
- See connection health / institution URL hints (UBC / UBCO front-end helpers may appear depending on build).

API surface (for developers): `PATCH /api/v1/auth/me/canvas-token` (and related me/session endpoints).

## Multi-institution notes

- Optional system `CANVAS_API_URL` may be empty so each instructor/course carries its Canvas host.
- MCP (if enabled) only calls hosts on `MCP_ALLOWED_CANVAS_HOSTS`.

## Failure modes

| Symptom | Likely cause | Recovery |
|---------|--------------|----------|
| Auth / Canvas error page | Bad URL or token | Re-enter token; check host |
| Empty courses | Wrong account / scopes | New token with course access |
| Admin shows failing connection | Token revoked or Canvas down | Instructor reconnect; admin troubleshooting |
| “Limited mode” behaviour | No usable credentials | Complete connection |

## Admin revoke

Administrators can revoke an instructor’s Canvas access. After revoke, the instructor must reconnect before Canvas-backed tools work again.
