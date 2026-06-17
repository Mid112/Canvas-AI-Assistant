.PHONY: install lint test build up down logs restart clean migrate migrate-new db-shell db-reset

# ── Install ──────────────────────────────────
# Creates a venv (if one doesn't exist) and installs backend deps
# into it, plus installs frontend Node deps.
install:
	cd app/backend && python3 -m venv .venv
	cd app/backend && .venv/bin/pip install --upgrade pip
	cd app/backend && .venv/bin/pip install -r requirements.txt
	cd app/frontend && npm ci

# ── Lint ─────────────────────────────────────
# Checks code style/quality without running tests.
lint:
	cd app/backend && .venv/bin/ruff check .
	cd app/frontend && npm run lint

# ── Test ─────────────────────────────────────
# Runs backend tests (pytest, against test/backend/) and
# frontend tests (vitest, proxied via package.json).
# PYTHONPATH points at app/backend so `from app.main import app`
# resolves correctly even though tests live in test/backend/.
test:
	PYTHONPATH=./app/backend DATABASE_URL=postgresql+asyncpg://appuser:changeme@localhost:5432/appdb app/backend/.venv/bin/pytest test/backend/ -v
	cd app/frontend && npm run test

# ── Docker ───────────────────────────────────
build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

restart:
	docker compose restart

# ── Database ─────────────────────────────────
# NOTE: these assume Alembic is wired up. Until then, schema
# changes are applied via db/init/01_schema.sql on first
# postgres startup, or manually with db-shell.
migrate:
	cd app/backend && .venv/bin/alembic upgrade head

migrate-new:
	cd app/backend && .venv/bin/alembic revision --autogenerate -m "$(msg)"
	# usage: make migrate-new msg="add canvas_token to users"

db-shell:
	docker compose exec postgres psql -U appuser -d appdb

db-reset:
	docker compose down -v
	docker compose up -d postgres
	sleep 5
	make migrate

# ── Full reset ───────────────────────────────
# Nukes everything (containers, volumes, images) and rebuilds
# from scratch. Use when things are in a broken/inconsistent state.
clean:
	docker compose down -v
	docker compose build --no-cache
	docker compose up -d