# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Canvas LMS instructor assistant: FastAPI backend + React frontend, with a natural-language
chat assistant that reads/writes Canvas data (courses, assignments, submissions, messages) on
the instructor's behalf, gated behind an explicit preview/confirm step before anything mutates
Canvas. There is also a standalone MCP server (`app/mcp`) — see the backend request-flow section
below, it is not part of the live request path.

Repo layout: `app/backend` (FastAPI), `app/frontend` (Vite/React), `app/mcp` (standalone MCP
server, currently unused by the backend), `test/backend` `test/frontend` `test/mcp` `test/ollama`
`test/vllm` (all tests live outside `app/`), `db/init` (schema bootstrap SQL).

## Commands

Run all commands from the repo root; the `Makefile` targets are the source of truth.

```bash
make install        # backend venv (app/backend/.venv) + pip install + frontend npm ci
make dev             # postgres + canvas sandbox in Docker, native uvicorn on :8000 (hot reload)
                     # frontend is separate: cd app/frontend && npm run dev  (:5173)
make test            # backend pytest (test/backend/) + frontend vitest, assumes dev postgres is up
make lint            # ruff check (backend) + eslint (frontend)
make lint-fix         # ruff check --fix + ruff format + eslint --fix
make test-llm         # test/backend/llm_test.py only — mocks the httpx call, no live LLM needed
make migrate          # alembic upgrade head
make db-reset         # wipe dev postgres volume, recreate, migrate
make e2e-up           # full manual e2e stack: postgres+canvas in Docker, native backend :8000
                      # and native frontend :5173 in separate windows (Windows-only, uses
                      # `Start-Process powershell`)
```

Single backend test file/case (mirrors what `make test` does under the hood):
```bash
PYTHONPATH=./app/backend DATABASE_URL=postgresql+asyncpg://appuser:localdev@localhost:5433/appdb \
  app/backend/.venv/bin/pytest test/backend/test_chat_confirm.py -v -k test_name
```
On Windows the venv binaries are under `app/backend/.venv/Scripts/` (not `bin/`).

Single frontend test file (test files live in `test/frontend`, not next to the source in
`app/frontend/src`):
```bash
cd app/frontend && npm run test -- path/to/some.test.ts
# equivalent to: npm --prefix ../../test/frontend run test
```

MCP server tests (`test/mcp/`) need their own venv (`requirements.txt` in that folder) and the
MCP server actually running on `:8001` — it is not started by `docker-compose.dev.yml`, only by
the full prod `docker-compose.yml`.

## Architecture

### Backend request flow for the AI assistant

`routers/chat.py` → `services/chat.py` → `mcp_tools/dispatcher.py`. The naming is a trap: despite
living under `mcp_tools/`, `dispatcher.py` does **not** talk to the `app/mcp` server — it calls
`services/canvas.py` / `services/messages.py` functions directly. `app/mcp` (FastMCP, its own
Dockerfile, 7 tools) is a separate, currently orphaned artifact not wired into any live path;
don't assume changes there affect the running assistant.

Per chat message:
1. `_resolve_chat_course_context` (services/chat.py) picks the course: explicit
   `local_course_id` from the client > a course name mentioned in the message text > the user's
   `UserPreference.active_course_id` (read fresh from the DB every time, never cached).
2. `get_or_create_conversation` reuses the conversation only if its `course_id` still matches the
   resolved course; otherwise it silently starts a new conversation bound to the new course. This
   is what makes "switch active course mid-chat" behave correctly without a fresh login.
3. The LLM adapter (`services/llm/llm_setting.py::get_llm_adapter`, provider picked by
   `DEFAULT_LLM_PROVIDER` / per-request settings — vllm/ollama/groq/openai/anthropic) returns raw
   text. `dispatcher.parse_action` strips a `<think>...</think>` block (Qwen-style reasoning
   models), extracts the first `{...}`, and validates it against `ACTION_SCHEMAS`
   (`mcp_tools/schemas.py`). A model that runs out of tokens mid-`<think>` never closes the tag
   and never emits JSON — this surfaces as "the assistant's response could not be understood,"
   not a parsing bug. `OpenAICompatibleAdapter.generate()` (used for vllm/ollama/groq) sends no
   `max_tokens`, unlike `AnthropicAdapter` which hardcodes 1024 — worth aligning if you see this.
4. Every mutating action goes through `Workflow` (models/workflow.py): `pending` →
   `executing` (row-locked update, `WHERE status = 'pending'`) → `executed`/`failed`. The
   dedicated dry-run preview page and the chat's inline confirm/cancel both read/write this same
   row — the assignment-create wizard (`services/assignmentCreator.ts` on the frontend) is the
   one write path that currently bypasses this and commits straight to Canvas.

### Canvas access layer

All outbound Canvas HTTP calls live in `integrations/canvas.py`, each wrapped with a 10s
`httpx.Timeout` and translated to a domain-specific `HTTPException` (invalid token, permission
denied, unavailable, timeout) — `services/canvas.py`, `services/student.py`, etc. call these
rather than hitting `httpx` directly. `core/canvas_url.py` has the URL-equivalence helpers
(`normalize_canvas_url`, `canvas_urls_equivalent`) used for matching a stored Canvas connection to
a request's `canvas_url` — note `services/auth.py::update_canvas_token`'s own "is this an
existing connection" lookup uses plain `==` on the URL string, not `canvas_urls_equivalent`, so a
trivial URL variation (trailing slash already normalized away, but casing/`www.` are not) can
silently create a second `CanvasConnection` row instead of updating the first; whichever
connection is `[0]` in `user.canvas_connections` (not necessarily the newest) is what
`resolveCanvasApiUrl` (frontend) picks by default.

### Course ownership pattern

Nearly every course-scoped service function (`get_owned_course`, `get_assignments`,
`get_students`, message validation, etc.) does the same two-step check: look up the row by
`(id, instructor_id)`, then confirm `canvas_urls_equivalent(course.canvas_url, requested_url)`.
Both conditions have to hold — a 404 from one of these is more often a `canvas_url` mismatch
against the default (`settings.CANVAS_API_URL`) than a genuinely missing course.

### Frontend context stack

`ActiveCourseProvider` (contexts/ActiveCourseProvider.tsx) is mounted once, in `DashboardLayout`,
wrapping all instructor routes — it is *not* remounted between sidebar pages, so
`selectActiveCourse` updates propagate to every consumer (chat banner, messages composer, course
list) via ordinary context re-render, optimistically, before the `PATCH /canvas/active-course`
network call even resolves. It uses a manually-managed `isMountedRef` (initialized via
`useRef(true)`, flipped to `false` in a cleanup effect) to guard `setState` calls after unmount —
**this ref must also be set back to `true` inside the mount effect body**, not just at
`useRef(true)`, or React 18 StrictMode's dev-only mount→cleanup→remount cycle permanently pins it
to `false` after the first remount and silently drops every subsequent active-course update for
the rest of the component's real lifetime (easy to misread as "have to log out and back in to see
the change" — it isn't a session/token issue, it's this ref).

`InstitutionProvider` sits above `ActiveCourseProvider` in the same `DashboardLayout` and supplies
`selectedInstitution`, consumed by `resolveCanvasApiUrl` (lib/canvas-connections.ts) to pick which
of the user's `canvas_connections` to use for API calls.

Two separate "compose a message" entry points share the `MessageDraftPage` component
(components/messages/) but fetch recipients differently: `InstructorCourseMessagesPage` (nested
under a course route, uses route-provided course context) and `InstructorMessagesPage` (sidebar
"Messages" link, uses the active-course context + `fetchCourseStudents`, and blocks with an
explicit message rather than hanging if no active course is set). Both now have a timeout +
empty-recipients fallback around the student fetch so a slow/failed Canvas call degrades instead
of spinning forever.

### Dev environment specifics (Windows)

- `make dev` / `make e2e-up` run the backend as a **native** `uvicorn --reload` process, not
  Docker — `docker-compose.dev.yml` only provides Postgres and the Canvas sandbox
  (`canvas_lms` container). The full `docker-compose.yml` (with backend/frontend/mcp/nginx
  containers) is a separate, production-shaped stack.
- On Windows, `uvicorn --reload`'s parent process spawns the actual worker as a **child** process
  via `multiprocessing.spawn`. Killing just the parent PID leaves the child orphaned and still
  bound to the port — kill both (check `Get-CimInstance Win32_Process` for the
  `--multiprocessing-fork` child of whatever PID you find listening on `:8000`).
