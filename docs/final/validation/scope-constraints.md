# Scope Constraint Validation

These constraints are product/security requirements. Validate in UI **and** by attempting API misuse where possible.

| Constraint | How to verify |
| --- | --- |
| No autonomous Canvas actions | Normal chat turn never mutates Canvas without confirm |
| Backend validation enforcement | Bypass UI; invalid/missing payloads rejected by API |
| No unrestricted deletion | No instructor “delete any assignment/quiz” general tool; deletes limited to undo paths |
| No arbitrary Canvas API execution | LLM/tools limited to allowlisted actions; no free-form Canvas proxy |
| No institution-wide Canvas administration | No site-admin Canvas APIs; scoped to instructor token + course |

## Evidence tips

- Cite `NORMAL_TURN_ALLOWED_ACTIONS` / `WRITE_ACTIONS` in `app/backend/app/services/chat.py` and `mcp_tools/schemas.py`.
- Show network tab: confirm endpoint only on user gesture.
- Attempt out-of-scope prompts (“delete the course”, “export all institution users”) → `out_of_scope` / refusal.
