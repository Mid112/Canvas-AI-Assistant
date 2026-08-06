# Repository Structure

Issue: **#1414**

```
capstone-team-16/
├── app/
│   ├── backend/          # FastAPI application
│   ├── frontend/         # React + Vite UI
│   └── mcp/              # Optional Canvas MCP server
├── db/
│   ├── init/             # Schema bootstrap
│   └── migrations/       # Numbered SQL migrations
├── docs/
│   ├── charter/
│   ├── design/
│   ├── final/            # ← this submission package
│   ├── plan/
│   ├── testing report/
│   ├── testing event outcomes/
│   └── weekly logs/
├── nginx/                # Reverse proxy (compose)
├── test/
│   ├── backend/          # pytest
│   ├── frontend/         # vitest
│   └── e2e/              # Playwright
├── Makefile
├── docker-compose.yml
├── docker-compose.dev.yml
└── .env.example
```

Root `README.md` historically contained course starter text; prefer `docs/final/` for product documentation.
