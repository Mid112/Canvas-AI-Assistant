# Cycle 19 (7/21–7/23)

---

## Burn-up Chart (Velocity)
<img width="938" height="588" alt="burn up" src="https://github.com/user-attachments/assets/98513e60-064b-4834-be73-1be90cd4b3eb" />

### Burn-up Summary

The burn-up chart for **Cycle 19 (Jul 21 – Jul 23)** shows open work stabilizing (flatlining around ~310) while completed work experienced a massive and rapid increase (jumping from ~30 to ~170). This sharply reflects the successful merging of the major TE2 feature PRs over the past three days.

| Date Range | Trend |
|---|---|
| Jul 21 – Jul 23 | Completed work sharply increased |
| Jul 21 – Jul 23 | Open work stabilized |
| Current focus | Merging next-tier dependency features and TE2 finalization |

---

## Project Board Summary

The project board for **Testing Event 2** reflects a massive shift of tickets into the "Done" column as the initial wave of TE2 PRs was merged. Open work in "In progress" and "In review" currently shows 0 on the board view, as the active work is currently being tracked directly via open Pull Requests.

### Current Testing Event 2 Board Status

| Status | Count / Notes |
|---|---|
| Backlog | 64 active items |
| Ready | 15 active items |
| In Progress | 0 active items |
| In Review | 0 active items |
| Done | 265 items |

---

## Closed / Out of Scope Tasks

The following grey Done-column tasks were closed or moved to Done, but they should **not** be counted as completed/resolved deliverables for this project scope.

| Task ID | Description | Status |
|---|---|---|
| 231 | Feature: UI Polish | Done |
| 232 | Improve dashboard layout | Done |
| 233 | Improve chat interface | Done |
| 234 | Improve preview readability | Done |
| 235 | Improve history page | Done |
| 236 | Improve mobile responsiveness | Done |
| 237 | Fix visual bugs | Done |
| 238 | Feature: Reliability improvements | Done |
| 239 | Improve API error messages | Done |
| 240 | Add timeout handling | Done |
| 241 | Improve Canvas API failure handling | Done |
| 242 | Improve LLM failure handling | Done |
| 243 | Add clearer logs | Done |
| 244 | Add retry handling where needed | Done |
| 245 | Feature: Security Review | Done |
| 252 | Feature: Performance Testing | Done |
| 253 | Test dashboard load time | Done |
| 254 | Test API response time | Done |
| 255 | Test LLM response time | Done |
| 256 | Test Docker startup time | Done |
| 257 | Identify slow endpoints | Done |
| 258 | Optimize repeated requests | Done |
| 259 | Feature: Peer Feedback Fixes | Done |
| 600 | Route Canvas operations through MCP | Done |
| 601 | Restrict MCP operations | Done |
| 602 | Verify Dockerized MCP deployment | Done |
| 604 | Encrypt Canvas tokens | Done |
| 607 | Restrict student data access | Done |
| 615 | Connect audit logs | Done |
| 644 | Feature: AI Validation & MCP Integration (FR9.1-FR9.6) | Done |
| 649 | Feature: AI Safety Validation | Done |
| 655 | Prevent assistant from generating non-retrieved Canvas data | Done |
| 656 | Restrict assistant responses to validated Canvas information | Done |
| 657 | Validate AI-generated actions | Done |
| 658 | Reject unsafe actions | Done |
| 659 | Reject malformed actions | Done |
| 1090 | Update Cycle 17 report with timesheet and current tasks | Done |
| 1174 | Verify MCP execution path | Done |
| 1175 | Verify AI validation | Done |
| 1176 | Verify safe execution | Done |
| 1177 | Verify Canvas validation | Done |
| 1179 | Verify encrypted storage | Done |

---

## Upcoming Tasks / Next Cycle

The next cycle will focus on addressing the requested changes on the newly opened PRs (Feature 11, Feature 15, Audit Logs) and merging them into the `develop` branch. 

| Feature | Status |
|---|---|
| Address PR Feedback for Failed Operation Monitoring (#1265) | Ready for next cycle |
| Address PR Feedback for Reliability & Context Control (#1263) | Ready for next cycle |
| Address PR Feedback for Audit Logs (#1266) | Ready for next cycle |
| Final TE2 Validation and Regression Testing | Pending PR merges |

---
## Tasks
<img width="603" height="704" alt="project board 1" src="https://github.com/user-attachments/assets/4d390866-a4d9-4110-a0f9-5b570eebd688" />

---

## Clockify Summary

Time was tracked using Clockify for **Cycle 19 (Jul 21, 2026 – Jul 23, 2026)**.

### Team Summary

| Team Member | Clockify Username | Logged Time |
|---|---|---:|
| Mridul | mridulnohria21 | 17:17:13 |
| Rhythm | trivedirhythm | 09:50:12 |
| Jessica | jessica goel | 08:33:39 |
| Bao | thanhvoiban | 08:25:43 |
| Yerdana | yerdana | 06:45:54 |
| **Total** | | **50:52:41** |

**Team:**
<img width="1338" height="406" alt="team hours 1" src="https://github.com/user-attachments/assets/85c8e65c-dfe8-4904-bd3f-c0b8f68c3f59" />
**Mridul:**
<img width="1339" height="389" alt="mridul hours" src="https://github.com/user-attachments/assets/9ab7d225-1bcf-4c01-a28e-01661d157095" />
**Rhythm:**
<img width="1340" height="391" alt="Rhythm hours" src="https://github.com/user-attachments/assets/18fd1a88-b6d1-4b1c-9686-fa15b994ce93" />
**Bao:**
<img width="1342" height="393" alt="bao hours" src="https://github.com/user-attachments/assets/fc1c71f8-9332-4498-a6e9-6627b8ba7c67" />
**Jessica:**
<img width="1340" height="392" alt="jessica hours" src="https://github.com/user-attachments/assets/4fffb8ba-e6d7-4cde-bf25-6c60f49c935c" />
**Yerdana:**
<img width="1342" height="391" alt="Yerdana hours" src="https://github.com/user-attachments/assets/ca6d8ea5-8f63-4117-bbd9-569d157d1d15" />


---

## Project Status Summary

### Current State

This cycle represented a massive clearing of the Testing Event 2 pipeline. The team successfully reviewed, hardened, and merged the foundational TE2 workflows (Quiz Management, Feedback, Grade Updates, Risk Metadata, and LLM Provider settings) into `develop`. The burn-up chart clearly illustrates this major burndown of active tasks.

With the core architecture in place, the team has already pivoted to the next layer of the dependency graph: admin observability. New PRs are currently open for System Reliability, Context Control, Failed Operation Monitoring, and Audit Logs. 

The focus for the upcoming cycle will be resolving the requested changes on these new PRs, managing merge orders to prevent database migration conflicts, and beginning final manual smoke testing on the `develop` branch to prepare for Testing Event 2 execution.

---

## In Progress / To Do

The following features and documentation tasks are currently actively being worked on or are in the review phase for Testing Event 2:

| PR ID | Description | Assigned To | Status |
|---|---|---|---|
| #1266 | Add audit log feature backend + frontend | Bao | In Progress (Review required) |
| #1265 | Feature 11: Add failed operation monitoring for Canvas and AI failures | Rhythm | In Progress (Review required) |
| #1263 | Feature 15: Reliability & Context Control | Jessica | In Progress (Changes requested) |

---

## Test Report / Testing Status

- Final regression and security spot-checks were completed on Feature 8 to ensure no credential leakage in API responses prior to merging.
- Automated tests for Quiz, Feedback, and Grade workflows are passing on `develop` post-merge.
- New instrumentation and backend tests were written for the Failed Operation Monitoring feature.
- Testing Event 1 findings were compiled and merged into the documentation branch to inform final TE2 testing priorities.

---

## Feature Ownership Overview

| Feature / Area | Primary Owner |
|---|---|
| LLM Provider Connections & Caching (Merged) | Rhythm |
| Quiz / Feedback Workflows (Merged) | Jessica |
| Grade Updates / Risk Metadata (Merged) | Mridul |
| Feature/Action Reversal (Merged) | Mridul |
| Failed Operation Monitoring | Rhythm |
| Reliability & Context Control | Jessica |
| Audit Log Feature | Bao |

---

## Main Risks / Remaining Gaps

| Risk / Gap | Impact | Next Step |
|---|---|---|
| Concurrent database migrations in open PRs (#1265, #1266) | High risk of migration numbering collisions | Coordinate a strict merge order and renumber migrations immediately before merging |
| Massive influx of code into `develop` | Potential for integrated regression bugs | Conduct full-system manual smoke testing of merged features in the next cycle |
| Admin observability relies on real failures | Features might pass unit tests but fail live | Induce artificial AI and Canvas failures in a local environment to test admin dashboards live |

---

## Overall Summary

Cycle 19 was defined by exceptional velocity and delivery. The team successfully pushed through the initial bottlenecks of Testing Event 2, merging a massive wave of core functionality—including Quiz, Feedback, and Grade workflows, alongside LLM Provider Switching—into the `develop` branch. The burn-up chart reflects this success with a steep rise in completed tasks.

With over 50 team hours logged, momentum remains high. The team has already transitioned to the next phase of the TE2 dependency graph, opening PRs for critical admin observability features like Failed Operation Monitoring and Audit Logs. 

Moving into the next cycle, the team's overarching goal is to safely merge these remaining observability features, carefully manage database migration sequences, and shift entirely into full-system regression testing to ensure the application is perfectly stabilized for Testing Event 2.
