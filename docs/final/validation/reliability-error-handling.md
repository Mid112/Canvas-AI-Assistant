# Reliability & Error Handling Validation

Use this checklist against a running build. For each item: repro steps → expected behaviour → pass/fail.

| Check | Expected |
| --- | --- |
| Actionable AI clarification | Clarifications tell the user what to provide next |
| Canvas API failures | User-visible error; no fake success; optionally failed_operations row |
| Incomplete Canvas data | Graceful empty/partial states; no crash |
| Canvas error explanations | Messages explain auth/permission/network class of failure |
| Retry behaviour | Safe retries where implemented; no duplicate writes without idempotency |
| Clarification examples | Clarifications suggest example prompts / field hints |
| Duplicate request prevention | Idempotency / single executing write guard blocks double confirm |
| Timeout handling | Timeouts surface as failures with recovery guidance |
| Invalid AI responses | Invalid structured output → clarify/error; no Canvas write |
| Preserve previous input | Drafts/forms keep user text across validation errors |
| Recovery suggestions | Errors suggest reconnect, fix fields, or retry confirm |
| Missing field detection | Required assignment/quiz/message fields listed before confirm |

## Notes

Record build SHA, date, and tester on completion.
