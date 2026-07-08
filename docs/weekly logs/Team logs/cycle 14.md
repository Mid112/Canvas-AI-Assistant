# Cycle 14 (7/3–7/6)

---

## Weekly Team Log

This cycle focused on closing the remaining MVP Demo work, validating end-to-end workflows, and moving the project board toward a fully completed MVP milestone. The team closed the remaining backend, frontend, LLM, integration, Canvas, audit/history, and demo preparation tasks. By the end of the cycle, the MVP Demo milestone board showed all main work moved into **Done**, with no active items left in Ready, In Progress, or In Review for that milestone.

Mridul focused heavily on MVP validation preparation, integration work, and ensuring the frontend/backend/Canvas workflow was ready for demonstration. Yerdana completed LLM workflow and action-history related work, including preview, safe handling, and audit/logging support. Jessica completed the remaining frontend-facing workflows and UI features. Rhythm completed dashboard, analytics, action-history, and audit-log related UI work. Bao completed backend services, Canvas retrieval, authentication, RBAC, instructor management, and analysis-related backend work.

## Date Range:

- [03-07] - [06-07]

---

## Features in the Project Plan Cycle:

- MVP Demo completion
- End-to-end integration completion
- Canvas integration finalization
- Assignment workflow integration
- Assistant workflow integration
- Messaging workflow integration
- Action history integration
- Action history service
- Action history UI
- Admin audit logs page
- Workflow audit log update
- LLM preview/status workflow
- LLM update assignment workflow
- LLM student messaging workflow
- LLM post request workflow
- Safe error handling
- Preview and confirmation service
- Canvas source-of-truth validation
- Backend RBAC permissions cleanup
- Missing and late submission backend analysis
- Student and assignment views
- MVP demo preparation

---

## Project Board Status

The MVP Demo milestone board reached a completed state this cycle.

| Status | Count / Notes |
|---|---|
| Backlog | 0 active items remaining in the filtered MVP board |
| Ready | 0 active items remaining in the filtered MVP board |
| In Progress | 0 active items remaining in the filtered MVP board |
| In Review | 0 active items remaining in the filtered MVP board |
| Done | 98 completed items |

> Note: Cycle report, personal log, and team log documentation tickets are excluded from the task tables below.

---

## Completed Tasks

| Task ID | Description | Completed By |
|---|---|---|
| 963 | CI and Makefile complete setup | Mridul |
| 63 | Feature: LLM Foundation | Yerdana |
| 69 | Feature: Frontend + Backend Connection | Yerdana |
| 21 | Feature: Docker Setup | Mridul / Yerdana |
| 384 | Add canvas-docker for testing | Mridul / Bao |
| 87 | Feature: Authentication UI | Jessica |
| 323 | CI/CD Pipeline | Mridul |
| 419 | Feature: Course Access UI | Rhythm |
| 37 | Feature: Authentication UI | Jessica / Rhythm |
| 387 | Feature/backend token route | Bao |
| 411 | Feature: Assignment Update UI | Jessica |
| 629 | Feature: Admin Authentication Integration | Mridul |
| 851 | Use authenticated instructor token for Canvas operations | Bao |
| 852 | Prevent instructor access to other instructor tokens | Bao |
| 853 | Verify Canvas data remains source of truth | Mridul |
| 854 | Prevent local override of Canvas records | Mridul |
| 863 | Classify actions as read-only | Yerdana |
| 864 | Classify actions as modifying | Yerdana |
| 865 | Classify actions as irreversible | Yerdana |
| 866 | Store original user request | Yerdana |
| 867 | Store executed action | Yerdana |
| 868 | Store execution status | Yerdana |
| 869 | Store timestamp | Yerdana |
| 870 | Store affected Canvas resources | Yerdana |
| 343 | Create a Canvas connector page | Jessica / Rhythm |
| 967 | Add endpoints for Canvas token management | Bao |
| 86 | Demo basic LLM response | Team |
| 984 | Added frontend for course management page | Rhythm |
| 989 | Add canvas docker dev | Mridul |
| 1003 | Feature/student retrieval service | Bao |
| 1005 | Update feature/assignment retrieval service | Bao |
| 1007 | Feature/submission retrieval service | Bao |
| 1011 | Add Canvas connection refresh & URL support | Mridul |
| 1018 | Feature/missing submissions page | Rhythm |
| 1022 | Feature/backend authentication api | Bao |
| 1024 | Feature/backend rbac permissions | Bao |
| 1025 | Feature/backend instructor account manage | Bao |
| 1029 | Add Canvas-backed course management page | Rhythm |
| 1034 | Feature/backend missing sub analysis | Bao |
| 1035 | Feature/backend late submission analysis | Bao |
| 1039 | Feature/workflow auditlog update | Yerdana |
| 1037 | Feature/LLM update assignment | Yerdana |
| 1038 | Feature/LLM student messaging | Yerdana |
| 1036 | Feature/LLM post request | Yerdana |
| 1041 | Add admin audit logs page | Rhythm |
| 1042 | Feature/LLM preview status | Yerdana |
| 635 | Feature: Messaging Workflow Integration | Mridul |
| 637 | Feature: MVP Demo Preparation | Team |
| 636 | Feature: Action History Integration | Mridul |
| 630 | Feature: Instructor Account Management Integration | Mridul |
| 633 | Feature: Assistant Workflow Integration | Mridul |
| 632 | Feature: Dashboard Integration | Mridul |
| 634 | Feature: Assignment Workflow Integration | Mridul |
| 631 | Feature: Canvas Integration | Mridul |
| 406 | Feature: Student & Assignment Views | Jessica |
| 413 | Feature: Action History UI | Rhythm |
| 628 | Feature: Frontend ↔ Backend Authentication | Mridul |
| 409 | Feature: Late Submission Dashboard | Rhythm |
| 420 | Feature: Canvas Token Setup UI | Jessica |
| 414 | Feature: Dry Run Preview UI | Jessica |
| 499 | Feature: Instructor Account Management UI | Jessica |
| 412 | Feature: Student Message Draft UI | Jessica |
| 523 | Feature: Assignment Retrieval Service | Bao |
| 517 | Feature: Administrator Authentication API | Bao |
| 526 | Feature: Late Submission Analysis | Bao |
| 525 | Feature: Missing Submission Analysis | Bao |
| 524 | Feature: Submission Retrieval Service | Bao |
| 528 | Feature: Assignment Creation Service | Yerdana |
| 533 | Feature: Safe Error Handling | Yerdana |
| 531 | Feature: Preview & Confirmation Service | Yerdana |
| 530 | Feature: Student Messaging Service | Yerdana |
| 408 | Feature: Missing Submission Dashboard | Rhythm |
| 522 | Feature: Student Retrieval Service | Bao |
| 407 | Feature: Natural Language Assistant UI | Jessica |
| 410 | Feature: Assignment Creation UI | Jessica |
| 520 | Feature: Canvas Token Management Service | Bao |
| 399 | Feature: Course Dashboard | Rhythm |
| 498 | Feature: Administrator Login UI | Jessica |
| 521 | Feature: Course Retrieval Service | Bao |
| 518 | Feature: Role-Based Access Control | Bao |
| 516 | Feature: Authentication API | Jessica |
| 532 | Feature: Action History Service | Yerdana |
| 529 | Feature: Assignment Update Service | Yerdana |
| 527 | Feature: Natural Language Assistant Service | Yerdana |
| 519 | Feature: Instructor Account Management Service | Bao |
| 80 | Test full app startup | Team |
| 79 | Add shared environment variables | Team |

---

## Tasks for Next Cycle / Currently In Progress

The following Ready items are being treated as the next cycle’s active work and validation priorities.

| Task ID | Description | Assigned To | Status |
|---|---|---|---|
| 959 | Feature: Session cache | Team / Assigned member | Ready / Next Cycle |
| 682 | Feature: Frontend Testing & Bug Fixes | Team / Assigned member | Ready / Next Cycle |
| 683 | Feature: Workflow Validation | Team / Assigned member | Ready / Next Cycle |
| 684 | Feature: Backend Testing & Validation | Team / Assigned member | Ready / Next Cycle |
| 685 | Feature: Automated Test Coverage | Team / Assigned member | Ready / Next Cycle |
| 686 | Feature: Bug Fixes | Team / Assigned member | Ready / Next Cycle |
| 687 | Feature: Integration Testing | Team / Assigned member | Ready / Next Cycle |
| 688 | Feature: Testing Event 1 Preparation | Team | Ready / Next Cycle |

---

## Burn-up Chart / Velocity

Add burn-up chart screenshot here.

### Burn-up Summary

The MVP Demo board moved to a near-final completed state this cycle. The board shows **98 completed items** under the MVP Demo milestone, with no remaining active items in Ready, In Progress, or In Review for the filtered MVP board. This reflects a major push to finish feature work, resolve review items, and prepare the project for MVP validation.

| Metric | Status |
|---|---|
| MVP Demo completed items | 98 |
| Active Ready items in MVP Demo board | 0 |
| Active In Progress items in MVP Demo board | 0 |
| Active In Review items in MVP Demo board | 0 |
| Remaining focus | Testing, validation, bug fixes, and demo polish |

---

## Clockify Summary

Time was tracked using Clockify for **Jul 3, 2026 – Jul 6, 2026**.

| Team Member | Clockify Username | Logged Time |
|---|---|---:|
| Mridul | mridulnohria21 | 19:31:44 |
| Yerdana | yerdana | 12:32:28 |
| Jessica | jessica goel | 11:56:54 |
| Rhythm | trivedirhythm | 08:45:05 |
| Bao | thanhvoiban | 08:16:59 |
| **Total** |  | **61:03:10** |

---

## Test Report / Testing Status

- Full app startup was tested and completed.
- Docker setup and shared environment variable setup were completed.
- Frontend-backend authentication and connection work was completed.
- Canvas token management and authenticated Canvas operations were completed.
- Canvas source-of-truth behavior was validated through tasks preventing local override of Canvas records.
- Assignment retrieval, student retrieval, submission retrieval, course retrieval, and Canvas token management services were completed.
- Missing and late submission dashboard and backend analysis features were completed.
- LLM workflows for post requests, student messaging, assignment updates, preview status, and natural language assistant services were completed.
- Safe error handling, preview/confirmation, and workflow action classification were completed.
- Action history storage fields were completed, including original request, executed action, execution status, timestamp, and affected Canvas resources.
- Integration workflows for Canvas, dashboard, assignment, assistant, messaging, and action history were completed.
- Remaining next-cycle testing work should focus on automated coverage, backend validation, frontend bug fixes, workflow validation, and final Testing Event 1 preparation.

---

## Project Status Summary

### Current State

This cycle brought the MVP Demo milestone to a completed state. The project board now shows the major MVP work moved into Done, including backend services, frontend workflows, Canvas integration, authentication, LLM workflows, action history, audit logging, and integration tasks.

Bao completed the remaining backend-focused work, including RBAC permissions, instructor account management, authentication API work, Canvas token management, student retrieval, assignment retrieval, submission retrieval, missing submission analysis, and late submission analysis. This helped close the backend service layer needed for the MVP Demo.

Jessica completed the remaining frontend features, including authentication UI, administrator login UI, Canvas token setup UI, Dry Run Preview UI, Student Message Draft UI, Assignment Creation UI, Natural Language Assistant UI, Instructor Account Management UI, and Student & Assignment Views.

Rhythm completed dashboard and analytics work, including Course Access UI, Course Dashboard, Missing Submission Dashboard, Late Submission Dashboard, Canvas-backed course management, Action History UI, and Admin Audit Logs page support.

Mridul completed major integration and infrastructure work, including CI/CD, Makefile setup, Docker and Canvas Docker support, frontend-backend authentication, Canvas connection refresh and URL support, Canvas integration, dashboard integration, assignment workflow integration, assistant workflow integration, messaging workflow integration, and action history integration.

Yerdana completed the LLM and workflow-safety layer, including LLM foundation, LLM post requests, LLM student messaging, LLM assignment updates, LLM preview status, natural language assistant service, assignment creation/update services, preview and confirmation service, safe error handling, action history service, workflow audit log updates, and action classification.

Overall, this cycle moved the project from feature completion into final validation and demo-readiness. The next cycle should focus on testing depth, bug fixes, workflow validation, automated coverage, and Testing Event 1 preparation.

---

## Completed and Merged to `develop`

| Layer | What's Done |
|---|---|
| **Authentication** | Authentication UI, Authentication API, admin authentication API, admin login UI, frontend-backend authentication, admin authentication integration, route protection, token route support |
| **Canvas Integration** | Canvas connector page, Canvas token setup UI, Canvas token management service, Canvas token endpoints, Canvas connection refresh and URL support, authenticated instructor Canvas operations, Canvas source-of-truth validation, Canvas integration workflow |
| **Course / Student / Assignment / Submission Retrieval** | Course retrieval service, student retrieval service, assignment retrieval service, submission retrieval service, missing submission analysis, late submission analysis, Canvas-backed course management |
| **Dashboards / Analytics** | Course Access UI, Course Dashboard, Missing Submission Dashboard, Late Submission Dashboard, Dashboard Integration, Canvas-backed course management page |
| **LLM / Assistant** | LLM foundation, basic LLM response demo, natural language assistant UI/service, LLM post request, LLM student messaging, LLM update assignment, LLM preview status |
| **Write / Preview / Messaging Workflows** | Assignment creation UI/service, assignment update UI/service, student message draft UI, student messaging service, preview and confirmation service, dry run preview UI, action classification |
| **Action History / Audit** | Action history service, action history UI, action history integration, workflow audit log update, admin audit logs page, storage of original request/executed action/status/timestamp/affected Canvas resources |
| **Infrastructure** | Docker setup, Canvas Docker setup, Canvas Docker dev support, CI/CD pipeline, Makefile setup, shared environment variables, full app startup testing |
| **Integration** | Instructor account management integration, Canvas integration, dashboard integration, assignment workflow integration, assistant workflow integration, messaging workflow integration, action history integration |
| **Testing / Validation** | Full startup testing completed; remaining testing moved into next-cycle testing, bug fix, validation, and coverage tasks |

---

## In Progress / To Do for Next Cycle

| Area | Description |
|---|---|
| Session cache | Implement or validate caching behavior needed for smoother workflow execution |
| Frontend testing and bug fixes | Improve frontend stability and resolve UI issues found during demo preparation |
| Workflow validation | Validate assistant, assignment, messaging, preview, and action-history flows end to end |
| Backend testing and validation | Strengthen backend test coverage around auth, Canvas, RBAC, LLM, and write-action services |
| Automated test coverage | Add/expand automated tests for core MVP workflows |
| Bug fixes | Resolve issues found during manual and automated validation |
| Integration testing | Test the full instructor path across frontend, backend, Canvas, LLM, preview, confirmation, and history |
| Testing Event 1 preparation | Prepare the project, demo flow, and validation evidence for Testing Event 1 |

---

## Feature Ownership Overview

| Feature / Area | Primary Owner |
|---|---|
| Backend auth API, admin auth, RBAC, Canvas services | Bao |
| Course, student, assignment, submission retrieval services | Bao |
| Missing/late submission backend analysis | Bao |
| Instructor account management service | Bao |
| LLM foundation and natural language assistant services | Yerdana |
| LLM write-action workflows and safe error handling | Yerdana |
| Preview/confirmation service and action history service | Yerdana |
| Workflow audit logging and action classification | Yerdana |
| Frontend authentication, admin UI, assistant UI, preview UI, message draft UI | Jessica |
| Student and assignment views | Jessica |
| Course dashboard, course access UI, analytics dashboards | Rhythm |
| Action History UI and Admin Audit Logs UI | Rhythm |
| Frontend-backend authentication and Canvas integration | Mridul |
| Docker, CI/CD, Canvas Docker, environment setup | Mridul |
| Dashboard, assignment, assistant, messaging, and action history integration | Mridul |
| MVP demo preparation and final validation | All |

---

## Main Risks / Remaining Gaps

| Risk / Gap | Impact | Next Step |
|---|---|---|
| Many features closed in a short period | Higher chance of integration regressions | Prioritize full end-to-end testing next cycle |
| Remaining Ready items are mostly validation/testing | Bugs may surface late during demo prep | Start workflow validation and bug triage early |
| Action history and LLM workflows are complex | Edge cases may be missed | Add automated coverage and manual scenario testing |
| Canvas integration depends on external API behavior | Token, permission, or unavailable API cases can affect demo | Re-test Canvas failure modes and source-of-truth behavior |
| UI and backend work merged across many areas | Potential mismatch between frontend assumptions and backend responses | Run full frontend-backend integration tests |
| Demo readiness depends on stable environment | Docker or startup problems could block validation | Re-test Docker environment and full app startup before demo |

---

## Overall Summary

Cycle 14 was a major completion cycle for the MVP Demo milestone. The project board shows the MVP Demo work moved into Done, with 98 completed items and no remaining active Ready, In Progress, or In Review items in the filtered milestone board. The team completed the remaining backend services, frontend pages, Canvas workflows, LLM workflows, action history/audit support, and integration tasks required for the MVP.

The next cycle should focus less on adding new features and more on validation. The main priorities are session cache, frontend testing and bug fixes, workflow validation, backend testing, automated coverage, integration testing, and final Testing Event 1 preparation.
