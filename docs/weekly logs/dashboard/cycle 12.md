# Cycle 12 (6/26-6/29)

---

## Burn-up Chart (Velocity)
<img width="946" height="552" alt="Screenshot 2026-06-30 at 10 01 20 PM" src="https://github.com/user-attachments/assets/ac433469-4a21-44d8-8570-12319aa01add" />

<img width="943" height="545" alt="Screenshot 2026-06-30 at 10 01 49 PM" src="https://github.com/user-attachments/assets/a198c9f5-fbeb-4a8e-9dd7-645464c452b6" />


## Tasks

<img width="1438" height="729" alt="Screenshot 2026-06-30 at 10 03 01 PM" src="https://github.com/user-attachments/assets/0c8bcbd0-9bea-4ca0-88d3-1b88f0d0c5ea" />

<img width="1438" height="776" alt="Screenshot 2026-06-30 at 10 03 22 PM" src="https://github.com/user-attachments/assets/d115b78c-19d4-41d3-ba36-c109ef6e8dbf" />

<img width="1440" height="774" alt="Screenshot 2026-06-30 at 10 03 43 PM" src="https://github.com/user-attachments/assets/ffd3b3f2-8dc4-4e09-bc8e-515b29182355" />

<img width="1440" height="779" alt="Screenshot 2026-06-30 at 10 04 04 PM" src="https://github.com/user-attachments/assets/7d11a695-1629-496b-85e8-87bd6bbc5402" />



## Clockify Summary
### team Summary
<img width="1221" height="415" alt="Screenshot 2026-06-30 at 10 04 33 PM" src="https://github.com/user-attachments/assets/314d1b72-3563-4136-ae49-a04727ae3f59" />

<img width="1221" height="405" alt="Screenshot 2026-06-30 at 10 05 10 PM" src="https://github.com/user-attachments/assets/407d3005-6481-472e-802b-5b837e3d40af" />


### Jessica:
<img width="1220" height="408" alt="Screenshot 2026-06-30 at 10 05 42 PM" src="https://github.com/user-attachments/assets/68dfe8c5-ffed-4f09-b412-255570e084d3" />

### Rhythm:
<img width="1222" height="403" alt="Screenshot 2026-06-30 at 10 06 11 PM" src="https://github.com/user-attachments/assets/8389ed0c-b1e8-4703-9d91-464f613b716e" />


### Mridul:
<img width="1221" height="409" alt="Screenshot 2026-06-30 at 10 06 35 PM" src="https://github.com/user-attachments/assets/4fd68710-938d-49b2-96d6-bc22098328e2" />


### Bao:
<img width="1223" height="419" alt="Screenshot 2026-06-30 at 10 06 57 PM" src="https://github.com/user-attachments/assets/3805c3b8-9bff-4eb0-a55d-53511cfd67b1" />


### Yerdana:
<img width="1222" height="407" alt="Screenshot 2026-06-30 at 10 07 28 PM" src="https://github.com/user-attachments/assets/c918f536-0d59-4720-9383-b204d45f2bc0" />


---

## Project Status Summary

### Current State

This cycle pushed the project significantly closer to MVP. Bao delivered three backend features on Monday: admin authentication with JWT role claims and audit logging, role-based access control restricting Canvas endpoints to instructors and admins, and instructor account management. Jessica closed fourteen issues across the Dry Run Preview UI and Student Message Draft UI. Rhythm built the missing and late submission analytics dashboards and fixed several Course Management page issues, including replacing mock data with real Canvas-backed loading. Mridul continued connecting frontend and backend authentication flows. Yerdana addressed all review feedback on the LLM vague-message PR, adding server-side confirm by message ID, scope checking, ambiguity handling, and user-friendly error generation.

**Completed and merged to `develop`:**

| Layer | What's Done |
|---|---|
| **Auth** | Register, login, JWT, GET /me, bcrypt password hashing, route guards; login, registration, and Canvas token workflows connected end to end; admin authentication with JWT role claims, audit logging, and rate limiting; role-based access control guarding instructor and admin routes |
| **Canvas Integration** | Fetch courses, assignments, submissions, and students via Canvas REST API; per-user Canvas token stored, encrypted with Fernet; multi-institution support; submission status and grading info parsing |
| **Course Retrieval + Student/Assignment/Submission Retrieval** | Canvas pagination, batch upsert, active course selection; full data layer from course to individual submission; 23 passing integration tests |
| **LLM Adapter + Chat Pipeline** | Shared adapter interface; in-process tool dispatcher; scope check rejects out-of-scope requests; ambiguity handling asks one clarifying question per turn; intent preview before every action; server-side confirm by message ID; user-friendly error messages for each failure mode; conversation history deduplication fix |
| **Frontend** | Landing page, full auth flow, Canvas Connect page, Course Access page, Course Dashboard, Assignment Creation UI, Dry Run Preview UI (preview panel, affected resources, action summary, reversibility status, confirm/cancel buttons), Student Message Draft UI (draft page, preview, editable message, confirmation workflow) |
| **Infrastructure** | CI pipeline with path filtering, backend/frontend lint, Postgres test service; `make dev` and `make test-vague-llm` Makefile targets |
| **Testing** | Backend tests passing; RBAC permission tests passing; admin auth integration tests passing; LLM scope/clarify/intent-preview pipeline tested end to end against real Canvas sandbox with Groq-hosted Qwen3.6-27B; frontend unit tests for shipped components |

**In progress (active branches, not yet merged):**

| Branch | Owner | What's There |
|---|---|---|
| Administrator Login UI | Jessica | Admin route protection and redirect to admin dashboard, in progress |
| Missing/Late Submission Dashboard | Rhythm | UI built this cycle, not yet fully connected to backend |
| Instructor Account Management | Bao | Endpoints and schema built, integration in progress |
| Frontend/backend authentication integration | Mridul | Canvas URL integration in progress |
| Write actions pipeline | Yerdana | Three-module write intent architecture in design, branch created |

---

## Two-Week Plan (Cycles 13 & 14: Jun 30 – Jul 13)

### Week 1 — Jun 30–Jul 6 (Cycle 13): Action History + Write Actions + MVP Polish

| Task | Owner | Requirements | Description |
|---|---|---|---|
| Write action pipeline (Module 1–3) | **Yerdana** | FR9.1, FR9.3 | Write intent classification, context fetching, and LLM-driven preview construction for grade updates, reminders, and assignment creation |
| No-invention guard for write actions | **Yerdana** | FR9.5 | Verify current Canvas state against what the LLM claims before any write executes |
| Action history service | **Yerdana** | FR8.1 | Log every confirmed Canvas action with old and new values for review and potential reversal |
| AI Assistant Chat UI | **Jessica** | FR3.1, FR3.5, FR3.6, FR3.9, UR2.11, UR2.12 | Chat interface on Instructor Assistant page; message input, conversation history, displays interpreted intent before any action executes |
| Administrator Login UI | **Jessica** | UR1.1 | Finish admin route protection and redirect to admin dashboard |
| Missing/Late Submission Dashboard | **Rhythm** | FR5.1, FR5.3, UR2.7, UR2.8 | Connect dashboard UI to real backend submission data |
| Canvas URL and auth integration | **Mridul** | — | Finish connecting remaining frontend Canvas and auth flows to backend endpoints |
| Instructor account management wiring | **Bao** | FR4.1 | Wire instructor account management endpoints to frontend |

### Week 2 — Jul 7–13 (Cycle 14): Integration + Demo Prep

| Task | Owner | Requirements | Description |
|---|---|---|---|
| End-to-end integration testing | **All** | — | Test primary user flows from Canvas connection through to analytics viewing and LLM-assisted actions |
| MVP demo preparation | **All** | — | Finalize user flows, fix remaining UI issues, prepare technical script for MVP presentation |
| Safe error handling | **Yerdana** | FR9.6 | Cover remaining edge cases identified during end-to-end testing |
| Student messaging service | **Bao** | FR6.1, UR2.18 | Generate draft Canvas messages to selected students with dry-run confirmation |

---

## Feature Ownership Overview

| Feature | Primary Owner |
|---|---|
| Backend auth API + security + RBAC | **Bao** |
| Canvas API integration + multi-token encryption | **Bao** |
| Course/student/assignment/submission retrieval | **Bao** |
| Admin authentication + instructor account management | **Bao** |
| LLM adapter + chat pipeline + write actions | **Yerdana** |
| Frontend auth flow + route guards | **Jessica** |
| Administrator Login UI | **Jessica** |
| Dry Run Preview UI + Student Message Draft UI | **Jessica** |
| AI Assistant Chat UI | **Jessica** |
| Course Access + Course Dashboard + Analytics | **Rhythm** |
| Missing/late submission analytics dashboard | **Rhythm** |
| Frontend/backend auth + Canvas URL integration | **Mridul** |
| Docker Compose + Canvas Docker + DB schema | **Mridul** |
| CI/CD pipeline | **Mridul** |
