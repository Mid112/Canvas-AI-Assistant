# Scope Validation Review

Parent: **#1323**

Reviewer sign-off over restricted workflows.

| Issue | Review item | Pass criteria |
|-------|-------------|---------------|
| #1388 | All restricted workflows | Assignment, quiz, message, grade, feedback paths reviewed for confirm gates |
| #1389 | Approval required before execution | No hidden auto-confirm; dry-run/preview shown for writes |
| #1390 | Protected Canvas operations | High-risk (`send_message`, `update_grade`) use strong confirmation |

## Reviewer checklist

- [ ] Walk each write action once (confirm + cancel paths)
- [ ] Confirm paused workflows cannot cancel incorrectly (per server rules)
- [ ] Confirm admin failed-ops cannot silently retry Canvas writes
- [ ] Confirm MCP disabled-by-default in examples
- [ ] File findings as issues; link SHA

**Reviewer:** _____________ **Date:** _____________ **Build:** _____________
