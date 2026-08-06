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
| `conversations`, `messages` | Assistant transcripts (`conversations.field_memory` holds confirmed draft fields, `course_context`, grounded facts) |
| `workflows` | Pending/executing/terminal action state |
| `tool_call_logs` | Tool invocation audit |
| `audit_logs`, `audit_logs_session` | Audit |
| `message_templates`, `message_drafts` | Messaging |
| `grade_history` | Grade change history |
| `instructor_llm_connections`, `llm_response_cache` | LLM |
| `resolved_sets` | Cached resolution sets for assistant tools |
| `user_preferences` | Instructor preferences (e.g. active course) |
| `system_settings` | Institution settings |
| `password_reset_tokens` | Reset flow |
| `deferred_assistant_requests` | Limited-mode deferred chat work |
| `health_checks`, `ai_call_health` | Health |
| `canvas_idempotency_keys` | Write idempotency |
| `failed_operations`, `support_tickets` | Ops / escalation |
| `schema_migrations` | Migration bookkeeping |

Notes:

- `users.role` is `instructor` or `admin`.
- `canvas_connections` may store instructor Canvas `time_zone` used when normalizing due dates to UTC.

## Applying migrations

- App lifespan migrator on startup.
- `make migrate` / `make db-ensure` / `make db-reset` for local ops.
