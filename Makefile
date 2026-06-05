.PHONY: install lint test build up down logs restart clean migrate migrate-new db-shell db-reset

# ── Install ──────────────────────────────────
install:
	cd test/backend && pip install -r requirements.txt
	cd test/frontend && npm ci

# ── Lint ─────────────────────────────────────
lint:
	cd test/backend && ruff check .
	cd test/frontend && npm run lint

# ── Test ─────────────────────────────────────
test:
	cd test/backend && DATABASE_URL=postgresql+asyncpg://appuser:changeme@localhost:5432/appdb pytest tests/ -v
	cd test/frontend && npm run test

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
migrate:
	cd test/backend && alembic upgrade head

migrate-new:
	cd test/backend && alembic revision --autogenerate -m "$(msg)"
	# usage: make migrate-new msg="add canvas_token to users"

db-shell:
	docker compose exec postgres psql -U appuser -d appdb

db-reset:
	docker compose down -v
	docker compose up -d postgres
	sleep 5
	make migrate

# ── Full reset ───────────────────────────────
clean:
	docker compose down -v
	docker compose build --no-cache
	docker compose up -d
