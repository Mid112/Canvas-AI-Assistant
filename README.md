# Canvas Helper AI Assistant

**UBCO COSC 499 · Capstone Team 16**  
**Client:** Mohamed Mostafa

An AI-assisted Canvas LMS workflow tool for instructors, with administrator oversight. Natural-language requests become structured Canvas actions only after an explicit **preview → confirm** step — the assistant never writes to Canvas on a normal chat turn.

## What it does

- **Instructors:** connect Canvas, manage an active course, run the AI assistant, create/update assignments and quizzes, analyze submissions, draft messages and feedback, and update grades — all with dry-run preview and confirmation.
- **Administrators:** manage instructor accounts, review audit logs, monitor system health and failed operations, and troubleshoot without exposing credentials.
- **Platform:** FastAPI + React, PostgreSQL, encrypted Canvas tokens, multi-provider LLM support, optional MCP Canvas sidecar, Docker Compose deployment.

## Quick start

**Prerequisites:** Docker + Docker Compose, Make, Python 3.12+, Node 22.13+ (see `.nvmrc`).

```bash
make install
cp .env.example .env
# Set a unique CANVAS_TOKEN_ENCRYPTION_KEY (Fernet) and SECRET_KEY
cp app/backend/.env.example app/backend/.env

# Developer loop (API :8000, UI :5173, Canvas sandbox :3000)
make e2e-up

# Or full stack behind nginx (:8888)
make build && make up
```

Full install steps: [`docs/final/deployment/installation-guide.md`](docs/final/deployment/installation-guide.md).

## Documentation

Start with the final package index: [`docs/final/README.md`](docs/final/README.md) · table of contents: [`docs/TOC.md`](docs/TOC.md)

| Audience | Path |
| --- | --- |
| Instructors & administrators | [`docs/final/user-guides/`](docs/final/user-guides/) |
| Developers | [`docs/final/developer/`](docs/final/developer/) |
| Deploy & install | [`docs/final/deployment/`](docs/final/deployment/) |
| Architecture | [`docs/final/architecture.md`](docs/final/architecture.md) |
| API overview | [`docs/final/api-reference.md`](docs/final/api-reference.md) |
| Testing report | [`docs/testing report/Final_Testing_Report_Detailed.pdf`](docs/testing%20report/Final_Testing_Report_Detailed.pdf) |
| Requirements traceability | [`docs/final/Requirements_Traceability_Matrix.pdf`](docs/final/Requirements_Traceability_Matrix.pdf) |
| Design | [`docs/design/README.md`](docs/design/README.md) |

## Testing

```bash
make test        # backend pytest (excl. fuzz) + frontend vitest coverage
make test-e2e    # Playwright
make test-fuzz   # Hypothesis (opt-in)
```

## Safety model

1. **Reads** (course data, analytics, missing submissions) can run immediately.  
2. **Writes** to Canvas require preview and explicit confirmation.  
3. High-risk actions (send message, update grade) may require typing `CONFIRM`.  
4. Scope limits: no autonomous Canvas writes, no arbitrary Canvas API calls, no institution-wide Canvas administration.

## License

See [`LICENSE`](LICENSE).
