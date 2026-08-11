# Weekly Team Log

We had 1 team meeting during this cycle, on Friday to keep moving toward the MVP milestone. Mridul added Canvas Docker support and worked through PR feedback on the Docker setup. Bao merged the Canvas Docker branch into develop and built out the full course retrieval service with pagination, upsert, and active course selection. Jessica worked on the Administrator Login UI and admin route protection, and got her auth validation PR merged. Rhythm finished the Course Access page and moved on to the Course Dashboard. Yerdana joined a live coding session to troubleshoot the Canvas connect page and the Canvas Docker sandbox, and opened a PR for the LLM adapter layer.

## Date Range:

- [19-06] - [22-06]

## Features in the Project Plan Cycle:


- Canvas Docker setup and testing
- Course retrieval service (fetch, pagination, upsert, active course)
- Administrator Login UI and admin route protection
- Auth form validation and error handling
- Course Access UI
- Course Dashboard UI
- LLM adapter layer and chat pipeline
- Canvas connect page troubleshooting

## Associated Tasks from Project Board:
| Task ID | Description                                      | Assigned To | Status      |
|---------|--------------------------------------------------|-------------|-------------|
| 384 | Add canvas-docker for testing | Mridul | Completed |
| 963 | CI and Makefile complete setup | Mridul | Completed |
| 534 | Fetch instructor courses | Bao | Completed |
| 535 | Handle API failures | Bao | Completed |
| 536 | Format course responses | Bao | Completed |
| 537 | Handle Canvas pagination | Bao | Completed |
| 538 | Store active course context | Bao | Completed |
| 539 | Support active course selection | Bao | Completed |
| 498 | Feature: Administrator Login UI (UR1.1) | Jessica | In Progress |
| 501 | Add admin route protection | Jessica | In Progress |
| 502 | Redirect admins to admin dashboard | Jessica | In Progress |
| 419 | Feature: Course Access UI (UR2.4, UR2.5) | Rhythm | Completed |
| 67 | Return response through backend | Yerdana | In Progress |
| 68 | Add timeout/error handling | Yerdana | In Progress |
| 543 | Fetch assignments | Yerdana | In Progress |
| 563 | Process natural-language requests | Yerdana | In Progress |
| 559 | Generate structured actions | Yerdana | In Progress |
| 561 | Request clarification for ambiguous requests | Yerdana | Not Started |

## Tasks for Next 2 weeks:
### Backend:
| Task ID | Description                                      | Assigned To | Status      |
|---------|--------------------------------------------------|-------------|-------------|
| 67 | Return response through backend | Yerdana | In Progress |
| 68 | Add timeout/error handling | Yerdana | In Progress |
| 543 | Fetch assignments | Yerdana | In Progress |
| 563 | Process natural-language requests | Yerdana | In Progress |
| 559 | Generate structured actions | Yerdana | In Progress |
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
| 498 | Feature: Administrator Login UI (UR1.1) | Jessica | In Progress |
| 501 | Add admin route protection | Jessica | In Progress |
| 502 | Redirect admins to admin dashboard | Jessica | In Progress |
| 399 | Course dashboard | Rhythm | In Progress |
| 406 | Student & Assignment views | Rhythm | Not started |
| 407 | Natural langugage assistant UI | Jessica | Not started |
| 408 | Missing submission dashboard | Rhythm | Not started |
| 409 | Late submission dashboard | Rhythm | Not started |
| 410 | Assignment creation UI | Jessica | Not started |
| 411 | Assignment update UI | Jessica | Not started |
| 412 | Student message draft UI | Jessica | Not started |
| 413 | Action history UI | Rhythm | Not started |
| 414 | Dry run preview UI | Jessica | Not started |
| 499 | Instructor account management UI | Jessica | Not started |

## Burn-up Chart (Velocity):

<img width="943" height="545" alt="Screenshot 2026-06-23 at 9 41 31 PM" src="https://github.com/user-attachments/assets/5b20f786-09e0-4727-b9fb-a40d4e3c9996" />

<img width="907" height="508" alt="Screenshot 2026-06-23 at 9 43 20 PM" src="https://github.com/user-attachments/assets/3b8c9fe9-d6cf-4419-b50e-c26f55e503a6" />


## Times for Team/Individual:

| Team Member | Logged Hours |
| ----------- | ------------ |
| Mridul      | 5:40:00 |
| Jessica     | 3:31:28 |
| Bao         | 7:52:32 |
| Yerdana     | 3:41:00 |
| Rhythm      | 4:41:32 |

## Completed Tasks:

| Task ID | Description        | Completed By |
| ------- | ------------------ | ------------ |
| 384 | Add canvas-docker for testing | Mridul |
| 963 | CI and Makefile complete setup | Mridul |
| 534 | Fetch instructor courses | Bao |
| 535 | Handle API failures | Bao |
| 536 | Format course responses | Bao |
| 537 | Handle Canvas pagination | Bao |
| 538 | Store active course context | Bao |
| 539 | Support active course selection | Bao |
| 419 | Feature: Course Access UI | Rhythm |

## In Progress Tasks/ To do:

| Task ID | Description        | Assigned To |
| ------- | ------------------ | ----------- |
| 498 | Feature: Administrator Login UI | Jessica |
| 501 | Add admin route protection | Jessica |
| 502 | Redirect admins to admin dashboard | Jessica |
| 67 | Return response through backend | Yerdana |
| 68 | Add timeout/error handling | Yerdana |
| 543 | Fetch assignments | Yerdana |
| 563 | Process natural-language requests | Yerdana |
| 559 | Generate structured actions | Yerdana |
| 518 | Role-based access control | Bao |
| 399 | Course dashboard | Rhythm |

## Test Report / Testing Status:
- Backend — tests passing
- Course retrieval service — 23 integration tests passing, covering response shape, upsert idempotency, pagination, error handling, and active course round-trip
- MCP server — 19 tests passing
- Frontend — unit tests present for shipped components

## Overview:
The team made strong progress on the backend this cycle. Bao delivered the full course retrieval service, including Canvas pagination, batch upsert into the local database, and active course selection backed by a new user_preferences table, all covered by 23 passing tests. Mridul added Canvas Docker support and worked through PR feedback to get it merged into dev. Yerdana joined a live troubleshooting session with the team to debug the Canvas connect page and the Canvas Docker sandbox, finding a missing compose service definition and a URL duplication bug, and opened a PR for the LLM adapter layer that connects the chatbox to Canvas through a local LLM. Jessica continued work on the Administrator Login UI and admin route protection, and got her auth validation PR merged. Rhythm finished the Course Access page and moved on to building the Course Dashboard. The team is now running three meetings a week, which has noticeably sped up PR reviews and reduced back and forth on cross-team integration issues.
