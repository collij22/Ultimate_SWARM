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
- **docs/AUTH.md** — Authentication & RBAC for durable engine (Phase 8).
- **docs/QUALITY-GATES.md** — CVF/QA/Security gates & thresholds.
- **docs/verify.md** — copy‑paste verification steps per AUV.
- **docs/runbook.md, docs/operate.md** — run/operate playbooks.
- **mcp/** — tool registry & policies (router).
- **capabilities/** — AUV specs.

### Phase 10a Highlights

- New Primary MCPs: `ref` (docs.search/docs.read), `brave-search` (web.search), `fetch` (web.fetch)
- New node: `web_search_fetch` (Brave search + fetch); CLI: `node orchestration/cli.mjs search-fetch "<query>"`
- Router coverage report path: `runs/router/coverage-report.json`

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

## Environment configuration

To set all required API keys and environment variables in one step, create a `.env.local` file (git-ignored) in the project root, then load it via the helper script.

1) Create `.env.local` (example — replace with your values):

```
# Web/Search
BRAVE_API_KEY=your_brave_key
REF_API_KEY=your_ref_key

# YouTube
YOUTUBE_API_KEY=your_youtube_api_key
# To enable uploads (OAuth not included here)
YOUTUBE_UPLOAD_ALLOWED=false

# Stripe (test only)
STRIPE_API_KEY=sk_test_...

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_key

# Cloud TTS
TTS_CLOUD_API_KEY=your_tts_key
TTS_PROVIDER=google # or elevenlabs

# Engine/General
TEST_MODE=true
NODE_ENV=development
```

2) Load into current shell (Windows CMD or PowerShell):

```
node scripts\load_env.mjs
```

Options: `--file <path>` to specify a custom file, `--overwrite` to overwrite existing vars in the current process.


## Contributing

See **CONTRIBUTING.md**. New? Start with **docs/ONBOARDING.md**.

---

> Swarm1 principle: _small, vertical, provable increments — always runnable, always reversible._
