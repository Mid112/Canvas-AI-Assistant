# Deployment Validation Checklist

Parents: **#1318**, **#1319**

Mark each item during final validation. Attach notes/screenshots in your PR or test log as needed.

## Clean install & startup (#1353–#1354)

- [ ] Fresh clone installs with `make install`
- [ ] Env examples sufficient to boot
- [ ] `make e2e-up` **or** `make up` starts without manual image hacks
- [ ] `/health` returns success
- [ ] Admin seed login works once

## Networking (#1355)

- [ ] UI → API path works
- [ ] API → DB works
- [ ] API → Canvas (sandbox or real) works
- [ ] MCP path works **or** documented disabled

## Complete application (#1356–#1357)

- [ ] Instructor register/login
- [ ] Canvas connect + course list
- [ ] Assistant read prompt
- [ ] One write preview → cancel (no Canvas change)
- [ ] One write preview → confirm (Canvas change observed)
- [ ] Admin audit/health pages load

## Compose services (#1358–#1365)

- [ ] #1358 Docker Compose deployment
- [ ] #1359 Frontend container
- [ ] #1360 Backend container
- [ ] #1361 Database initialization
- [ ] #1362 Environment configuration
- [ ] #1363 Canvas configuration
- [ ] #1364 Ollama configuration (if in scope)
- [ ] #1365 Hosted LLM configuration (if in scope)

## Deployment reliability (#1382)

- [ ] Restart containers; sessions/policy still coherent
- [ ] Migrations idempotent on restart
- [ ] Failure surfaces actionable UI/admin errors (no silent hang)
