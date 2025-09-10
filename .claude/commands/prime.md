# Prime Command - Swarm1 Context Setup

You're starting with a blank context. Prime yourself on the Swarm1 codebase and working method using the docs below. Swarm1 is an agentic swarm system that delivers AUV-sized vertical slices via Claude Code sub-agents, MCP tools, and evidence-based gates. Keep your reply short, action-oriented, and scoped to this repo. Do not over-explain.

## Load these references (skim, don't paraphrase them back)

- `@CLAUDE.md`
- `@docs/deep_technical_plan_06sep2025.md` (phase 1-9 implementation)
- `@docs/phases10-14.md` (phase 10-14 implementation - still in progress)
- `@docs/plan.md` (a high level plan to supplement the phased plan)
  IMPORTANT: other core documents
- `@docs/ARCHITECTURE.md`
- `@docs/ORCHESTRATION.md`
- `@docs/QUALITY-GATES.md`
- `@docs/verify.md`
- `@docs/hooks.md`
- `@mcp/registry.yaml`
- `@mcp/policies.yaml`
- `@mcp/router-report.mjs`
- `@orchestration/cli.mjs`
- `@orchestration/runbooks/auv_delivery.mjs`
- `@orchestration/lib/test_authoring.mjs`
- `@orchestration/cvf-check.mjs`
- `@orchestration/lib/auv_compiler.mjs`
- `@orchestration/graph/runner.mjs`
- `@orchestration/graph/projects/seo-audit-demo.yaml`
- `@orchestration/lib/engine_selector.mjs`
- `@orchestration/lib/subagent_gateway.mjs`
- `@orchestration/lib/tool_executor.mjs`
- `@orchestration/lib/build_lane.mjs`
- `@orchestration/security/semgrep.mjs`
- `@orchestration/visual/capture.mjs`
- `@tests/robot/playwright/playwright.config.ts`
- `@mock/server.js`
- `@capabilities/AUV-0002.yaml`
- `@capabilities/AUV-0003.yaml`
- `@capabilities/AUV-0004.yaml`
- `@capabilities/AUV-0005.yaml`

## Project TL;DR (internalize)

- **Swarm1 delivers AUV units** with contract-first specs and CVF (functional, perf, security, visual) gates
- **Phases 1–10b complete**: Autopilot, Compiler, DAG, MCP Router, Build Lane, Security/Visual, Packaging, Durable Engine, Agent Excellence, vNext MCPs + tri‑mode
- **Runbook autopilot** (`orchestration/cli.mjs AUV-<ID>`) → mock server → Playwright → Lighthouse → CVF → result cards
- **Tri‑mode orchestration**: `SWARM_MODE=deterministic|claude|hybrid`; subagent gateway + tool executor; router enforces allowlists & budgets; coverage at `runs/router/coverage-report.json`
- **New Primary MCPs**: `ref` (docs.search/read), `brave-search` (web.search; TEST_MODE), `fetch` (web.fetch); node `web_search_fetch` + CLI `search-fetch`
- **DAG Runner**: Parallel execution with dependencies; work_simulation nodes (20–45% speedup verified)
- **Build Lane**: Autonomous pipeline with QA gates and PR creation
- **Security/Visual Gates**: Semgrep, Gitleaks, visual regression with baselines (Phase 6 complete)
- **Packaging & Delivery**: Client-ready bundles with manifests, HTML reports, semantic versioning (Phase 7 complete)
- **Durable engine & agents**: BullMQ/Redis multi‑tenant runs (Phase 8); output schemas, knowledge, scorecards (Phase 9)

## House rules

- **IMPORTANT**: staging/test only; never touch prod or secrets
- **IMPORTANT**: keep artifacts machine-readable (JSON/XML) and commit only repo-legal paths
- **Prefer Primary MCPs**; propose Secondary with small budget + reason
- **Keep changes AUV-sized**, reversible, and evidenced (Level-3 deliverables)

## What you should do now

1. **Confirm understanding** of AUV model & gates (see `@docs/verify.md`, `@orchestration/cvf-check.mjs`) and where artifacts land (`runs/<AUV-ID>/...`)
2. **Verify local run facts** (don't leak tokens): `STAGING_URL`, `API_BASE`; mock server at `@mock/server.js`; Playwright config at `@tests/robot/playwright/playwright.config.ts`
3. **Offer a 3–5 line status snapshot** and a next-steps menu tailored to this repo (e.g., runbook for AUV-0003/0004/0005, tri‑mode seo‑audit demo, router coverage, extend gates)

## Output format

Reply with exactly this structure:

````xml
<ready>
  <snapshot>
    <!-- 3–5 bullets: where we are (AUVs, runbook, MCP router/policies, artifacts/gates), and any env/setup preconditions -->
  </snapshot>

  <quick_commands>
    npm run mock:staging
    STAGING_URL=http://127.0.0.1:3000 API_BASE=http://127.0.0.1:3000/api
    npx playwright test -c tests/robot/playwright/playwright.config.ts
    node orchestration/cli.mjs AUV-0003
    node orchestration/cvf-check.mjs AUV-0003 --strict
    node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml
    node orchestration/cli.mjs search-fetch "ref tools MCP server"
    node mcp/router-report.mjs
    node orchestration/security/semgrep.mjs --auv AUV-0003
    node orchestration/visual/capture.mjs --auv AUV-0003
    tail -n 50 runs/observability/hooks.jsonl
  </quick_commands>

  <menus>
    <option id="1">Run a full AUV delivery (autopilot): choose 0003, 0004, or 0005</option>
    <option id="2">Compile AUVs from brief (node orchestration/cli.mjs plan briefs/demo-01/brief.md)</option>
    <option id="3">Run DAG with parallel execution (graph runner with concurrency)</option>
    <option id="4">Execute build lane with QA gates and PR creation</option>
    <option id="5">Run security/visual regression checks (Phase 6 gates)</option>
    <option id="6">Package delivery + client report (zip + report HTML)</option>
  </menus>

  <notes>
    - Phases 1–10b complete: tri‑mode orchestration with Claude subagents; new Primary MCPs wired; router coverage emitted
    - CI/CD fully integrated; AUV-0002..0005 green; artifacts under runs/**; reports in dist/**
    - Auto-authoring protects manual tests; use FORCE_REGEN_OVERRIDE_MANUAL=1 only when necessary
    - Use the MCP router by **capability** (Primary‑first; Secondary budget/consent; TEST_MODE for web.search/external crawl)
    - Security waivers expire after 30 days; visual baselines at tests/robot/visual/baselines/
    - Set SWARM_MODE=claude|hybrid to exercise subagents; decisions/ledgers in runs/observability/
  </notes>
</ready>
``` ::contentReference[oaicite:0]{index=0}
````
