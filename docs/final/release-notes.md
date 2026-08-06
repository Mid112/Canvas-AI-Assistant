# Release Notes

Issues: **#1417** Create release notes · **#1416** Tag final release

## Version

**Tag:** `vX.Y.Z` *(set when tagging)*  
**Date:** *(set when tagging)*  
**Commit:** *(set when tagging)*

## Highlights

- Instructor AI assistant with confirm-before-write Canvas workflows (assignments, quizzes, feedback, messaging, grades).
- Active course scoping and Canvas token encryption.
- Admin audit, system health, troubleshooting, and failed-operations escalation.
- Multi-provider LLM support with optional Ollama/vLLM.
- Optional MCP Canvas tool sidecar with host allowlisting.
- Docker Compose deployment behind nginx.

## Testing

- Automated: `make test` (pytest + vitest coverage); optional fuzz/e2e targets.
- Manual: Testing Event 1 & 2 reports under `docs/testing report/` and `docs/testing event outcomes/`.

## Upgrade / install

See [deployment/installation-guide.md](./deployment/installation-guide.md).

## Known limitations

- *[Add before tag: e.g. no admin Canvas write retry, sandbox vs production Canvas differences, provider rate limits]*

## Tagging procedure (#1416)

```bash
git checkout <release-commit>
git tag -a v1.0.0 -m "Team 16 final release"
git push origin v1.0.0
# Create GitHub Release from the tag; paste these notes
```
