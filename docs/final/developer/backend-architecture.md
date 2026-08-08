# Backend Architecture

Final summary: also [`../architecture.md`](../architecture.md)

## Layers

```
React (Vite)  →  FastAPI (/api/v1)  →  Services  →  Integrations
                                      ↓
                              Postgres (SQLAlchemy)
                                      ↓
                         Canvas API  and/or  MCP sidecar
                                      ↓
                              LLM providers (instructor / institution)
```

## Components

| Component | Path | Role |
| --- | --- | --- |
| FastAPI app | `app/backend/app/main.py` | Routers, lifespan (migrations, admin seed, background jobs) |
| Routers | `app/backend/app/routers/` | HTTP adapters |
| Services | `app/backend/app/services/` | Business rules, workflows, risk, drafts |
| Models | `app/backend/app/models/` | ORM |
| Schemas | `app/backend/app/schemas/` | Pydantic I/O |
| Canvas client | `app/backend/app/integrations/canvas.py` | Direct Canvas HTTP |
| MCP tools | `app/backend/app/mcp_tools/` | Tool schemas + dispatcher |
| MCP server | `app/mcp/server.py` | Optional Canvas tool gateway |
| Frontend | `app/frontend/` | Instructor / admin UI |

## Write safety

- Normal chat turns may only emit: `intent_preview`, `clarify`, `out_of_scope`, `respond` (`NORMAL_TURN_ALLOWED_ACTIONS`).
- Canvas **writes** are `WRITE_ACTIONS`: `create_assignment`, `create_quiz`, `update_assignment`, `send_message`, `update_grade`.
- Execution path: pending workflow → confirm endpoint → claim → Canvas call.
- Risk levels gate standard vs strong (`CONFIRM`) confirmation (`services/risk.py`).

## Related design doc

See [`../../design/README.md`](../../design/README.md) for the layered / MCP credential-boundary rationale.
