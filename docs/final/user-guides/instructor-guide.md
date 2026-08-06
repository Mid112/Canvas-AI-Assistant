# Instructor User Guide

Issue: **#1327** · Parent: #1315

## 1. Overview

The Canvas Helper AI Assistant helps instructors manage selected Canvas LMS workflows with AI assistance while keeping **human approval** before any Canvas write.

**Roles:** Instructor accounts register/login separately from administrators.

## 2. Getting started

1. Open the app (local: `http://localhost:5173` with `make e2e-up`, or production URL via nginx on port `8888`).
2. Register or log in as an instructor.
3. Complete Canvas onboarding (`/canvas-info` → `/connect-canvas` → `/review-permissions`).
4. Open **Courses** and set an **active course** (or use the assistant course selector).

> **Screenshot placeholder:** `instructor-dashboard.png`  
> *[Add screenshot here]*

> **Screenshot placeholder:** `instructor-sidebar-active-course.png`  
> *[Add screenshot here]*

See also: [Canvas Connection Guide](./canvas-connection.md).

## 3. Navigation

| Area | Path | Purpose |
|------|------|---------|
| Dashboard | `/instructor/dashboard` | Course overview metrics |
| Courses | `/instructor/courses` | Course list / active course |
| Course detail | `/instructor/courses/:id/...` | Assignments, quizzes, students, grades, messages, analytics |
| AI Assistant | `/instructor/assistant` | Conversational workflows |
| Messages | `/instructor/messages` | Inbox / compose |
| History | `/instructor/history` | Workflow history, undo where supported |
| Settings | `/instructor/settings` | Canvas connection, AI providers |
| Profile | `/instructor/profile` | Account |

> **Screenshot placeholder:** `instructor-courses.png`  
> *[Add screenshot here]*

## 4. Active course

Most generation and chat flows are scoped to the **active course**. Changing it updates the sidebar badge and assistant context immediately. The preference is stored locally via the API (`/canvas/active-course`) and is **not** a Canvas write.

## 5. Core workflows (quick links)

- [AI Assistant usage](./ai-assistant-usage.md)
- [Assignments](./assignment-workflow.md)
- [Quizzes](./quiz-workflow.md)
- [Feedback](./feedback-workflow.md)
- [Messaging](./messaging-workflow.md)
- [Grades](./grade-management.md)

## 6. Confirm-before-write pattern

1. Ask the assistant **or** use a create form.
2. Review the **preview** (fields, audience, risk).
3. **Confirm** to execute, or **Cancel** / edit in chat.
4. For high-risk actions, type **`CONFIRM`** when prompted.
5. Check **History** for outcomes; use undo when the product offers it (creates are typically undoable; sends/grades are not).

## 7. Settings

- **Canvas Connection:** update/validate token, see connection health.
- **AI Models:** connect instructor LLM providers (keys encrypted at rest). Institution defaults may apply when no personal key is set.

## 8. Troubleshooting (instructor)

| Symptom | What to try |
|---------|-------------|
| Limited / no Canvas data | Re-check token & permissions; ask admin if revoked |
| Assistant asks clarifying questions | Answer missing fields (due date, points, etc.) |
| Action stuck “running” | Wait or refresh; check History; contact admin if failed ops appear |
| Wrong course context | Switch active course in sidebar / courses page |

> **Screenshot placeholder:** `workflow-history.png`  
> *[Add screenshot here]*
