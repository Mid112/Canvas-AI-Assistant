# Weekly Team Log

We had 1 team meeting this cycle on Friday to coordinate the MVP push and agree on implementation priorities. Bao delivered three backend features on Monday: admin authentication API, role-based access control, and instructor account management. Rhythm built out the missing and late submission analytics dashboards and fixed several Course Management page issues. Jessica finished the Dry Run Preview UI and the Student Message Draft UI, closing fourteen related issues. Mridul continued connecting frontend and backend authentication flows. Yerdana addressed all review feedback on the LLM vague-message PR, implementing server-side confirm by message ID, scope checking, ambiguity handling, and user-friendly error generation.

## Date Range:

- [26-06] - [29-06]

## Features in the Project Plan Cycle:

- Administrator Authentication API
- Role-based access control
- Instructor account management
- Missing and late submission analytics dashboards
- Course Management page fixes
- Dry Run Preview UI
- Student Message Draft UI
- LLM scope check, ambiguity handling, and intent preview
- Frontend/backend authentication connection

## Associated Tasks from Project Board:
| Task ID | Description                                      | Assigned To | Status      |
|---------|--------------------------------------------------|-------------|-------------|
| 546 | Fetch submissions | Bao | Completed |
| 547 | Parse submission status | Bao | Completed |
| 548 | Parse grading information | Bao | Completed |
| 549 | Handle API failures | Bao | Completed |
| 517 | Feature: Administrator Authentication API (UR1.1) | Bao | Completed |
| 593 | Create administrator role model | Bao | Completed |
| 594 | Support administrator JWT generation | Bao | Completed |
| 595 | Support administrator login | Bao | Completed |
| 596 | Add admin logout support | Bao | Completed |
| 597 | Add admin session validation | Bao | Completed |
| 518 | Feature: Role-Based Access Control (UR1.1, UR1.2, UR1.3, UR2.1) | Bao | Completed |
| 598 | Create role middleware | Bao | Completed |
| 599 | Restrict admin routes | Bao | Completed |
| 600 | Return unauthorized responses | Bao | Completed |
| 601 | Add permission tests | Bao | Completed |
| 602 | Validate permissions on protected endpoints | Bao | Completed |
| 603 | Restrict instructor routes | Bao | Completed |
| 408 | Feature: Missing Submission Dashboard (UR2.7) | Rhythm | In Progress |
| 409 | Feature: Late Submission Dashboard (UR2.8) | Rhythm | In Progress |
| 414 | Feature: Dry Run Preview UI (UR2.13, UR2.23) | Jessica | Completed |
| 490 | Create preview panel | Jessica | Completed |
| 491 | Display affected resources | Jessica | Completed |
| 492 | Display action summary | Jessica | Completed |
| 493 | Display reversibility status | Jessica | Completed |
| 494 | Add cancel button | Jessica | Completed |
| 495 | Display action type | Jessica | Completed |
| 496 | Add confirm button | Jessica | Completed |
| 412 | Feature: Student Message Draft UI (UR2.18, UR2.19) | Jessica | Completed |
| 478 | Create message draft page | Jessica | Completed |
| 479 | Display draft preview | Jessica | Completed |
| 480 | Allow message edits | Jessica | Completed |
| 481 | Add confirmation workflow | Jessica | Completed |
| 482 | Create message editor | Jessica | Completed |
| 663 | Connect Canvas token workflow | Mridul | Completed |
| 678 | Connect login flow | Mridul | Completed |
| 679 | Connect registration flow | Mridul | Completed |
| 561 | Request clarification for ambiguous requests | Yerdana | Completed |
| 564 | Answer questions about course data | Yerdana | Completed |
| 625 | Generate user-friendly errors | Yerdana | Completed |

## Tasks for Next 2 weeks:
### Backend:
| Task ID | Description                                      | Assigned To | Status      |
|---------|--------------------------------------------------|-------------|-------------|
| 519 | Instructor Account Management Service | Bao | In Progress |
| 527 | Natural language assistant service | Bao | Not started |
| 530 | Student messaging service | Bao | Not started |
| 531 | Preview & confirmation service | Bao | Not started |
| 532 | Action history service | Yerdana | Not started |
| 533 | Safe error handling | Yerdana | Not started |
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
| 407 | Natural language assistant UI | Jessica | Not started |
| 408 | Missing submission dashboard | Rhythm | In Progress |
| 409 | Late submission dashboard | Rhythm | In Progress |
| 411 | Assignment update UI | Jessica | Not started |
| 413 | Action history UI | Rhythm | Not started |
| 499 | Instructor account management UI | Jessica | Not started |

## Burn-up Chart (Velocity):

<img width="930" height="556" alt="Screenshot 2026-06-30 at 9 59 11 PM" src="https://github.com/user-attachments/assets/402ecb4f-b168-4d58-87f7-2db8c47d95e1" />


## Times for Team/Individual:

| Team Member | Logged Hours |
| ----------- | ------------ |
| Mridul      | 04:20:00 |
| Jessica     | 07:21:47 |
| Bao         | 12:54:10 |
| Yerdana     | 07:46:23 |
| Rhythm      | 08:27:24 |

## Completed Tasks:

| Task ID | Description        | Completed By |
| ------- | ------------------ | ------------ |
| 546 | Fetch submissions | Bao |
| 547 | Parse submission status | Bao |
| 548 | Parse grading information | Bao |
| 549 | Handle API failures | Bao |
| 517 | Feature: Administrator Authentication API | Bao |
| 593 | Create administrator role model | Bao |
| 594 | Support administrator JWT generation | Bao |
| 595 | Support administrator login | Bao |
| 596 | Add admin logout support | Bao |
| 597 | Add admin session validation | Bao |
| 518 | Feature: Role-Based Access Control | Bao |
| 598 | Create role middleware | Bao |
| 599 | Restrict admin routes | Bao |
| 600 | Return unauthorized responses | Bao |
| 601 | Add permission tests | Bao |
| 602 | Validate permissions on protected endpoints | Bao |
| 603 | Restrict instructor routes | Bao |
| 414 | Feature: Dry Run Preview UI | Jessica |
| 490 | Create preview panel | Jessica |
| 491 | Display affected resources | Jessica |
| 492 | Display action summary | Jessica |
| 493 | Display reversibility status | Jessica |
| 494 | Add cancel button | Jessica |
| 495 | Display action type | Jessica |
| 496 | Add confirm button | Jessica |
| 412 | Feature: Student Message Draft UI | Jessica |
| 478 | Create message draft page | Jessica |
| 479 | Display draft preview | Jessica |
| 480 | Allow message edits | Jessica |
| 481 | Add confirmation workflow | Jessica |
| 482 | Create message editor | Jessica |
| 663 | Connect Canvas token workflow | Mridul |
| 678 | Connect login flow | Mridul |
| 679 | Connect registration flow | Mridul |
| 561 | Request clarification for ambiguous requests | Yerdana |
| 564 | Answer questions about course data | Yerdana |
| 625 | Generate user-friendly errors | Yerdana |

## In Progress Tasks/ To do:

| Task ID | Description        | Assigned To |
| ------- | ------------------ | ----------- |
| 408 | Missing submission dashboard | Rhythm |
| 409 | Late submission dashboard | Rhythm |
| 498 | Feature: Administrator Login UI | Jessica |
| 501 | Add admin route protection | Jessica |
| 502 | Redirect admins to admin dashboard | Jessica |
| 519 | Instructor Account Management Service | Bao |
| 532 | Action history service | Yerdana |
| 628 | Frontend & backend authentication | Mridul |
| 631 | Canvas integration | Mridul |

## Test Report / Testing Status:
- Backend tests passing
- Admin authentication API covered by unit and integration tests
- RBAC permission tests passing, covering admin-only and instructor-only route restrictions
- LLM scope check, clarification, and intent preview tested end to end against a real Canvas sandbox with Groq-hosted Qwen3.6-27B
- Frontend unit tests present for shipped components

## Overview:
This was a high-output cycle with significant progress across the backend, frontend, and LLM layers. Bao delivered three backend features on Monday: admin authentication with JWT role claims and audit logging, role-based access control restricting Canvas endpoints to instructors, and instructor account management. Running three feature branches in parallel caused some lint and test conflicts that needed a cleanup pass, but all three landed. Rhythm continued building the missing and late submission analytics dashboards and fixed several Course Management page issues, including replacing mock data with real Canvas-backed loading and fixing assignment page routing. Jessica closed fourteen issues across the Dry Run Preview UI and Student Message Draft UI, both of which required building multiple sub-components and a confirmation workflow. Mridul continued connecting the frontend authentication flows to the backend. Yerdana addressed all review feedback on the LLM vague-message PR, adding server-side confirm by message ID, scope checking that rejects out-of-scope requests cleanly, ambiguity handling with multi-turn clarification, and user-friendly error messages for each failure mode. The team met on Friday to align on the MVP push for the next cycle.
