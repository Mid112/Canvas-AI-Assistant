# Weekly Team Log

We had 1 team meeting during this cycle, on Tuesday, to review PRs and walk through each member's part of the codebase. Bao built out the student, assignment, and submission retrieval services. Jessica and Rhythm finished the Assignment Creation UI and closed nine related issues together. Rhythm also finished the Course Dashboard and started the missing and late submissions analytics dashboard. Mridul connected the login, registration, and Canvas token workflows between frontend and backend. Yerdana implemented the LLM adapter chat pipeline, including timeout and error handling, and verified it end to end against real Canvas data.

## Date Range:

- [23-06] - [25-06]

## Features in the Project Plan Cycle:

- Student retrieval service
- Assignment retrieval service
- Submission retrieval service
- Assignment Creation UI
- Course Dashboard
- Missing and late submissions analytics dashboard
- Frontend/backend authentication connection (login, registration, Canvas token)
- LLM adapter chat pipeline (return response through backend, timeout/error handling)
- CI workflow fixes

## Associated Tasks from Project Board:
| Task ID | Description                                      | Assigned To | Status      |
|---------|--------------------------------------------------|-------------|-------------|
| 522 | Feature: Student Retrieval Service (UR2.6) | Bao | Completed |
| 410 | Feature: Assignment Creation UI (UR2.14) | Jessica + Rhythm | Completed |
| 467 | Create assignment form | Jessica + Rhythm | Completed |
| 468 | Connect preview workflow | Jessica + Rhythm | Completed |
| 469 | Add validation | Jessica + Rhythm | Completed |
| 470 | Add due date field | Jessica + Rhythm | Completed |
| 471 | Add description field | Jessica + Rhythm | Completed |
| 472 | Add title field | Jessica + Rhythm | Completed |
| 399 | Course dashboard | Rhythm | Completed |
| 663 | Connect Canvas token workflow | Mridul | Completed |
| 678 | Connect login flow | Mridul | Completed |
| 679 | Connect registration flow | Mridul | Completed |
| 67 | Return response through backend | Yerdana | Completed |
| 68 | Add timeout/error handling | Yerdana | Completed |
| 534 | Fetch instructor courses | Yerdana | Completed |
| 543 | Fetch assignments | Yerdana | Completed |
| 563 | Process natural-language requests | Yerdana | Completed |
| 559 | Generate structured actions | Yerdana | Completed |
| 561 | Request clarification for ambiguous requests | Yerdana | Not Started |

## Tasks for Next 2 weeks:
### Backend:
| Task ID | Description                                      | Assigned To | Status      |
|---------|--------------------------------------------------|-------------|-------------|
| 561 | Request clarification for ambiguous requests | Yerdana | Not Started |
| 532 | Action history service | Yerdana | Not started |
| 533 | Safe error handling | Yerdana | Not started |
| 518 | Role-based access control | Bao | In Progress |
| 519 | Instructor Account Management Service | Bao | Not started |
| 527 | Natural language assistant service | Bao | Not started |
| 530 | Student messaging service | Bao | Not started |
| 531 | Preview & confirmation service | Bao | Not started |
### Integration:
| Task ID | Description                                      | Assigned To | Status      |
|---------|--------------------------------------------------|-------------|-------------|
| 628 | Frontend & backend authentication | Mridul | In Progress |
| 629 | Admin authentication integration | Mridul | Not started |
| 630 | Instructor account management integration | Mridul | Not started |
| 631 | Canvas integration | Mridul | In Progress |
| 632 | Dashboard integration | Mridul | Not started |
| 633 | Assistant workflow integration | Mridul | Not started |
| 634 | Assignment workflow integration | Mridul | Not started |
| 635 | Messaging workflow integration | Mridul | Not started |
| 636 | Action history integration | Mridul | Not started |
### Frontend:
| Task ID | Description                                      | Assigned To | Status      |
|---------|--------------------------------------------------|-------------|-------------|
| 498 | Feature: Administrator Login UI | Jessica | In Progress |
| 501 | Add admin route protection | Jessica | In Progress |
| 502 | Redirect admins to admin dashboard | Jessica | In Progress |
| 406 | Student & Assignment views | Rhythm | Not started |
| 407 | Natural langugage assistant UI | Jessica | Not started |
| 408 | Missing submission dashboard | Rhythm | In Progress |
| 409 | Late submission dashboard | Rhythm | In Progress |
| 411 | Assignment update UI | Jessica | Not started |
| 412 | Student message draft UI | Jessica | Not started |
| 413 | Action history UI | Rhythm | Not started |
| 414 | Dry run preview UI | Jessica | Not started |
| 499 | Instructor account management UI | Jessica | Not started |

## Burn-up Chart (Velocity):
[ADD BURN-UP CHART SCREENSHOT HERE]

## Times for Team/Individual:

| Team Member | Logged Hours |
| ----------- | ------------ |
| Mridul      | [ADD HOURS] |
| Jessica     | [ADD HOURS] |
| Bao         | [ADD HOURS] |
| Yerdana     | [ADD HOURS] |
| Rhythm      | [ADD HOURS] |

## Completed Tasks:

| Task ID | Description        | Completed By |
| ------- | ------------------ | ------------ |
| 522 | Feature: Student Retrieval Service | Bao |
| 410 | Feature: Assignment Creation UI | Jessica + Rhythm |
| 467 | Create assignment form | Jessica + Rhythm |
| 468 | Connect preview workflow | Jessica + Rhythm |
| 469 | Add validation | Jessica + Rhythm |
| 470 | Add due date field | Jessica + Rhythm |
| 471 | Add description field | Jessica + Rhythm |
| 472 | Add title field | Jessica + Rhythm |
| 399 | Course dashboard | Rhythm |
| 663 | Connect Canvas token workflow | Mridul |
| 678 | Connect login flow | Mridul |
| 679 | Connect registration flow | Mridul |
| 67 | Return response through backend | Yerdana |
| 68 | Add timeout/error handling | Yerdana |
| 534 | Fetch instructor courses | Yerdana |
| 543 | Fetch assignments | Yerdana |
| 563 | Process natural-language requests | Yerdana |
| 559 | Generate structured actions | Yerdana |

## In Progress Tasks/ To do:

| Task ID | Description        | Assigned To |
| ------- | ------------------ | ----------- |
| 498 | Feature: Administrator Login UI | Jessica |
| 501 | Add admin route protection | Jessica |
| 502 | Redirect admins to admin dashboard | Jessica |
| 408 | Missing submission dashboard | Rhythm |
| 409 | Late submission dashboard | Rhythm |
| 561 | Request clarification for ambiguous requests | Yerdana |
| 518 | Role-based access control | Bao |
| 628 | Frontend & backend authentication | Mridul |
| 631 | Canvas integration | Mridul |

## Test Report / Testing Status:
- Backend tests passing
- Student retrieval service covered by new integration tests, including upsert idempotency and error propagation
- LLM adapter chat pipeline tested end to end against a real Canvas sandbox: fetch_courses, fetch_assignments, and fetch_submissions all verified with real enrolled students and real assignments
- Course retrieval service 23/23 tests passing
- Frontend unit tests present for shipped components

## Overview:
The team closed out a large batch of work this cycle. Bao built the student, assignment, and submission retrieval services, giving the backend a complete data layer from course down to individual submissions. Jessica and Rhythm finished the Assignment Creation UI together, closing nine related issues in one push. Rhythm also completed the Course Dashboard and began the missing and late submissions analytics dashboard. Mridul connected the login, registration, and Canvas token workflows so the frontend and backend now talk to each other end to end, and gave useful Makefile feedback on Yerdana's PR. Yerdana finished the chat pipeline that returns LLM responses through the backend with timeout and error handling, and verified it end to end against a real Canvas sandbox with five enrolled students and two real assignments. The team continues to meet regularly to review PRs together, which keeps everyone aligned on the shared data model as the backend and frontend pieces come together.
