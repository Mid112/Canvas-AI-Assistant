# Requirements Traceability Matrix

Fill **Status** / **Evidence** before final submission. Requirement IDs follow the project’s FR/NFR labelling where known; adjust to match the official requirements list.

| Req ID | Description | Implementation evidence | Test / validation evidence | Status |
| --- | --- | --- | --- | --- |
| FR-Auth | Instructor & admin authentication | `routers/auth.py`, JWT, sessions | auth tests / manual login | |
| FR-Canvas-Connect | Encrypted Canvas token connect | `canvas_connections`, auth canvas-token | connect guide + TE | |
| FR-Active-Course | Active course preference | `/canvas/active-course`, sidebar badge | UI test / manual | |
| FR-Assistant | NL assistant with previews | `routers/chat.py`, workflows | TE + e2e | |
| FR-Confirm | Human confirm before Canvas write | confirm/cancel, risk levels | scope validation | |
| FR-Assignment | Create/update assignments | canvas + assignment services | TE regression evidence | |
| FR-Quiz | Create quizzes | quiz draft/validation | quiz validation | |
| FR-Feedback | Feedback workflow | feedback create flow | manual / tests | |
| FR-Message | Messaging + templates | messages, message_templates | TE | |
| FR-Grades | Grade preview/submit | grades services | strong CONFIRM checks | |
| FR-History | Workflow history / undo | history router | manual | |
| FR-Admin | Instructor mgmt, audit, health | admin routers/pages | manual | |
| FR-Troubleshoot | Troubleshooting / failed ops | troubleshoot, failed_operations | manual | |
| FR-LLM | Multi-provider LLM | llm services, design doc | provider tests | |
| NFR-Security | Token encryption, no LLM secrets | Fernet, key rejection | review | |
| NFR-Deploy | Docker Compose deploy | compose, Makefile | checklists | |
| NFR-Scope | No autonomous / arbitrary Canvas | WRITE_ACTIONS allowlist | scope validation | |

## How to complete

1. Align IDs with the official requirements document / charter.
2. Link test file paths in **Evidence**.
3. Mark Status `Done` only when both implementation and validation exist.
