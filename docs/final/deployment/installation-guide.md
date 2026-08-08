# Installation Guide

## Prerequisites

- Docker + Docker Compose
- Python 3.12+ (for native backend / venv)
- Node 22.13+ (see `.nvmrc` / `.node-version`)
- Make
- Optional: Ollama or vLLM for local models

## Clean install

```bash
git clone <repo-url>
cd capstone-team-16
git checkout <release-tag-or-branch>
make install
cp .env.example .env
# Edit CANVAS_TOKEN_ENCRYPTION_KEY — generate a new Fernet key
cp app/backend/.env.example app/backend/.env
# Set DATABASE_URL, SECRET_KEY, admin seed, provider keys as needed
```

### Option A — Developer loop (recommended for contributors)

```bash
make e2e-up
# API http://localhost:8000
# UI  http://localhost:5173
# Canvas sandbox http://localhost:3000
```

### Option B — Full compose stack

```bash
make build && make up
# App http://localhost:8888
```

## Startup procedure

1. Start dependencies (`e2e-up` or `up`).
2. Wait for Postgres healthy / migrations.
3. Hit `/health`.
4. Open UI; admin login; create instructor; connect Canvas.
5. Smoke: list courses, open assistant, run a **read** prompt.

## Verify web deployment

- [ ] UI loads over HTTP(S)
- [ ] Login works
- [ ] API calls succeed (no CORS failures)
- [ ] Static assets load through nginx (compose mode)
