# Frontend Testing & Bug Fixes (#682)

Acceptance evidence for the four sub-issues under
[Feature: Frontend Testing & Bug Fixes #682](https://github.com/UBCO-COSC499-S2026/capstone-team-16/issues/682).

## #689 — Add missing frontend tests

Added / extended Vitest coverage for high-traffic instructor gaps:

| Area | Test file |
| --- | --- |
| Canvas connection gate UI | `test/frontend/components/common/CanvasConnectionRequired.test.tsx` |
| Messages page gates + roster error | `test/frontend/pages/Instructor/InstructorMessagesPage.test.tsx` |
| Course layout error/loading/gates | `test/frontend/pages/Instructor/InstructorCourse/InstructorCourseLayout.test.tsx` |
| Course submissions invalid/Canvas gate | `test/frontend/pages/Instructor/InstructorCourseSubmissionsPage.test.tsx` |
| Active course selector | `test/frontend/components/courses/ActiveCourseSelector.test.tsx` |
| Dashboard shell + titles | `test/frontend/components/layouts/DashboardLayout.test.tsx` |
| Editable recipients | `test/frontend/components/messages/EditableRecipientList.test.tsx` |
| Canvas settings empty state | `test/frontend/pages/Instructor/InstructorSettings/CanvasConnectionTab.test.tsx` |

Run:

```bash
cd test/frontend && npx vitest run
```

## #690 — Fix MVP review issues

MVP demo-day functional fixes already landed on `develop` via
`integration/mvp-merge` (duplicate chat send, editable recipients, write-action
gating, assignment HTML→plain text, preview/assignments-list mapping, message
composer reconciliation). There is no separate Discord bug list in-repo.

### Verified against current branch

- [x] Duplicate assistant send on `initialPrompt` — fixed in `ChatWindow`
- [x] Editable message recipients before send — `EditableRecipientList`
- [x] Canvas token / outage errors classified with reconnect CTA — `ErrorAlert`
- [x] Course/messages Canvas gates use shared `CanvasConnectionRequired`
- [x] Workflow history page loads and filters previous actions
- [x] Assignment create/update preview paths remain instructor-gated

No remaining known MVP-demo blockers on this branch. Post-MVP UI polish that
lives only on `ui-fixes` (inbox UI, LLM switcher, publish badges) is tracked
separately and is not required to close #690.

## #691 — Verify responsive layouts

### Automated checks

- [x] Dashboard layout exposes a mobile nav trigger (`lg:hidden`)
- [x] Mobile nav sheet opens and shows instructor links
- [x] Desktop sidebar chrome remains available via layout shell

### Manual checklist (desktop / tablet / mobile)

Verify at ~375px, ~768px, and ≥1024px:

- [x] Header: mobile menu button visible below `lg`; desktop sidebar toggle at `lg+`
- [x] Sidebar: hidden below `lg`, available in sheet on small screens
- [x] Instructor pages: padding `p-4 md:p-6 lg:p-8` does not clip primary CTAs
- [x] Assistant suggested-action cards wrap without horizontal overflow
- [x] Messages draft: subject/body/recipients usable without horizontal scroll
- [x] Tables (history, submissions, students): horizontal scroll or wrap without covering nav

## #692 — Verify error handling workflows

### Automated checks

- [x] `ErrorAlert` — Canvas auth reconnect, outage hint, generic alert (`role=alert`)
- [x] `error-classification` unit coverage
- [x] `CanvasConnectionRequired` CTA → `/instructor/settings?tab=canvas`
- [x] Messages: no token → gate; roster failure → banner + draft still usable
- [x] Course layout: invalid id / load error / Canvas gate
- [x] Submissions: invalid link / Canvas gate

### Manual checklist

- [x] Disconnect Canvas → Messages / Courses / Submissions show connect gate
- [x] Invalid Canvas token error surfaces Reconnect Canvas action
- [x] Temporary Canvas outage message does not offer a false reconnect fix
- [x] Course not found / invalid URL offers Back to courses
- [x] Message roster timeout still allows composing a draft

## Closing #682

All four sub-issues have acceptance evidence above. Close #689–#692, then close
parent #682.
