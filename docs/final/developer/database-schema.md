# Database Schema

Issue: **#1345** · Parent: #1316

Source of truth: `db/init/01_schema.sql` plus numbered files in `db/migrations/`.

## Core tables (summary)

| Table | Purpose |
|-------|---------|
| `users` | Instructors & admins |
| `sessions` | Auth sessions |
| `canvas_connections` | Encrypted tokens / connection metadata |
| `courses`, `canvas_course_names` | Local course rows & aliases |
| `assignments`, `submissions`, `students` | Cached Canvas-linked data |
| `conversations`, `messages` | Assistant transcripts |
| `workflows` | Pending/executing/terminal action state |
| `tool_call_logs` | Tool invocation audit |
| `audit_logs`, `audit_logs_session` | Audit |
| `message_templates`, `message_drafts` | Messaging |
| `grade_history` | Grade change history |
| `instructor_llm_connections`, `llm_response_cache` | LLM |
| `system_settings` | Institution settings |
| `password_reset_tokens` | Reset flow |
| `deferred_assistant_requests` | Deferred chat work |
| `health_checks`, `ai_call_health` | Health |
| `canvas_idempotency_keys` | Write idempotency |
| `failed_operations`, `support_tickets` | Ops / escalation |
| `schema_migrations` | Migration bookkeeping |

## Applying migrations

- App lifespan migrator on startup.
- `make migrate` / `make db-ensure` / `make db-reset` for local ops.
