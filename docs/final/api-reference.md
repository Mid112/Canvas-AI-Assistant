# API Reference (Final)

## Base URL

- Local native: `http://localhost:8000`
- Compose/nginx: `http://localhost:8888/api` (UI on same origin)
- Versioned API: `/api/v1/...`

## OpenAPI

Run the backend and open `/docs` or `/redoc` for generated schemas. This Markdown index is the human overview for the submission package.

## Endpoint groups

| Group | Prefix | Auth |
| --- | --- | --- |
| Auth & sessions | `/api/v1/auth` | Mixed (login public; me protected) |
| Canvas data & previews | `/api/v1/canvas` | Instructor |
| Chat / workflows | `/api/v1/chat` | Instructor |
| LLM connections | `/api/v1/llm` | Instructor |
| Messages / templates | `/api/v1/messages`, `/message-templates` | Instructor |
| History | `/api/v1/history` (and workflow helpers) | Instructor |
| Audit | `/api/v1/audit`, `/api/v1/admin/audit` | Instructor / Admin |
| Admin ops | `/api/v1/admin`, `/admin/failed-operations`, `/admin/support-tickets`, `/admin/troubleshoot` | Admin |
| Health | `/health` | Public liveness |

## Write confirmation

Canvas mutations from chat require workflow **confirm** after `intent_preview`. Form-based creates use preview/submit endpoints with the same human gate.
