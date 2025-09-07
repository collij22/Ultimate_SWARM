# Onboarding — Swarm1

## Prereqs

- Node 18+ (22 used in CI), Git, Docker (optional), Playwright browsers (`npx playwright install`).

## First run

```bash
npm i
npm run mock:staging
export STAGING_URL=http://localhost:3000
export API_BASE=http://localhost:3000/api
npx playwright test -c tests/robot/playwright/playwright.config.ts
node orchestration/cvf-check.mjs AUV-0001
```

## Core concepts

- **AUV** — smallest acceptable slice; spec in `capabilities/`.
- **Router (MCP)** — maps capabilities → tools (see `mcp/`).
- **Gates** — CVF → QA → Security before deploy.

## Where to read next

- **docs/SWARM1-GUIDE.md**
- **docs/ARCHITECTURE.md**
- **CLAUDE.md** (agent operational guide)
