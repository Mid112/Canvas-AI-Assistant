# Canvas Integration

## Modes

1. **Direct Canvas HTTP** from FastAPI (`integrations/canvas.py`) — common for day-to-day local/dev.
2. **MCP sidecar** (`app/mcp/server.py`) — optional tool gateway with host allowlist (`MCP_ENABLED`, `MCP_ALLOWED_CANVAS_HOSTS`, `MCP_SHARED_SECRET`).

## Data ownership

- **Canvas is source of truth** for course/assignment/submission/grade entities after sync.
- Local Postgres caches relationships, workflows, audit, preferences, encrypted tokens, course name aliases, etc.

## Active course

`GET/PATCH /api/v1/canvas/active-course` stores the instructor’s selected local course preference. Not a Canvas write.

## Write path

Preview services (`write_preview`, assignment/quiz/feedback/grade/message validation) → confirm → Canvas API. Idempotency keys (`canvas_idempotency_keys`) reduce duplicate executes.

Due dates are normalized with `services/due_date.py` / `_normalize_due_date_for_user` (instructor Canvas timezone → UTC ISO) before preview and write so confirm matches Canvas.

Ungraded assignments send `points_possible=null` with Canvas `grading_type=not_graded`.

## Failure recording

Failed Canvas/AI operations may land in `failed_operations` for admin visibility; support tickets escalate without auto-retry.
