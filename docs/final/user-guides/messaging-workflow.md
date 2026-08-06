# Messaging Workflow Guide

Issue: **#1332** · Parent: #1315

## Paths

- `/instructor/messages`
- Course messages under `/instructor/courses/:localCourseId/messages`
- Assistant: propose `send_message`
- Templates: message templates UI / `/api/v1/message-templates`

## Compose & send

1. Ensure **active course** is set (compose is course-scoped).
2. Choose audience (entire class, missing submissions subset, etc. as offered).
3. Draft body (manual or AI-assisted).
4. Preview recipients and content.
5. **Confirm send** — messaging is **irreversible** (strong confirmation / type `CONFIRM` when required).

> **Screenshot placeholder:** `messages-compose.png`  
> *[Add screenshot here]*

> **Screenshot placeholder:** `messages-templates.png`  
> *[Add screenshot here]*

## Templates

Save and reuse institution/instructor templates for common reminders. Templates do not send until you compose + confirm.

## Inbox / replies

Where inbox reply drafting is available, treat AI drafts like any other message: review, then send with confirmation.

## Safety

- No autonomous sends from a normal assistant turn.
- Cancel a pending proposal if the audience or wording is wrong.
- After send, use audit/history for accountability — there is no Canvas “unsend” via this app.
