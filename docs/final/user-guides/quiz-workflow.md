# Quiz Workflow Guide

## Paths

- `/instructor/quizzes/create`
- Course quizzes tab
- Assistant: propose `create_quiz` (form handoff may carry the full prompt, not only a title)

## Create via form

1. **Describe** quiz metadata (title, due date, points or ungraded where supported, settings) and the generation prompt.
2. Generate questions (or enter them). Supported types include multiple choice and other form-backed types.
3. Ensure **per-question points** and totals validate. Regenerating after edits **preserves per-question points** where possible instead of resetting them.
4. **Review / approve**, then confirm create.

### Typed drafts & resume

- You can save a describe-step prompt or a generated quiz as a **typed draft**.
- Resuming a draft that already has generated questions returns you to **review** with structured questions intact — you do not lose the question set and retype from a blank describe step.
- A draft’s saved course is preferred over the current active course when resuming.

> **Screenshot placeholder:** `quiz-create-review.png`
> *[Add screenshot here]*

## Via assistant

Ask for a quiz on a topic with constraints (question count, difficulty, due date). The handoff should carry the **full prompt** into the quiz creator when offered. Confirm the structured preview before Canvas create.

## Notes

- Creates are generally undoable when History offers undo.
- There is no general-purpose “delete any quiz” instructor action outside undo paths.
- Invalid point totals should block confirm until fixed.
- Quiz Canvas writes stay on the direct create path even when MCP is enabled (multi-step quiz shell + questions).
