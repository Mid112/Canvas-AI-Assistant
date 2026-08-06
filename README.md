# Canvas Helper AI Assistant — Team 16

UBCO COSC 499 capstone project: an AI-assisted Canvas LMS workflow tool for instructors, with administrator oversight and **confirm-before-write** safety for all Canvas mutations.

## Quick start

```bash
make install
cp .env.example .env   # generate a unique CANVAS_TOKEN_ENCRYPTION_KEY
cp app/backend/.env.example app/backend/.env
make e2e-up            # Postgres + Canvas sandbox; API :8000; UI :5173
# or full stack:
make build && make up  # app on :8888 via nginx
```

## Documentation

**Start here:** [`docs/final/README.md`](docs/final/README.md) · [`docs/TOC.md`](docs/TOC.md)

| Audience | Link |
|----------|------|
| Instructors / admins | [`docs/final/user-guides/`](docs/final/user-guides/) |
| Developers | [`docs/final/developer/`](docs/final/developer/) |
| Deploy / install | [`docs/final/deployment/`](docs/final/deployment/) |
| Architecture / API | [`docs/final/architecture.md`](docs/final/architecture.md), [`docs/final/api-reference.md`](docs/final/api-reference.md) |
| Design (LLM) | [`docs/design/llm-providers.md`](docs/design/llm-providers.md) |

## Testing

```bash
make test        # pytest + vitest coverage
make test-e2e    # Playwright
make test-fuzz   # Hypothesis (opt-in)
```

## Team

UBCO COSC 499 — Capstone Team 16 (Canvas Helper AI Assistant).

## License

See [`LICENSE`](LICENSE).
