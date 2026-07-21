.PHONY: install install-vllm install-ollama lint lint-fix test test-llm test-ollama test-vague-llm test-e2e test-fresh build up down logs restart clean migrate migrate-new db-shell db-reset run-vllm run-ollama dev e2e-up reload

# ── Install ──────────────────────────────────
# Creates a venv (if one doesn't exist) and installs backend deps
# into it, plus installs frontend Node deps.
install:
	cd app/backend && python3 -m venv .venv
	cd app/backend && .venv/bin/pip install --upgrade pip
	cd app/backend && .venv/bin/pip install -r requirements.txt
	cd app/frontend && npm ci

# ── Install vLLM ─────────────────────────────
# Creates a dedicated venv for vLLM at ~/vllm-env (kept separate from
# the backend's venv since vLLM has heavy, sometimes conflicting deps)
# and downloads the Qwen3-4B model. Run once per machine.
install-vllm:
	python3.12 -m venv ~/vllm-env
	~/vllm-env/bin/pip install --upgrade pip
	~/vllm-env/bin/pip install vllm
	~/vllm-env/bin/hf download Qwen/Qwen3-4B

# ── Install Ollama ───────────────────────────
# Installs Ollama via the official installer and pulls the default model.
# Run once per machine. Requires curl and a network connection.
install-ollama:
	curl -fsSL https://ollama.com/install.sh | sh
	ollama pull llama3.2

# ── Lint ─────────────────────────────────────
# Checks code style/quality without running tests.
lint:
	cd app/backend && .venv/bin/ruff check .
	cd app/frontend && npm run lint

# ── Lint Fix ─────────────────────────────────
# Auto-fixes safe, non-breaking issues: import sorting, unused
# imports, trailing whitespace, missing trailing newlines, and
# similar syntax modernizations (e.g. datetime.UTC alias).
# Ruff only applies fixes it's confident are behavior-preserving —
# it will NOT touch things like the E731 lambda-assignment warning
# or line-length (E501) issues, since fixing those requires a
# human decision about how to restructure the code.
lint-fix:
	cd app/backend && .venv/bin/ruff check . --fix
	cd app/backend && .venv/bin/ruff format .
	cd app/frontend && npm run lint -- --fix

# ── Test ─────────────────────────────────────
# Runs backend tests (pytest, against test/backend/) and
# frontend tests (vitest, proxied via package.json).
# PYTHONPATH points at app/backend so `from app.main import app`
# resolves correctly even though tests live in test/backend/.
# Assumes dev postgres (docker-compose.dev.yml) is already running.
test:
	PYTHONPATH=./app/backend DATABASE_URL=postgresql+asyncpg://appuser:localdev@localhost:5433/appdb app/backend/.venv/bin/pytest test/backend/ -v
	cd app/frontend && npm run test

# ── Browser E2E (Playwright) ─────────────────
# Full-app UI flows for #687 / #711–#714. Requires Postgres on :5433.
# Reuses backend (:8000) / frontend (:5173) if already running (e.g. make e2e-up);
# otherwise Playwright starts them via webServer. Canvas sandbox is optional.
test-e2e:
	docker compose -f docker-compose.dev.yml up -d postgres
	@echo "Waiting for Postgres..."
	@sleep 3
	cd test/e2e && npm ci
	cd test/e2e && npx playwright install --with-deps chromium
	cd test/e2e && npm test

# ── Test LLM adapter ─────────────────────────
# Runs the LLM adapter test (test/backend/llm_test.py). This test mocks
# the httpx call to the LLM, so it does NOT require vLLM running — it
# verifies the adapter's request/response handling logic in isolation.
test-llm:
	PYTHONPATH=./app/backend app/backend/.venv/bin/pytest test/backend/llm_test.py -v

# ── Test Ollama ──────────────────────────────
# Integration test against a running Ollama server. Requires:
# make install-ollama && make run-ollama
test-ollama:
	PYTHONPATH=./app/backend app/backend/.venv/bin/pytest test/ollama/test_ollama.py -v

# ── Test from scratch ─────────────────────────
# Full reset: tears down any running stack (dev or prod), starts
# a fresh dev postgres, reinstalls backend deps into a clean venv,
# then runs the full test suite. Use this when something's in a
# broken/inconsistent state, or before a milestone demo to confirm
# everything genuinely works from zero.
test-fresh:
	docker compose down -v
	docker compose -f docker-compose.dev.yml down -v
	docker compose -f docker-compose.dev.yml up postgres -d
	sleep 5
	rm -rf app/backend/.venv
	cd app/backend && python3 -m venv .venv
	cd app/backend && .venv/bin/pip install --upgrade pip
	cd app/backend && .venv/bin/pip install -r requirements.txt
	make test

# ── Dev ──────────────────────────────────────
# Starts the full local dev environment in one command:
# Postgres (Docker), Canvas sandbox (Docker), and the FastAPI backend
# (native uvicorn with hot reload). Frontend is not started here since
# it's a separate long-running process — run `cd app/frontend && npm
# run dev` in its own terminal if you need the UI.
# Canvas sandbox (canvas_lms) must already exist — run
# `docker run -d --name canvas_lms -p 3000:3000 lbjay/canvas-docker`
# once to create it. This target just starts it if it's stopped.
# Uses Groq as the LLM provider by default — no vLLM needed.
# Ctrl+C stops the backend; Postgres and Canvas keep running.
dev:
	@echo "Starting Postgres..."
	docker compose -f docker-compose.dev.yml up -d postgres
	@echo "Starting Canvas sandbox..."
	docker start canvas_lms 2>/dev/null || echo "canvas_lms container not found — run: docker run -d --name canvas_lms -p 3000:3000 lbjay/canvas-docker"
	@echo "Waiting for Postgres..."
	sleep 3
	@echo "Starting backend on :8000..."
	lsof -ti :8000 | xargs kill -9
	cd app/backend && .venv/bin/python -m uvicorn app.main:app --reload

# ── E2E Dev Stack ────────────────────────────
# Starts the stack used for manual end-to-end testing:
#   - Postgres and Canvas sandbox in Docker
#   - FastAPI backend natively from app/backend/.venv on :8000
#   - Vite frontend on :5173
#
# The Docker backend is stopped because the current image can lag behind
# local backend dependencies. Ctrl+C stops the native backend/frontend;
# Postgres and Canvas keep running for the next e2e session.
e2e-up:
	@echo "Starting Postgres and Canvas sandbox..."
	docker compose -f docker-compose.dev.yml up -d postgres canvas-docker
	@echo "Stopping Docker backend container; e2e uses the native backend..."
	-docker compose -f docker-compose.dev.yml stop backend >/dev/null 2>&1
	@echo "Freeing backend/frontend ports..."
	@pids=$$(lsof -ti :8000 :5173 2>/dev/null); \
	if [ -n "$$pids" ]; then \
		kill $$pids 2>/dev/null || true; \
		sleep 1; \
		stuck=$$(lsof -ti :8000 :5173 2>/dev/null); \
		if [ -n "$$stuck" ]; then kill -9 $$stuck 2>/dev/null || true; fi; \
	fi
	@echo "Starting backend on http://localhost:8000 and frontend on http://localhost:5173"
	@echo "Default e2e admin seed: admin@example.com / AdminPass123!"
	@trap 'kill 0' INT TERM EXIT; \
	(cd app/backend && \
		DATABASE_URL=$${DATABASE_URL:-postgresql+asyncpg://appuser:localdev@localhost:5433/appdb} \
		SECRET_KEY=$${SECRET_KEY:-localdevsecret} \
		DEBUG=false \
		BACKEND_CORS_ORIGINS=$${BACKEND_CORS_ORIGINS:-http://localhost:5173} \
		CANVAS_API_URL=$${CANVAS_API_URL:-http://localhost:3000} \
		CANVAS_TOKEN_ENCRYPTION_KEY=$${CANVAS_TOKEN_ENCRYPTION_KEY:-ebcquOyeXkl8geXIi5sS4BYEeh1mYSdWHiSuBkXr9T4=} \
		ADMIN_EMAIL=$${ADMIN_EMAIL:-admin@example.com} \
		ADMIN_PASSWORD=$${ADMIN_PASSWORD:-AdminPass123!} \
		ADMIN_NAME=$${ADMIN_NAME:-Administrator} \
		.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload) & \
	(cd app/frontend && npm run dev -- --host 0.0.0.0) & \
	wait

# ── Reload ───────────────────────────────────
# Kills whatever's on :8000/:5173 and restarts the native backend and
# frontend cleanly — use this after a `git pull` to pick up new code
# without touching Postgres/Canvas (assumes they're already running via
# `make dev` or `make e2e-up`; if they're not, start those first).
# Ctrl+C stops both together.
reload:
	@echo "Freeing backend/frontend ports..."
	@pids=$$(lsof -ti :8000 :5173 2>/dev/null); if [ -n "$$pids" ]; then kill -9 $$pids; fi
	@sleep 1
	@echo "Starting backend on http://localhost:8000 and frontend on http://localhost:5173"
	@trap 'kill 0' INT TERM EXIT; \
	(cd app/backend && .venv/bin/python -m uvicorn app.main:app --reload) & \
	(cd app/frontend && npm run dev) & \
	wait

# ── Run vLLM ─────────────────────────────────
# Starts vLLM's OpenAI-compatible server on port 8001 (8000 is
# reserved for the FastAPI backend — do not change this port without
# also updating VLLM_BASE_URL in app/backend/.env.example and .env).
# Leave this running in its own terminal — it's long-lived, not a
# one-shot command. First run also downloads the model if you skipped
# `make install-vllm`, which can take several minutes.
run-vllm:
	~/vllm-env/bin/python -m vllm.entrypoints.openai.api_server \
		--model Qwen/Qwen3-4B \
		--host 0.0.0.0 \
		--port 8001 \
		--max-model-len 4096

# ── Run Ollama ───────────────────────────────
# Starts the Ollama server with the default model available at
# http://localhost:11434/v1 for OpenAI-compatible clients.
run-ollama:
	ollama serve

test-vague-llm:
	app/backend/.venv/bin/python app/backend/app/non_unit_test/test_vague_llm.py

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
	docker compose -f docker-compose.dev.yml exec postgres psql -U appuser -d appdb

db-reset:
	docker compose -f docker-compose.dev.yml down -v
	docker compose -f docker-compose.dev.yml up -d postgres
	sleep 5
	make migrate

# ── Full reset ───────────────────────────────
# Nukes everything (containers, volumes, images) and rebuilds
# from scratch. Use when things are in a broken/inconsistent state.
clean:
	docker compose down -v
	docker compose build --no-cache
	docker compose up -d
