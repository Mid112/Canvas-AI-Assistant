# Weekly Team Log

We had a 2 hour meeting on Tuesday June 9nd to divide tasks for demo proof of life, Jessica and Rhythm work on frontend, Bao works on backend, Yerdana does LLM and MCP setup, Mridul takes responsibility for Docker. We also have another 2 hours meeting on 

## Date Range:

- [09-06] - [11-06]

## Features in the Project Plan Cycle:

- Work on frontend, backend, docker, mcp & llm set up for demo proof of life
- Address weekly action items:
    - Requirements
    - Project progression

## Associated Tasks from Project Board:
| Task ID | Description                                      | Assigned To | Status      |
|---------|--------------------------------------------------|-------------|-------------|
| 37 | Authentication UI + Dashboard Preview | Rhythm & Jessica | Finished |
| 21 | Docker setup frontend/backend | Mridul | Finished |
| 63 | LLM/MCP server basic set up + test | Yerdana | Finished |
| 43, 49, 56 | Backend setup | Bao | Finished |
| 69 | Integration | Jessica | Finished |

## Tasks for Next Cycle:
| Task ID | Description                                      | Assigned To | Status      |
|---------|--------------------------------------------------|-------------|-------------|
| 37 | Instructor Authentication UI | Rhythm + Jessica |Not started|
| 94 | Canvas Token Management UI | Jessica + Rhythm |Not started|
| 133 | Chat API | Bao | Not started |
| 140 | Intent Detection | Yerdana | Not started |
| 154 | Missing Submission Analysis | Mridul | Not started

## Burn-up Chart (Velocity):
<img width="2200" height="562" alt="Screenshot 2026-06-09 100820" src="https://github.com/user-attachments/assets/de81414c-e2b3-4490-a453-9f07a1704152" />


## Times for Team/Individual:

| Team Member | Logged Hours |
| ----------- | ------------ |
| Mridul      | 08:42:00 |
| Jessica    |  09:09:19 |
| Bao     | 11:25:00  |
| Yerdana     |  5:00:00 |
| Rhythm     | 07:06:00   |

## Completed Tasks:

| Task ID | Description        | Completed By |
| ------- | ------------------ | ------------ |
| 37 | Authentication UI + Dashboard Preview | Rhythm & Jessica | Finished |
| 21 | Docker setup frontend/backend | Mridul | Finished |
| 63 | LLM/MCP server basic set up + test | Yerdana | Finished |
| 43, 49, 56 | Backend work + Canvas token | Bao | Finished |
| 69 | Integration | Jessica | Finished |

## In Progress Tasks/ To do:

| Task ID | Description        | Assigned To |
| ------- | ------------------ | ----------- |
| 37 | Instructor Authentication UI | Rhythm + Jessica |Not started|
| 94 | Canvas Token Management UI | Jessica + Rhythm |Not started|
| 133 | Chat API | Bao | Not started |
| 140 | Intent Detection | Yerdana | Not started |
| 154 | Missing Submission Analysis | Mridul | Not started

## Test Report / Testing Status:
- Backend — 13/13 passing
test_auth.py — register (with name), login, wrong password, duplicate email, GET /me, invalid token
test_canvas.py — unauthenticated access, list courses/assignments/submissions (mocked), invalid Canvas token
test_main.py — root and health endpoints

- Frontend — unit tests present for all shipped components
Auth pages: RegisterForm, LoginForm, ResetPasswordForm and their sub-components
Route guards: ProtectedRoute, GuestRoute
Layouts: Header, Sidebar


## Overview:
The team completed the foundational setup across all layers this cycle. Backend delivered a working FastAPI auth system (register, login, JWT, GET /me) with a full PostgreSQL schema covering users, sessions, courses, assignments, submissions, conversations, workflows, audit logs, and message templates. Frontend delivered the landing page, register/login/reset flows, route guards, and dashboard layout scaffolding. Docker Compose was set up for local Postgres and full-stack testing. The system is running end-to-end locally — users can register, log in, and reach the Canvas info page. Canvas API endpoints are wired and tested with mocks, ready for real token integration next cycle.
