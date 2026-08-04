# Cycle 22 (7/31–8/3)

---

# Weekly Team Log

Cycle 22 was a high-velocity post–Testing Event 2 stabilization cycle focused on closing regression tickets, hardening AI assistant trust/grounding behaviour, and preparing the application for Final Demo and final delivery. Rather than adding major new product surfaces, the team concentrated on fixing TE2 findings across Canvas workflows, messaging, quizzes/assignments, authentication/session security, and instructor UX polish.

Personal logs for Jessica, Mridul, Rhythm, and Yerdana are already merged into `logs`. Bao’s Cycle 22 personal log was not yet available when this team report was drafted, so Bao’s hours are marked **TBD** below and should be filled in once that personal log lands.

Collectively, the four logged members recorded **79 hours, 26 minutes, and 3 seconds**. Development activity produced a large set of merged regression and polish pull requests into `develop`, while a smaller set of high-priority PRs remained open for Final Demo readiness.

---

## Date Range

- **[31-07] – [03-08]**

---

## Features in the Project Plan Cycle

- Final regression / TE2 ticket closure
- AI assistant grounding, loading UX, and missing-submission analysis
- Assignment / quiz create & review polish
- Canvas course context / naming / code validation
- Messaging draft sync and templates
- Auth / session / password-reset hardening
- Documentation, testing reports, and Final Demo preparation
- Individual team logs & time reporting

---

## Project Board Status

Cycle 22 continued the board’s shift from feature delivery into final regression cleanup and demo readiness. Many TE2 tickets moved through review and into Done; remaining open work is concentrated on a short list of polish / delivery PRs.

### Current Project Board Status

| Status | Count / Notes |
| --- | --- |
| Backlog | **TBD — paste current count** |
| Ready | **TBD — paste current count** |
| In Progress | **TBD — paste current count** |
| In Review | **Several open polish PRs (see below)** |
| Done | **TBD — paste current count** |

<!-- TODO: replace with Cycle 22 project-board screenshot -->
<!-- <img width="1426" height="738" alt="Cycle 22 project board" src="PASTE_BOARD_SCREENSHOT_URL" /> -->

---

## Completed and Merged Tasks (Cycle 22)

A large batch of TE2 / final-delivery fixes landed on `develop` during and immediately after this cycle window. Highlights:

| PR ID | Description | Status |
| --- | --- | --- |
| #1457 | Fix course creation token error for new accounts | Merged |
| #1458 | Ticket 2: Canvas URL resolution across institution workflows | Merged |
| #1459 | Ticket 33: Per-course Create Assignment on Assignments subtab | Merged |
| #1462 | Review-permissions / troubleshooting UI updates | Merged |
| #1471 | Ticket 18: AI Assistant chat window layout | Merged |
| #1475 | Ticket 9: Refresh course names and code matching | Merged |
| #1476 | Ticket 10: Migration to repair Canvas course names | Merged |
| #1477 | Ticket 8: Persist assignment/student refs across chat turns | Merged |
| #1478 | Ticket 11: Assignment update due-date hour/timezone | Merged |
| #1481 | Ticket 12: Publish / unpublish assignment workflow | Merged |
| #1482 | Ticket 13: Quiz workflow issues from assignment assumptions | Merged |
| #1484 | Ticket 21: Ungraded assignments without forcing points | Merged |
| #1485 | Ticket 22: Improve assignment field validation | Merged |
| #1486 | Ticket 26: Instructor notifications functional | Merged |
| #1493 | Ticket 37: Wire logout to backend session revoke | Merged |
| #1494 | Ticket 38: Stop mock dry-run from faking Canvas execution | Merged |
| #1495 | Ticket 39: Stop dashboard seed metrics fallback | Merged |
| #1496 | Ticket 40: Wire message templates UI to backend | Merged |
| #1497 | PII / grounding: stop destructive scrubbing of instructor-facing replies | Merged |
| #1498 | Real Canvas read behind course submission analysis | Merged |
| #1499 | Ticket 34: Multi-institution course unique constraint | Merged |
| #1500 | Ticket 35: Revoke other sessions after password change | Merged |
| #1501 | Assignment-create chat handoff through draft generator | Merged |
| #1516 | Tickets 24/25: Preserve sent draft snapshot on success | Merged |
| #1517 | Ticket 23: Validate course code format on course creation | Merged |
| #1518 | Architecture / changes.txt documentation | Merged |
| #1519 | Quiz point reconciliation + quiz/assignment routing | Merged |
| #1520 | Resolved assignment/student names in previews & grade handoff | Merged |
| #1522 | Ticket 15: AI loading / thinking feedback | Merged |

Additional effort this cycle also covered PR reviews, Testing Event report refinement, merge-conflict resolution across stacked branches, and Final Demo preparation.

---

## In Progress Tasks / To Do

| Task | Status |
| --- | --- |
| Ticket 14: Quiz question point validation (#1483) | Open / in review |
| Ticket 16: Show all missing required assignment fields at once (#1523) | Open |
| Ticket 19: Missing assignments & analytics in chat (#1474) | Open |
| Ticket 20: Softer assignment-description guardrails (#1524) | Open |
| Ticket 31 + 32: Sidebar + audit log fixes (#1521) | Open |
| Ticket 36: Wire forgot-password flow to backend reset APIs (#1487) | Open |
| Creator workflow audit (#1514) | Open |
| Draft course persist (#1515) | Open |
| Bao Cycle 22 personal log | Pending |

---

## Upcoming Tasks / Next Cycle

| Feature / Task | Status |
| --- | --- |
| Merge remaining open TE2 / polish PRs | Active |
| Final Demo rehearsal and end-to-end validation | Upcoming |
| Final submission package completeness check | Upcoming |
| User / developer documentation final pass | Active |
| Live Canvas sandbox verification | Upcoming |
| Project board cleanup for final delivery | Upcoming |

---

## Burn-up Chart / Velocity

<!-- TODO: replace with Cycle 22 burn-up screenshot -->
<!-- <img width="1087" height="585" alt="Cycle 22 burn-up" src="PASTE_BURNUP_SCREENSHOT_URL" /> -->

### Burn-up Summary

The burn-up chart for **Cycle 22 (Jul 31 – Aug 3)** should show a sharp rise in completed work as TE2 regression tickets and polish PRs landed, with open work concentrating on a smaller Final Demo / documentation set.

| Date Range | Trend |
| --- | --- |
| Jul 31 – Aug 3 | Completed work increased through regression merges |
| Jul 31 – Aug 3 | Open work shifted toward Final Demo polish and docs |
| Current Focus | Remaining open PRs, Final Demo, submission package |

---

# Clockify Summary

Time was tracked using Clockify for **Cycle 22 (Jul 31, 2026 – Aug 3, 2026).**

Hours below are taken from merged personal logs. **Bao’s Cycle 22 personal log was not yet available**, so team totals exclude Bao for now.

### Team Summary

| Team Member | Clockify Username | Logged Time |
| --- | --- | ---: |
| Yerdana | yerdana | **35:05:23** |
| Mridul | mridulnohria21 | **21:05:08** |
| Jessica | jessica goel | **14:10:58** |
| Rhythm | trivedirhythm | **09:04:34** |
| Bao | thanhvoiban | **TBD** |
| **Total (excl. Bao)** | | **79:26:03** |

The four logged members recorded a combined **79 hours, 26 minutes, and 3 seconds** during Cycle 22. Friday and Saturday carried the heaviest meeting + bugfix load; Sunday/Monday continued stacked PR reviews, analysis/grounding fixes, and Final Demo prep.

### Daily Team Hours (excl. Bao)

| Day | Hours |
| --- | ---: |
| Friday (31/7) | **22:59:59** |
| Saturday (1/8) | **21:24:34** |
| Sunday (2/8) | **14:54:24** |
| Monday (3/8) | **20:07:06** |

<!-- TODO: replace with team Clockify screenshot -->
<!-- <img width="904" height="527" alt="Cycle 22 team Clockify" src="PASTE_TEAM_CLOCKIFY_URL" /> -->

---

### Individual Clockify Reports

#### Yerdana

- **Friday:** 07:05:28
- **Saturday:** 10:24:29
- **Sunday:** 10:11:58
- **Monday:** 07:23:28
- **Total:** **35:05:23**

<img width="1226" height="550" alt="Yerdana Cycle 22 Clockify" src="https://github.com/user-attachments/assets/36894004-8300-4533-aa28-8f6fe884143b" />

---

#### Mridul

- **Friday:** 08:23:55
- **Saturday:** 03:04:18
- **Sunday:** 02:40:57
- **Monday:** 06:55:58
- **Total:** **21:05:08**

<img width="2410" height="330" alt="Mridul Friday Clockify" src="https://github.com/user-attachments/assets/ec907c04-fdc2-4a82-a033-5987731ba0eb" />
<img width="2404" height="194" alt="Mridul Saturday Clockify" src="https://github.com/user-attachments/assets/43776aef-45df-469a-aa2d-7a57addca0b0" />
<img width="2408" height="216" alt="Mridul Sunday Clockify" src="https://github.com/user-attachments/assets/3bb931b8-2990-4188-a274-dc7bd437ea61" />
<img width="2410" height="214" alt="Mridul Monday Clockify" src="https://github.com/user-attachments/assets/4100e974-90f2-480d-b551-a2f7c7131e74" />

---

#### Jessica

- **Friday:** 03:30:19
- **Saturday:** 06:13:07
- **Sunday:** 02:01:29
- **Monday:** 02:26:03
- **Total:** **14:10:58**

<img width="1205" height="346" alt="Jessica Friday Clockify" src="https://github.com/user-attachments/assets/6ec2803b-e860-44b2-a1e5-b6310c19249a" />
<img width="1201" height="229" alt="Jessica Saturday Clockify" src="https://github.com/user-attachments/assets/9b69e2a9-8946-459b-b65d-d4bfe0c32f19" />
<img width="1199" height="102" alt="Jessica Sunday Clockify" src="https://github.com/user-attachments/assets/c4842686-0794-49f1-a0a8-cfd28c9f8849" />
<img width="1200" height="172" alt="Jessica Monday Clockify" src="https://github.com/user-attachments/assets/ef424bb2-ceab-4128-8563-c3f3e8770c3d" />

---

#### Rhythm

- **Friday:** 04:00:17
- **Saturday:** 01:42:40
- **Sunday:** 00:00:00
- **Monday:** 03:21:37
- **Total:** **09:04:34**

<img width="1208" height="170" alt="Rhythm Friday Clockify" src="https://github.com/user-attachments/assets/c460836d-8e7f-4fbe-9585-a156e2111bf8" />
<img width="1208" height="110" alt="Rhythm Saturday Clockify" src="https://github.com/user-attachments/assets/530c2833-3996-4d2d-b702-a4c0cc5ac915" />
<img width="1206" height="292" alt="Rhythm Monday Clockify" src="https://github.com/user-attachments/assets/740ba3ee-c570-486e-85ea-3b4afd949044" />

---

#### Bao

- **Total:** **TBD** (Cycle 22 personal log not yet merged)

---

# Test Report / Testing Status

Cycle 22 testing focused on validating TE2 regression fixes and confirming that assistant, Canvas, messaging, quiz/assignment, and auth workflows stayed reliable as many PRs landed in parallel.

Testing activities performed during this cycle included:

- Manual regression verification of TE2 tickets
- AI assistant grounding / unverified-claims UX checks
- Course-wide missing/late submission analysis validation
- Assignment create handoff + description expansion checks
- Quiz points consistency / review UI validation
- Course name/code matching and create-time validation
- Message draft sync / templates verification
- Auth logout / session revoke / password-change session checks
- PR review + CI green confirmation before merges

---

### Frontend Testing

Frontend validation concentrated on instructor-facing flows touched by TE2 tickets: chat/assistant UX, assignment/quiz creators, messaging drafts, notifications, and Canvas connection / course-context behaviour.

Areas reviewed included:

- AI Assistant loading states and clarify prompts
- Assignment create / review / preview flows
- Quiz review question cards and points editing
- Messaging draft / template behaviour
- Dashboard notifications and metrics (no seed fallback)
- Auth logout and password-reset UX paths

---

### Backend Testing

Backend validation focused on services changed by the regression stack: chat analysis chains, grounding/PII separation, Canvas course naming/migrations, assignment audit/workflow claim behaviour, and auth session revocation.

Backend validation included:

- `analyze_course_submissions` published-filter / roster-reuse / history compaction
- Grounding notice-not-redact behaviour for instructor-facing replies
- Assignment create ownership-before-write and claim-commit ordering
- Course unique-constraint / code-format validation
- Session revoke on logout and password change

---

### Testing Outcome

Cycle 22 substantially reduced outstanding TE2 regression risk. Core instructor workflows are more trustworthy (especially AI answers backed by real Canvas reads, and write paths with correct audit/workflow records). Remaining open PRs are polish / final-delivery items rather than broad feature work.

---

# Project Status Summary

## Current State

The project is in final stabilization ahead of the Final Demo and submission. Cycle 22 closed a large share of TE2 regression tickets across Canvas context, messaging, quizzes/assignments, AI grounding/analysis, and auth/session security. The board’s remaining work is a short list of open polish PRs, documentation finalization, and demo rehearsal.

---

# Feature Ownership Overview

| Feature / Area | Primary Owner |
| --- | --- |
| Documentation, reporting, TE2 ticket merges / reviews | Jessica |
| AI grounding, submission analysis, quiz/assignment create audit | Yerdana |
| Canvas URL / course naming / messaging draft sync / docs package | Mridul |
| AI loading UX, missing-fields clarify, guardrails, chat analytics | Rhythm |
| Sidebar / audit / troubleshooting UI polish | Bao |

---

# Main Risks / Remaining Gaps

| Risk / Gap | Impact | Next Step |
| --- | --- | --- |
| Open polish PRs (#1483, #1487, #1474, #1514, #1515, #1521, #1523, #1524) | Could delay Final Demo readiness | Finish review/merge before demo |
| Bao Cycle 22 hours missing from team totals | Incomplete time reporting | Merge Bao personal log and update this report |
| Live Canvas sandbox e2e verification | Real-environment gaps may remain | Complete sandbox verification |
| Final documentation / submission package completeness | Delivery risk | Final docs + package review |
| Board / burn-up screenshots not yet attached | Report incomplete visually | Add screenshots before final merge |

Overall project risk remains **low to moderate**, with remaining work focused on polish, verification, and delivery packaging.

---

# Individual Team Contributions

### Jessica

Focused on TE2 regression tickets (course create token, assignment/quiz/message/auth/session fixes), teammate PR reviews, Testing Event report refinement, and coordinating merges into `develop`. Also maintained personal/team logging for the cycle.

### Mridul

Closed Canvas URL, chat-window, course-name/code, messaging draft sync, and course-code validation tickets; continued final documentation / submission-package work; and reviewed teammate PRs for delivery readiness.

### Yerdana

Led AI trust fixes (PII vs grounding separation, course submission analysis with real Canvas reads), assignment-create generator handoff / audit holes, quiz point reconciliation, stacked-branch conflict resolution, and deep review responses with failing-test-first habit.

### Rhythm

Delivered AI loading/thinking feedback (merged), plus open work on missing-assignment analytics in chat, single-turn missing-field clarification, and softer assignment-description guardrails; also reviewed early TE2 PRs and aligned bug priorities in the Friday meeting.

### Bao

Cycle 22 personal log not yet available at draft time. Known open work associated with Bao includes sidebar / audit-log polish (#1521). Hours and detailed contributions should be filled in after the personal log merges.

---

# Cycle Achievements

- Large TE2 regression batch merged into `develop`
- AI assistant answers no longer invent course-wide submission stats without a real Canvas read
- Instructor-facing replies stopped being destructively scrubbed for grades/titles
- Assignment/quiz create & review paths hardened (points, handoff expansion, audit/workflow)
- Course context / naming / code validation improved for create and matching flows
- Messaging draft sync + templates wired more correctly
- Auth/session security gaps closed (logout revoke, password-change session revoke)
- Personal Cycle 22 logs merged for Jessica, Mridul, Rhythm, and Yerdana

---

# Lessons Learned

- Stacked regression PRs need a deliberate merge order; resolving conflicts only after upstream lands avoids repeated churn
- Review feedback is most reliable when reproduced with a failing test before coding
- AI product fixes must separate inbound privacy controls from outbound trust/grounding UX
- Course-context bugs cascade across create, resume, messaging, and analytics — shared resolution helpers pay off
- Team time reporting is incomplete until every member’s personal log is present

---

# Objectives for Cycle 23 / Final Delivery

- Merge remaining open polish PRs
- Complete Final Demo rehearsal and end-to-end validation
- Finish user/developer documentation and submission package checks
- Attach board / burn-up / team Clockify screenshots and Bao hours to this report
- Live Canvas sandbox verification
- Final repository / project-board cleanup
- Submit final deliverables

---

# Team Outlook

Cycle 22 moved the project from “many TE2 tickets open” to “mostly merged, short open list.” The application is substantially more stable for Final Demo. With remaining polish PRs closed and documentation/demo prep finished, the team is positioned to complete final delivery on schedule.
