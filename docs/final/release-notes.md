# Release Notes

Issues: **#1417** Create release notes · **#1416** Tag final release

## Version

**Tag:** `vX.Y.Z` *(set when tagging)*  
**Date:** *(set when tagging)*  
**Commit:** *(set when tagging)*

## Highlights

- Instructor AI assistant with confirm-before-write Canvas workflows (assignments, quizzes, feedback, messaging, grades).
- Active course preference plus **explicit / draft / conversation course priority** so ambient active course is not silently attached on every chat turn.
- **Ungraded assignments** (`points_possible` null → Canvas `not_graded`; no invented default points).
- Due dates normalized to **UTC** using instructor Canvas timezone before preview and write (including MCP create assignment).
- Messages page: **Inbox / Announcements / Sent / Compose**; compose honors draft course over active course.
- AI Assistant: starter prompts, **collapsed conversation history**, limited mode + **deferred request** save/resume, Feature 13 grounding (ID scrub + grade warnings).
- Quiz creator: structured draft resume, preserve points across regen, full-prompt handoff from assistant.
- Course overview submission counts aligned to Submissions source of truth; analyse-missing uses indexed `course_context`.
- Password strength policy (8+ with upper/lower/digit/symbol), reset flow, session revoke on password change / logout.
- Admin audit, system health, troubleshooting, and failed-operations escalation.
- Multi-provider LLM support with optional Ollama/vLLM; optional MCP Canvas sidecar with host allowlisting.
- Docker Compose deployment behind nginx.

## Testing

- Automated: `make test` (pytest + vitest coverage); optional fuzz/e2e targets.
- Manual: Testing Event 1 & 2 reports under `docs/testing report/` and `docs/testing event outcomes/`.

## Upgrade / install

See [deployment/installation-guide.md](./deployment/installation-guide.md).

## Known limitations

- MCP is optional (`MCP_ENABLED`); Canvas tokens live encrypted on the API host — MCP is not the sole credential store.
- Screenshot assets in `user-guides/screenshots/` may still be placeholders until capture pass (#1336/#1337).
- *[Add before tag: sandbox vs production Canvas differences, provider rate limits]*

## Tagging procedure (#1416)

```bash
git checkout <release-commit>
git tag -a v1.0.0 -m "Team 16 final release"
git push origin v1.0.0
# Create GitHub Release from the tag; paste these notes
```
