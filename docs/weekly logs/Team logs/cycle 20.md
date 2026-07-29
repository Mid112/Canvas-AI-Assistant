# Cycle 20 (7/24–7/27)

---

## Weekly Team Log

This cycle was characterized by an intense, high-velocity push to finalize, polish, and stabilize all features for Testing Event 2 (TE2). The team logged over 82 hours, focusing entirely on bug fixes, edge-case handling, and critical infrastructure improvements (like CI alignment and Hypothesis fuzz testing) to ensure a smooth live testing experience.

Major additions this cycle included in-app Canvas course creation and publishing, comprehensive profanity filtering for feedback and chat, and the successful resolution and merge of the complex Failed Operations Monitoring feature after handling database migration collisions. The team effectively squashed dozens of medium-to-high severity bugs across the grade, assignment, and feedback workflows.

## Date Range:

- [24-07] - [27-07]

---

## Features in the Project Plan Cycle:

- Feature 11: Failed Operation Monitoring (Merged)
- Feature: In-app Canvas course creation and publish/unpublish (Merged)
- Feature: Profanity filtering for feedback, grades, and chat (Merged)
- Infrastructure: Hypothesis fuzz testing harness for pure parsers (Merged)
- Infrastructure: Makefile CI alignment and Canvas student seeding (Merged)
- Feature: Secure troubleshooting integration (Merged)
- Extensive TE2 Bug Fixes (Grade workflow, announcement drafts, memory/grounding)

---

## Project Board Status

The project board for **Testing Event 2** reflects the massive final push. The "Done" column experienced a massive influx, reflecting the closure of numerous bug tickets, sub-tasks, and PRs. Active development is now shifting strictly to remaining bug fixes and documentation.

| Status | Count / Notes |
|---|---|
| Backlog | 103 items |
| Ready | 6 active items (primarily documentation and guides) |
| In Progress | 0 items (on board view) |
| In Review | 0 items (on board view) |
| Done | 1114 items |

<img width="902" height="792" alt="project board" src="https://github.com/user-attachments/assets/94973e72-f507-49e7-9547-b31740be2193" />

---

## Completed and Merged Tasks (Cycle 20)

The team successfully closed a massive number of PRs this cycle to lock in TE2 stability. Below is a highlight of the major merges:

| PR ID | Description | Status |
|---|---|---|
| #1314 | Add Hypothesis fuzz testing harness for pure parsers | Merged |
| #1313 | fix assistant field memory, grounding persistence, and malformed JSON | Merged |
| #1312 | fix Canvas connection duplicate card and quiet dashboard refresh | Merged |
| #1311 | fix assignment stepper navigation and reset preview state | Merged |
| #1310 | fix for grade workflow | Merged |
| #1309 | Align Makefile test commands with CI coverage standards | Merged |
| #1308 | fix course announcement draft flow | Merged |
| #1307 | Add profanity filtering for feedback comments | Merged |
| #1306 | Add in-app Canvas course create and publish/unpublish | Merged |
| #1284 | Feature/secure trouble shooting integration monitoring | Merged |
| #1265 | Feature 11: Add failed operation monitoring for Canvas and AI failures | Merged |

---

## In Progress Tasks / To Do

The following bug fix PR is currently open and undergoing review/changes for final TE2 cleanup:

| PR ID | Description | Assigned To | Status |
|---|---|---|---|
| #1418 | Bugfix/reminder workflow | Yerdana | In Progress (Changes requested) |

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

## Burn-up Chart / Velocity

<img width="837" height="534" alt="burn up" src="https://github.com/user-attachments/assets/6c62fc11-0a89-4f60-a8b7-d95a6e2d1005" />

### Burn-up Summary

The burn-up chart for **Cycle 20 (Jul 24 – Jul 27)** illustrates a dramatic spike in velocity. Completed work surged upward from roughly ~30 items to over ~140, capturing the intense bug-squashing and PR merging phase leading directly into Testing Event 2. Open work increased slightly to ~165 to account for new bug tickets generated during final QA.

| Date Range | Trend |
|---|---|
| Jul 24 – Jul 27 | Completed work spiked dramatically |
| Jul 24 – Jul 27 | Open work increased slightly as QA bugs were logged |
| Current focus | TE2 Live Support and Documentation |

---

## Clockify Summary

Time was tracked using Clockify for **Cycle 20 (Jul 24, 2026 – Jul 28, 2026)**. 

### Team Summary

| Team Member | Clockify Username | Logged Time |
|---|---|---:|
| Mridul | mridulnohria21 | 27:41:40 |
| Yerdana | yerdana | 19:37:10 |
| Jessica | jessica goel | 12:51:18 |
| Rhythm | trivedirhythm | 12:19:38 |
| Bao | thanhvoiban | 09:41:47 |
| **Total** | | **82:11:33** |

<img width="1344" height="392" alt="team hours 2" src="https://github.com/user-attachments/assets/30eb4ada-ea00-40a5-88c6-aa0912d9f30a" />
<img width="1343" height="390" alt="Team hours 1" src="https://github.com/user-attachments/assets/e6fe193c-f8bf-4e35-9f93-2fc533d98676" />

---

## Test Report / Testing Status

- **Fuzz Testing:** A Hypothesis fuzz testing harness was added for pure parsers to ensure robust data validation against edge cases.
- **CI Alignment:** The Makefile was aligned with CI coverage standards. A `make seed-canvas-students` command was added to strictly test the dedicated COSC 499 Capstone course environment.
- **Data Safety:** Profanity filters for feedback, chat, and grades were implemented, tested, and resolved frontend linting flakes (`no-misleading-character-class`).
- **Environment:** Resolved Docker disk reclaim issues, E2E port uniqueness, and missing `CANVAS_TOKEN_ENCRYPTION_KEY` crashes in local environments to ensure demo readiness.

---

## Project Status Summary

### Current State

The project is now fully stabilized and entering the execution phase of Testing Event 2. Cycle 20 was a monumental effort (over 82 collective hours) dedicated almost entirely to ensuring the stability, safety, and reliability of the platform's core workflows. 

Database migration collisions (such as the overlap on migration `035`) were successfully navigated, and background tasks (like the course-sync sweep spamming the Failed Operations table) were audited and fixed. The application now supports robust edge-case handling, including in-app Canvas course creation for easier testing, and profanity filtering to meet safety requirements. 

Moving forward, active feature development is frozen. The team's full attention will pivot to TE2 live support, tracking new user feedback, and compiling the final documentation, deployment packages, and user guides required for project handover.

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
