# User Guides

Guides for instructors and administrators. Screenshot placeholders are intentional — add images under [`screenshots/`](./screenshots/) using the listed filenames.

## Guides

| Guide | File |
| --- | --- |
| Instructor user guide | [instructor-guide.md](./instructor-guide.md) |
| Administrator user guide | [administrator-guide.md](./administrator-guide.md) |
| AI Assistant usage | [ai-assistant-usage.md](./ai-assistant-usage.md) |
| Canvas connection | [canvas-connection.md](./canvas-connection.md) |
| Assignment workflow | [assignment-workflow.md](./assignment-workflow.md) |
| Messaging workflow | [messaging-workflow.md](./messaging-workflow.md) |
| Quiz workflow | [quiz-workflow.md](./quiz-workflow.md) |
| Feedback workflow | [feedback-workflow.md](./feedback-workflow.md) |
| Grade management | [grade-management.md](./grade-management.md) |
| Screenshot inventory | [screenshots/README.md](./screenshots/README.md) |
| Accuracy verification checklist | [../review/documentation-review-checklist.md](../review/documentation-review-checklist.md) |

## Safety model (all workflows)

1. **Reads** (analytics, missing submissions, course overview) can run immediately.
2. **Writes** to Canvas (create/update assignment or quiz, send message, update grade) require an explicit **preview → confirm** step.
3. High-risk irreversible actions (send message, update grade) may require typing **`CONFIRM`**.
4. The assistant never executes Canvas writes on a normal chat turn.
