# AI Assistant Usage Guide

Issue: **#1329** · Parent: #1315

## Purpose

Use natural language to analyze courses and **propose** Canvas actions. Writes only run after you confirm.

## Open the assistant

Go to **AI Assistant** (`/instructor/assistant`). Ensure the correct **active course** is selected.

> **Screenshot placeholder:** `assistant-chat.png`  
> *[Add screenshot here]*

## What you can ask

**Examples (reads — may run immediately):**
- “Which students are missing Assignment 3?”
- “Summarize grade distribution for the midterm.”
- “Give me an overview of this course.”

**Examples (writes — preview only until confirm):**
- “Create an assignment titled Lab 4 due next Friday worth 10 points.”
- “Draft a reminder message to students missing the quiz.”
- “Create a 5-question multiple-choice quiz on recursion.”

## Proposal card lifecycle

| Status | Meaning | UI |
|--------|---------|-----|
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

## Dry-run / action preview

Some flows open `/instructor/actions/preview` so you can inspect structured fields before confirm.

## Tips

- Be specific: course is usually implied by active course; still name due dates, points, and audience.
- If the assistant **clarifies**, answer all missing required fields in one reply when possible.
- One confirmed write at a time per user (concurrency guard).
- Out-of-scope requests are refused rather than inventing Canvas admin powers.
