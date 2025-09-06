# Swarm1 — Executive Overview

*Status, How It Works, What's Next*

## Why Swarm1 exists

Swarm1 is a capability-driven, multi-agent delivery system designed to take an Upwork-style brief and produce a verified, production-ready deliverable—with tests, performance proofs, and auditable artifacts—ideally with minimal human intervention.

It combines:

- **Main Orchestrator (A1)** and a roster of specialist sub-agents (requirements, architecture, frontend, backend/API, database, AI/ML, QA, debugger, DevOps)
- **Capabilities model (AUV-xxxx)** that turns requirements into verifiable units with deterministic tests and artifacts
- **Runbook** that drives automated proof for each capability (Playwright UI/API tests, Lighthouse performance checks, CVF "Definition of Done" gate)
- **Observability hooks** and MCP policies for safety, traceability, and tool governance

## Where we are today (truth snapshot — Phase 1 Complete)

### ✅ What we HAVE (Post Phase 1 - 2025-09-06)

**Working E2E demo stack** (mock server + static UI) and green capabilities:

- **AUV-0001** Add-to-Cart (API+UI)
- **AUV-0002** Product list & detail (API+UI+perf+CVF) — specs corrected to generate proper artifacts
- **AUV-0003** Search & filter (API+UI+perf+CVF)
- **AUV-0004** Cart summary totals (API+UI+perf+CVF)
- **AUV-0005** Checkout (API+UI+perf+CVF)

**All AUVs (0002-0005) passing in CI with full validation**

**Hardened Runbook automation** (`orchestration/cli.mjs`) that:
1. Checks for existing healthy server (prevents double starts)
2. Auto-authors tests from capability hints 
3. Runs Playwright with retry logic for transients
4. Runs Lighthouse 
5. Enforces CVF with proper ENV propagation
6. Writes versioned result cards with typed exit codes (101-105)

**Phase 1 Improvements:**
- **Validation Pipeline**: Result cards validated with ajv-cli against schemas
- **Artifact Consistency**: Automated verification that CVF expectations match runbook artifacts
- **CI Simplification**: All AUVs use autopilot as single source of truth
- **Error Handling**: Structured failure cards, transient retry logic, typed exit codes
- **Server Management**: Health check prevents duplicate instances

**Additional components:**
- Auto test authoring (`orchestration/lib/test_authoring.mjs`) from `capabilities/<AUV>.yaml`
- CVF gate (`orchestration/cvf-check.mjs`) that codifies "done" by checking required artifacts per AUV
- CI pipeline (Playwright + Lighthouse + CVF + artifact upload) for ALL AUV-0002..0005
- Observability hooks (session start/end, post tool use, subagent stop) emitting JSONL and per-AUV result cards
- Agent prompts for the 16-agent roster (A/B/C series) plus aux agents (Performance Optimizer, Code Migrator)
- MCP registry & policies with primary/secondary tools and per-agent allowlists
- Docs: `CLAUDE.md`, `docs/verify.md`, `docs/ARCHITECTURE.md`, `docs/Hooks.md`, `runbook.md`, `CHANGELOG.md`

### ⛳ What we DON'T have yet (gaps to full autonomy)

**Brief → Capabilities pipeline**
- Automated intake that reads a client brief and emits AUV plans (with acceptance criteria & authoring hints)

**Task-graph execution**
- A DAG that coordinates parallel agents with dependencies, retries, and repair loops

**Autonomous build lane**
- Agents that write code, open PRs, iterate until tests/CVF pass (today this step is still largely human-driven)

**Dynamic MCP routing**
- Cost/side-effect aware tool selection (primary vs secondary) at runtime with policy enforcement

**Packaging & client delivery**
- Release bundles (ZIPs, docs, videos, verification report) generated automatically

**Security/compliance & cost guardrails**
- Semgrep security gate, budgets, SBOM/license checks, secret hygiene

**Durable workflow engine**
- Background execution (resume, retry, checkpointing) beyond the current single-run runbook

## How it works today (end-to-end)

Choose an AUV (capability) and run:

```bash
node orchestration/cli.mjs AUV-000x
```

The runbook:
1. Starts mock server and health-checks it
2. Reads `capabilities/<AUV>.yaml` and auto-generates tests if missing
3. Runs Playwright UI/API tests headless, capturing artifacts
4. Runs Lighthouse on the target page
5. Enforces the CVF gate (required artifacts present & valid)
6. Writes a summary result card

CI replicates these steps headlessly on push and uploads artifacts.

**Quality bars in play:** deterministic tests, screenshots/videos, JSON proofs, perf score, and explicit "Definition of Done" via CVF.

## The target system (what "production" looks like)

### High-level business flow

1. **Client brief arrives** (scope, budget, deadline)
2. **Requirements & risks are extracted**; capabilities (AUVs) are proposed with acceptance criteria
3. **Build & verify runs**: agents implement, test, repair, and converge to green CVF
4. **Deliverables are packaged**: code, docs, verification report, and demo media
5. **Handover with provenance**: who/what produced each artifact, with cost/time metrics

### Technical architecture (target)

- **Orchestrator API** (Node/TS) + Workflow/DAG engine (Temporal or BullMQ/Redis)
- **Worker pool**: Claude Code sessions per agent, governed by MCP router
- **Versioned repos** (feature branches & PRs), CI enforcing Playwright/Lighthouse/CVF/Semgrep
- **Artifact store** (S3-style) backed by provenance metadata
- **Observability**: events → OpenSearch/ELK dashboards; cost ledgers; per-AUV success rates
- **Policy**: centralized MCP allowlists, budgets, and audit logs

## Immediate path forward (Phase 2: Brief Intake & AUV Compiler)

### Step 0 — Pick the brief

Create `briefs/demo-01/brief.md` with the job post. Include any constraints (budget, stack, deadline, brand).

### Step 1 — From brief to capabilities (AUV plan)

- Run **A2 Requirements Analyst** to extract features, risks, unknowns
- Produce `capabilities/AUV-0101.yaml`, `AUV-0102.yaml`, … (one per feature) with:
  - **Acceptance criteria** (testable statements)
  - **Authoring hints** (page, selectors, API base paths) so auto-test authoring works
  - **Artifact expectations** for CVF (screenshots, JSON payloads, perf reports)

### Step 2 — Author tests & implement incrementally

For each AUV:

```bash
node orchestration/cli.mjs AUV-0101
```

This ensures specs, runs tests, and fails until implementation exists.

- Turn agents loose (**Rapid Builder**, **Frontend Specialist**, **API Integrator**, **DB Expert**) to scaffold or update the app (either extend `mock/` or create `apps/demo-01/`)
- Iterate until CVF passes per AUV:
  - Failures trigger **Debugger** + **QA (Quality Guardian)** loops using artifacts

### Step 3 — Package and deliver

**Compose a release bundle:**
- Source + build outputs, verification report, artifacts pack, and README for deployment
- Update `CHANGELOG` and `docs/verify.md` with the new AUVs
- Tag a release (`0.3.0-demo01`) and generate client-facing Statement of Conformance

This **"brief → AUVs → green CVF"** loop is repeatable and measurable. It's the backbone for autonomy.

## Detailed roadmap to full autonomy

### Phase 1 — Autopilot MVP on real brief (1–2 weeks)

- Deliver the demo brief using the current runbook + agents
- Prove repeatability (green locally and in CI)
- Produce delivery packages and client-style reports

### Phase 2 — Task graph & parallelization (2–4 weeks)

- Add `orchestration/graph/` (YAML/JSON) to define a DAG from the AUV set
- Orchestrate parallel lanes (e.g., Frontend + API)
- Implement repair loops: failing nodes automatically invoke Debugger + Rapid Builder, then re-run downstream nodes
- Persist run state; support resume after crash

### Phase 3 — Deep MCP routing & security (1–2 weeks)

- Finalize `mcp/registry.yaml`/`policies.yaml` capability_map; enforce primary vs secondary tools
- Integrate Semgrep MCP in CI and add a CVF-Sec gate for PRs touching critical code
- Add RefDocs + retrieval for specs/templates; track tool cost/use in ledgers

### Phase 4 — Packaging & client UX (1–2 weeks)

- CLI `orchestration/package.mjs <project-id>` → `/dist/<project>.zip` bundle
- Generate an HTML verification report linking artifacts & CI runs
- Optional portal UI to upload briefs, track DAG progress, and download results

### Phase 5 — Production hardening (ongoing)

- Durable workflows (Temporal/BullMQ), SSO/RBAC, budgets, SLOs, SBOM/license scans, red-team tests, audit logs

## Operating model (how teams & bots work together)

- **Definition of Done**: A capability is "done" when its CVF gate passes (required artifacts present and valid)
- **SLOs**: CI green, <5-minute local proof loops per capability, >95% deterministic test runs
- **Budget controls**: Per-session token/tool budgets; primary MCPs default; secondary MCPs require explicit allow
- **Approvals**: For expensive tools or scope changes, Orchestrator requests human approval with a delta plan and cost estimate

## Risks and how we mitigate them

- **Spec drift**: Capabilities as the single source of truth; CVF gates enforce verifiable outcomes
- **Flaky tests/headless variance**: Record artifacts & retries; stabilize selectors; use 127.0.0.1 for Lighthouse
- **Scope creep**: AUV scoping + milestone-based delivery; prioritize capabilities
- **Security**: MCP allowlists, no prod access by default, Semgrep in CI, secrets via standard vaults
- **Cost overruns**: Per-agent budgets, tool tiering, hooks ledger (extend to track spend per run)

## What "groundbreaking" looks like (our bar)

Feed an arbitrary Upwork brief → automatically produce an AUV plan, tests, implementation PRs, and verified artifacts, with agents running in parallel, governed by policy and budgets, and generating a traceable, client-ready delivery package—**all with minimal human hand-holding**.

## Immediate next actions (do these now)

1. Create `briefs/demo-01/brief.md` with a real job post
2. Run **A2 Requirements Analyst** → produce `capabilities/AUV-0101..` with acceptance & authoring hints
3. For each AUV: `node orchestration/cli.mjs AUV-010x` → implement until CVF is green
4. Package and tag `v0.3.0-demo01`; update `CHANGELOG.md` and `docs/verify.md`
5. Start the **Task Graph** module to unlock parallelization and repair loops on the next brief

## Quick reference

- **One-button proof**: `node orchestration/cli.mjs AUV-0003`
- **Definition of Done**: enforced by `orchestration/cvf-check.mjs`
- **Artifacts**: under `runs/<AUV-ID>/...`, uploaded by CI
- **Docs to skim**: `CLAUDE.md`, `docs/verify.md`, `docs/Hooks.md`, `runbook.md`