# Prime Command - Swarm1 Context Setup

You're starting with a blank context. Prime yourself on the Swarm1 codebase and working method using the docs below. Swarm1 is an agentic swarm system that delivers AUV-sized vertical slices via Claude Code sub-agents, MCP tools, and evidence-based gates. Keep your reply short, action-oriented, and scoped to this repo. Do not over-explain.

## Load these references (skim, don't paraphrase them back)

- `@CLAUDE.md`
- `@docs/deep_technical_plan_06sep2025.md` (proposed technical moving forward, including current state and recent implementation)
- `@docs/plan.md` (a high level plan to supplement the technical plan)
  IMPORTANT: other core documents
- `@docs/ARCHITECTURE.md`
- `@docs/ORCHESTRATION.md`
- `@docs/QUALITY-GATES.md`
- `@docs/verify.md`
- `@docs/Hooks.md`
- `@mcp/registry.yaml`
- `@mcp/policies.yaml`
- `@orchestration/cli.mjs`
- `@orchestration/runbooks/auv_delivery.mjs`
- `@orchestration/lib/test_authoring.mjs`
- `@orchestration/cvf-check.mjs`
- `@orchestration/lib/auv_compiler.mjs`
- `@orchestration/graph/runner.mjs`
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
- **Proven locally**: AUV-0001..0005; CI/CD fully integrated; Brief compiler generates AUVs from requirements
- **Runbook autopilot** (`orchestration/cli.mjs AUV-<ID>`) starts mock server → Playwright → Lighthouse → CVF → result card
- **Auto-authoring** creates baseline tests from `capabilities/<AUV>.yaml` with FORCE_REGEN protection for manual files
- **MCP**: agents request capabilities, not tool names. Router enforces Primary first, Secondary by consent+budget per policies
- **DAG Runner**: Parallel execution with dependencies, work_simulation nodes for testing (20-45% speedup verified)
- **Build Lane**: Autonomous pipeline with QA gates and PR creation
- **Security/Visual Gates**: Semgrep, Gitleaks, visual regression with baselines (Phase 6 complete)
- **Packaging & Delivery**: Client-ready bundles with manifests, HTML reports, and semantic versioning (Phase 7 complete)
- **Hooks/Observability**: JSONL logs + result cards under `runs/`; artifacts are the source of truth for "done"

## House rules

- **IMPORTANT**: staging/test only; never touch prod or secrets
- **IMPORTANT**: keep artifacts machine-readable (JSON/XML) and commit only repo-legal paths
- **Prefer Primary MCPs**; propose Secondary with small budget + reason
- **Keep changes AUV-sized**, reversible, and evidenced (Level-3 deliverables)

## What you should do now

1. **Confirm understanding** of AUV model & gates (see `@docs/verify.md`, `@orchestration/cvf-check.mjs`) and where artifacts land (`runs/<AUV-ID>/...`)
2. **Verify local run facts** (don't leak tokens): `STAGING_URL`, `API_BASE`; mock server at `@mock/server.js`; Playwright config at `@tests/robot/playwright/playwright.config.ts`
3. **Offer a 3–5 line status snapshot** and a next-steps menu tailored to this repo (e.g., runbook for AUV-0003/0004/0005, add a new AUV, extend gates, wire CI)

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
    node orchestration/graph/runner.mjs orchestration/graph/projects/demo-validation.yaml
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
    - Phases 1-7 complete: Foundation, Brief Compiler, DAG Runner, MCP Router, Build Lane, Security/Visual Gates, Packaging & Delivery
    - CI/CD fully integrated with GitHub Actions; all AUVs passing consistently
    - Auto-authoring protects manual test files; use FORCE_REGEN_OVERRIDE_MANUAL=1 only when necessary
    - Use the MCP router by **capability**, not tool name; policies/registry are the source of truth
    - Security waivers expire after 30 days; visual baselines in tests/robot/visual/baselines/
    - Keep output diffs/patches minimal and reproducible; attach artifacts in runs/
  </notes>
</ready>
``` ::contentReference[oaicite:0]{index=0}
````
