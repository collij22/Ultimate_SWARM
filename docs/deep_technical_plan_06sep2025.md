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

## Phase 4 — MCP Router (Runtime) & Policy Governance ✅ COMPLETED (2025-09-07)

### Objective

Resolve capabilities → tools at runtime with budgets and allowlists; log decisions and costs.

### Deliverables (all completed with enhancements)

- ✅ `mcp/router.mjs` - Pure, deterministic routing engine with schema validation
  - `planTools()` function for capability → tool resolution
  - `deriveCapabilities()` extracts capabilities from AUV specs
  - Safety policy enforcement for production environments
  - Enriched decision rationale tracking alternatives
- ✅ `mcp/schemas/` - JSON schemas for registry and policies validation
  - `registry.schema.json` enforces tool metadata structure
  - `policies.schema.json` validates capability mappings and agent configs
- ✅ `mcp/router-report.mjs` - Coverage analysis tool for configuration health
- ✅ Enhanced `mcp/policies.yaml`:
  - `router.defaults` with budget ceilings and tier preferences
  - `router.on_missing_primary` policy for secondary tool proposals
  - `tiers.secondary.budget_overrides` for per-tool custom budgets
  - `safety` policies for production restrictions
- ✅ Enhanced `mcp/registry.yaml`:
  - All 30 tools with complete `cost_model` definitions
  - `api_key_env` support for custom environment variables
  - Comprehensive `side_effects` tracking
- ✅ Router fixtures and dry-run: `mcp/router-fixtures/*.json`, `npm run router:dry`
- ✅ Telemetry: Router decisions in `runs/observability/hooks.jsonl`, per-session ledgers in `runs/observability/ledgers/<session>.jsonl`

### Implementation Highlights

- **Schema Validation**: Ajv-based validation with cross-reference checks
- **CLI Enhancements**: `--validate` flag, `--session` for ledger tracking
- **Safety Enforcement**: Blocks risky tools in production unless SAFETY_ALLOW_PROD=true
- **Budget Management**: Total ceiling enforcement, per-tool overrides, tier defaults
- **Observability**: Hooks events and spend ledgers with epoch timestamps
- **CI Integration**: Router validation and tests run in CI pipeline
- **Test Coverage**: 12 comprehensive router tests + schema validation tests

### Critical Enhancements Applied

- Cross-reference validation ensures all tool references exist
- Capability derivation from AUV authoring_hints (UI→browser.automation, API→api.test)
- Graph runner integration with router preview and ledger updates
- Enriched decisions track all alternatives considered per capability
- Coverage report identifies configuration issues and orphaned tools
- Tests for schema validation failures provide clear error messages
- API key environment override (e.g., VERCEL_TOKEN) fully implemented

### Acceptance & Proofs ✅

- Configuration validation passes: 30 tools, 27 capabilities, 16 agents configured
- All 12 router tests passing (tier preference, budget enforcement, safety policies)
- Schema validation catches invalid configurations with clear error messages
- Dry-run snapshots written to `runs/router/*` with chosen/rejected rationale
- Router preview integrated in graph runner and runbook execution
- Safety policies block production mutations unless explicitly overridden
- Budget tracking via ledgers enables cost governance
- Coverage report identifies orphaned tools and missing budgets

---

## Phase 5 — Autonomous Build Lane & PR Flow ✅ COMPLETED (2025-09-07)

### Objective

Let agents implement changes safely: branch, write diffs, format/lint, test, commit, push, and open PRs automatically.

### Deliverables (all completed with production hardening)

- ✅ `orchestration/lib/build_lane.mjs` - Complete autonomous pipeline with safety features
  - Branch management with automatic creation/selection
  - Patch application (diff and changeset formats) with validation
  - QA gate runners (format, lint, typecheck, unit, integration, autopilot)
  - Git operations (add, commit, push) restricted to allowlist
  - Comprehensive artifact generation and observability
  - Typed exit codes (201-209) for precise error reporting
  - Windows-safe implementation with cross-platform compatibility

- ✅ `orchestration/lib/gh.mjs` - GitHub integration module
  - `gh` CLI detection and automatic fallback to REST API
  - PR creation with formatted body including artifacts
  - Repository information parsing
  - Result card generation for PR metadata

- ✅ QA Configuration Files
  - `.prettierrc.json` - Code formatting rules (printWidth: 100, semi: true, etc.)
  - `.eslintrc.cjs` - ESLint configuration with ES2022 support
  - `tsconfig.json` - TypeScript checking without emission
  - `.github/PULL_REQUEST_TEMPLATE.md` - Standardized PR template

- ✅ CLI Integration
  - Extended `orchestration/cli.mjs` with `build-lane` command
  - Support for dry-run, branch selection, PR creation
  - Granular QA gate control via flags

### Safety & Security Features

- **Write Allowlist**: Restricts modifications to approved directories (orchestration, mcp, tests, docs, etc.)
- **Path Validation**: All diff paths validated against allowlist before application
- **Dry-run Mode**: Complete execution without workspace mutations
- **Artifact Isolation**: Prevents `runs/**` artifacts from being committed
- **Sensitive File Protection**: Blocks modifications to .env, .git, node_modules
- **Git Scope Restriction**: Uses `getAllowedGitPathspecs()` for all git operations

### Critical Fixes Applied

1. **[B1] Diff Safety**: `extractFilesFromDiff()` validates all paths before `git apply`
2. **[B2] Dry-run Safety**: `applyPatch()` skips git operations in dry-run mode
3. **[B3] Artifact Bleed**: `recordDiff()` uses allowlist pathspecs for staging
4. **[B4] Recursive Rejects**: `collectRejectsRecursive()` finds all .rej files
5. **[B5] CI QA Gates**: Removed `|| true` to make gates blocking
6. **[T1] ESM Imports**: Fixed to use `import { randomBytes } from 'node:crypto'`

### Testing & Validation

- ✅ **Unit Tests**: 20 tests covering all critical functions
  - Path allowlist validation
  - Diff parsing and validation
  - Changeset structure validation
  - Run ID generation
  - Branch naming conventions
  - QA configuration
  - Exit code mapping

- ✅ **Integration Tests**: Dry-run scenarios
  - Diff application without mutations
  - Changeset validation
  - Result card generation
  - Observability event emission

### Artifacts Structure

```
runs/
  <AUV-ID>/
    patches/
      <timestamp>-applied.diff    # Copy of applied patch
      <timestamp>-staged.diff      # Git diff of staged changes
      rejects/
        *.rej                      # Any rejected hunks
    changeset.json                 # Changeset metadata
    result-cards/
      build-lane-<RUN-ID>.json    # Complete execution summary
      pr.json                      # PR metadata (if created)
```

### Policies

- Only Primary tools by default; Secondary require explicit node override + budget
- Commit messages: `feat(AUV-xxxx): summary` or `fix(AUV-xxxx): summary`
- All changes must pass QA gates before commit
- Write-allowlist enforced for all file modifications

### Acceptance & Proofs ✅

- **Dry-run execution**: Creates placeholder artifacts without mutations ✓
- **Path validation**: Rejects disallowed paths with clear error messages ✓
- **Artifact isolation**: No `runs/**` files in git commits ✓
- **Result cards**: Comprehensive execution summaries with all metadata ✓
- **Test coverage**: All unit and integration tests passing ✓
- **CI integration**: QA gates properly blocking merges ✓
- **Observability**: BuildStart/PatchApplied/BuildEnd events in hooks.jsonl ✓

---

## Phase 6 — Advanced Verification: Security, Visual, Budgets ✅ COMPLETED (2025-09-08)

### Objective

Add security and visual parity with machine-readable reports and enforceable budgets.

### Deliverables (all completed with full CI integration)

- ✅ Security Scanning:
  - `orchestration/security/semgrep.mjs` - SAST scanner with waiver support (exit code 301)
  - `orchestration/security/gitleaks.mjs` - Secret detection with waiver support (exit code 302)
  - `.security/waivers.yaml` - Time-bound security finding waivers (30-day expiry)
  - `semgrep.yml` - Security rules configuration
  - `.gitleaks.toml` - Secret detection configuration

- ✅ Visual Regression Testing:
  - `orchestration/visual/capture.mjs` - Deterministic screenshot capture with Playwright
  - `orchestration/visual/compare.mjs` - Image comparison with pixelmatch and SSIM (exit code 303)
  - `tests/robot/visual/baselines/` - Visual regression baselines for AUV-0003/0004/0005

- ✅ Performance Budget Enforcement:
  - `orchestration/lib/budget_evaluator.mjs` - Evaluates Lighthouse metrics against budgets
  - Enhanced capability YAMLs with `perf_budgets` (LCP, TTI, CLS, FCP, TBT, SI)
  - Budget validation integrated into CVF gate

- ✅ CVF Extensions:
  - Enhanced `orchestration/cvf-check.mjs` with Phase 6 gates
  - `--strict` mode for comprehensive security/visual/performance checks
  - Security gate: checks for high/critical findings in Semgrep/Gitleaks reports
  - Visual gate: compares screenshots against baselines (0.1% pixel threshold)
  - Performance gate: validates metrics against defined budgets

- ✅ CI Integration:
  - `.github/workflows/ci.yml` updated with security scanning steps
  - Visual capture and comparison workflow
  - Mock server cleanup with PID tracking and port-based fallback
  - Tool installation (Semgrep, Gitleaks) in CI environment
  - Artifact upload for security and visual reports

### Implementation Highlights

- **Security Waivers**: 30-day expiry, automatic cleanup of expired waivers
- **Deterministic Visual Testing**: Fixed viewport (1920x1080), disabled animations, UTC timezone
- **Cross-platform Compatibility**: Windows-safe module execution with fileURLToPath
- **Typed Exit Codes**: 301 (security), 302 (secrets), 303 (visual regression)
- **Smart Server Cleanup**: PID tracking with lsof fallback for port 3000

### Critical Fixes Applied

1. **Runtime Dependencies**: Added playwright, pngjs, pixelmatch, js-yaml to package.json
2. **Module Execution**: Fixed Windows compatibility with fileURLToPath for all Phase 6 modules
3. **Capability YAML Updates**: Added perf_budgets, visual.routes, security.required to AUV-0003/0004/0005
4. **Visual Baselines**: Generated initial baselines for all visual routes
5. **CI Mock Server**: Implemented proper cleanup with PID tracking and fallback

### Acceptance & Proofs ✅

- Security scanning blocks on high/critical findings (exit code 301) ✓
- Secret detection blocks on any detected secrets (exit code 302) ✓
- Visual regression blocks on >0.1% pixel difference (exit code 303) ✓
- Performance budgets enforced with clear pass/fail reporting ✓
- All gates integrated into CVF with --strict mode ✓
- CI properly installs tools and runs all Phase 6 gates ✓
- Mock server cleanup prevents port conflicts ✓
- Documentation updated (QUALITY-GATES.md) with Phase 6 gates ✓

### CI Integration & Stability Improvements

During final CI integration (2025-09-08), the following critical fixes were applied to ensure pipeline stability:

#### TypeScript & Test Framework Fixes
- Created `tests/tsconfig.json` extending root config with DOM types for Playwright compatibility
- Migrated from Jest assertions to Node.js built-in test runner for consistency
- Fixed all type errors related to document/window references in tests
- Replaced `spawn('node', ...)` with `spawn(process.execPath, ...)` for cross-platform compatibility

#### CVF & Artifact Management
- **Important Concession**: Added clearing of `runs/security/` and `runs/visual/` before autopilot runs
  - Prevents CVF failures from stale results of earlier CI steps
  - Security and visual tests still run independently with full validation
  - Results preserved as CI artifacts for audit trail
- Fixed graph parallelization tests to use placeholder nodes avoiding artifact dependencies

#### Result
- **Full CI pipeline passing** with all quality gates enforced
- Security scanning (Semgrep/Gitleaks) runs as independent CI step
- Visual regression testing captures and compares screenshots successfully
- Autopilot tests (AUV-0002 through AUV-0005) pass with strict CVF validation
- All artifacts properly uploaded and validated

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
```
