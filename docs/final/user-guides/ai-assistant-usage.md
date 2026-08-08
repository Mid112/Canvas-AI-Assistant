# AI Assistant Usage Guide

## Purpose

Use natural language to analyze courses and **propose** Canvas actions. Writes only run after you confirm.

## Open the assistant

Go to **AI Assistant** (`/instructor/assistant`). Use the course selector when you want a specific course context. First-time empty chats show **starter prompts**; they hide after the first message and return on **New Chat**.

**Conversation history** is collapsed by default so the chat stays primary — expand **Conversation History** to load a prior thread.

> **Screenshot placeholder:** `assistant-chat.png`
> *[Add screenshot here]*

> **Screenshot placeholder:** `assistant-history-collapsed.png`
> *[Add screenshot here]*

## Course context (important)

The assistant does **not** silently attach the sidebar active course as `local_course_id` on every turn. Course comes from, in priority order roughly:

1. What you name in the utterance (or a draft / handoff that already carries a course)
2. Conversation / field-memory course context (including indexed `course_context` from the selector)
3. Active course only when it is the intentional fallback (for example a fresh compose with no draft course)

If results look wrong, name the course explicitly or change the assistant course selector — switching only the sidebar active course is not always enough.

## Limited mode (no Canvas token)

Without usable Canvas credentials the assistant runs in **limited mode**:

- A banner explains the restriction and links to Connect Canvas.
- Canvas-dependent asks can be **saved as deferred requests** and **resumed** after you reconnect (queued resumes run one at a time until send succeeds).

> **Screenshot placeholder:** `assistant-limited-mode.png`
> *[Add screenshot here]*

## What you can ask

**Examples (reads — may run immediately):**
- “Which students are missing Assignment 3?”
- “Summarize grade distribution for the midterm.”
- “Give me an overview of this course.”

**Examples (writes — preview only until confirm):**
- “Create an assignment titled Lab 4 due next Friday worth 10 points.”
- “Create an ungraded reading check-in due Friday.”
- “Draft a reminder message to students missing the quiz.”
- “Create a 5-question multiple-choice quiz on recursion.”

## Proposal card lifecycle

| Status | Meaning | UI |
| --- | --- | --- |
| Pending | Waiting for you | Confirm / Cancel (and pause/rename when offered) |
| Paused | Parked for later | Resume to continue |
| Executing | Running against Canvas | In-progress indicator |
| Confirmed / executed | Succeeded | Resolved / muted treatment |
| Failed | Nothing changed (or partial per message) | Error / alert treatment |
| Cancelled / superseded | Discarded or replaced | Muted |

> **Screenshot placeholder:** `assistant-confirm-cancel.png`
> *[Add screenshot here]*

> **Screenshot placeholder:** `assistant-executing.png`
> *[Add screenshot here]*

## Confirm, cancel, pause

- **Confirm** — executes the stored pending action (server-side gate by workflow / message id).
- **Cancel** — discards the proposal (cancel while paused may be rejected by the server until resume).
- **Pause / Resume / Rename** — organize long-running reviews without executing.
- **Modify** — return to chat to refine the request when offered.

High-risk actions may require typing **`CONFIRM`**.

## Grounding & trust

Replies are grounded on tool results for this conversation. Ungrounded Canvas **IDs** are scrubbed; grade/score claims that cannot be verified may surface as **warnings** rather than being silently rewritten. Review warnings before confirming writes.

## Dry-run / action preview

Some flows open `/instructor/actions/preview` so you can inspect structured fields before confirm.

## Tips

- Be specific: name the course when needed; always name due dates, points (or ungraded), and audience.
- If the assistant **clarifies**, answer all missing required fields in one reply when possible (including graded vs ungraded).
- One confirmed write at a time per user (concurrency guard).
- Out-of-scope requests are refused rather than inventing Canvas admin powers.
