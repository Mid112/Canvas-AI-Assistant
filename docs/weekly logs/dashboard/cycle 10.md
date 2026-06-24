# Cycle 10 (6/19-6/22)

---

## Burn-up Chart (Velocity)
<img width="928" height="532" alt="Screenshot 2026-06-23 at 9 54 14 PM" src="https://github.com/user-attachments/assets/b27c5821-ed5c-4f1c-ab32-c718a45c7c7b" />

<img width="926" height="559" alt="Screenshot 2026-06-23 at 9 54 50 PM" src="https://github.com/user-attachments/assets/fc084859-7385-4221-a6b7-bec49743b0eb" />


## Tasks

<img width="1423" height="722" alt="Screenshot 2026-06-23 at 9 57 59 PM" src="https://github.com/user-attachments/assets/a773bd9c-611e-488f-bc70-1cfe6b312581" />

<img width="1433" height="784" alt="Screenshot 2026-06-23 at 9 58 32 PM" src="https://github.com/user-attachments/assets/27e5cfd1-9bf4-4126-bb63-d650f5d95848" />

<img width="1440" height="774" alt="Screenshot 2026-06-23 at 9 59 45 PM" src="https://github.com/user-attachments/assets/67425b6a-8104-400d-85a8-07db40482e5c" />





## Clockify Summary
### team Summary
<img width="1234" height="775" alt="Screenshot 2026-06-23 at 10 00 41 PM" src="https://github.com/user-attachments/assets/b3a7843f-9708-4e59-91ed-43cabd92fecf" />

<img width="1217" height="453" alt="Screenshot 2026-06-23 at 10 01 58 PM" src="https://github.com/user-attachments/assets/3f640a08-f7d2-42e1-b1bf-41c124274541" />


### Jessica:

<img width="1222" height="402" alt="Screenshot 2026-06-23 at 10 02 36 PM" src="https://github.com/user-attachments/assets/3eac5459-6920-4fde-839c-86c52131b874" />


### Rhythm:

<img width="1215" height="420" alt="Screenshot 2026-06-23 at 10 03 11 PM" src="https://github.com/user-attachments/assets/3d3f35d3-bd60-4014-8f86-0d702f974990" />


### Mridul:

<img width="1232" height="387" alt="Screenshot 2026-06-23 at 10 03 41 PM" src="https://github.com/user-attachments/assets/6df3bfa7-baf4-4b63-afda-e3c623834cd1" />


### Bao:

<img width="1221" height="426" alt="Screenshot 2026-06-23 at 10 04 04 PM" src="https://github.com/user-attachments/assets/e85ad7a2-d83a-4dd6-bbb8-181b5c8bd9d9" />


### Yerdana:

<img width="1230" height="416" alt="Screenshot 2026-06-23 at 10 04 29 PM" src="https://github.com/user-attachments/assets/cbf29063-debc-4e9a-aee2-9441729febff" />


---

## Project Status Summary

### Current State

The team merged the Canvas Docker setup and the full course retrieval service this cycle. Courses are now synced from Canvas into the local database on every fetch, and instructors can select and store an active course. Yerdana joined a live troubleshooting session with the team to debug the Canvas connect page and the Canvas Docker sandbox, and found a missing compose service definition and a URL duplication bug in the Canvas integration layer. Yerdana also opened a PR for the LLM adapter layer, which connects the chatbox to Canvas through a locally run LLM. 

**Completed and merged to `develop`:**

| Layer | What's Done |
|---|---|
| **Auth** | Register, login, JWT, GET /me, bcrypt password hashing, route guards (ProtectedRoute/GuestRoute) |
| **Canvas Integration** | Fetch courses, assignments, submissions via Canvas REST API; per-user Canvas token stored, encrypted with Fernet; multi-institution support via `canvas_connections` table |
| **Course Retrieval Service** | Canvas pagination (Link headers, up to 50 pages) with single retry on 5xx errors; batch upsert into local `courses` table with no N+1 queries; `canvas_url` column added to courses to support co-instructors; `user_preferences` table for active course selection; `GET/PATCH /canvas/active-course` endpoints; 23 passing integration tests |
| **Canvas Docker** | `lbjay/canvas-docker` merged into dev, unblocking local Canvas API testing without a heavyweight sandbox |
| **MCP Server** | 7 Canvas tools; 19 passing tests including Canvas integration tests against a real sandbox |
| **Frontend** | Landing page, full auth flow (login/register/reset), Canvas info + permissions pages, Canvas Connect page, Course Access page, role-based dashboard layouts for Instructor/TA/Admin |
| **Infrastructure** | CI pipeline with path filtering, backend/frontend lint, Postgres test service, Makefile cleanup |
| **Testing** | Backend tests passing; course retrieval service 23/23 tests passing; MCP server 19/19 tests passing; frontend unit tests for shipped components |

**In progress (active branches, not yet merged):**

| Branch | Owner | What's There |
|---|---|---|
| `feature/canvas-connect-page` | Jessica + Rhythm | Multi-institution Canvas connect UI; in review; blocked from full local testing by the https-only validation requirement on `canvas_url` |
| `feature/llm-adapter` | Yerdana | LLM adapter layer (vLLM and OpenAI-compatible providers), in-process tool dispatcher, chat endpoint; tested end to end against a real Canvas sandbox and real vLLM inference |
| Administrator Login UI | Jessica | Admin route protection and redirect to admin dashboard, in progress |
| Course Dashboard | Rhythm | UI layout and component structure started, not yet connected to backend |

---

## Two-Week Plan (Cycles 11 & 12: Jun 23 – Jul 6)

### Week 1 — Jun 23–25 (Cycle 11): AI Assistant + Dry Run + Analysis

| Task | Owner | Requirements | Description |
|---|---|---|---|
| MCP client + chat pipeline | **Yerdana** | FR9.1, FR9.3, FR9.4 | Wire the chat endpoint to the LLM adapter for prompt-to-tool-call translation; merge `feature/llm-adapter` |
| Timeout and error handling | **Yerdana** | FR9.5, FR9.6 | Finalize timeout and error handling for LLM requests; resolve the Canvas Docker compose service and `/api/v1` URL duplication issues found in cycle 10 |
| AI Assistant Chat UI | **Jessica** | FR3.1, FR3.5, FR3.6, FR3.9, UR2.11, UR2.12 | Chat interface on Instructor Assistant page; message input, conversation history, displays interpreted intent before any action executes |
| Course Dashboard UI | **Rhythm** | FR2.6, FR2.7, FR2.8, FR2.9, UR2.6 | Finish Course Dashboard UI and connect to the course retrieval service backend |
| Dry Run Preview System | **Bao + Rhythm** | FR7.1–FR7.6, UR2.13, UR2.23–UR2.25 | Every Canvas-modifying action generates a preview; instructor must explicitly confirm or cancel before execution |
| Administrator Login UI | **Jessica** | UR1.1 | Finish admin route protection and redirect to admin dashboard |

### Week 2 — Jun 30–Jul 6 (Cycle 12): Messaging + Missing Submission Analysis

| Task | Owner | Requirements | Description |
|---|---|---|---|
| Canvas Messaging Workflow | **Yerdana + Bao** | FR6.1–FR6.3, FR3.6, UR2.18, UR2.19 | Generate draft Canvas messages to selected students; delivery requires dry-run confirmation |
| Missing & Late Submission Analysis | **Mridul** | FR5.1–FR5.3, UR2.7, UR2.8 | Identify and display students with missing or late submissions per assignment |
| Role-based access control | **Bao** | — | Finish role-based access control for instructor and admin endpoints |
| Third-party LLM adapter documentation | **Yerdana** | FR9.2 | Document the MCP server connection contract so Claude Code/Codex compatibility can be verified directly |

---

## Feature Ownership Overview

| Feature | Primary Owner |
|---|---|
| Backend auth API + security | **Bao** |
| Canvas API integration + multi-token encryption | **Bao** |
| Course retrieval service + active course selection | **Bao** |
| MCP server + Canvas tools | **Yerdana** |
| LLM adapter + chat pipeline | **Yerdana** |
| Frontend auth flow + route guards | **Jessica** |
| Administrator Login UI | **Jessica** |
| AI Assistant chat UI | **Jessica** |
| Canvas Token Management UI | **Jessica + Rhythm** |
| Course Access + Course Dashboard UI | **Rhythm** |
| Docker Compose + Canvas Docker + DB schema | **Mridul** |
| Missing submission analysis | **Mridul** |
| CI/CD pipeline | **Mridul** |
