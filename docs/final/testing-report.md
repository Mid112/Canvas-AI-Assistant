# Testing Report (Final Summary)

**Document:** [Final Testing Report (PDF)](../testing%20report/Final_Testing_Report.pdf)  
**Team:** Team 16 · **Course:** COSC 499 · **Date:** August 2026

## Artifacts already in repo

| Event | Location |
| --- | --- |
| Final Testing Report | [`../testing report/Final_Testing_Report.pdf`](../testing%20report/Final_Testing_Report.pdf) |
| Testing Event 1 findings | [`../testing event outcomes/Testing_Event_1_Detailed_Findings_Report-2.pdf`](../testing%20event%20outcomes/Testing_Event_1_Detailed_Findings_Report-2.pdf) |
| TE1 UX notes | [`../testing event outcomes/UX report.docx`](../testing%20event%20outcomes/UX%20report.docx) |
| Testing Event 2 spreadsheet/report | [`../testing report/TE2-Testing report - Sheet1-3.pdf`](../testing%20report/TE2-Testing%20report%20-%20Sheet1-3.pdf) |

## Automated testing results (final)

Source: last clean GitHub Actions CI on `develop` (6 August 2026) for Pytest / Vitest / Playwright; local `make test-fuzz` on 8 August 2026 for Hypothesis.

| Test Suite | Tests Run | Passed | Failed | Coverage |
| --- | ---: | ---: | ---: | ---: |
| Backend – Pytest | 1,298 | 1,297 | 0 | 78.58% |
| Frontend – Vitest | 1,075 | 1,075 | 0 | 86.06% |
| End-to-End – Playwright | 16 | 16 | 0 | N/A |
| Fuzz – Hypothesis | 9 | 9 | 0 | N/A |

Notes: backend reported 1,297 passed + 1 skipped (9 fuzz tests deselected from the default suite). Frontend coverage is Vitest/v8 line coverage; backend coverage is pytest-cov total line coverage (minimum gate 68%).

## How to re-run

```bash
make test        # backend pytest (excl. fuzz) + frontend vitest coverage
make test-fuzz   # Hypothesis fuzz (opt-in)
make test-e2e    # Playwright
```

## Narrative summary

**TE1 themes:**
Usability feedback emphasized clearer confirmation messaging, risk-level distinction, editable structured drafts, stable active-course context, and clearer AI error messaging. Those findings drove follow-up implementation work before TE2.

**TE2 themes:**
TE2 recorded all user requirements (UR1.1–UR1.7, UR2.1–UR2.29), functional requirement groups (FR1–FR12), and scope/safety constraints as PASS. Automated suites on the final green CI run were also clean across Pytest, Vitest, and Playwright.

**Outstanding risks:**
- Production must be configured with unique `CANVAS_TOKEN_ENCRYPTION_KEY`, `SECRET_KEY`, and (if enabled) `MCP_SHARED_SECRET`.
- Intentional scope limits remain: no autonomous Canvas writes, no arbitrary Canvas API execution, no institution-wide Canvas administration.
- LLM/provider behaviour outside the sandboxed test environment can still vary by rate limits and model quality.

**Known bugs at final submission:** No known blocking or requirement-level defects were identified at the time of final validation.
