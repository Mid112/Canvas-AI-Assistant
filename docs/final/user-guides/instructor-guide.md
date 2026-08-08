# Instructor User Guide

## 1. Overview

The Canvas Helper AI Assistant helps instructors manage selected Canvas LMS workflows with AI assistance while keeping **human approval** before any Canvas write.

**Roles:** Instructor accounts register/login separately from administrators.

## 2. Getting started

1. Open the app (local: `http://localhost:5173` with `make e2e-up`, or production URL via nginx on port `8888`).
2. Register or log in as an instructor.
 - Passwords must be at least **8 characters** and include uppercase, lowercase, a number, and a symbol. The UI shows live requirement feedback.
 - Password reset is available from the login / forgot-password flow.
3. Complete Canvas onboarding (`/canvas-info` → `/connect-canvas` → `/review-permissions`).
4. Open **Courses** and set an **active course** (or use the assistant course selector).

> **Screenshot placeholder:** `instructor-dashboard.png`
> *[Add screenshot here]*

> **Screenshot placeholder:** `instructor-sidebar-active-course.png`
> *[Add screenshot here]*

See also: [Canvas Connection Guide](./canvas-connection.md).

## 3. Navigation

| Area | Path | Purpose |
| --- | --- | --- |
| Dashboard | `/instructor/dashboard` | Course overview metrics |
| Courses | `/instructor/courses` | Course list / active course |
| Course detail | `/instructor/courses/:id/...` | Assignments, quizzes, students, grades, messages, analytics |
| AI Assistant | `/instructor/assistant` | Conversational workflows |
| Messages | `/instructor/messages` | Inbox, announcements, sent, compose |
| History | `/instructor/history` | Workflow history, undo where supported |
| Settings | `/instructor/settings` | Canvas connection, AI providers, security |
| Profile | `/instructor/profile` | Account |

> **Screenshot placeholder:** `instructor-courses.png`
> *[Add screenshot here]*

## 4. Active course vs draft / chat course

The **active course** preference (sidebar / `/canvas/active-course`) is the default for many UIs and is **not** a Canvas write.

It is **not** always the write target:

- Assistant turns prefer an explicit course in the message, conversation/`course_context`, or draft handoff over ambient active course.
- Assignment / quiz / message **typed drafts** resume against the course saved on the draft when present.
- Messages **compose** from an AI handoff uses the draft’s course even if you switched the sidebar afterward.

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
- **Security:** change password (other sessions may be revoked); manage active sessions.

## 8. Troubleshooting (instructor)

| Symptom | What to try |
| --- | --- |
| Limited / no Canvas data | Re-check token & permissions; resume deferred assistant requests after reconnect |
| Assistant asks clarifying questions | Answer missing fields (due date, graded vs ungraded, etc.) |
| Action stuck “running” | Wait or refresh; check History; contact admin if failed ops appear |
| Wrong course context | Name the course in chat, use the assistant course selector, or resume the draft’s own course — not only the sidebar active course |

> **Screenshot placeholder:** `workflow-history.png`
> *[Add screenshot here]*
