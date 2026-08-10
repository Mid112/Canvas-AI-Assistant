# Cycle 23 (8/4–8/9)

---

# Weekly Team Log

Cycle 23 was the final delivery cycle. The team focused on closing remaining TE2 / manual-QA tickets, hardening AI chat intent and course-context behaviour, unifying shared UI/safety surfaces (quick actions, due-date resolution, risk/reversibility badges), completing final documentation and design diagrams, reviewing large end-of-project pull requests, and preparing the Final Demo / submission package.

Hours below are taken from each member’s Cycle 23 personal Clockify totals for **04/08/2026 – 09/08/2026** (Jessica’s personal Cycle 23 timesheet was not yet filed at draft time; her hours use the Final Week aggregate already recorded for the Final Design and Analysis Report).

Collectively the team logged approximately **133 hours and 4 minutes**. Development produced a large set of merged polish and regression PRs into `develop`, while several high-impact assistant / token / reversibility PRs remained open for final review and merge ordering at cycle end.

---

## Date Range

- **[04-08] – [09-08]**

---

## Features in the Project Plan Cycle

- Final regression / manual-QA ticket closure
- AI assistant intent routing, clarification, and course-context safety
- Quiz / assignment / messaging polish
- Shared due-date resolver and risk/reversibility badge unification
- Unique Canvas token enforcement
- Final Design & Analysis Report / DFD / use-case / ER documentation
- Final Demo recording and submission package preparation
- Individual team logs & time reporting
- Structured multi-branch PR review before final merge

---

## Project Board Status

Cycle 23 completed the board’s transition into final delivery. Most remaining TE2 and polish tickets moved through review into Done. Leftover open work at cycle end concentrated on a short list of large assistant / messaging / token / reversibility PRs plus the final documentation package.

### Current Project Board Status

| Status | Count / Notes |
| --- | --- |
| Backlog / Ready | Final-delivery leftovers only (docs + open polish PRs) |
| In Progress / In Review | Open PRs: #1555, #1556, #1557, #1558, #1562, #1533 (and related follow-ups) |
| Done | Project burnup shows ~1205 tracked issues with completed work nearly meeting open scope by Aug 8–9 |

Board / burnup snapshots should be attached from GitHub Projects when publishing this log.

<!-- Attach project board screenshot here -->

---

## Completed and Merged Tasks (Cycle 23)

A large batch of final polish, regression, documentation, and demo-readiness work landed on `develop` during this cycle. Highlights:

| PR ID | Description | Status |
| --- | --- | --- |
| #1483 | Ticket 14: Quiz question point validation | Merged |
| #1487 | Ticket 36: Wire forgot-password flow to backend reset APIs | Merged |
| #1521 | Tickets 31 + 32: Sidebar + status fixes | Merged |
| #1523 | Ticket 16: Show all missing required assignment fields at once | Merged |
| #1524 | Ticket 20: Improve AI guardrails for assignment descriptions | Merged |
| #1474 | Show missing assignments and analytics clearly in chat | Merged |
| #1534 | Ticket 17: Improve first-time AI prompt guidance | Merged |
| #1535 | Ticket 27: Harden password requirements and field feedback | Merged |
| #1536 | Ticket 44: Resume quiz draft with generated questions | Merged |
| #1537 | Ticket 43: Preserve assignment draft due date across saves | Merged |
| #1538 | Ticket 45: Stabilize quiz points on regen / show correct answers | Merged |
| #1539 | Ticket 48: Honor explicit and draft target course over active course | Merged |
| #1540 | Ticket 46: Analyse missing submissions and course-context JSON | Merged |
| #1542 | Ticket 47: Course overview submission status vs submissions source of truth | Merged |
| #1543 | Ticket 30: Reduce AI page clutter (manual verification) | Merged |
| #1544 | Ticket 49: Messages tab course label, announcements, compose, sent tab | Merged |
| #1545 | Ticket 51: Preserve full quiz prompt instead of title-only handoff | Merged |
| #1546 | Align backend test passwords with password strength policy | Merged |
| #1548 | Add comments for better readability and reproduction | Merged |
| #1549 | Revise ER diagram in design doc | Merged |
| #1550 | Fix due-date preview normalization and flaky assignment tests | Merged |
| #1551 | Update use case models to match current instructor/admin implementation | Merged |
| #1552 | Update DFD level 1 | Merged |
| #1554 | Revert recent merges for password alignment and comments (stabilization) | Merged |
| #1559 / #1560 / #1561 | Cycle 23 personal logs (Bao, Mridul, Yerdana) | Merged |

Additional effort covered deep multi-pass reviews of #1555–#1558, Final Design and Analysis Report drafting, Final Demo video capture, and merge-order planning so remaining assistant/token work lands without regressing privacy or handoff behaviour.

---

## In Progress Tasks / To Do

| Task | Status |
| --- | --- |
| #1555 Semantic intent routing + unified announcement/private messaging | Open / review complete; merge after dependent fixes |
| #1556 Assistant clarification messaging and workflow handoffs | Open / approved after rebase onto #1555 |
| #1557 Enforce unique Canvas token usage (institution-scoped) | Open / approved after URL + test-token hardening |
| #1558 Reversibility / status badges + related assistant themes | Open / request changes — split/rebase recommended |
| #1562 Bugfix/requirement testing | Open |
| #1533 Final documentation package | Draft / open |
| Cycle 23 personal log (Jessica) + team Clockify screenshots | Pending attachment |

---

## Upcoming Tasks / Next Steps (Post-Cycle / Final Submission)

| Feature / Task | Status |
| --- | --- |
| Merge remaining open polish PRs in agreed order (#1557 → #1556 → #1555 → split #1558) | Active |
| Finalize Final Design and Analysis Report + submission package | Active |
| Publish Final Demo / client presentation artifacts | Active |
| Close remaining documentation checklist items (#1533) | Active |
| Final repository cleanup and release tag | Upcoming |

---

## Burn-up Chart / Velocity

<!-- Attach GitHub Projects burn-up screenshot for Aug 4–9 here -->

### Burn-up Summary

The GitHub Projects burn-up for the final window (May–August, filter `is:issue`, ~1205 items) shows completed work nearly meeting total open scope by **Aug 8–9**. Mid-June scope growth and late-cycle polish are visible as open-scope steps, while the completed line converges on the open line at final delivery — consistent with Cycle 23’s focus on closing leftovers rather than expanding MVP scope.

| Date Range | Trend |
| --- | --- |
| Aug 4–6 | Heavy merge throughput of TE2 / polish tickets into `develop` |
| Aug 7–9 | Documentation, demo capture, and deep review of remaining large PRs |
| Current Focus | Ordered merge of remaining assistant/token/reversibility PRs + final docs |

---

# Clockify Summary

Time was tracked using Clockify for **Cycle 23 (Aug 4, 2026 – Aug 9, 2026).**

### Team Summary

| Team Member | Clockify Username | GitHub | Logged Time |
| --- | --- | --- | ---: |
| Yerdana | yerdana | Yerdana2002 | **35:51:06** |
| Rhythm | trivedirhythm | rhythmt1 | **29:06:02** |
| Jessica | jessica goel | jessica545 | **~29:00:00**† |
| Mridul | mridulnohria21 | Mid112 | **27:21:50** |
| Bao | thanhvoiban | StoneCA12 | **11:44:40** |
| **Total** | | | **~133:03:38** |

† Jessica’s Cycle 23 personal timesheet was not yet posted when this team log was drafted; hours use the Final Week aggregate already recorded for the Final Design and Analysis Report and should be replaced with her Clockify export when available.

The team logged a combined **~133 hours** during Cycle 23. Effort concentrated on final ticket closure (especially Aug 5–6), documentation and demo preparation (Aug 7–9), and multi-branch review of the remaining assistant / Canvas-token / reversibility stack.

### Daily Notes (from personal logs)

| Day | Focus |
| --- | --- |
| Tuesday 4/8 | Team meeting; merge Cycle 22 leftovers; password / AI guidance tickets |
| Wednesday 5/8 | Large PR review batch; ER/diagram/docs readability |
| Thursday 6/8 | Quiz/assignment/messaging ticket merges; password-policy test alignment |
| Friday 7/8 | Team meeting / triage; DFD & use-case docs; presentation-found bugfixes |
| Saturday 8/8 | Chat intent/context fixes; due-date resolver; Final Design Report drafting |
| Sunday 9/8 | Deep review of #1555–#1558; demo recording; unique-token / reversibility hardening |

### Team / Individual Clockify

<!-- Attach Clockify team + individual screenshots from personal Cycle 23 logs here -->

Personal Clockify screenshots are available in:

- Mridul Cycle 23 personal log
- Bao Cycle 23 personal log
- Yerdana Cycle 23 personal log
- Rhythm Cycle 23 personal log

---

# Test Report / Testing Status

Cycle 23 testing emphasized final regression verification, PR-level adversarial review, and demo rehearsal rather than new feature acceptance.

Testing activities included:

- Manual verification of quiz / assignment / messaging / course-context tickets before merge
- Multi-pass code review of #1555–#1558 (intent routing, clarification handoffs, token uniqueness, reversibility/status)
- Re-running affected backend/frontend suites after password-policy and due-date changes
- Identifying shared `"test-token"` collisions under the new uniqueness constraint during review
- Final Demo end-to-end walkthrough of instructor and admin portals
- Documentation consistency checks (use cases, DFD, ER, Final Design report)

These activities confirmed that core workflows remain stable while highlighting merge-order and branch-split risks for the remaining open PRs.

---

### Frontend Testing

Frontend validation focused on:

- Messages / announcements / compose tab placement and course labels
- AI Assistant clutter reduction and first-time prompt guidance
- Quiz draft resume, points regen, and prompt preservation
- Assignment draft due-date persistence and preview normalization
- Quick-action routing consistency between dashboard and assistant
- Risk / reversibility badge presentation on confirm surfaces (in progress on #1558)

---

### Backend / Integration Testing

Backend validation focused on:

- Password strength policy alignment across auth tests
- Forgot-password and session-revoke flows
- Course-context precedence (explicit / draft target over ambient active course)
- Shared due-date resolver across assignment and quiz write paths
- Institution-scoped Canvas token fingerprint uniqueness (#1557)
- Intent / announcement / private-message delivery guards (#1555)

---

## Feature Ownership Overview

| Feature / Area | Primary Contributors This Cycle |
| --- | --- |
| Final TE2 / polish ticket closure | Jessica, Rhythm, Yerdana, Mridul |
| AI chat intent / clarification / course context | Mridul, Yerdana, Jessica |
| Auth / password / session hardening | Rhythm, Jessica |
| Due-date resolver / reversibility badges / quick actions | Yerdana |
| Unique Canvas token enforcement | Mridul (author), Bao/Rhythm/Jessica (review) |
| Design docs (DFD, ER, use cases) + Final Design Report | Mridul, Bao, Rhythm, Jessica |
| Final Demo recording / submission packaging | Rhythm, Jessica |
| Structured multi-branch PR review | Bao, Rhythm, Jessica |

---

## Main Risks / Remaining Gaps

| Risk / Gap | Impact | Next Step |
| --- | --- | --- |
| Large overlapping PRs (#1555/#1556/#1558) | Merge conflicts / privacy or handoff regressions if landed out of order | Follow agreed merge order; split #1558 unique themes |
| Unique-token constraint vs shared test tokens | CI / local suite 409 failures if incomplete | Confirm #1557 test isolation remains green |
| Final documentation package (#1533) still draft | Blocks complete hand-over checklist | Finish and merge docs package |
| Jessica Cycle 23 Clockify not yet attached | Team hours slightly approximate | Update this log when personal timesheet is posted |

---

## Project Status Summary

### Current State

The project is in final delivery. Core Canvas Helper functionality is implemented and largely stabilized. Cycle 23 closed the majority of remaining polish tickets, advanced final documentation and demo artifacts, and subjected the last large feature/safety PRs to detailed review.

Remaining work is hand-over oriented: merge the reviewed leftover PRs carefully, finish the documentation package, and submit the final deliverables.

---
