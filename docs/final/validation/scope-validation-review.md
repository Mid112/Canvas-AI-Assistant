# Scope Validation Review

Reviewer sign-off over restricted workflows.

| Review item | Pass criteria |
| --- | --- |
| All restricted workflows | Assignment, quiz, message, grade, feedback paths reviewed for confirm gates |
| Approval required before execution | No hidden auto-confirm; dry-run/preview shown for writes |
| Protected Canvas operations | High-risk (`send_message`, `update_grade`) use strong confirmation |

## Reviewer checklist

- [ ] Walk each write action once (confirm + cancel paths)
- [ ] Confirm paused workflows cannot cancel incorrectly (per server rules)
- [ ] Confirm admin failed-ops cannot silently retry Canvas writes
- [ ] Confirm MCP disabled-by-default in examples
- [ ] File findings and link SHA

**Reviewer:** _____________ **Date:** _____________ **Build:** _____________
