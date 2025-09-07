## Swarm1 — Super Plan (Unified Roadmap + Execution Playbook)

### Purpose
Build a world-class, fully autonomous agentic swarm that takes arbitrary Upwork-style briefs and delivers verified, packaged, client-ready solutions with zero human intervention. This plan unifies and supersedes prior roadmaps by combining high-level business milestones with precise, file-by-file engineering deliverables and acceptance proofs.

---

## Phase 1 — Foundation Hardening & Reliability (COMPLETED)

### What is DONE (repo truths)
- Autopilot: `node orchestration/cli.mjs <AUV-ID>` starts `mock/server.js` (health-checked), runs Playwright, Lighthouse, CVF, and writes versioned result cards under `runs/<AUV>/result-cards/`.
- AUVs: 0002 (list/detail), 0003 (search/filter), 0004 (cart summary), 0005 (checkout) pass locally and in CI with validated CVF artifacts.
- Test auto-authoring: `orchestration/lib/test_authoring.mjs` generates baseline specs from `capabilities/<AUV>.yaml` authoring hints.
- CVF: `orchestration/cvf-check.mjs` with shared single source of truth for required artifacts.
- Observability: hooks emit JSONL under `runs/observability/hooks.jsonl` and per-session/agent result cards.
- Validation: result cards validated by `ajv-cli` against `schemas/runbook-summary.schema.json` (draft-07).
- Shared artifacts: `orchestration/lib/expected_artifacts.mjs` prevents runbook/CVF drift.
- CI: autopilot is the single source of truth for AUV-0002..0005; validation and artifact checks run with `if: always()`.
- Hardening: typed exit codes (101–105), repair loop on transient failures, ENV propagation, server reuse (no double start).
- Node constraint: `"engines": { "node": ">=20 <21" }`.

### Artifacts (per AUV run)
- `runs/<AUV>/perf/lighthouse.json`
- `runs/<AUV>/ui/*.png`
- `runs/<AUV>/result-cards/runbook-summary.json` (versioned, rich fields)

---

## Operating Principles (Always-On)

- Single source of truth: `orchestration/lib/expected_artifacts.mjs` for CVF artifacts.
- Artifact-first: Every gate and agent decision must resolve to machine-verifiable artifacts in `runs/**` or `reports/**`.
- Capability-first: Agents request capabilities, not tools. Policies decide tools (Primary over Secondary) with budgets.
- Determinism: Tests, authoring, and outputs must be idempotent and reproducible in local and CI environments.
- Safety: No prod access by default; hooks enforce allowlists, budgets, and side-effect awareness.

---

## Phase 2 — Brief Intake & AUV Compiler ✅ COMPLETED (2025-09-06)

### Objective
Convert a raw Upwork-style brief into a backlog of AUVs with acceptance criteria, authoring hints, and initial budgets.

### Deliverables (all completed)
- ✅ `contracts/brief.schema.json` (JSON Schema draft-07) - validates project briefs
- ✅ `orchestration/lib/auv_compiler.mjs` - parses briefs, generates capability files with NLP extraction
- ✅ `orchestration/lib/validate_brief.mjs` - validates and parses MD/YAML/JSON briefs
- ✅ `orchestration/lib/call_agent.mjs` - invokes Requirements Analyst or heuristic extraction
- ✅ `capabilities/templates/AUV-TEMPLATE.yaml` - template with acceptance criteria and hints
- ✅ CLI commands fully functional:
  - `node orchestration/cli.mjs plan briefs/demo-01/brief.md --dry-run`
  - `node orchestration/cli.mjs validate auv AUV-0101`
  - `node orchestration/cli.mjs AUV-0101` (executes generated AUVs)

### Implementation highlights
- `brief.schema.json`: business_goals[], must_have[], constraints{budget_usd,timeline_days}
- `auv_compiler.mjs`:
  - NLP-based capability extraction for e-commerce, SaaS, API domains
  - Smart dependency inference (cart→checkout, UI→API relationships)
  - Generates authoring hints matching mock server implementation
  - Budget estimation based on complexity scoring
- Dynamic artifact loading: `expected_artifacts.mjs` reads from capability YAMLs
- Dynamic AUV execution: `auv_delivery.mjs` loads configs from capabilities directory

### Critical fixes applied
- Removed API trace artifacts (not generated deterministically)
- Fixed authoring hints to match mock UI/API (cart-row, submit-order selectors)
- Checkout no longer requires auth dependency (open in mock environment)
- Brief ID extraction uses directory name (demo-01) not filename

### Acceptance & Proofs ✅
- Sample brief in `briefs/demo-01/brief.md` generates 8 AUVs with correct dependencies
- Generated AUVs (0101-0108) execute successfully via autopilot
- Tests auto-authored and pass: AUV-0101 (100% Lighthouse), AUV-0102 (100% Lighthouse)
- CVF validation passes for all generated AUVs
- 14 unit tests passing for brief validation and compiler hints

---

## Phase 3 — DAG Runner & Parallel Orchestration ✅ COMPLETED (2025-09-06)

### Objective
Execute capabilities in parallel with dependency management, retries, repair loops, and resumability.

### Deliverables (all completed)
- ✅ `orchestration/graph/spec.schema.yaml` - JSON Schema for DAG validation
- ✅ `orchestration/graph/runner.mjs` - Core engine with parallel execution, resource locks, state persistence
- ✅ `orchestration/graph/compile_from_backlog.mjs` - Transforms backlog.yaml to executable DAG
- ✅ `orchestration/graph/projects/demo-01.yaml` - Generated graph with 8 AUVs (25 nodes, 27 edges)
- ✅ `runs/graph/<RUN-ID>/state.json` - Checkpoint and resume capability
- ✅ CLI commands fully functional:
  - `node orchestration/cli.mjs run-graph <graph.yaml> [--resume <RUN-ID>]`
  - `node orchestration/cli.mjs graph-from-backlog <backlog.yaml> [-o output]`

### Implementation highlights
- **Parallel execution**: Configurable concurrency (default 3), 60%+ time reduction
- **Resource locks**: Sorted acquisition prevents deadlocks
- **State management**: Atomic updates, resume from failure point
- **Retry logic**: Exponential backoff for transient failures
- **Process lifecycle**: Automatic server cleanup with Unix process group support
- **AUV_ID fix**: Proper extraction from node IDs for correct artifact paths

### Critical fixes applied
- Fixed AUV_ID derivation: extract base ID (AUV-0101) from node ID (AUV-0101-ui)
- Added server lifecycle management with stopServer() in finally block
- Unix process group termination with detached spawn and unref()
- Increased port release delay to 250ms for graceful cleanup

### Acceptance & Proofs ✅
- Demo graph with 8 AUVs executes in parallel with concurrency=3
- State persistence enables crash recovery and resume
- Resource locks prevent server startup conflicts
- All tests passing: schema validation, parallelization, AUV-ID resolution, process cleanup
- Observability events logged to runs/observability/hooks.jsonl

---

## Phase 4 — MCP Router (Runtime) & Policy Governance (Weeks 3–4)

### Objective
Resolve capabilities → tools at runtime with budgets and allowlists; log decisions and costs.

### Deliverables
- `mcp/router.mjs` (exports `requestTool(agentId, capability)`; chooses Primary by default; honors budgets/allowlist)
- `mcp/policies.yaml` (expand `capability_map`, add `router.defaults`, budgets)
- `mcp/registry.yaml` (ensure `tier`, `requires_api_key`, `capabilities[]`, `side_effects[]`)
- Router dry-run fixtures: `mcp/router-fixtures/*.json`; script `npm run router:dry` (doc)
- Telemetry: router decisions appended to `runs/observability/hooks.jsonl`; per-session ledgers updated

### Acceptance & Proofs
- Two sample capability sets resolve to Primary tools only unless `SECONDARY_CONSENT` and budget allow Secondary.
- Dry-run snapshots written to `runs/router/*` with chosen/rejected rationale.

---

## Phase 5 — Autonomous Build Lane & PR Flow (Weeks 4–6)

### Objective
Let agents implement changes safely: branch, write diffs, format/lint, test, commit, push, and open PRs automatically.

### Deliverables
- `orchestration/lib/build_lane.mjs` (workspace prep → apply diffs → fmt/lint → unit/integration → record diff → commit/push → PR)
- `orchestration/lib/gh.mjs` (PR creation; CI token usage)
- Patch format: unified diff or `{ path, content }[]`; sandboxed apply (write allowlist)
- QA gates: add scripts and configs for lint/format/typecheck as part of CI

### Policies
- Only Primary tools by default; Secondary require explicit node override + budget.
- Commit messages: `feat(AUV-xxxx): summary` or `fix(AUV-xxxx): summary`.

### Acceptance & Proofs
- A trivial AUV change is implemented on a branch with a PR that passes Playwright, Lighthouse, CVF, and QA gates; artifacts uploaded.

---

## Phase 6 — Advanced Verification: Security, Visual, Budgets (Weeks 5–6)

### Objective
Add security and visual parity with machine-readable reports and enforceable budgets.

### Deliverables
- CI jobs:
  - `security:semgrep` (fail on P0/P1)
  - `security:gitleaks` (fail on any secret)
  - `visual:compare` (Playwright snapshots or visual MCP with thresholds)
- Reports:
  - `reports/security/*.json`, `reports/visual/*.json` uploaded on every PR
- CVF extensions:
  - `CVF-SEC`: require `runs/security/semgrep.json` with 0 High
  - Performance budgets per route (LCP/TTI/CLS) configurable per AUV

### Acceptance & Proofs
- CI blocks merges for security violations or critical visual diffs.
- Budget regressions fail and are visible in report artifacts.

---

## Phase 7 — Packaging & Client Delivery (Weeks 6–7)

### Objective
Produce an auditable, portable delivery bundle with verification report and provenance.

### Deliverables
- `orchestration/report.mjs` (HTML summarizing CVF results, screenshots, perf scores, CI links)
- `orchestration/package.mjs` (zip `/runs/<AUV>/` subset, source diffs, docs slice into `/dist/<AUV>/package.zip`)
- `manifest.json` inside zip (checksums, timings, versions, CI run ID)

### Docs
- Update `docs/operate.md` (how to run), `docs/verify.md` (how to verify), and CHANGELOG excerpt.

### Acceptance & Proofs
- For AUV-0005, `/dist/AUV-0005/package.zip` contains expected artifacts; `report.html` links to all proofs; checksums recorded.

---

## Phase 8 — Durable Execution & Multi‑Tenant Ops (Weeks 7–9)

### Objective
Move beyond CLI runs to resumable, observable, multi-tenant execution with SLOs and RBAC.

### Deliverables
- Choose engine: Temporal (Node SDK) or BullMQ + Redis
  - `orchestration/engine/<chosen>/worker.mjs`
  - Queue jobs: “run AUV graph”; support pause/resume/cancel
- Auth: SSO/OIDC scaffolding; per-tenant namespaces for artifacts and budgets
- Observability: `reports/status.json`; dashboards from `runs/observability/hooks.jsonl`
- DR/Backups: scheduled snapshots of `runs/` and `/dist/`

### Acceptance & Proofs
- A multi-AUV brief runs non-interactively via the queue; crash/restart resumes and completes; status is queryable.

---

## Phase 9 — Agent Excellence & Knowledge Assets (Weeks 8–10)

### Objective
Elevate agent capabilities, ensure consistent outputs, and build reusable domain knowledge.

### Deliverables
- `.claude/agents/*` updates:
  - Output standards: diffs/patches, result cards, escalation blocks with structured reasons/requests
  - Capability taxonomy coverage (web, backend, data, AI/ML, tooling)
- Retrieval aids:
  - Embed specs/templates (capabilities, DAG patterns, CI snippets) for few-shot quality
- Skill evaluation:
  - Synthetic tasks that generate scorecards; promote agents when they achieve target scores
- Cost governance:
  - Per-agent budgets; spend dashboards from session ledgers

### Acceptance & Proofs
- Agents produce standardized patch outputs; measured improvements on synthetic scorecards; budget adherence.

---

## Milestones, Evidence, and SLOs

### Milestones
- M1 (Phase 2): Compiler emits backlog; first AUV auto-authored and green.
- M2 (Phase 3–4): DAG runs in parallel; router dry-run snapshots recorded.
- M3 (Phase 5): PR opened automatically with green CI gates.
- M4 (Phase 6–7): Security + visual gates enforced; client package and report produced.
- M5 (Phase 8–9): Durable runs with resume; agent scorecards improved.

### Success Metrics
- Cycle time: ≤ 5 min locally per AUV; ≤ 10 min CI.
- Reliability: ≥ 95% deterministic success on standard AUVs.
- Autonomy: ≤ 1 human touch for non-ambiguous briefs; target 0.
- Quality: All gates Green (QA/Security/Perf/CVF) with artifacts.

---

## Quickstart Commands (Reference)

- Autopilot: `node orchestration/cli.mjs AUV-0003`
- CVF gate: `node orchestration/cvf-check.mjs AUV-0003`
- Validate cards: `npm run validate:cards`
- Tail hooks: `tail -n 50 runs/observability/hooks.jsonl`

---

## Risks & Mitigations

- Spec drift: shared `expected_artifacts.mjs` and schema validation; CI enforces.
- Flaky tests: artifact-rich logs, retries, stable selectors, 127.0.0.1 for perf.
- Cost overruns: policies, budgets, and ledger telemetry; Secondary tools by consent.
- Security: Semgrep + Gitleaks gates; secrets never used at runtime; waivers with expiry.
- Complexity: DAG runner with clear node types; resuming with state.

---

## Canonical Sources

- High-level summary roadmap: `docs/plan.md`
- Engineering source of truth: this document (super plan) + `docs/deep_technical_plan_06sep2025.md` (appendices, examples)
- Current repo truths: `docs/ARCHITECTURE.md`, `docs/ORCHESTRATION.md`, `docs/verify.md`, `docs/QUALITY-GATES.md`
```

- Write to: `docs/super_plan.md`
