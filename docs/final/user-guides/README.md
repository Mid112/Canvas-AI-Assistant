# User Guides

Parent: **#1315 Documentation & User Guides**

Guides for instructors and administrators. Screenshot placeholders are intentional — add images under [`screenshots/`](./screenshots/) using the listed filenames.

## Guides

| Guide | File | Issue |
|-------|------|-------|
| Instructor user guide | [instructor-guide.md](./instructor-guide.md) | #1327 |
| Administrator user guide | [administrator-guide.md](./administrator-guide.md) | #1328 |
| AI Assistant usage | [ai-assistant-usage.md](./ai-assistant-usage.md) | #1329 |
| Canvas connection | [canvas-connection.md](./canvas-connection.md) | #1330 |
| Assignment workflow | [assignment-workflow.md](./assignment-workflow.md) | #1331 |
| Messaging workflow | [messaging-workflow.md](./messaging-workflow.md) | #1332 |
| Quiz workflow | [quiz-workflow.md](./quiz-workflow.md) | #1333 |
| Feedback workflow | [feedback-workflow.md](./feedback-workflow.md) | #1334 |
| Grade management | [grade-management.md](./grade-management.md) | #1335 |
| Screenshot inventory | [screenshots/README.md](./screenshots/README.md) | #1336, #1337 |
| Accuracy verification checklist | [../review/documentation-review-checklist.md](../review/documentation-review-checklist.md) | #1338 |

## Safety model (all workflows)

1. **Reads** (analytics, missing submissions, course overview) can run immediately.
2. **Writes** to Canvas (create/update assignment or quiz, send message, update grade) require an explicit **preview → confirm** step.
3. High-risk irreversible actions (send message, update grade) may require typing **`CONFIRM`**.
4. The assistant never executes Canvas writes on a normal chat turn.
