# Cycle 11 (6/23-6/25)

---

## Burn-up Chart (Velocity)

<img width="937" height="571" alt="Screenshot 2026-06-26 at 11 50 58 PM" src="https://github.com/user-attachments/assets/7a152fb4-1103-49c2-b98f-109c9c818d91" />


<img width="928" height="569" alt="Screenshot 2026-06-26 at 11 51 26 PM" src="https://github.com/user-attachments/assets/aa755f3a-6b1f-4aea-95b5-bd4c120afb66" />


## Tasks
<img width="1440" height="737" alt="Screenshot 2026-06-26 at 11 52 16 PM" src="https://github.com/user-attachments/assets/c6bf15a1-9e68-43c1-aea2-b9f20a5dac2e" />


<img width="1433" height="733" alt="Screenshot 2026-06-26 at 11 52 35 PM" src="https://github.com/user-attachments/assets/89b3a5e0-cd36-4c11-9239-7442a2141eca" />


<img width="1439" height="780" alt="Screenshot 2026-06-26 at 11 52 56 PM" src="https://github.com/user-attachments/assets/68afcd2f-c76d-4e17-9f1a-312ac1b818a1" />


## Clockify Summary
### team Summary

<img width="1225" height="417" alt="Screenshot 2026-06-26 at 11 53 28 PM" src="https://github.com/user-attachments/assets/68b19a7c-4d60-4230-a239-a14e6b3f849b" />

<img width="1231" height="436" alt="Screenshot 2026-06-26 at 11 53 42 PM" src="https://github.com/user-attachments/assets/cdedc143-6763-4771-90ad-ed7f0c7da77c" />


### Jessica:

<img width="1223" height="404" alt="Screenshot 2026-06-26 at 11 54 17 PM" src="https://github.com/user-attachments/assets/47b920b5-9859-428a-97cb-2904c28aed9c" />


### Rhythm:

<img width="1220" height="415" alt="Screenshot 2026-06-26 at 11 54 39 PM" src="https://github.com/user-attachments/assets/48e14c61-14d7-48b3-846c-68679c936e5d" />


### Mridul:

<img width="1230" height="412" alt="Screenshot 2026-06-26 at 11 55 00 PM" src="https://github.com/user-attachments/assets/aba7e9a3-cc24-496c-8173-7cab75ce29fe" />


### Bao:

<img width="1225" height="409" alt="Screenshot 2026-06-26 at 11 55 20 PM" src="https://github.com/user-attachments/assets/25205334-6266-495d-81f1-9077093c64c6" />


### Yerdana:

<img width="1224" height="429" alt="Screenshot 2026-06-26 at 11 55 42 PM" src="https://github.com/user-attachments/assets/75e64dfa-690c-41a0-9d69-d77ba49b4f2b" />


---

## Project Status Summary

### Current State

The team closed out a large batch of work this cycle. Bao delivered the student, assignment, and submission retrieval services, giving the backend a complete data layer from course down to individual submissions. Jessica and Rhythm finished the Assignment Creation UI together, closing nine related issues in one push. Rhythm also completed the Course Dashboard and started the missing and late submissions analytics dashboard. Mridul connected the login, registration, and Canvas token workflows so the frontend and backend now talk to each other end to end. Yerdana finished the LLM adapter chat pipeline with timeout and error handling, and verified it end to end against a real Canvas sandbox with five enrolled students and two real assignments.

**Completed and merged to `develop`:**

| Layer | What's Done |
|---|---|
| **Auth** | Register, login, JWT, GET /me, bcrypt password hashing, route guards (ProtectedRoute/GuestRoute); login, registration, and Canvas token workflows connected end to end between frontend and backend |
| **Canvas Integration** | Fetch courses, assignments, submissions via Canvas REST API; per-user Canvas token stored, encrypted with Fernet; multi-institution support via `canvas_connections` table |
| **Course Retrieval Service** | Canvas pagination, batch upsert, active course selection; 23 passing integration tests |
| **Student/Assignment/Submission Retrieval** | New `get_students` service with upsert and idempotency tests; assignment and submission retrieval services persisting data locally; ORM models and schema updated for `assignments` and `submissions` tables |
| **LLM Adapter + Chat Pipeline** | Shared adapter interface for local and third-party LLMs; in-process tool dispatcher with Pydantic validation; `<think>`-block stripping for reasoning models; timeout and error handling; chat endpoint tested end to end against real Canvas data (5 students, 2 assignments) |
| **Frontend** | Landing page, full auth flow, Canvas Connect page, Course Access page, Course Dashboard, Assignment Creation UI (form, preview workflow, validation, due date/description/title fields) |
| **Infrastructure** | CI pipeline with path filtering, backend/frontend lint, Postgres test service |
| **Testing** | Backend tests passing; course retrieval service 23/23; LLM adapter dispatcher/chat endpoint unit tests (mocked, CI-safe); frontend unit tests for shipped components |

**In progress (active branches, not yet merged):**

| Branch | Owner | What's There |
|---|---|---|
| Administrator Login UI | Jessica | Admin route protection and redirect to admin dashboard, in progress |
| Missing/Late Submission Dashboard | Rhythm | UI drafted, not yet connected to backend |
| Role-based access control | Bao | In progress |
| Frontend/backend authentication integration | Mridul | In progress |

---

## Two-Week Plan (Cycles 12 & 13: Jun 26 – Jul 9)

### Week 1 — Jun 26–29 (Cycle 12): Messaging + Missing Submission Analysis

| Task | Owner | Requirements | Description |
|---|---|---|---|
| Request clarification for ambiguous requests | **Yerdana** | FR9.2 | Add a dispatcher path for the assistant to ask a follow-up question instead of guessing when a request is unclear |
| Canvas Messaging Workflow | **Yerdana + Bao** | FR6.1–FR6.3, FR3.6, UR2.18, UR2.19 | Generate draft Canvas messages to selected students; delivery requires dry-run confirmation |
| Missing & Late Submission Analysis | **Mridul + Rhythm** | FR5.1–FR5.3, UR2.7, UR2.8 | Identify and display students with missing or late submissions per assignment; connect dashboard UI to backend |
| Role-based access control | **Bao** | — | Finish role-based access control for instructor and admin endpoints |
| Administrator Login UI | **Jessica** | UR1.1 | Finish admin route protection and redirect to admin dashboard |
| Frontend/backend authentication integration | **Mridul** | — | Finish connecting remaining auth flows between frontend and backend |

### Week 2 — Jun 30–Jul 6 (Cycle 13): Action History + Dry Run

| Task | Owner | Requirements | Description |
|---|---|---|---|
| Action history service | **Yerdana** | — | Log every chat-triggered Canvas action for later review |
| Safe error handling | **Yerdana** | — | Cover remaining edge cases identified during end-to-end testing |
| Dry Run Preview System | **Bao + Rhythm** | FR7.1–FR7.6, UR2.13, UR2.23–UR2.25 | Every Canvas-modifying action generates a preview; instructor must explicitly confirm or cancel before execution |
| AI Assistant Chat UI | **Jessica** | FR3.1, FR3.5, FR3.6, FR3.9, UR2.11, UR2.12 | Chat interface on Instructor Assistant page; message input, conversation history, displays interpreted intent before any action executes |

---

## Feature Ownership Overview

| Feature | Primary Owner |
|---|---|
| Backend auth API + security | **Bao** |
| Canvas API integration + multi-token encryption | **Bao** |
| Course/student/assignment/submission retrieval | **Bao** |
| LLM adapter + chat pipeline | **Yerdana** |
| Frontend auth flow + route guards | **Jessica** |
| Administrator Login UI | **Jessica** |
| Assignment Creation UI | **Jessica + Rhythm** |
| AI Assistant chat UI | **Jessica** |
| Course Access + Course Dashboard UI | **Rhythm** |
| Missing/late submission analytics dashboard | **Rhythm** |
| Frontend/backend auth integration | **Mridul** |
| Docker Compose + Canvas Docker + DB schema | **Mridul** |
| CI/CD pipeline | **Mridul** |
