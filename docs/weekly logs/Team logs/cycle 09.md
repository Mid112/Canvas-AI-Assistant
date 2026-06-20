# Weekly Team Log

We had a team meeting this cycle to review proof of life follow-up items and align on task assignments for the MVP push. Jessica and Rhythm continue frontend work on Instructor Authentication UI, Canvas Token Management UI, and Canvas Token Setup UI. Mridul focuses on the CI/CD pipeline and Makefile setup. Bao works on Canvas token management endpoints and the Canvas Docker sandbox. Yerdana focuses on MCP server tools, Canvas integration testing, and bug fixes.

## Date Range:

- [16-06] - [18-06]

## Features in the Project Plan Cycle:

- Instructor Authentication UI
- Canvas Token Management UI
- Canvas Token Setup UI
- CI/CD pipeline setup
- Makefile setup
- Canvas token management endpoints (backend)
- Canvas Docker sandbox integration
- MCP server core tools and testing
- Feature and bug fixes

## Associated Tasks from Project Board:
| Task ID | Description                                      | Assigned To | Status      |
|---------|--------------------------------------------------|-------------|-------------|
| 87 | Authentication UI | Jessica & Rhythm | In Progress |
| 37 | Instructor Authentication UI | Rhythm + Jessica | In Progress |
| 420 | Canvas token setup UI | Jessica | In Progress |
| 323 | CI/CD Pipeline | Mridul | In Progress |
| 963 | CI and Makefile complete setup | Mridul | Completed |
| 21 | Feature: Docker Setup | Mridul | In Progress |
| 967 | Add endpoints for canvas token management | Bao | Completed |
| 384 | Canvas Docker | Bao | Completed |
| 686 | Feature/Bug Fixes | Yerdana | Completed |
| 524 | Submission Retrieval Service | Yerdana | In Progress |
| 525 | Late submission analysis | Yerdana | In Progress |
| 528 | Assignment creation service | Yerdana | In Progress |
| 529 | Assignment update service | Yerdana | In Progress |

## Tasks for Next 2 weeks:
### Backend:
| Task ID | Description                                      | Assigned To | Status      |
|---------|--------------------------------------------------|-------------|-------------|
| 524 | Submission Retrieval Service | Yerdana | In Progress |
| 525 | Late submission analysis | Yerdana | In Progress |
| 528 | Assignment creation service | Yerdana | In Progress |
| 529 | Assignment update service | Yerdana | In Progress |
| 532 | Action history service | Yerdana | Not started |
| 533 | Safe error handling | Yerdana | Not started |
| 518 | Role-based access control | Bao | In Progress |
| 519 | Instructor Account Management Service | Bao | Not started |
| 520 | Canvas Token Management Service | Bao | Completed |
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
| 87 | Authentication UI | Jessica & Rhythm | In Progress |
| 399 | Course dashboard | Rhythm | Not started |
| 406 | Student & Assignment views | Rhythm | Not started |
| 407 | Natural langugage assistant UI | Jessica | Not started |
| 408 | Missing submission dashboard | Rhythm | Not started |
| 409 | Late submission dashboard | Rhythm | Not started |
| 410 | Assignment creation UI | Jessica | Not started |
| 411 | Assignment update UI | Jessica | Not started |
| 412 | Student message draft UI | Jessica | Not started |
| 413 | Action history UI | Rhythm | Not started |
| 414 | Dry run preview UI | Jessica | Not started |
| 419 | Course access UI | Rhythm | Not started |
| 420 | Canvas token setup UI | Jessica | In Progress |
| 498 | Administrator login UI | Jessica | Not started |
| 499 | Instructor account management UI | Jessica | Not started |

## Burn-up Chart (Velocity):


## Times for Team/Individual:

| Team Member | Logged Hours |
| ----------- | ------------ |
| Mridul      | 9:14:06      |
| Jessica     | 11:01:15     |
| Bao         | 10:10:01     |
| Yerdana     | 7:29:31      |
| Rhythm      | 4:37:35      |

## Completed Tasks:

| Task ID | Description        | Completed By |
| ------- | ------------------ | ------------ |
| 963 | CI and Makefile complete setup | Mridul |
| 967 | Add endpoints for canvas token management | Bao |
| 384 | Canvas Docker | Bao |
| 686 | Feature/Bug Fixes | Yerdana |
| 520 | Canvas Token Management Service | Bao |

## In Progress Tasks/ To do:

| Task ID | Description        | Assigned To |
| ------- | ------------------ | ----------- |
| 87 | Authentication UI | Rhythm + Jessica |
| 37 | Instructor Authentication UI | Rhythm + Jessica |
| 420 | Canvas token setup UI | Jessica |
| 323 | CI/CD Pipeline | Mridul |
| 21 | Feature: Docker Setup | Mridul |
| 524 | Submission Retrieval Service | Yerdana |
| 525 | Late submission analysis | Yerdana |
| 528 | Assignment creation service | Yerdana |
| 529 | Assignment update service | Yerdana |
| 518 | Role-based access control | Bao |

## Test Report / Testing Status:
- Backend — tests passing
- MCP server — 19 tests passing, including Canvas integration tests
- Frontend — unit tests present for shipped components

## Overview:
The team spent this cycle finishing CI/CD tooling, Canvas token management endpoints, and MCP server development while continuing frontend authentication work. Mridul completed the CI and Makefile setup. Bao completed the Canvas token management endpoints and the Canvas Docker sandbox integration. Yerdana implemented the Canvas MCP server core tools, wrote and passed integration tests against a local Canvas sandbox, and reviewed multiple Canvas-connection PRs across the team, finding a request shape mismatch and a https-only validation gap that now blocks local sandbox testing. Jessica and Rhythm continued frontend development on authentication and Canvas token setup UI. The cycle moved several backend and integration tasks from in progress into the next two weeks' to-do list, since they were not fully completed.