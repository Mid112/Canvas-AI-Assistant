# API Endpoints

Packaged reference: [`../api-reference.md`](../api-reference.md)

Base prefix: **`/api/v1`** (plus `/` and `/health` on the app root).

Interactive docs (when running the API): `http://localhost:8000/docs` (OpenAPI).

## Router map

| Prefix | Module | Responsibility |
| --- | --- | --- |
| `/auth` | `routers/auth.py` | Register, login, admin login, logout, me, password reset, sessions, canvas token |
| `/canvas` | `routers/canvas.py` | Dashboard, courses, assignments/quizzes/feedback/grades preview+create, students, active course |
| `/chat` | `routers/chat.py` | Messages, confirm/cancel/pause/resume/rename, conversations, deferred |
| `/llm` | `routers/llm.py` | Instructor LLM provider connections |
| `/messages` | `routers/messages.py` | Drafts, inbox, send flows |
| `/message-templates` | `routers/message_templates.py` | Templates CRUD |
| `/history`, workflows | `routers/history.py` | Workflow history, cancel/undo/reverse |
| `/audit` | `routers/audit.py` | Instructor-scoped audit |
| `/admin` | `routers/admin.py` | Dashboard, health, settings, instructors |
| `/admin/audit` | `routers/audit.py` | Admin audit |
| `/admin/failed-operations` | `routers/failed_operations.py` | Failed ops |
| `/admin/support-tickets` | `routers/support_tickets.py` | Escalation tickets |
| `/admin/troubleshoot` | `routers/troubleshoot.py` | Diagnostics |

## Auth

Most routes require `Authorization: Bearer <JWT>`. Role is enforced from the **database**, not solely from token claims.

## Confirm pattern (chat)

Typical write sequence:

1. `POST /chat/...` (message) → assistant returns `intent_preview` + workflow pending
2. Optional dry-run UI
3. `POST /chat/confirm` (or cancel/pause/resume)
