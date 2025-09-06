# Swarm1 — Deep Technical Plan

*From "great demo" → "groundbreaking autonomous swarm"*

This is a hands-on, engineering-grade plan to take Swarm1 from today's verified demos to a system that can accept an Upwork-style brief, plan capabilities, run agents in parallel, implement, test, repair, prove via CVF, and package a client-ready delivery—largely autonomously.

## 0) Goals & Non-Goals

### Goals

- **Automate the loop**: Brief → AUV plan → tests → implementation → perf/security proofs → CVF → packaging
- **Run parallel agents** under policy (MCP tiers, budgets) with repair loops on failures
- **Keep artifacts, provenance, and Definition of Done** enforceable (CVF)
- **Be portable**: local dev reproducible, CI green, easy to scale

### Non-Goals (for now)

- No long-running production backend with multi-tenant billing yet (we'll add Temporal/BullMQ later)
- No exotic MCPs until the Primary/Secondary tool discipline is bedded in

## 1) Where we stand (condensed)

- **Capabilities proven**: AUV-0001..0005 green locally; 0002–0005 green in CI
- **Runbook**: `orchestration/cli.mjs` + `runbooks/auv_delivery.mjs` with auto test authoring (`orchestration/lib/test_authoring.mjs`), Lighthouse, CVF, result cards
- **Observability**: hooks emit JSONL + session/agent result cards
- **MCP**: registry & policies (primary/secondary) + allowlists wired in prompts
- **Docs**: `CLAUDE.md`, `verify.md`, `ARCHITECTURE.md` (baseline), `Hooks.md`, `runbook.md`, `CHANGELOG.md`

**Key gaps to autonomy**: brief→AUV compiler, DAG/task-graph runner, autonomous build (PRs), dynamic MCP routing, packaging + client report, durable execution.

## 2) Target System (what we're building)

### Components

**Brief Intake & AUV Compiler**
- **Files**: `orchestration/briefs/` + `orchestration/lib/auv_compiler.mjs`
- **Output**: `capabilities/AUV-01xx.yaml` with acceptance & authoring_hints

**Task Graph (DAG) Orchestrator**
- **Files**: `orchestration/graph/spec.schema.yaml`, `orchestration/graph/projects/<id>.yaml`, `orchestration/graph/runner.mjs`
- **Function**: Runs sub-agents in parallel, with retries, timeouts, checkpoints, and repair

**MCP Router Library**
- **Files**: `mcp/router.mjs` (runtime policy decision), uses `mcp/policies.yaml`, `mcp/registry.yaml`

**Autonomous Build Lane**
- **Files**: `orchestration/lib/build_lane.mjs` (git branch, commit, PR), agent caller to Rapid Builder, Frontend, API/DB

**Verification Lane**
- **Function**: Reuses runbook pieces + adds Semgrep (security), optional VRT (visual regression) gates

**Packaging & Report**
- **Files**: `orchestration/package.mjs`, `orchestration/report.mjs` → `/dist/<project>.zip` and HTML report

**Durability (later)**
- **Files**: `orchestration/engine/temporal/` (or bullmq/) for background, resumable runs

## 3) Data Contracts & File Schemas

### 3.1 Capability YAML (extend)

**File(s)**: `capabilities/AUV-0101.yaml` … (generated per brief)

```yaml
id: AUV-0101
name: "Search products"
acceptance:
  - "GET /api/products?q=needle returns ≥1 result containing 'needle' in title"
  - "UI shows filtered grid and allows navigation to detail"
authoring_hints:
  ui:
    page: "/products.html"
    search_input: "#q"
    apply_button_text: "Apply"
    card_selector: "[data-testid='product-card']"
    title_selector: "[data-testid='product-title']"
    screenshot: "products_search.png"
  api:
    base_path: "/products"
    cases:
      - name: "q filters by title"
        query: "?q=needle"
        expect: "list_ok"
artifacts:
  cvf:
    - path: "runs/AUV-0101/ui/products_search.png"
    - path: "runs/AUV-0101/perf/lighthouse.json"
```

**Action**: Keep `authoring_hints` rich enough that `orchestration/lib/test_authoring.mjs` can fully generate baseline specs.

### 3.2 DAG Spec (new)

**Files:**
- **Schema**: `orchestration/graph/spec.schema.yaml`
- **Example DAG**: `orchestration/graph/projects/demo-01.yaml`

```yaml
project_id: demo-01
brief: briefs/demo-01/brief.md
capabilities: [AUV-0101, AUV-0102, AUV-0103]
nodes:
  - id: parse-brief
    kind: agent
    agent: requirements-analyst
    inputs: [brief]
    outputs: [capabilities]
    timeout_s: 120
  - id: author-tests-0101
    kind: runbook
    run: auv
    auv: AUV-0101
    depends_on: [parse-brief]
    retry: {max: 1, backoff_s: 10}
  - id: implement-0101
    kind: agent
    agent: rapid-builder
    inputs: [capabilities, test-failures-0101]
    depends_on: [author-tests-0101]
    timeout_s: 600
    retry: {max: 2}
  - id: verify-0101
    kind: runbook
    run: auv
    auv: AUV-0101
    depends_on: [implement-0101]
    on_fail_repair:
      agents: [debugger, quality-guardian]
      max_cycles: 2
parallelism: 3
budgets:
  tokens: 2_000_000
  mcp_cost_usd: 25
```

### 3.3 MCP Policy Map (extend)

**File**: `mcp/policies.yaml`

- Expand `capability_map` to include new AUV families (010x, 020x)
- Ensure `agents.allowlist` only includes primary tools by default; secondary require a route override within DAG node (see §5)

## 4) Pipelines (from brief to delivery)

### 4.1 Brief Intake → Capability Plan (AUV Compiler)

**Files to add/update:**
- `orchestration/briefs/demo-01/brief.md` (input)
- `orchestration/lib/auv_compiler.mjs` (new)
- `orchestration/cli.mjs` (extend with run project command)
- `capabilities/AUV-0101.yaml` … (outputs)

**Implementation sketch** — `orchestration/lib/auv_compiler.mjs`:

```javascript
import fs from 'fs';
import path from 'path';
import { callAgent } from './call_agent.mjs'; // small helper that starts a Claude Code session for A2

export async function compileBriefToAuvs(briefPath, outDir) {
  const brief = fs.readFileSync(briefPath, 'utf8');
  const analysis = await callAgent('requirements-analyst', {
    brief, standards: '@docs/verify.md', examples: '@capabilities/AUV-0003.yaml'
  });
  // analysis should include a list of features + acceptance + suggested authoring_hints
  const auvs = [];
  for (const feat of analysis.features) {
    const auvId = nextAuvId(outDir); // e.g., AUV-0101, AUV-0102…
    const yaml = renderCapabilityYaml(auvId, feat); // create hints for test_authoring
    const p = path.join(outDir, `${auvId}.yaml`);
    fs.writeFileSync(p, yaml, 'utf8');
    auvs.push({ id: auvId, path: p });
  }
  return auvs;
}
```

**Agent prompt impact:**
- Ensure A2 Requirements Analyst prompt includes "emit machine-readable features with acceptance + authoring_hints"

4.2 Auto Test Authoring (already present, extend)

File: orchestration/lib/test_authoring.mjs

Add support for new authoring_hints (e.g., multi-step forms, authentication “login first”).

Detect cart-style summaries vs. simple list pages (already does; extend with before_steps hooks, e.g., log in).

4.3 Implementation Lane (Autonomous Build)

Files to add

orchestration/lib/build_lane.mjs — owns: branching, writing files, formatting, git commits, and PR creation.

orchestration/lib/call_agent.mjs — small helper to call a sub-agent with allowlist via MCP router.

GitHub integration: orchestration/lib/gh.mjs (create PR, set status; use a repo PAT or GH Actions token in CI).

build_lane.mjs (sketch)

export async function implementAuv(auvId, analysis) {
  // 1) create feature branch (git)
  await sh(`git checkout -b feat/${auvId}`);
  // 2) call Rapid Builder / specialists with explicit tasks
  const plan = await callAgent('project-architect', { auvId, analysis });
  const diffs = await callAgent('rapid-builder', { plan, allow: 'primary' });
  applyDiffs(diffs); // write files safely; validate paths
  // 3) format/lint; run local tests
  await sh(`npm run fmt && npm run lint`);
  // 4) commit & push
  await sh(`git add -A && git commit -m "feat(${auvId}): initial impl" && git push -u origin HEAD`);
  // 5) open PR
  const pr = await openPr({ title: `feat(${auvId})`, body: plan.summary });
  return pr;
}


Prompt impact

Rapid Builder, Frontend Specialist, API Integrator must produce diffs/patches (unified diff) or “file write plans” (path + content), not just prose.

Debugger should take failing artifacts and propose minimal diffs (patch hunks) to fix.

4.4 Verification Lane

Runbook stays as is per AUV (orchestration/cli.mjs run auv <id>).

Add Semgrep gate (primary MCP) in CI:

Files: .github/workflows/ci.yml add after tests:

- name: Security scan (Semgrep)
  run: npx semgrep --config=p/ci --json > runs/security/semgrep.json || true
- name: CVF gate — SEC
  run: node orchestration/cvf-check.mjs CVF-SEC


File: orchestration/cvf-check.mjs add case CVF-SEC requiring runs/security/semgrep.json with 0 high severities.

4.5 Repair Loop (auto)

Files:

orchestration/graph/runner.mjs — when a node fails, invoke Debugger + Quality Guardian, apply proposed patches via build_lane.applyDiffs(), re-run node (bounded cycles).

Runner pseudo:

if (nodeFailed) {
  for (let i=0; i<node.on_fail_repair.max_cycles; i++) {
    const analysis = collectArtifacts(node);
    const patch = await callAgent('debugger', { node, analysis });
    if (patch) { applyDiffs(patch); await run(node); if (ok) break; }
  }
}

4.6 Packaging & Client Report

Files:

orchestration/report.mjs — builds a static HTML summarizing AUVs, artifacts, perf scores, and links to CI runs.

orchestration/package.mjs — zips code + report + runs/ subset to /dist/<project-id>.zip.

CVF extension: Add CVF-PKG requiring /dist/<project>.zip and report.html.

5) MCP Router & Policies
5.1 Runtime Router (new)

File: mcp/router.mjs

Responsibilities:

Validate agent → tool request against mcp/policies.yaml (agents.allowlist & capability_map).

Prefer primary tier unless node overrides to tier: secondary.

Record usage → hooks ledger (extend scripts/hooks/session_end.py with cost counters).

Interface:

export function requestTool(agentId, desiredCap) {
  const allowed = resolveTools(agentId, desiredCap); // from policies + registry
  if (!allowed.length) throw new Error('Denied by policy');
  return chooseByTierAndBudget(allowed); // prefer primary; check budget
}

5.2 Policy updates

File: mcp/policies.yaml

Add note (already discussed): PreToolUse hook enforces agents.allowlist as source of truth.

Populate capability_map for new AUV families (e.g., search.filter, checkout.payment.mock).

Define budget envelopes per session and per node.

File: mcp/registry.yaml

Ensure each tool lists tier: primary|secondary, capabilities: [], requires_api_key: bool, side_effects: [].

Prompts

Remind sub-agents to call tools through router semantics (“request capability code.static_analysis” rather than hard-naming a tool).

6) Orchestrator/DAG Runner
6.1 Files to add

orchestration/graph/spec.schema.yaml (YAML schema for validation)

orchestration/graph/runner.mjs (executes nodes; concurrency; retries; repair)

orchestration/graph/projects/<project>.yaml (DAGs per project)

orchestration/lib/validate_yaml.mjs (ajv + schema)

6.2 CLI updates

File: orchestration/cli.mjs — add commands:

node orchestration/cli.mjs run auv AUV-0101
node orchestration/cli.mjs run project demo-01
node orchestration/cli.mjs plan demo-01  # brief -> AUVs -> DAG


Sketch:

if (cmd === 'run' && sub === 'project') {
  const dagPath = `orchestration/graph/projects/${id}.yaml`;
  await runDag(dagPath, { parallelism: cfg.parallelism });
}
if (cmd === 'plan') {
  const auvs = await compileBriefToAuvs(`briefs/${id}/brief.md`, 'capabilities/');
  await emitProjectDag(id, auvs); // write graph/projects/<id>.yaml
}

7) CI/CD Enhancements

File: .github/workflows/ci.yml

Matrix over declared AUVs in repo (parse capabilities/*.yaml names).

Steps per AUV:

Playwright (API+UI).

Lighthouse (ensure dir).

CVF (functional + perf).

Semgrep (security) + CVF-SEC.

Upload artifacts (already in place).

Optional: generate and upload report.html as build artifact.

8) Observability & Governance

Hooks (already writing JSONL) → add cost ledger rollups (extend scripts/hooks/session_end.py and post_tool.py to accumulate tokens, mcp_cost into runs/observability/ledgers/session-*.json).

Provide a small viewer:

File: orchestration/ops/summary.mjs — parses JSONL and prints per-session tool usage + failures.

Dashboards later: ship logs to OpenSearch; index by auv, agent, tool, ok.

9) Security & Cost Controls

Semgrep MCP in CI; treat “High” as failure.

Policies: disallow secondary tools by default; grant per-node override in DAG:

nodes:
  - id: ai-code-migrate
    agent: code-migrator
    mcp_tier: secondary
    budget:
      mcp_cost_usd: 5


Secrets: CI uses repo/organization secrets; runtime agents never get prod secrets.

Sandbox: file writes are constrained to workspace; applyDiffs() whitelists known directories.

10) Immediate Execution Plan (do now)

Seed a real brief

mkdir -p briefs/demo-01 && touch briefs/demo-01/brief.md (paste job post).

Implement AUV compiler

Add orchestration/lib/auv_compiler.mjs + orchestration/lib/call_agent.mjs.

Update A2 Requirements Analyst prompt: “emit structured JSON (features, acceptance, authoring_hints)”.

Add “plan” command

Update orchestration/cli.mjs to support:

node orchestration/cli.mjs plan demo-01


Writes capabilities/AUV-0101.yaml etc. + orchestration/graph/projects/demo-01.yaml.

Add DAG runner

Create orchestration/graph/spec.schema.yaml, orchestration/graph/runner.mjs.

Add “run project” to CLI:

node orchestration/cli.mjs run project demo-01


Patch prompts for patch/diff outputs

Rapid Builder, Frontend, API, Debugger: instruct to output unified diffs or {path, content} arrays.

Update CLAUDE.md (“Implementation outputs”) to standardize patch format.

Build lane

Create orchestration/lib/build_lane.mjs and orchestration/lib/gh.mjs.

First iteration can skip PRs and commit directly; add PRs in CI phase.

MCP router

Create mcp/router.mjs.

Update agent prompts: “request capability” not tool names.

Ensure scripts/hooks/pre_tool.py stays enforce-of-truth with agents.allowlist.

CI updates

Semgrep step + CVF-SEC.

Optional: matrix over discovered AUVs.

Packaging

Implement orchestration/report.mjs and orchestration/package.mjs.

Extend orchestration/cvf-check.mjs for CVF-PKG.

Docs

Append sections to docs/verify.md for AUV-010x after they are generated.

Update docs/ARCHITECTURE.md with DAG design and router.

11) Detailed File-by-File To-Do

New

orchestration/lib/auv_compiler.mjs

orchestration/lib/call_agent.mjs

orchestration/graph/spec.schema.yaml

orchestration/graph/projects/demo-01.yaml (generated)

orchestration/graph/runner.mjs

orchestration/lib/build_lane.mjs

orchestration/lib/gh.mjs

mcp/router.mjs

orchestration/report.mjs

orchestration/package.mjs

Update

orchestration/cli.mjs — add plan and run project commands.

orchestration/lib/test_authoring.mjs — support extra authoring_hints + auth/logins + before_steps.

orchestration/cvf-check.mjs — add cases for AUV-010x, CVF-SEC, CVF-PKG.

.github/workflows/ci.yml — add Semgrep & pkg/report artifact upload.

mcp/policies.yaml — expand capability_map, budgets, doc line noting PreToolUse enforcement.

mcp/registry.yaml — ensure tool metadata complete (tier, requires_api_key, side_effects).

CLAUDE.md — add “Output format for code changes” (patches/diffs), and “DAG awareness”: declare inputs/outputs.

Agent prompts: A2, Rapid Builder, Debugger, Quality Guardian, DevOps to reference router and output standards.

docs/ARCHITECTURE.md — include DAG runner and router diagrams.

docs/verify.md — new AUV sections as they’re added.

CHANGELOG.md — versions 0.3.0-demo01 after the first end-to-end brief is delivered.

## 12) Stretch: Visual Regressions & UX Proofs

**VRT (Visual Regression Testing):**
- **Primary**: Playwright's snapshot comparisons; artifacts in `runs/<AUV>/vrt/`
- **Optional MCP**: Percy (secondary tool) via policies with an override per DAG node

**UX Heuristics:**
- Add lighthouse accessibility category (AA minimum), and a CVF-A11Y gate

## 13) Example: End-to-End on a Real Brief

1. **Paste brief** → `briefs/demo-01/brief.md`
2. `node orchestration/cli.mjs plan demo-01` → AUV-0101.. + DAG file
3. `node orchestration/cli.mjs run project demo-01`
4. **Orchestrator executes** parse-brief → author-tests → implement → verify → repair loops
5. **Results flow** to `/runs/demo-01/*`, and a final `/dist/demo-01.zip` + `report.html`
6. **PRs opened automatically** per AUV; CI enforces Playwright, Lighthouse, CVF, Semgrep
7. **You approve merges**; system packages delivery; client gets artifacts & proofs

## 14) What this unlocks

- **Feed almost arbitrary project briefs**; Swarm1 explodes them into tractable, testable capabilities
- **Parallel agent work** under strict policy + budget, with deterministic gates and automatic repair
- **Client receives** not only a working product but a provenance trail of how it was built and verified

---

*If you want, I can generate starter files for each of the "New" modules above (skeleton code and comments) so you can drop them into the repo and begin wiring immediately.*