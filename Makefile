.PHONY: install lint test build up down logs

# ── Install ──────────────────────────────────
install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm ci

# ── Lint ─────────────────────────────────────
lint:
	cd backend && ruff check .
	cd frontend && npm run lint

# ── Test ─────────────────────────────────────
test:
	cd backend && pytest tests/ -v
	cd frontend && npm run test

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

# ── Full reset ───────────────────────────────
clean:
	docker compose down -v
	docker compose build --no-cache
	docker compose up -d