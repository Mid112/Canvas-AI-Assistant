# Grade Management Guide

## Paths

- Course grades: `/instructor/courses/:localCourseId/grades`
- Preview / submit APIs under `/api/v1/canvas/...` grades endpoints
- Assistant: propose `update_grade` (routes into approval UI)

## Flow

1. Select assignment / student row.
2. Enter or AI-suggest a grade change.
3. **Preview** the mutation (old → new, student, assignment).
4. Confirm submit. Grades are **high-risk / irreversible** in product terms (strong `CONFIRM` when required). Auto-undo is not offered.

> **Screenshot placeholder:** `grades-preview.png`
> *[Add screenshot here]*

## Safety

- No grade writes on a normal chat turn.
- Backend validates ownership / course scope before Canvas calls.
- Assistant replies may show **unverified grade/score warnings** (Feature 13) when a claim is not grounded in tool data — review those before confirming.
- Failures should leave Canvas unchanged; check Failed Operations (admin) or retry via UI after fixing the cause.

## History

Grade-related history may appear in workflow history / grade history tables for auditability.
