.PHONY: install install-vllm lint lint-fix test test-llm test-fresh build up down logs restart clean migrate migrate-new db-shell db-reset run-vllm

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

# ── Test LLM adapter ─────────────────────────
# Runs just the LLM adapter test (test/backend/llm_test.py) against a
# live vLLM instance. Requires `make run-vllm` running in another
# terminal first — this does NOT start vLLM for you, since vLLM is a
# long-running process meant to stay up across multiple test runs.
test-llm:
	PYTHONPATH=./app/backend app/backend/.venv/bin/pytest test/backend/llm_test.py -v

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