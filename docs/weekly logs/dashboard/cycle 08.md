# Cycle 8 (6/12-6/15)

---

## Burn-up Chart (Velocity)
<img width="701" height="405" alt="Screenshot 2026-06-15 205334" src="https://github.com/user-attachments/assets/483aef40-27e1-4dbc-96bd-eef980d5cec4" />




## Tasks
<img width="1271" height="665" alt="Screenshot 2026-06-15 205309" src="https://github.com/user-attachments/assets/d3260d4c-c185-431b-9895-755bddf48cec" />





## Clockify Summary
### team Summary
<img width="593" height="336" alt="Screenshot 2026-06-15 205425" src="https://github.com/user-attachments/assets/0b6906ad-cd7b-4abd-bb2a-82b1e6bc2fe7" />

<img width="594" height="457" alt="Screenshot 2026-06-15 205431" src="https://github.com/user-attachments/assets/1877e6b4-c4be-4525-9a81-42b1f17b5cce" />




### Jessica:
<img width="1124" height="242" alt="Screenshot 2026-06-15 205658" src="https://github.com/user-attachments/assets/310ca793-1be3-4e9a-9a70-21fc0cf747d8" />


### Rhythm:
<img width="1126" height="126" alt="Screenshot 2026-06-15 210304" src="https://github.com/user-attachments/assets/9105e661-7ad1-451b-8718-b57504ef79ac" />



### Mridul:
<img width="1126" height="125" alt="Screenshot 2026-06-15 205710" src="https://github.com/user-attachments/assets/bff46837-db61-4f4e-80ca-59d7f92310a1" />




### Bao:
<img width="1123" height="201" alt="Screenshot 2026-06-15 210311" src="https://github.com/user-attachments/assets/f662f916-2201-47e9-8532-a5b4ae96a205" />



### Yerdana:
<img width="1124" height="127" alt="Screenshot 2026-06-15 210318" src="https://github.com/user-attachments/assets/91b0c962-9945-4349-ad50-09d019514afa" />




---

## Project Status Summary

### Current State

The team has completed the full foundational stack and is now mid-way through feature development. The system runs end-to-end so far — users can register, log in, connect their Canvas account, and navigate dashboards.

**Completed and merged to `develop`:**

| Layer | What's Done |
|---|---|
| **Auth** | Register, login, JWT, GET /me, bcrypt password hashing, route guards (ProtectedRoute/GuestRoute) |
| **Canvas Integration** | Fetch courses, assignments, submissions via Canvas REST API; per-user Canvas token stored and managed per account |
| **Frontend** | Landing page, full auth flow (login/register/reset), Canvas info + permissions pages, role-based dashboard layouts for Instructor/TA/Admin |
| **Database** | Full PostgreSQL schema — 10 tables: users, sessions, courses, assignments, submissions, conversations, messages, workflows, audit_logs, message_templates |
| **Infrastructure** | Docker Compose (4 services: Postgres, FastAPI, React/Nginx, Nginx reverse proxy), 2 isolated networks, multi-stage frontend build, CI/CD pipeline (GitHub Actions) |
| **Testing** | 13/13 backend tests passing (auth, canvas, health); unit tests for all shipped frontend components |

**In progress (active branches, not yet merged):**

| Branch | Owner | What's There |
|---|---|---|
| `feature/mcp-vllm-setup` | Yerdana | Full MCP server (7 Canvas tools: fetch/create assignments, send messages, missing submissions, audit logs), mock Canvas server for demo, vLLM/Qwen3-4B blueprint |
| `feature/backend-frontend-integration` | Bao | Encrypted Canvas token per user (Fernet encryption), name field on signup, role-based Canvas API calls |

---

## Two-Week Plan (Cycles 9 & 10: Jun 16 – Jun 25)

### Week 1 — Jun 16–20 (Cycle 9): Integration + Core AI Pipeline

| Task | Owner | Requirements | Description |
|---|---|---|---|
| Merge & integrate MCP server | **Yerdana** | FR9.2, FR9.5, FR9.6 | Merge `feature/mcp-vllm-setup`; add `mcp_server` service to docker-compose; all Canvas operations routed through MCP layer, AI model never calls Canvas directly |
| Merge encrypted Canvas token | **Bao** | FR1.5, FR1.7, FR1.8, FR1.9 | Merge `feature/backend-frontend-integration`; Fernet encryption at rest; token never exposed after submission; each Canvas call uses the authenticated instructor's own token |
| Canvas Token Management UI | **Jessica + Rhythm** | FR1.4, FR1.6, UR2.2, UR2.3 | Frontend pages to enter, replace, and remove a Canvas API token; backend validates token against Canvas before storing |
| Chat API + Intent Detection | **Bao + Yerdana** | FR3.1, FR3.2, FR3.3, FR9.1, FR9.3, FR9.4 | Backend Chat API receives natural-language instructor messages; intent detection classifies the request and routes to the correct MCP tool; backend validates AI-generated actions before forwarding |
| Course Dashboard — data layer | **Bao** | FR2.1–FR2.5, UR2.4, UR2.5 | Cache courses, students, assignments, and submissions on login; allow instructor to select an active course; Canvas treated as source of truth |
| Instructor Course Dashboard UI | **Rhythm + Jessica** | FR2.6, FR2.7, FR2.8, FR2.9, UR2.6 | Display course summary, assignment list, and per-assignment submission status (submitted, missing, late, graded); suggested action shortcuts |
| Admin health + audit logs | **Mridul** | FR12.1, FR12.2, UR1.4, UR1.5 | Admin dashboard showing system health and a readable audit log of Canvas and AI operations |

### Week 2 — Jun 21–25 (Cycle 10): AI Assistant + Dry Run + Analysis

| Task | Owner | Requirements | Description |
|---|---|---|---|
| AI Assistant Chat UI | **Jessica** | FR3.1, FR3.5, FR3.6, FR3.9, UR2.11, UR2.12 | Chat interface on Instructor Assistant page — message input, conversation history, displays interpreted intent before any action executes; scoped to selected active course |
| Dry Run Preview System | **Bao + Rhythm** | FR7.1–FR7.6, UR2.13, UR2.23–UR2.25 | Every Canvas-modifying action generates a preview: proposed action, affected resources, and whether the action is reversible; instructor must explicitly confirm or cancel before execution; actions classified as read-only, modifying, or irreversible |
| Missing & Late Submission Analysis | **Mridul** | FR5.1–FR5.3, UR2.7, UR2.8 | Identify and display students with missing or late submissions per assignment; surface summaries to the LLM for natural-language responses |
| Canvas Messaging Workflow | **Yerdana + Bao** | FR6.1–FR6.3, FR3.6, UR2.18, UR2.19 | Generate draft Canvas messages to selected students; instructor reviews and edits before sending; delivery requires dry-run confirmation; action recorded in history |
| Action History | **Mridul** | FR8.1–FR8.3, UR2.26, UR2.27 | User-visible log of all actions: original request, action performed, execution status, timestamp, and affected Canvas resources |


---

## Feature Ownership Overview

| Feature | Primary Owner |
|---|---|
| Backend auth API + security | **Bao** |
| Canvas API integration + token encryption | **Bao** |
| Chat API + cache layer + dry run | **Bao** |
| MCP server + Canvas tools | **Yerdana** |
| Intent detection + LLM integration | **Yerdana** |
| Frontend auth flow + route guards | **Jessica** |
| AI Assistant chat UI | **Jessica** |
| Canvas Token Management UI | **Jessica + Rhythm** |
| Instructor dashboard + Canvas info pages | **Rhythm** |
| Docker Compose + Nginx + DB schema | **Mridul** |
| Missing submission analysis | **Mridul** |
| CI/CD pipeline | **Mridul** |
