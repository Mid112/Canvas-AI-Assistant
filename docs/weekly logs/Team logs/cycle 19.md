# Cycle 19 (7/21–7/23)

---

## Weekly Team Log

This cycle was highly productive, focusing on addressing PR feedback, completing reviews, and successfully merging the initial wave of Testing Event 2 features into the `develop` branch. 

The team successfully pushed massive architectural and workflow features to completion, including Quiz Management, Feedback Workflows, High-Risk Grade Updates, Risk Metadata, and the full LLM Provider Switching and Response Caching implementation. 

Alongside merging these core features, the team immediately transitioned to the next tier of the feature dependency graph. Active development and new PRs were opened for System Health Monitoring, Failed Operation Monitoring, Reliability & Context Control, and the Audit Log feature.

## Date Range:

- [21-07] - [23-07]

---

## Features in the Project Plan Cycle:

- Feature: Add instructor LLM provider connections with response caching (Merged)
- Feature: Quiz Management Workflow (Merged)
- Feature: Feedback Workflow (Merged)
- Feature: Add high-risk grade update workflow (Merged)
- Feature: Add risk metadata to action previews (Merged)
- Feature: Feature/action reversal (Merged)
- Feature: System health monitoring for admin (Merged)
- Feature 11: Failed operation monitoring for Canvas and AI failures (Active)
- Feature 15: Reliability & Context Control (Active)
- Feature: Audit log feature backend + frontend (Active)

---

## Project Board Status

The project board for **Testing Event 2** reflects a massive shift of tickets into the "Done" column as the initial wave of TE2 PRs was merged. Open work in "In progress" and "In review" currently shows 0 on the board view, as the active work is currently being tracked directly via open Pull Requests.

| Status | Count / Notes |
|---|---|
| Backlog | 64 active items |
| Ready | 15 active items |
| In Progress | 0 active items |
| In Review | 0 active items |
| Done | 265 items |

<img width="603" height="704" alt="project board 1" src="https://github.com/user-attachments/assets/a2aa93c2-3435-409c-a466-1490bba7940c" />

---

## Completed and Merged Tasks (Cycle 19)

The following major feature PRs and documentation updates were successfully reviewed, approved, and merged into `develop` this cycle, representing a massive burndown of the Testing Event 2 scope.

| PR ID | Description | Status |
|---|---|---|
| #1264 | Feature 4: Feature/action reversal | Merged |
| #1262 | Added automated test screenshots | Merged |
| #1261 | Added Testing Event 1 Findings and Report | Merged |
| #1259 | Add new system health monitoring for admin | Merged |
| #1252 | Feature 8: Add instructor LLM provider connections with response caching | Merged |
| #1251 | Feature 2: Feedback Workflow | Merged |
| #1250 | feature 5: Add risk metadata to action previews | Merged |
| #1249 | Feature 1 :quiz management | Merged |
| #1231 | feature 3: Add high-risk grade update workflow | Merged |

<img width="612" height="546" alt="closed pr" src="https://github.com/user-attachments/assets/683f7100-8fbe-4a72-872e-d6233e31b20f" />

---

## In Progress Tasks / To Do

The following features and documentation tasks are currently actively being worked on or are in the review phase for Testing Event 2:

| PR ID | Description | Assigned To | Status |
|---|---|---|---|
| #1266 | Add audit log feature backend + frontend | Bao | In Progress (Review required) |
| #1265 | Feature 11: Add failed operation monitoring for Canvas and AI failures | Rhythm | In Progress (Review required) |
| #1263 | Feature 15: Reliability & Context Control | Jessica | In Progress (Changes requested) |

<img width="976" height="209" alt="Untitled" src="https://github.com/user-attachments/assets/cfa04c89-46fd-47ff-a7f5-58373429dd7c" />

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

## Burn-up Chart / Velocity

<img width="938" height="588" alt="burn up" src="https://github.com/user-attachments/assets/4aafc739-e77d-4cad-b34a-5f1758ec0028" />


### Burn-up Summary

The burn-up chart for **Cycle 19 (Jul 21 – Jul 23)** shows open work stabilizing (flatlining around ~310) while completed work experienced a massive and rapid increase (jumping from ~30 to ~170). This sharply reflects the successful merging of the major TE2 feature PRs over the past three days.

| Date Range | Trend |
|---|---|
| Jul 21 – Jul 23 | Completed work sharply increased |
| Jul 21 – Jul 23 | Open work stabilized |
| Current focus | Merging next-tier dependency features and TE2 finalization |

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

<img width="1338" height="406" alt="team hours 1" src="https://github.com/user-attachments/assets/040497a5-f2b6-4e21-aa25-a4800c3ee6f0" />
<img width="1343" height="390" alt="team hours 2" src="https://github.com/user-attachments/assets/dd909037-5754-411e-b3c8-56470172e83e" />

---

## Test Report / Testing Status

- Final regression and security spot-checks were completed on Feature 8 to ensure no credential leakage in API responses prior to merging.
- Automated tests for Quiz, Feedback, and Grade workflows are passing on `develop` post-merge.
- New instrumentation and backend tests were written for the Failed Operation Monitoring feature.
- Testing Event 1 findings were compiled and merged into the documentation branch to inform final TE2 testing priorities.

<img width="659" height="256" alt="tests" src="https://github.com/user-attachments/assets/1d21bf90-8939-4222-a710-5cf0af4a8c79" />

---

## Project Status Summary

### Current State

This cycle represented a massive clearing of the Testing Event 2 pipeline. The team successfully reviewed, hardened, and merged the foundational TE2 workflows (Quiz Management, Feedback, Grade Updates, Risk Metadata, and LLM Provider settings) into `develop`. The burn-up chart clearly illustrates this major burndown of active tasks.

With the core architecture in place, the team has already pivoted to the next layer of the dependency graph: admin observability. New PRs are currently open for System Reliability, Context Control, Failed Operation Monitoring, and Audit Logs. 

The focus for the upcoming cycle will be resolving the requested changes on these new PRs, managing merge orders to prevent database migration conflicts, and beginning final manual smoke testing on the `develop` branch to prepare for Testing Event 2 execution.

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
| Audit Log Feature | Bao / StoneCA12 |

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
