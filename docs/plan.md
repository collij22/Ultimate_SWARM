# Swarm1 — Enhanced Technical Roadmap (Production-Grade)

## 0. Current State (Ground Truth)

### ✅ Working Today (Post Phase 1 - Completed 2025-09-06)

- **Autopilot (runbook)**: `node orchestration/cli.mjs <AUV-ID>` → starts `mock/server.js` (with health check to prevent double starts), runs Playwright specs, Lighthouse perf, CVF gate, writes versioned result cards to `runs/<AUV>/result-cards`
- **AUVs**: 0002 (list/detail), 0003 (search/filter), 0004 (cart summary), 0005 (checkout) ALL verified locally AND in CI with full CVF artifacts validation
- **Test auto-authoring**: `orchestration/lib/test_authoring.mjs` generates specs from `capabilities/<AUV>.yaml` authoring hints (cart vs products pages handled)
- **Contracts**: `contracts/openapi.yaml` now mirrors real `/health` root and `/api/*` endpoints
- **Hooks & Observability**: `scripts/hooks/*.py` emit to `runs/observability/hooks.jsonl` and result-cards per session/subagent
- **MCP**: `mcp/registry.yaml` + `mcp/policies.yaml` define capability → tool mapping & allowlist; runtime router not built yet
- **CI Pipeline**: Simplified to use autopilot as single source of truth for AUV-0002..0005 with full artifact validation
- **Validation**: Result cards validated with ajv-cli against `schemas/runbook-summary.schema.json`
- **Error Handling**: Typed exit codes (101-105), structured failure cards, transient failure retry logic
- **Shared Artifacts Module**: `orchestration/lib/expected_artifacts.mjs` provides single source of truth for artifact expectations across runbook and CVF
- **Node Version Constraint**: Package.json enforces Node.js v20.x for consistency

### ❌ Gaps (to Full Autonomy)

- ✅ ~~No brief→AUV compiler~~ (Phase 2 completed)
- No DAG runner
- No runtime MCP router
- No autonomous code build lane/PR flow
- Partial CI gates (security/visual)
- No packaging/report module
- No durable workflow backend

### 📝 Note on Documentation
- Deleted `docs/phase1_correction.md` as Phase 1 is now complete and corrections have been applied
- `docs/phase_chat.md` is a working document for ongoing phase tracking (not part of formal documentation)

---

## Phase 1: Foundation Hardening & Reliability ✅ COMPLETED (2025-09-06)

### Objective
Bulletproof the current pipeline and codify "definition of done" (DoD) per AUV.

### 🎯 Deliverables (All Completed)

#### ✅ DoD Contract (`docs/QUALITY-GATES.md` updated)
- Green Playwright with retry logic for transient failures
- Lighthouse ≥ 0.9 perf score (AUV-specific budgets)
- CVF PASS with proper artifact validation
- Zero hook errors with consistent ENV propagation

#### ✅ Error-Hardened Autopilot
- Wrapped `orchestration/cli.mjs` and `runbooks/auv_delivery.mjs` with typed exit codes (101-105)
- Structured failure cards with version field for consistency
- Server health check to prevent double starts

#### ✅ Test Authoring Stability
- Deterministic generation and idempotent writes in `orchestration/lib/test_authoring.mjs`
- Fixed AUV-0002 spec configuration to generate correct artifacts

#### ✅ CI Parity
- Added AUV-0002, 0004 & AUV-0005 to CI using autopilot as single source of truth
- Simplified CI workflow eliminating duplication
- Added resilient artifact validation with `if: always()` safeguards

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
- Now imports from shared `orchestration/lib/expected_artifacts.mjs` module

#### `.github/workflows/ci.yml`
- Duplicate the 0003 block for 0004 and 0005 (ensure `mkdir -p runs/AUV-000X/perf` before Lighthouse)
- Upload `runs/**` and `test-results/**` always

### ✅ Acceptance & Proofs (Verified)
- All 0002–0005 pass locally and in CI consistently
- For each AUV run:
  - `runs/<AUV>/perf/lighthouse.json` (score and LCP logged) ✓
  - `runs/<AUV>/ui/*.png` as defined by CVF ✓
  - `runs/<AUV>/result-cards/runbook-summary.json` with `ok: true` and version field ✓
- Result cards validated with `npm run validate:cards` using ajv-cli ✓
- Artifact consistency verified with `orchestration/lib/artifact_consistency.mjs` (now using shared module) ✓
- Shared artifact definitions prevent runbook/CVF drift ✓

---

## Phase 2: Brief Intake & AUV Compiler ✅ COMPLETED (2025-09-06)

### Objective
Convert an Upwork-style brief into a backlog of AUVs (capabilities + hints), with estimates and acceptance criteria.

### 🎯 Deliverables (All Completed)

#### ✅ Brief Schema
- `contracts/brief.schema.json` (JSON Schema draft-07) with `business_goals[]`, `must_have[]`, `nice_to_have[]`, `constraints{budget_usd, timeline_days}`

#### ✅ Compiler
- `orchestration/lib/auv_compiler.mjs`:
  - NLP-based capability extraction for e-commerce, SaaS, API, and data domains
  - Smart dependency inference (cart→checkout, UI→API relationships)
  - Generates authoring hints matching mock server implementation
  - Budget estimation based on complexity scoring

#### ✅ Brief Validation
- `orchestration/lib/validate_brief.mjs`:
  - Parses MD/YAML/JSON brief formats
  - Validates against schema with human-friendly errors
  - Extracts structured data from markdown sections

#### ✅ Backlog & Status
- `capabilities/backlog.yaml`: ordered list with dependencies, estimates{tokens,mcp_usd,time_hours}
- Generated from demo brief with 8 AUVs and correct dependency graph

#### ✅ Requirements Integration
- `orchestration/lib/call_agent.mjs` invokes Requirements Analyst or uses heuristic extraction
- Outputs to `reports/requirements/<RUN-ID>.json`

### 🔧 File Changes

#### `capabilities/templates/AUV-TEMPLATE.yaml`
- Template with acceptance criteria, artifacts.required[], authoring_hints (ui/api)

#### CLI Integration
- `node orchestration/cli.mjs plan briefs/demo-01/brief.md --dry-run`
- `node orchestration/cli.mjs validate auv AUV-0101`
- `node orchestration/cli.mjs AUV-0101` (executes generated AUVs)

#### Dynamic Loading
- `orchestration/runbooks/auv_delivery.mjs` - loads AUV configs from capabilities directory
- `orchestration/lib/expected_artifacts.mjs` - dynamic artifact lookup from capability YAMLs

### ✅ Acceptance & Proofs (Verified)
- Sample brief in `briefs/demo-01/brief.md` generates 8 AUVs with correct dependencies ✓
- Generated AUVs execute successfully: AUV-0101 and AUV-0102 both pass with 100% Lighthouse ✓
- Tests auto-authored and pass locally with green CVF ✓
- 14 unit tests passing for brief validation and compiler hints ✓

---

## Phase 3: DAG Runner & Parallel Orchestration ✅ COMPLETED (2025-09-06)

### Objective
Execute multiple AUVs and their internal steps in parallel with dependency, retries, and repair.

### 🎯 Deliverables (All Completed with Hardening)

#### ✅ Graph Spec
- `orchestration/graph/spec.schema.yaml`: JSON Schema for DAG specification with nodes, edges, resources, retries

#### ✅ Runner (Production-Hardened)
- `orchestration/graph/runner.mjs`:
  - Executes nodes (server, playwright, lighthouse, cvf, agent_task, package, report)
  - Resource locks with deadlock prevention (sorted acquisition)
  - Fan-out/fan-in parallel execution (60%+ time reduction)
  - Retries with exponential backoff for transient failures
  - **HARDENED**: Server lifecycle management with automatic cleanup
  - **HARDENED**: Unix process group termination support
  - **FIXED**: AUV_ID extraction from node IDs for correct artifact paths
  - Emits events to `runs/observability/hooks.jsonl`

#### ✅ State & Resume
- `runs/graph/<RUN-ID>/state.json` with per-node status
- Resume capability with `--resume <RUN-ID>` flag
- Crashed nodes marked as failed on resume

#### ✅ Backlog Compiler
- `orchestration/graph/compile_from_backlog.mjs`:
  - Transforms `capabilities/backlog.yaml` to executable graph
  - Generates 3 nodes per AUV (ui, perf, cvf)
  - Respects `depends_on` relationships

### 🔧 Critical Fixes & Hardening Applied

#### ✅ AUV_ID Environment Variable Fix
- **Problem**: Node IDs like "AUV-0101-ui" incorrectly used as AUV_ID
- **Solution**: Extract base AUV ID using regex `/^AUV-\d{4}/`
- **Result**: Artifacts now written to correct directories

#### ✅ Server Lifecycle Management
- Added `serverProc` and `serverStartedByRunner` tracking
- Implemented `stopServer()` method with cleanup logic
- Cleanup in finally block ensures no orphaned processes
- 250ms delay for graceful port release

#### ✅ Unix Process Group Termination
- Spawn with `detached: true` on Unix systems
- Call `proc.unref()` to prevent blocking parent exit
- Use `process.kill(-pid)` for reliable group termination

### ✅ Acceptance & Proofs (Verified)
- Demo graph with 8 AUVs (25 nodes, 27 edges) executes in parallel ✓
- Concurrency=3 reduces execution time by 60%+ ✓
- Resource locks prevent server conflicts ✓
- State persistence enables crash recovery ✓
- All tests passing: schema, parallelization, AUV-ID, process cleanup ✓
- CI/CD ready with no orphaned processes or port conflicts ✓

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

### ✅ Phase-1 Closeout (COMPLETED)
- ✅ Added AUV-0002/0004/0005 to CI using autopilot approach
- ✅ Hardened `cli.mjs` exit codes (101-105) + summary card fields (version, durations, env, steps)
- ✅ Ensured `cvf-check.mjs` includes 0004/0005 and fixed AUV-0002 spec mapping
- ✅ Added validation pipeline with ajv-cli
- ✅ Fixed ENV propagation and server health checks
- ✅ Extracted shared `expected_artifacts.mjs` module to prevent drift
- ✅ Added Node.js v20.x engine constraint for consistency
- ✅ Added artifact validation assertions in consistency check

### ✅ Phase-2 Closeout (COMPLETED)
- ✅ Added `contracts/brief.schema.json` with JSON Schema draft-07 validation
- ✅ Built `orchestration/lib/auv_compiler.mjs` with NLP capability extraction
- ✅ Created `orchestration/lib/validate_brief.mjs` for MD/YAML/JSON parsing
- ✅ Implemented `orchestration/lib/call_agent.mjs` for requirements extraction
- ✅ Added sample brief `briefs/demo-01/brief.md` generating 8 AUVs
- ✅ Extended CLI with plan, validate brief, and validate auv commands
- ✅ Fixed dynamic AUV loading and artifact validation
- ✅ Added comprehensive unit tests (14 passing)

### ✅ Phase-3 Closeout (COMPLETED with Hardening)
- ✅ Created `orchestration/graph/spec.schema.yaml` with full JSON Schema validation
- ✅ Built `orchestration/graph/runner.mjs` with parallel execution, retries, and resource locks
- ✅ Implemented state persistence and resume capability
- ✅ Created backlog-to-graph compiler for automatic DAG generation
- ✅ Extended CLI with run-graph and graph-from-backlog commands
- ✅ Generated demo-01.yaml graph with 8 AUVs (25 nodes, 27 edges)
- ✅ Fixed AUV_ID environment variable extraction from node IDs
- ✅ Added server lifecycle management with automatic cleanup
- ✅ Implemented Unix process group termination support
- ✅ Created comprehensive test suite (18 tests passing)
- ✅ Verified 60%+ performance improvement with parallel execution

### 🚀 Kick Off Phase-4 (NEXT)
- Design `mcp/router.mjs` for runtime tool selection based on capabilities
- Implement capability → tool mapping with Primary/Secondary tier logic
- Add budget and side-effect tracking for tool usage
- Create dry-run fixtures for router validation

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