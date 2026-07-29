# Cycle 20 (7/24–7/27)

---

## Burn-up Chart (Velocity)
<img width="837" height="534" alt="burn up" src="https://github.com/user-attachments/assets/aa3a5b82-60ea-49f1-ab03-fd55503d9e5e" />

### Burn-up Summary

The burn-up chart for **Cycle 20 (Jul 24 – Jul 27)** illustrates a dramatic spike in velocity. Completed work surged upward from roughly ~30 items to over ~140, capturing the intense bug-squashing and PR merging phase leading directly into Testing Event 2. Open work increased slightly to ~165 to account for new bug tickets generated during final QA.

| Date Range | Trend |
|---|---|
| Jul 24 – Jul 27 | Completed work spiked dramatically |
| Jul 24 – Jul 27 | Open work increased slightly as QA bugs were logged |
| Current focus | TE2 Live Support and Documentation |

---

## Project Board Summary

The project board for **Testing Event 2** reflects the massive final push. The "Done" column experienced a massive influx, reflecting the closure of numerous bug tickets, sub-tasks, and PRs. Active development is now shifting strictly to remaining bug fixes and documentation.

### Current Testing Event 2 Board Status

| Status | Count / Notes |
|---|---|
| Backlog | 103 active items |
| Ready | 6 active items (primarily documentation and guides) |
| In Progress | 0 active items (on board view) |
| In Review | 0 active items (on board view) |
| Done | 1114 items |

<img width="902" height="792" alt="project board" src="https://github.com/user-attachments/assets/0a8d214e-d2da-4be7-898d-d4350c8d2e89" />

---

## Closed / Out of Scope Tasks

The previously established grey Done-column tasks (from Cycles 16–19, such as baseline UI polish, out-of-scope reliability testing, and isolated MCP verifications) remain closed and separated from completed/resolved project-scope deliverables. The current Done column count (1114) heavily reflects the hundreds of sub-tasks and QA bug tickets resolved during the TE2 stabilization push.

---

## Upcoming Tasks / Next Cycle

With TE2 active, the next cycle will immediately pivot into live testing support, feedback triage, and project documentation.

| Feature / Task | Status |
|---|---|
| Live Testing Event 2 Execution & Hotfixes | Active |
| Testing Event 2 Findings & Triage | Ready for next cycle |
| Finalize Instructor & Admin User Guides | Ready for next cycle |
| Developer Documentation & Deployment Package | Ready for next cycle |


---

## Clockify Summary

Time was tracked using Clockify for **Cycle 20 (Jul 24, 2026 – Jul 27, 2026)**.

### Team Summary

| Team Member | Clockify Username | Logged Time |
|---|---|---:|
| Mridul | mridulnohria21 | 27:41:40 |
| Yerdana | yerdana | 19:37:10 |
| Jessica | jessica goel | 12:51:18 |
| Rhythm | trivedirhythm | 12:19:38 |
| Bao | thanhvoiban | 09:41:47 |
| **Total** | | **82:11:33** |

**Team:**
<img width="1343" height="390" alt="Team hours 1" src="https://github.com/user-attachments/assets/6c5273fc-1859-41c4-90df-e6f3827a1110" />
<img width="1344" height="392" alt="team hours 2" src="https://github.com/user-attachments/assets/62c0c265-247b-4d4c-ac46-c8961b152080" />

**Mridul:**
<img width="1339" height="387" alt="mridul hours" src="https://github.com/user-attachments/assets/06440d15-81a9-49fe-966a-263ad4507f3d" />

**Rhythm:**
<img width="1341" height="392" alt="rhythm hours" src="https://github.com/user-attachments/assets/b6598b7d-7cf8-44ab-a59d-ab42c94d969d" />

**Bao:**
<img width="1342" height="393" alt="bao hours" src="https://github.com/user-attachments/assets/b516f867-03c2-4250-95df-67c4595934f8" />

**Jessica:**
<img width="1350" height="406" alt="jessica hours" src="https://github.com/user-attachments/assets/d39edece-75a3-408d-bc3e-a1d007821bba" />

---

## Project Status Summary

### Current State

The project is now fully stabilized and entering the execution phase of Testing Event 2. Cycle 20 was a monumental effort (over 82 collective hours) dedicated almost entirely to ensuring the stability, safety, and reliability of the platform's core workflows. 

Database migration collisions (such as the overlap on migration `035`) were successfully navigated, and background tasks (like the course-sync sweep spamming the Failed Operations table) were audited and fixed. The application now supports robust edge-case handling, including in-app Canvas course creation for easier testing, and profanity filtering to meet safety requirements. 

Moving forward, active feature development is frozen. The team's full attention will pivot to TE2 live support, tracking new user feedback, and compiling the final documentation, deployment packages, and user guides required for project handover.

---

## In Progress / To Do

The following bug fix PR is currently open and undergoing review/changes for final TE2 cleanup:

| PR ID | Description | Assigned To | Status |
|---|---|---|---|
| #1418 | Bugfix/reminder workflow | Yerdana | In Progress (Changes requested) |

---

## Test Report / Testing Status

- **Fuzz Testing:** A Hypothesis fuzz testing harness was added for pure parsers to ensure robust data validation against edge cases.
- **CI Alignment:** The Makefile was aligned with CI coverage standards. A `make seed-canvas-students` command was added to strictly test the dedicated COSC 499 Capstone course environment.
- **Data Safety:** Profanity filters for feedback, chat, and grades were implemented, tested, and resolved frontend linting flakes (`no-misleading-character-class`).
- **Environment:** Resolved Docker disk reclaim issues, E2E port uniqueness, and missing `CANVAS_TOKEN_ENCRYPTION_KEY` crashes in local environments to ensure demo readiness.

---

## Feature Ownership Overview

| Feature / Area | Primary Owner |
|---|---|
| Failed Operations, Course Auth, Profanity | Rhythm |
| Grade & Announcement Workflow Bugs | Mridul |
| Assistant Memory, Fuzz Testing, E2E Env | Jessica |
| Secure Troubleshooting & Audit | Bao |
| Reminder Workflow Fixes | Yerdana |

---

## Main Risks / Remaining Gaps

| Risk / Gap | Impact | Next Step |
|---|---|---|
| Cache Invalidation | Stale AI course lists (e.g., `canvas_course_names` caching) can confuse users | Scope a post-TE2 hotfix for tighter cache invalidation rules |
| Unforeseen Live Edge Cases | Students/Instructors may break the workflows in undocumented ways during TE2 | Monitor server logs live during the event and log bugs immediately |
| Documentation Backlog | High volume of codebase changes needs to be reflected in user/dev guides | Shift all available team bandwidth to documentation tickets in Cycle 21 |

---

## Overall Summary

Cycle 20 was the definitive stabilization sprint for Testing Event 2, marked by exceptional team velocity. With over 82 hours logged, the team aggressively tackled the remaining backlog, addressing everything from high-severity grade workflow bugs to CI pipeline reliability and database migration collisions. 

Significant enhancements were made to the application's safety and testing infrastructure, including the addition of a Hypothesis fuzz testing harness, strict profanity filters, and streamlined Canvas seeding commands for E2E testing. 

The successful merge of these critical PRs means the platform is now feature-locked and demo-ready. As the burn-up chart levels out on feature work, the team's objective for the upcoming cycle is to execute Testing Event 2, triage real-world user feedback, and begin finalizing the deployment and documentation deliverables.
