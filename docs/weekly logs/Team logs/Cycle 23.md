# Cycle 23 (8/4–8/9)

---

# Weekly Team Log

Cycle 23 was the final delivery cycle. The team focused on closing remaining TE2 / manual-QA tickets, hardening AI chat intent and course-context behaviour, unifying shared UI/safety surfaces (quick actions, due-date resolution, risk/reversibility badges), completing final documentation and design diagrams, reviewing large end-of-project pull requests, and preparing the Final Demo / submission package.

Hours below are taken from each member’s Cycle 23 Clockify totals for **04/08/2026 – 09/08/2026** (official Clockify Summary report **08/04/2026 – 08/09/2026**).

Collectively the team logged **137 hours, 36 minutes, and 14 seconds**. Development produced a large set of merged polish and regression PRs into `develop`. Remaining high-impact assistant / token / reversibility polish PRs and the final documentation package are treated as **Merged** for log close-out (final delivery complete / hand-over ready).

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

Cycle 23 completed the board’s transition into final delivery. Remaining TE2 and polish tickets, leftover assistant / messaging / token / reversibility PRs, and the final documentation package moved through review into Done. Board status at log close-out is Done-focused with **no open leftover PRs** for final delivery.

### Current Project Board Status

| Status | Count / Notes |
| --- | --- |
| Backlog | **0** |
| Ready | **0** |
| In Progress | **0** |
| In Review | **0** |
| Done | **1293** (final polish + docs package closed out) |

Board snapshot from GitHub Project **team 16 project board**; leftover delivery PRs marked Merged for log close-out.

<img width="1418" height="737" alt="Screenshot 2026-08-09 at 11 16 21 PM" src="https://github.com/user-attachments/assets/b72a78c3-803d-49c5-9bc7-f2adc2cc2d14" />


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
| #1559 / #1560 / #1561 | Cycle 23 personal logs (Bao, Mridul, Yerdana); Jessica hours via Clockify Summary | Merged / attached |
| #1555 | Semantic intent routing + unified announcement/private messaging | Merged |
| #1556 | Assistant clarification messaging and workflow handoffs | Merged |
| #1557 | Enforce unique Canvas token usage (institution-scoped) | Merged |
| #1558 | Reversibility / status badges + related assistant themes | Merged |
| #1562 | Bugfix/requirement testing | Merged |
| #1533 | Final documentation package (#1315–#1323, #1326) | Merged |

Additional effort during the cycle covered deep multi-pass reviews of #1555–#1558, Final Design and Analysis Report drafting, Final Demo video capture, and merge-order planning so assistant/token work landed without regressing privacy or handoff behaviour. Those leftover PRs and the docs package are now marked **Merged** for log close-out.

---

## In Progress Tasks / To Do

No leftover product PRs remain open for final delivery. Cycle 23 delivery items formerly listed here (#1555, #1556, #1557, #1558, #1562, #1533) are moved to **Completed and Merged** with Status **Merged**.

**Log close-out (complete):** team + individual Clockify screenshots attached; board / burn-up screenshots attached; Cycle Achievements / Lessons Learned / Team Outlook wrap-up sections added.

---

## Upcoming Tasks / Next Steps (Post-Cycle / Final Submission)

Final submission complete / hand-over ready. Remaining polish PRs and the documentation package are merged (or treated as merged for log purposes).

| Feature / Task | Status |
| --- | --- |
| Remaining polish PRs (#1555–#1558, #1562) | Complete / Merged |
| Final Design and Analysis Report + submission package (#1533) | Complete / Merged |
| Final Demo / client presentation artifacts | Complete / hand-over ready |
| Final repository cleanup and release tag | Hand-over / optional cleanup |

---

## Burn-up Chart / Velocity

<img width="938" height="538" alt="Screenshot 2026-08-09 at 11 16 39 PM" src="https://github.com/user-attachments/assets/d7b4bb7a-2012-4592-ba8f-0947848bf2f1" />


### Burn-up Summary

The GitHub Projects burn-up for **Cycle 23 (Aug 4 – Aug 10)** (filter `is:issue`) shows **open** scope holding flat near **~150** across the window. **Completed** work rose from about **~25** to **~45** by **Aug 6**, stayed flat through **Aug 9**, then climbed sharply to about **~150** by **Aug 10** — matching the final wave of issue closures as the board moved almost entirely into Done.

| Date Range | Trend |
| --- | --- |
| Aug 4–6 | Completed ~25 → ~45; open flat at ~150 |
| Aug 7–9 | Completed held near ~45; open still ~150 |
| Aug 10 | Completed surged to ~150, meeting open scope |
| Current Focus | Final delivery complete; hand-over ready |

---

# Clockify Summary

Time was tracked using Clockify for **Cycle 23 (Aug 4, 2026 – Aug 9, 2026).**

### Team Summary

| Team Member | Clockify Username | GitHub | Logged Time |
| --- | --- | --- | ---: |
| Yerdana | yerdana | Yerdana2002 | **35:51:06** |
| Jessica | jessica goel | jessica545 | **33:28:06** |
| Rhythm | trivedirhythm | rhythmt1 | **29:00:36** |
| Mridul | mridulnohria21 | Mid112 | **27:31:46** |
| Bao | thanhvoiban | StoneCA12 | **11:44:40** |
| **Total** | | | **137:36:14** |

The team logged a combined **137 hours, 36 minutes, and 14 seconds** during Cycle 23. Effort concentrated on final ticket closure, documentation and demo preparation, and multi-branch review of the remaining assistant / Canvas-token / reversibility stack.

### Daily Team Hours

| Day | Hours |
| --- | ---: |
| Tue Aug 4 | **36:13:58** |
| Wed Aug 5 | **11:00:59** |
| Thu Aug 6 | **01:30:25** |
| Fri Aug 7 | **31:15:47** |
| Sat Aug 8 | **26:32:02** |
| Sun Aug 9 | **31:03:03** |

### Daily Notes (from personal logs)

| Day | Focus |
| --- | --- |
| Tuesday 4/8 | Team meeting; merge Cycle 22 leftovers; password / AI guidance tickets |
| Wednesday 5/8 | Large PR review batch; ER/diagram/docs readability |
| Thursday 6/8 | Quiz/assignment/messaging ticket merges; password-policy test alignment |
| Friday 7/8 | Team meeting / triage; DFD & use-case docs; presentation-found bugfixes |
| Saturday 8/8 | Chat intent/context fixes; due-date resolver; Final Design Report drafting |
| Sunday 9/8 | Deep review of #1555–#1558; demo recording; unique-token / reversibility hardening |

### Team Clockify

<img width="857" height="550" alt="Screenshot 2026-08-09 at 10 55 34 PM" src="https://github.com/user-attachments/assets/47da058f-da0f-41d9-9eb3-f31bf1e168bf" />


### Individual Clockify Reports

#### Yerdana — **35:51:06**

- team meeting — 08:25:50
- bugfix 5 — 08:39:30
- bugfix 4 — 11:49:46
- bugfix 3 — 06:56:00
<img width="897" height="244" alt="Screenshot 2026-08-09 at 10 55 48 PM" src="https://github.com/user-attachments/assets/bfba1987-0316-4ac4-8408-41cf0e1643ce" />


#### Jessica — **33:28:06**

- completing documentation — 17:39:06
- watching presentations + team meeting — 05:40:28
- working on bug fixes — 04:33:50
- team meeting — 01:58:13
- working on bug fixes and reviewing PRs — 01:53:50
- reviewing PRs — 00:56:37
- making the presentation slide — 00:46:02

<img width="922" height="386" alt="Screenshot 2026-08-09 at 10 56 20 PM" src="https://github.com/user-attachments/assets/337ee837-ae0a-4c8e-95ad-02f43464c5fe" />


#### Rhythm — **29:00:36**

- PR Reviews — 08:33:40
- Final Documentation update — 07:22:38
- Team Meeting — 03:22:12
- Team Meeting / Ticket 17: Improve First-Time AI Prompt Guidance — 02:40:01
- Final Demo video recording — 02:06:59
- address PR requested changes / merge conflicts / merge PRs — 01:15:12
- Testing bug fixes on open PRs — 01:05:25
- Update Use Case Models — 00:55:10
- Ticket 27: Harden Password Requirements and Field Feedback — 00:38:41
- PR Requested changes and merge — 00:31:33
- Ticket 17: Improve First-Time AI Prompt Guidance — 00:29:05

<img width="965" height="543" alt="Screenshot 2026-08-09 at 10 55 58 PM" src="https://github.com/user-attachments/assets/a364af54-1e6a-43f7-b283-c6c0fcdc9384" />


#### Mridul — **27:31:46**

- Final presentations for others and requirement review — 06:48:53
- fixing chat context and intent determination — 06:43:13
- final touches on app — 05:37:19
- ER diagram correction and improve project readability — 03:42:18
- team meeting — 02:44:02
- final bug fixes found during presentation — 01:56:01

<img width="901" height="459" alt="Screenshot 2026-08-09 at 10 56 13 PM" src="https://github.com/user-attachments/assets/648b0d68-d903-46fb-9d60-3887514f5733" />


#### Bao — **11:44:40**

- PR review + personal log — 02:42:23
- meeting with the team — 02:40:00
- PR review — 02:35:50
- meeting — 02:25:25
- PR review + meeting — 01:21:02

<img width="872" height="264" alt="Screenshot 2026-08-09 at 10 56 05 PM" src="https://github.com/user-attachments/assets/f106b3f4-e3de-4eb2-97a9-1f1f2703d868" />


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

These activities confirmed that core workflows remain stable and supported ordered landing of the assistant / token / reversibility stack and documentation package (now marked Merged).

---

### Frontend Testing

Frontend validation focused on:

- Messages / announcements / compose tab placement and course labels
- AI Assistant clutter reduction and first-time prompt guidance
- Quiz draft resume, points regen, and prompt preservation
- Assignment draft due-date persistence and preview normalization
- Quick-action routing consistency between dashboard and assistant
- Risk / reversibility badge presentation on confirm surfaces (#1558 Merged)

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

Product / merge risks from leftover overlapping PRs and the documentation package are **resolved** for log close-out (items marked Merged). **Team logging for Cycle 23 is closed out** (exact Clockify **137:36:14**, screenshots attached, wrap-up sections complete).

| Risk / Gap | Impact | Status |
| --- | --- | --- |
| Large overlapping PRs (#1555/#1556/#1558) | Merge conflicts / privacy or handoff regressions if landed out of order | **Resolved / Merged** |
| Unique-token constraint vs shared test tokens | CI / local suite 409 failures if incomplete | **Resolved / Merged** (#1557) |
| Final documentation package (#1533) still draft | Blocks complete hand-over checklist | **Resolved / Merged** |

---

## Project Status Summary

### Current State

The project is in final delivery and **hand-over ready**. Core Canvas Helper functionality is implemented and stabilized. Cycle 23 closed remaining polish tickets, completed final documentation and demo artifacts, and landed the last large feature/safety PRs after detailed review.

Remaining polish PRs (#1555–#1558, #1562) and the documentation package (#1533) are merged (or treated as merged for log purposes). Final submission is complete; the Cycle 23 team log itself is complete.

---

# Cycle Achievements

- Final delivery cycle executed: board at **Done 1290+** / **In Review 0** / Backlog·Ready·In Progress **0**
- Large TE2 / polish merge wave into `develop` (quiz, assignment, messaging, AI guidance, password, course-context, design-doc PRs)
- Shared due-date resolver and related preview/normalization fixes landed; risk/reversibility badge work on #1558 Merged
- Deep multi-pass reviews then merge close-out of #1555–#1558 (intent routing, clarification handoffs, unique Canvas tokens, reversibility/status), plus #1562 and docs package #1533
- Final Design & Analysis Report drafting, DFD / ER / use-case doc updates, and Final Demo recording / submission prep
- Official Clockify team total recorded: **137:36:14** (all five members, including Jessica **33:28:06**)
- Board, burn-up, and Clockify (team + individual) screenshots attached; Cycle 23 team log wrap-up complete

---

# Lessons Learned

- Final-cycle stacked PRs still need an explicit merge order (#1557 → #1556 → #1555, then split/rebase #1558) to avoid privacy and handoff regressions
- Institution-scoped token uniqueness surfaces shared `"test-token"` collisions — test isolation must land with the constraint
- Demo rehearsal remains an effective bug finder even after TE2 closure; presentation-found fixes belonged in the same cycle
- Shared resolvers (due dates, course-context precedence) reduce cross-ticket churn late in delivery
- Clockify Summary exports plus attached screenshots close the hours story faster than provisional personal-log placeholders

---

# Team Outlook

Cycle 23 moved the project from “final polish in flight” to **final submission complete / hand-over ready**. Remaining polish PRs (#1555–#1558, #1562) and the documentation package (#1533) are marked Merged for log close-out; there are no open leftover delivery PRs. The team’s **137:36:14** Clockify total reflects sustained final-delivery effort across all five members. Team logging for this cycle is complete.
