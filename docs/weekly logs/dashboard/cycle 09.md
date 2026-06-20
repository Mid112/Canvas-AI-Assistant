# Cycle 9 (6/16-6/18)

---

## Burn-up Chart (Velocity)

<img width="940" height="605" alt="Screenshot 2026-06-19 at 11 30 44 PM" src="https://github.com/user-attachments/assets/31960c91-d5ea-4371-9b28-1c7b65c5f88b" />


## Tasks

<img width="1435" height="729" alt="Screenshot 2026-06-19 at 11 31 55 PM" src="https://github.com/user-attachments/assets/630197fa-7db5-4a6f-a6e2-0d174c66bdb4" />


## Clockify Summary
### team Summary
<img width="1208" height="718" alt="Screenshot 2026-06-19 at 11 33 37 PM" src="https://github.com/user-attachments/assets/4d3cb55b-3742-4001-9faf-a9970549cf26" />


<img width="1217" height="439" alt="Screenshot 2026-06-19 at 11 34 03 PM" src="https://github.com/user-attachments/assets/67f082df-b26a-444a-94e6-e4a8a634ec24" />



### Jessica:

<img width="1221" height="680" alt="Screenshot 2026-06-19 at 11 37 06 PM" src="https://github.com/user-attachments/assets/52b5ed63-65cd-4a40-8045-4e1a75aff692" />


### Rhythm:

<img width="1220" height="235" alt="Screenshot 2026-06-19 at 11 37 37 PM" src="https://github.com/user-attachments/assets/555ec530-3555-448c-bcd4-e0993cf26996" />

### Mridul:

<img width="1220" height="238" alt="Screenshot 2026-06-19 at 11 39 51 PM" src="https://github.com/user-attachments/assets/22db7642-acb0-475a-86ed-26efc46335a0" />


### Bao:

<img width="1219" height="367" alt="Screenshot 2026-06-19 at 11 40 17 PM" src="https://github.com/user-attachments/assets/332816e2-8323-4e97-ac6f-f93b22857084" />

### Yerdana:

<img width="1227" height="246" alt="Screenshot 2026-06-19 at 11 40 43 PM" src="https://github.com/user-attachments/assets/5265ef84-4b1c-4007-adc9-317106313772" />


---

## Project Status Summary

### Current State

The team merged the MCP server, the encrypted Canvas token work, and CI linting for integration this cycle. The system now routes all Canvas operations through the MCP layer, and each instructor's Canvas API calls use their own encrypted token. Several Canvas-connection pull requests were tested together against a local sandbox, which surfaced a request shape mismatch and an https-only validation gap that now blocks local sandbox testing. The Canvas Connect page itself is still in review and has not yet been merged.

**Completed and merged to `develop`:**

| Layer | What's Done |
|---|---|
| **Auth** | Register, login, JWT, GET /me, bcrypt password hashing, route guards (ProtectedRoute/GuestRoute) |
| **Canvas Integration** | Fetch courses, assignments, submissions via Canvas REST API; per-user Canvas token stored, encrypted with Fernet, and managed per account; multi-institution support via `canvas_connections` table |
| **MCP Server** | 7 Canvas tools (fetch courses, fetch assignments, fetch submissions, fetch missing submissions, create assignment, send message to students, get audit logs); 19 passing tests including Canvas integration tests against a real sandbox |
| **Frontend** | Landing page, full auth flow (login/register/reset), Canvas info + permissions pages, Canvas Connect page, role-based dashboard layouts for Instructor/TA/Admin |
| **Database** | Full PostgreSQL schema — replaced single `canvas_token` column with `canvas_connections` table to support multiple Canvas schools per user |
| **Infrastructure** | Docker Compose with `mcp_server` service added; CI pipeline merged with path filtering, backend/frontend lint integrated, Postgres test service, and Makefile cleanup |
| **Testing** | Backend tests passing; MCP server 19/19 tests passing; frontend unit tests for shipped components; CI now runs lint on every PR |

**In progress (active branches, not yet merged):**

| Branch | Owner | What's There |
|---|---|---|
| `feature/canvas-connect-page` | Jessica + Rhythm | Multi-institution Canvas connect UI; in review; blocked from full local testing by the https-only validation requirement on `canvas_url` |
| MCP client design | Yerdana | Designing the FastAPI-side MCP client and the adapter layer for third-party LLM tools (Claude Code, Codex) |

---

## Two-Week Plan (Cycles 10 & 11: Jun 19 – Jun 29)

### Week 1 — Jun 19–22 (Cycle 10): Local Testing Gap + Course Dashboard

| Task | Owner | Requirements | Description |
|---|---|---|---|
| Resolve local sandbox HTTPS gap | **Yerdana** | FR9.5, FR9.6 | Decide on and implement a fix (dev-mode bypass or HTTPS reverse proxy) so Canvas-connection features are testable locally |
| MCP client implementation | **Yerdana** | FR9.1, FR9.3, FR9.4 | Implement the MCP client inside FastAPI; wire it to the LLM (Qwen via vLLM) for prompt-to-tool-call translation |
| Canvas Token Management UI fixes | **Jessica + Rhythm** | FR1.4, FR1.6, UR2.2, UR2.3 | Align frontend request shape with the merged backend contract; resolve multi-institution scope |
| Course Dashboard — data layer | **Bao** | FR2.1–FR2.5, UR2.4, UR2.5 | Cache courses, students, assignments, and submissions on login; allow instructor to select an active course |
| Instructor Course Dashboard UI | **Rhythm + Jessica** | FR2.6, FR2.7, FR2.8, FR2.9, UR2.6 | Display course summary, assignment list, and per-assignment submission status |
| CI/CD pipeline fixes | **Mridul** | — | Fix hardcoded database credentials in Makefile test target; align with dev environment defaults |

### Week 2 — Jun 23–29 (Cycle 11): AI Assistant + Dry Run + Analysis

| Task | Owner | Requirements | Description |
|---|---|---|---|
| AI Assistant Chat UI | **Jessica** | FR3.1, FR3.5, FR3.6, FR3.9, UR2.11, UR2.12 | Chat interface on Instructor Assistant page — message input, conversation history, displays interpreted intent before any action executes |
| Dry Run Preview System | **Bao + Rhythm** | FR7.1–FR7.6, UR2.13, UR2.23–UR2.25 | Every Canvas-modifying action generates a preview; instructor must explicitly confirm or cancel before execution |
| Missing & Late Submission Analysis | **Mridul** | FR5.1–FR5.3, UR2.7, UR2.8 | Identify and display students with missing or late submissions per assignment |
| Canvas Messaging Workflow | **Yerdana + Bao** | FR6.1–FR6.3, FR3.6, UR2.18, UR2.19 | Generate draft Canvas messages to selected students; delivery requires dry-run confirmation |
| Third-party LLM adapter documentation | **Yerdana** | FR9.2 | Document the MCP server connection contract (`mcp.json` config, auth requirements) so Claude Code/Codex compatibility can be verified directly |

---

## Feature Ownership Overview

| Feature | Primary Owner |
|---|---|
| Backend auth API + security | **Bao** |
| Canvas API integration + multi-token encryption | **Bao** |
| Chat API + cache layer + dry run | **Bao** |
| MCP server + Canvas tools | **Yerdana** |
| MCP client + third-party LLM adapter | **Yerdana** |
| Intent detection + LLM integration | **Yerdana** |
| Frontend auth flow + route guards | **Jessica** |
| AI Assistant chat UI | **Jessica** |
| Canvas Token Management UI | **Jessica + Rhythm** |
| Instructor dashboard + Canvas info pages | **Rhythm** |
| Docker Compose + Nginx + DB schema | **Mridul** |
| Missing submission analysis | **Mridul** |
| CI/CD pipeline | **Mridul** |
