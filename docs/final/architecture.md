# Architecture (Final)

Issue: **#1407** · Developer detail: [developer/backend-architecture.md](./developer/backend-architecture.md) · Design: [../design/README.md](../design/README.md)

## System purpose

Canvas Helper AI Assistant reduces instructor busywork for selected Canvas workflows using LLM assistance with **mandatory human confirmation** before Canvas writes.

## High-level diagram

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ React UI    │────▶│ FastAPI      │────▶│ PostgreSQL  │
│ Instructor/ │     │ /api/v1      │     └─────────────┘
│ Admin       │     │ services     │────────┐
└─────────────┘     └──────┬───────┘        │
                           │                ▼
                           │         ┌─────────────┐
                           ├────────▶│ Canvas LMS  │
                           │         └─────────────┘
                           │                ▲
                           ▼                │
                    ┌─────────────┐         │
                    │ MCP (opt.)  │─────────┘
                    └─────────────┘
                           ▲
                    ┌─────────────┐
                    │ LLM providers│
                    └─────────────┘
```

## Key decisions

1. **Confirm-before-write** for all Canvas mutations.
2. **Encrypted Canvas tokens**; never sent to the LLM.
3. **Optional MCP** as credential/tool boundary with host allowlist.
4. **Canvas as source of truth** after successful writes; local DB for workflows/audit/preferences.

## Components to cite in presentation

Frontend routes (`paths.ts`), FastAPI routers, workflow table states, risk confirmation levels, admin health/audit.
