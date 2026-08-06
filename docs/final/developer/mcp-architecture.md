# MCP Architecture

Issue: **#1344** · Parent: #1316

## Role

The MCP server is an optional **credential boundary** for Canvas tools: shared secret on tool call routes, SSRF host allowlist, deployable separately from FastAPI.

## Config

| Variable | Purpose |
|----------|---------|
| `MCP_ENABLED` | Default `false` |
| `MCP_SERVER_URL` | Backend → MCP |
| `MCP_SHARED_SECRET` | Authenticate tool calls |
| `MCP_ALLOWED_CANVAS_HOSTS` | Hostname allowlist (no `*`) |

Dev compose publishes MCP on `:8001` when used; prod keeps it on an internal network.

## Tool surface

Schemas and dispatch live under `app/backend/app/mcp_tools/` (`schemas.py`, `dispatcher.py`). Write tools still require upstream workflow confirm — MCP does not grant the LLM autonomous writes.
