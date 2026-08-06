# Quiz Workflow Guide

Issue: **#1333** · Parent: #1315

## Paths

- `/instructor/quizzes/create`
- Course quizzes tab
- Assistant: propose `create_quiz`

## Create via form

1. Describe quiz metadata (title, due date, points, settings).
2. Add or generate **questions** (types supported by the form — e.g. multiple choice).
3. Ensure **per-question points** and totals validate.
4. **Review / approve**, then confirm create.

> **Screenshot placeholder:** `quiz-create-review.png`  
> *[Add screenshot here]*

## Via assistant

Ask for a quiz on a topic with constraints (question count, difficulty, due date). Confirm the structured preview before Canvas create.

## Notes

- Creates are generally undoable when History offers undo.
- There is no general-purpose “delete any quiz” instructor action outside undo paths.
- Invalid point totals should block confirm until fixed.
