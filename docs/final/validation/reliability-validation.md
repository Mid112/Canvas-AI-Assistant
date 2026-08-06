# Reliability Validation

Parent: **#1321**

| Issue | Check | Expected |
|-------|-------|----------|
| #1379 | Complete workflow reliability | Preview → confirm → Canvas reflects change; history shows terminal state |
| #1380 | Error recovery | After failure, user can fix and retry without corrupt workflow state |
| #1381 | Rollback behaviour | Undo available for undoable creates; irreversible actions do not claim undo |
| #1382 | Deployment reliability | See [../deployment/validation-checklist.md](../deployment/validation-checklist.md) |

## End-to-end smoke script

1. Connect Canvas; set active course.
2. Ask a read-only analytics question — answer appears.
3. Propose create assignment — cancel — Canvas unchanged.
4. Propose create assignment — confirm — appears in Canvas/course list.
5. Undo if offered — assignment removed/restored per product rules.
6. Propose send message — require `CONFIRM` — cancel — nothing sent.
7. Force Canvas outage (bad token) — confirm fails clearly; reconnect recovers.
