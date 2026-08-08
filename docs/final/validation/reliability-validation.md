# Reliability Validation

| Check | Expected |
| --- | --- |
| Complete workflow reliability | Preview → confirm → Canvas reflects change; history shows terminal state |
| Error recovery | After failure, user can fix and retry without corrupt workflow state |
| Rollback behaviour | Undo available for undoable creates; irreversible actions do not claim undo |
| Deployment reliability | See [../deployment/validation-checklist.md](../deployment/validation-checklist.md) |

## End-to-end smoke script

1. Connect Canvas; set active course.
2. Ask a read-only analytics question — answer appears.
3. Propose create assignment — cancel — Canvas unchanged.
4. Propose create assignment — confirm — appears in Canvas/course list.
5. Undo if offered — assignment removed/restored per product rules.
6. Propose send message — require `CONFIRM` — cancel — nothing sent.
7. Force Canvas outage (bad token) — confirm fails clearly; reconnect recovers.
