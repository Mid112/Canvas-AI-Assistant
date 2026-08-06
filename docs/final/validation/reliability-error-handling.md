# Reliability & Error Handling Validation

Parent: **#1320** Reliability & Error Handling Validation Service

Use this checklist against a running build. For each item: repro steps → expected behaviour → pass/fail.

| Issue | Check | Expected |
|-------|-------|----------|
| #1367 | Actionable AI clarification | Clarifications tell the user what to provide next |
| #1368 | Canvas API failures | User-visible error; no fake success; optionally failed_operations row |
| #1369 | Incomplete Canvas data | Graceful empty/partial states; no crash |
| #1370 | Canvas error explanations | Messages explain auth/permission/network class of failure |
| #1371 | Retry behaviour | Safe retries where implemented; no duplicate writes without idempotency |
| #1372 | Clarification examples | Clarifications suggest example prompts / field hints |
| #1373 | Duplicate request prevention | Idempotency / single executing write guard blocks double confirm |
| #1374 | Timeout handling | Timeouts surface as failures with recovery guidance |
| #1375 | Invalid AI responses | Invalid structured output → clarify/error; no Canvas write |
| #1376 | Preserve previous input | Drafts/forms keep user text across validation errors |
| #1377 | Recovery suggestions | Errors suggest reconnect, fix fields, or retry confirm |
| #1378 | Missing field detection | Required assignment/quiz/message fields listed before confirm |

## Notes

Record build SHA, date, and tester on completion.
