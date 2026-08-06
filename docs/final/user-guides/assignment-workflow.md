# Assignment Workflow Guide

Issue: **#1331** · Parent: #1315

## Paths

- Form: `/instructor/assignments/create`
- Course assignments: `/instructor/courses/:localCourseId/assignments`
- Assistant: propose `create_assignment` / `update_assignment`

## Create via form

1. Select / confirm **active course**.
2. **Describe** the assignment (title, description, due date, points, publish state, etc.).
3. Generate or edit the draft.
4. **Review / approve** — verify every field.
5. Submit create (preview → confirm pattern). Nothing is written to Canvas until this step succeeds.

> **Screenshot placeholder:** `assignment-create-describe.png`  
> *[Add screenshot here]*

> **Screenshot placeholder:** `assignment-create-review.png`  
> *[Add screenshot here]*

## Create / update via assistant

1. Describe the assignment in chat.
2. Review the proposal card / dry-run preview.
3. Confirm (or cancel / refine).

Validation surfaces **missing required fields** (ideally all at once) before a valid preview is offered.

## After creation

- Assignment appears in the course list (Canvas is source of truth after sync).
- Creates are typically **undoable** from History when the product exposes undo (deletes exist for undo, not as a general “delete assignment” feature).

## Publish / unpublish & edits

Use course assignment UI or assistant `update_assignment` proposals. Always confirm before Canvas mutation.
