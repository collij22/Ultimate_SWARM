# Swarm1 — Enhanced Technical Roadmap (Production-Grade)

## 0. Current State (Ground Truth)

### ✅ Working Today

- **Autopilot (runbook)**: `node orchestration/cli.mjs <AUV-ID>` → starts `mock/server.js`, runs Playwright specs, Lighthouse perf, CVF gate, writes result card to `runs/<AUV>/result-cards`
- **AUVs**: 0002 (list/detail), 0003 (search/filter), 0004 (cart summary), 0005 (checkout) verified locally with CVF artifacts; 0002 & 0003 wired in CI (green)
- **Test auto-authoring**: `orchestration/lib/test_authoring.mjs` generates specs from `capabilities/<AUV>.yaml` authoring hints (cart vs products pages handled)
- **Contracts**: `contracts/openapi.yaml` now mirrors real `/health` root and `/api/*` endpoints
- **Hooks & Observability**: `scripts/hooks/*.py` emit to `runs/observability/hooks.jsonl` and result-cards per session/subagent
- **MCP**: `mcp/registry.yaml` + `mcp/policies.yaml` define capability → tool mapping & allowlist; runtime router not built yet

### ❌ Gaps (to Full Autonomy)

- No brief→AUV compiler
- No DAG runner
- No runtime MCP router
- No autonomous code build lane/PR flow
- Partial CI gates (security/visual)
- No packaging/report module
- No durable workflow backend

---

## Phase 1: Foundation Hardening & Reliability (2–3 weeks)

### Objective
Bulletproof the current pipeline and codify "definition of done" (DoD) per AUV.

### 🎯 Deliverables

#### DoD Contract (`docs/QUALITY-GATES.md` update)
- Green Playwright
- Lighthouse ≥ 0.9 perf score (AUV-specific budgets)
- CVF PASS
- Zero hook errors

#### Error-Hardened Autopilot
- Wrap `orchestration/cli.mjs` and `runbooks/auv_delivery.mjs` with typed exit codes and structured failure cards

#### Test Authoring Stability
- Deterministic generation and idempotent writes in `orchestration/lib/test_authoring.mjs`

#### CI Parity
- Add AUV-0004 & AUV-0005 jobs mirroring local flow; artifact upload maintained

### 🔧 File Changes

#### `orchestration/cli.mjs`
- Write `runs/<AUV>/result-cards/runbook-summary.json` with `{ ok, steps, durations, env }`
- Return 10x series exit codes: 101 Playwright, 102 Lighthouse, 103 CVF, etc.

#### `orchestration/runbooks/auv_delivery.mjs`
- Guard spawn errors; Windows-safe shell quoting (already partially fixed)
- Retry policy: single retry on transient failures (HTTP 5xx, browser crash)

#### `orchestration/lib/test_authoring.mjs`
- Ensure `ensureTests()` is pure & deterministic (no nondeterministic timestamps)
- Add `authoring_hints.api.base_path` normalization (already added)

#### `orchestration/cvf-check.mjs`
- Ensure AUV-0004 (`ui/cart_summary.png`, `perf/lighthouse.json`) and AUV-0005 (`ui/checkout_success.png`, `perf/lighthouse.json`) are recognized

#### `.github/workflows/ci.yml`
- Duplicate the 0003 block for 0004 and 0005 (ensure `mkdir -p runs/AUV-000X/perf` before Lighthouse)
- Upload `runs/**` and `test-results/**` always

### ✅ Acceptance & Proofs
- All 0002–0005 pass locally and in CI; two CI runs in a row green
- For each AUV run:
  - `runs/<AUV>/perf/lighthouse.json` (score and LCP logged)
  - `runs/<AUV>/ui/*.png` as defined by CVF
  - `runs/<AUV>/result-cards/runbook-summary.json` with `ok: true`

---

## Phase 2: Brief Intake & AUV Compiler (3–4 weeks)

### Objective
Convert an Upwork-style brief into a backlog of AUVs (capabilities + hints), with estimates and acceptance criteria.

### 🎯 Deliverables

#### Brief Schema
- `contracts/brief.schema.json` (JSON Schema) with `business_goals[]`, `must_have[]`, `nice_to_have[]`, `constraints{budget, timeline, env}`, `sample_urls[]`

#### Compiler
- `orchestration/lib/auv_compiler.mjs`:
  - Parses brief → emits AUV manifest + capability files under `capabilities/`
  - Applies templates from `capabilities/templates/*.yaml`
  - Generates initial `authoring_hints` for test authoring

#### Backlog & Status
- `capabilities/backlog.yaml`: ordered list of AUV-IDs, dependencies (DAG edges), status (planned|in-progress|blocked|done), budgets

#### Requirements Analyst Agent Integration
- `orchestration/lib/call_agent.mjs` thin wrapper to invoke A2 (Requirements Analyst) → produce `reports/requirements/<RUN-ID>.json` aligned to `brief.schema.json`

### 🔧 File Changes

#### `capabilities/templates/AUV-TEMPLATE.yaml`
- Placeholders for acceptance, artifacts, authoring_hints (ui/api)

#### `orchestration/lib/auv_compiler.mjs`
- Inputs: raw brief text or structured JSON
- Outputs: `capabilities/AUV-xxxx.yaml`, append to `capabilities/backlog.yaml`

#### `docs/ORCHESTRATION.md`
- Add "Brief → Backlog" section and show single command: `node orchestration/compile_brief.mjs path/to/brief.md`

### ✅ Acceptance & Proofs
- Given a sample brief, compiler emits ≥3 AUVs with dependency edges
- Playwright specs for first AUV auto-generated and pass locally
- `reports/requirements/*.json` stored, referenced by the created AUVs

---

## Phase 3: DAG Runner & Parallel Orchestration (4–5 weeks)

### Objective
Execute multiple AUVs and their internal steps in parallel with dependency, retries, and repair.

### 🎯 Deliverables

#### Graph Spec
- `orchestration/graph/spec.schema.yaml`: nodes{ id, type, inputs, outputs, retries, resources, onFail }, edges[]

#### Runner
- `orchestration/graph/runner.mjs`:
  - Executes nodes (agent_task, playwright, lighthouse, cvf, package, report)
  - Resource locks (e.g., build/migration), fan-out/fan-in, retries with exponential backoff
  - Emits events to `runs/observability/hooks.jsonl`

#### State & Resume
- `runs/graph/<RUN-ID>/state.json` with per-node status; resume flag to continue after crash

### 🔧 File Changes

#### `orchestration/cli.mjs`
- New subcommand: `node orchestration/cli.mjs run-graph capabilities/backlog.yaml` → compiles to graph and runs

#### `docs/ORCHESTRATION.md`
- "DAG execution" section with example graph YAML and resume semantics

### ✅ Acceptance & Proofs
- A backlog with 3 dependent AUVs executes in parallel where possible, total wall time < serial sum
- `runs/graph/<RUN-ID>/state.json` shows retries & final PASS

---

## Phase 4: MCP Router (Runtime) & Dynamic Tooling (2–3 weeks)

### Objective
Agents request capabilities; router decides tools under budget and policy at runtime.

### 🎯 Deliverables

#### Router
- `mcp/router.mjs`:
  - Input: `{ agent, capabilities[], budget_usd }`
  - Sources: `mcp/policies.yaml` (capability_map, agents.allowlist), `mcp/registry.yaml` (tool metadata)
  - Output: resolved `tool_plan[]` with budgets and side-effects notes

#### Dry-run & Fixtures
- `mcp/router-fixtures/*.json` + `npm run router:dry` to verify mappings

#### Telemetry
- Append to `runs/observability/hooks.jsonl` tool selections with chosen vs rejected

### 🔧 File Changes

#### `mcp/policies.yaml`
- Add `router.defaults` (global budget ceilings, preferred tiers)

#### `docs/SWARM1-GUIDE.md`
- Brief "capabilities → tools (runtime)" section, link to router dry-run

### ✅ Acceptance & Proofs
- For two sample capability sets ("security.scan + code.static_analysis", "browser.journey + screenshot"), router chooses Primary tools first, Secondary only when explicitly allowed and budget ≥ threshold
- Dry-run snapshots under `runs/router/*`

---

## Phase 5: Autonomous Build Lane (4–5 weeks)

### Objective
Let agents make changes to the repo in a controlled way, open PRs, and pass gates automatically.

### 🎯 Deliverables

#### Build Lane
- `orchestration/lib/build_lane.mjs`:
  - Steps: branch → workspace → apply patches → lint/format → unit tests → record diff → commit → push → open PR
  - Idempotent; safe on Windows

#### PR Template & Metadata
- `.github/pull_request_template.md` with AUV ID, artifacts, checklists
- Commit message convention: `AUV-xxxx: <short>`

#### Patch Representation
- `runs/<AUV>/patches/*.diff` + `changeset.json` (file list and rationales)

#### Specialist Agents Integration
- Orchestrator invokes B7 Rapid Builder, B8 Frontend Specialist, B9 Backend Specialist with explicit tool_allowlist injected by the router

### 🔧 File Changes

#### `package.json`
- Scripts: lint, format, typecheck

#### Linting & Formatting
- `.eslintrc`, `.prettierrc`, optional `tsconfig.json` (if adding TS to orchestration libs)

#### `docs/QUALITY-GATES.md`
- Add lint and typecheck as QA gates before CVF

### ✅ Acceptance & Proofs
- A trivial AUV that adds a route or UI change is auto-implemented on a branch, PR opened with:
  - Diff, artifacts, and a green CI (Playwright + Lighthouse + CVF + QA)

---

## Phase 6: Advanced Verification & Security Gates (2–3 weeks)

### Objective
Bring security/visual to parity and export machine-readable reports.

### 🎯 Deliverables

#### Security
- Semgrep + Gitleaks
- Fail CI on Semgrep P0/P1 and any secret; publish JSON findings

#### Visual Regression
- Visual lane using Playwright snapshots (or visual-compare MCP)
- Thresholds per route; artifacts in `runs/visual/*`

#### Performance Budgets
- Enforce budgets by route; fail on regressions beyond delta

### 🔧 File Changes

#### `.github/workflows/ci.yml`
- Add jobs: `security:semgrep`, `security:gitleaks`, `visual:compare`
- `reports/security/*.json` and `reports/visual/*.json` written on every PR

#### `docs/QUALITY-GATES.md`
- Budget table and failure policies

### ✅ Acceptance & Proofs
- CI fails if you introduce a P0 Semgrep finding or a secret
- Visual diff artifacts uploaded; budgets enforced

---

## Phase 7: Packaging & Client Delivery (2–3 weeks)

### Objective
Produce a polished, self-contained deliverable with provenance and a human-readable report.

### 🎯 Deliverables

#### Packager
- `orchestration/package.mjs`:
  - Creates `/dist/<AUV>/package.zip` containing `/runs/<AUV>/`, relevant source diffs, and `/docs/*` slices
  - Includes `manifest.json` (checksums, timings, versions, CI run ID)

#### Report
- `orchestration/report.mjs`:
  - HTML report from templates in `orchestration/report-templates/*`, embedding CVF results and screenshots

#### Client Handover
- `docs/operate.md` (operational runbook), `docs/verify.md` slice, CHANGELOG excerpt

### 🔧 File Changes

#### `docs/ORCHESTRATION.md`
- Add "Packaging & Report" section with `node orchestration/package.mjs AUV-xxxx`

#### `.github/workflows/ci.yml`
- Optional job to upload `/dist` as release artifact

### ✅ Acceptance & Proofs
- For AUV-0005, `dist/AUV-0005/package.zip` contains artifacts and an HTML report; checksums recorded

---

## Phase 8: Durable Workflows & Production Hardening (3–4 weeks)

### Objective
Move beyond CLI runs to durable, multi-tenant, observable execution.

### 🎯 Deliverables

#### Durable Engine (Choose One)
- Temporal (Node SDK) or BullMQ + Redis
- Queue "run AUV graph" jobs; support pause/resume/cancel

#### Auth & Multi-tenant
- SSO (OIDC) and per-tenant namespaces for artifacts and budgets

#### Observability
- `reports/status.json` + Grafana dashboards sourced from `runs/observability/hooks.jsonl`

#### DR & Backups
- Snapshot `runs/` & `/dist/` to object storage with retention policies

### 🔧 File Changes

#### `orchestration/services/worker.mjs`
- Queue consumer

#### `docs/ARCHITECTURE.md`
- Production section updated with sequence diagrams & SLOs

### ✅ Acceptance & Proofs
- A multi-AUV brief executes non-interactively via a queue
- Can recover after a worker restart; reports accessible

---

## Success Metrics

- **Cycle time**: AUV delivered in ≤ 5 min locally; ≤ 10 min in CI
- **Reliability**: ≥ 95% success on standard AUVs w/ autosetup
- **Autonomy**: ≤ 1 human touch for non-ambiguous briefs
- **Quality**: All gates Green (QA/Security/Perf/CVF) with artifacts

---

## Immediate Next Actions (This Week)

### Phase-1 Closeout
- Add AUV-0004/0005 to CI (Playwright + LH + CVF); keep artifacts
- Harden `cli.mjs` exit codes + summary card fields (durations, env)
- Ensure `cvf-check.mjs` includes 0004/0005 (it does locally; mirror in CI)

### Kick Off Phase-2
- Add `contracts/brief.schema.json` (initial minimal schema)
- Scaffold `orchestration/lib/auv_compiler.mjs` (CLI + fixture brief under `examples/briefs/*.md` → `capabilities/backlog.yaml` + first AUV-1xxx.yaml)
- Wire `orchestration/lib/call_agent.mjs` to invoke A2 (Requirements Analyst) and persist `reports/requirements/*.json`

### Docs
- Update `docs/ORCHESTRATION.md` with Brief→Backlog quickstart and the CLI snippet
- Append the new AUV CVF examples (0004/0005) if not already present

---

## Appendices (Schemas & Examples)

### A. Brief Schema (v0)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Swarm1 Brief",
  "type": "object",
  "properties": {
    "business_goals": { "type": "array", "items": { "type": "string" } },
    "must_have": { "type": "array", "items": { "type": "string" } },
    "nice_to_have": { "type": "array", "items": { "type": "string" } },
    "constraints": {
      "type": "object",
      "properties": {
        "budget_usd": { "type": "number" },
        "timeline_days": { "type": "integer" },
        "environments": { "type": "array", "items": { "type": "string" } }
      }
    },
    "sample_urls": { "type": "array", "items": { "type": "string", "format": "uri" } }
  },
  "required": ["business_goals", "must_have"]
}
```

### B. AUV Template (Capabilities)

```yaml
id: AUV-XXXX
title: Short capability title
depends_on: []
acceptance:
  - "User can …"
  - "API … returns …"
artifacts_required:
  cvf:
    - "runs/${AUV}/ui/<proof>.png"
    - "runs/${AUV}/perf/lighthouse.json"
authoring_hints:
  ui:
    page: /products.html
    search_input: "#q"
    apply_button_text: "Apply"
  api:
    base_path: /products
    cases:
      - name: list returns 200 and array
        query: ""
        expect: list_ok
```

### C. Graph Spec (v0)

```yaml
nodes:
  - id: auv-0003-ui
    type: playwright
    specs: ["tests/robot/playwright/products-filter.spec.ts"]
    retries: { max: 1, backoff_ms: 1000 }
  - id: auv-0003-perf
    type: lighthouse
    url: "${STAGING_URL}/products.html"
  - id: auv-0003-cvf
    type: cvf
    auv: "AUV-0003"
edges:
  - [auv-0003-ui, auv-0003-perf]
  - [auv-0003-perf, auv-0003-cvf]
```

---

## Why This Version Is Better

- Maps each phase → files → CI → proofs so nothing is "hand-wavy"
- Uses your current repo truths (autopilot, capabilities, CVF, hooks) rather than generic agent talk
- Keeps the end game squarely on Upwork-style, multi-AUV deliveries with evidence, packaging, and budgets