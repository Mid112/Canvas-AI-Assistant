# Messaging Workflow Guide

## Paths

- `/instructor/messages`
- Course messages under `/instructor/courses/:localCourseId/messages`
- Assistant: propose `send_message`
- Templates: message templates UI / `/api/v1/message-templates`

## Messages page tabs

The Messages page uses four tabs:

| Tab | Purpose |
| --- | --- |
| **Inbox & replies** | Canvas conversations / student replies (all courses or filtered) |
| **Announcements** | Course announcements for the **active** course |
| **Sent** | Sent messages for the active course |
| **Compose** | Draft and send a course message (opened from FAB, AI handoff, or `?tab=compose`) |

> **Screenshot placeholder:** `messages-tabs.png`
> *[Add screenshot here]*

## Compose & send

1. Open **Compose** (or land there from an AI draft handoff / typed draft resume).
2. **Course targeting:** if the draft was started from the assistant or a saved draft that carries its own course, compose targets **that course** — not whatever happens to be active in the sidebar. Fresh compose (no draft course) uses the active course.
3. Choose audience (entire class, missing submissions subset, etc. as offered).
4. Draft body (manual or AI-assisted).
5. Preview recipients and content.
6. **Confirm send** — messaging is **irreversible** (strong confirmation / type `CONFIRM` when required).

> **Screenshot placeholder:** `messages-compose.png`
> *[Add screenshot here]*

> **Screenshot placeholder:** `messages-templates.png`
> *[Add screenshot here]*

## Templates

Save and reuse institution/instructor templates for common reminders. Templates do not send until you compose + confirm.

## Inbox / replies

Inbox works without requiring an active course. Where inbox reply drafting is available, treat AI drafts like any other message: review, then send with confirmation.

## Safety

- No autonomous sends from a normal assistant turn.
- Cancel a pending proposal if the audience or wording is wrong.
- After send, use audit/history for accountability — there is no Canvas “unsend” via this app.
