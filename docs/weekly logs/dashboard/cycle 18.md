# Cycle 18 (7/17–7/20)

---

## Burn-up Chart (Velocity)
<img width="1045" height="650" alt="burn up" src="https://github.com/user-attachments/assets/81094328-a348-4604-adaa-0969a2f55816" />

### Burn-up Summary

The burn-up chart for **Cycle 18 (Jul 17 – Jul 20)** shows open work increasing (trending toward ~380) as the Testing Event 2 scope was fully populated, alongside a steady increase in completed work (trending near ~80) as initial sub-tasks and UI scaffolding tasks were moved to Done.

| Date Range | Trend |
|---|---|
| Jul 17 – Jul 20 | Completed work steadily increased |
| Jul 17 – Jul 20 | Open work increased as TE2 scope was added |
| Current focus | Testing Event 2 active feature implementation |

---

## Project Board Summary

The project board for **Testing Event 2** shows that active implementation is heavily underway, with a massive influx of tasks moved into the "In progress" state as development kicked off.

### Current Testing Event 2 Board Status

| Status | Count / Notes |
|---|---|
| Backlog | 242 active items |
| Ready | 35 active items |
| In Progress | 21 active items |
| In Review | 0 active items |
| Done | 43 items |

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

The next cycle will focus on addressing the requested changes on the open PRs, merging the core Testing Event 2 features into the `develop` branch, and continuing down the feature dependency graph. 

| Feature | Status |
|---|---|
| Address PR Feedback for LLM Provider Switching | Ready for next cycle |
| Address PR Feedback for Quiz & Feedback Workflows | Ready for next cycle |
| Address PR Feedback for Grade Updates & Risk Metadata | Ready for next cycle |
| Next-tier Dependency Features | Pending PR merges |

---
## Tasks
<img width="602" height="802" alt="project board 1" src="https://github.com/user-attachments/assets/c3d72055-c008-4415-803f-5ef902b65397" />
<img width="602" height="817" alt="Project board 2" src="https://github.com/user-attachments/assets/0a428b10-c962-4be2-803d-1264ad0dadad" />

---

## Clockify Summary

Time was tracked using Clockify for **Cycle 18 (Jul 17, 2026 – Jul 20, 2026)**.

### Team Summary

| Team Member | Clockify Username | Logged Time |
|---|---|---:|
| Yerdana | yerdana | 15:02:44 |
| Rhythm | trivedirhythm | 13:38:03 |
| Jessica | jessica goel | 11:40:56 |
| Mridul | mridulnohria21 | 09:57:36 |
| Bao | thanhvoiban | 05:11:37 |
| **Total** | | 55:30:56 |

**Team:**
<img width="1339" height="388" alt="Team hours 1" src="https://github.com/user-attachments/assets/9e6bb461-996e-48d1-9740-01c20eae15da" />
**Mridul:**
<img width="1339" height="389" alt="Mridul hours" src="https://github.com/user-attachments/assets/65fc0788-0450-407d-9234-d858d109ba13" />
**Yerdana:**
<img width="1343" height="389" alt="Yerdana hours" src="https://github.com/user-attachments/assets/99aa1dfe-602f-48c2-9236-3e4aa690d326" />
**Rhythm:**
<img width="1338" height="390" alt="Rhythm hours" src="https://github.com/user-attachments/assets/84159f1a-52fc-48b4-824f-9ea148f2de00" />
**Bao:**
<img width="1336" height="389" alt="Bao Hours" src="https://github.com/user-attachments/assets/0fd36560-c10a-4a3f-94de-8337a55302c9" />
**Jessica:**
<img width="1337" height="391" alt="Jessica Hours" src="https://github.com/user-attachments/assets/527d813a-42e5-460f-b595-7b5c9d40da9b" />

---

## Project Status Summary

### Current State

This cycle represented a massive shift into active development for Testing Event 2. The project board reflects 21 items currently In Progress. The team effectively split the major workflows (Quiz Management, Feedback, Grade Updates, and LLM Provider settings) and successfully submitted PRs for the initial implementations of all of them.

The implementation of the LLM provider switching creates a strong foundation for the application's AI architecture moving forward, securely handling API keys and intelligently routing/caching chat requests. Replacing the legacy Canvas-free mode with deferred workflows significantly improves the logical safety and user expectations of the application. 

The focus for the upcoming cycle will be resolving the requested changes on the open PRs, pushing them through to merge, and beginning work on the dependent features mapped out in our dependency graph.

---

## In Progress / To Do

The following features are currently actively being worked on or are in the review phase (with changes requested) for Testing Event 2 implementation:

| Task ID / PR | Description | Assigned To | Status |
|---|---|---|---|
| PR #1252 | Feature 8: Add instructor LLM provider connections with response caching | Rhythm | In Progress (Changes requested) |
| PR #1251 | Feature 2: Feedback Workflow | Jessica | In Progress (Changes requested) |
| PR #1249 | Feature 1: Quiz management | Jessica | In Progress (Changes requested) |
| PR #1231 | Feature 3: Add high-risk grade update workflow | Mridul | In Progress (Changes requested) |
| PR #1250 | Feature 5: Add risk metadata to action previews | Mridul | In Progress (Changes requested) |
| #1245 | Removal of Canvas-Free Assistant Mode | Rhythm | In Progress (Changes requested) |

---

## Test Report / Testing Status

- Developer unit testing is currently ongoing in tandem with feature implementation for Quiz, Feedback, and Grade workflows.
- LLM Provider Switching logic underwent localized testing to ensure invalid client-supplied API keys are rejected and secure keys are properly Fernet-encrypted at rest.
- The new limited-mode assistant gate was tested to ensure Canvas reads/writes are appropriately deferred.

---

## Feature Ownership Overview

| Feature / Area | Primary Owner |
|---|---|
| LLM Provider Connections & Caching | Rhythm |
| Deferred Assistant Requests (Canvas-Free Mode) | Rhythm |
| Quiz Management Workflow | Jessica |
| Feedback Workflow | Jessica |
| High-Risk Grade Update Workflow | Mridul |
| Risk Metadata in Action Previews | Mridul |

---

## Main Risks / Remaining Gaps

| Risk / Gap | Impact | Next Step |
|---|---|---|
| Multiple massive feature PRs are open simultaneously | High potential for merge conflicts in `develop` | Coordinate a strict merge order utilizing the feature dependency graph |
| API Key Security | Improper handling could leak instructor credentials | Enforce strict reviews on the Fernet-encryption logic |
| Deferred Assistant Requests | State management could break if user flow is interrupted | Extensive frontend state testing needed once merged |

---

## Overall Summary

Cycle 18 was defined by a massive and highly productive transition into active feature implementation for Testing Event 2. After aligning on a detailed feature dependency graph to mitigate integration bottlenecks, the team pushed forward with over 50 logged development hours (with some hours still pending). The project board reflects this momentum with 21 high-priority tasks actively in progress.

Major architectural milestones were achieved this cycle, most notably the implementation of LLM provider switching, secure response caching, and the deprecation of the legacy Canvas-free mode in favor of intelligent, limited-mode deferrals. In tandem, foundational PRs were opened for critical workflows, including Quiz Management, Feedback, and High-Risk Grade Updates. 

Moving into Cycle 19, the team's overarching goal is to methodically address PR feedback, securely merge these expansive features into the main `develop` branch without causing conflicts, and continue burning down the Testing Event 2 backlog according to our dependency strategy.
