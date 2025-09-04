# Swarm1

General‑purpose **Agent Swarm** that delivers AUV‑sized (Acceptable Unit of Value) increments with
contract‑first development, deterministic tests (“User Robot”) and evidence‑based gates (CVF → QA → Security → DevOps).

## Quickstart
```bash
# 1) install deps & browsers
npm i
npx playwright install

# 2) run local mock "staging"
npm run mock:staging   # or: node mock/server.js

# 3) run tests (UI + API)
npx playwright test -c tests/robot/playwright/playwright.config.ts

# 4) CVF gate checks artifacts for AUV-0001
node orchestration/cvf-check.mjs AUV-0001
```

## Key docs
- **CLAUDE.md** — operational guide for Claude Code + sub‑agents.
- **docs/ARCHITECTURE.md** — system diagram & components.
- **docs/SWARM1-GUIDE.md** — “what to keep/what to change” strategy (11 sections).
- **docs/ORCHESTRATION.md** — AUV lifecycle, lanes, serialization policy.
- **docs/QUALITY-GATES.md** — CVF/QA/Security gates & thresholds.
- **docs/verify.md** — copy‑paste verification steps per AUV.
- **docs/runbook.md, docs/operate.md** — run/operate playbooks.
- **mcp/** — tool registry & policies (router).
- **capabilities/** — AUV specs.

## Repo layout (essentials)
```
.claude/agents, .claude/aux-agents    # system prompts
capabilities/                         # AUV specs (id, acceptance, proofs)
contracts/{openapi.yaml,events.yaml}  # API & event contracts
db/{schema.sql,migrations/}           # schema & migrations
docs/{...}                            # architecture, orchestration, gates, verify
mcp/{registry.yaml,policies.yaml}     # MCP catalog & routing policies
orchestration/{policies.yaml,...}     # orchestrator policies/gates
tests/robot/{api,playwright,visual/...}  # user robot
```

## Contributing
See **CONTRIBUTING.md**. New? Start with **docs/ONBOARDING.md**.

---
> Swarm1 principle: *small, vertical, provable increments — always runnable, always reversible.*
