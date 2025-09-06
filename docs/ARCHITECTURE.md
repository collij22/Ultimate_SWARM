## Overview
Swarm1 delivers **AUV-sized** (Acceptable Unit of Value) increments through a contract-first,
evidence-producing pipeline. Core pieces: an Orchestrator, a roster of specialized
sub‑agents, a Tool Router (MCP), a User Robot (tests), and gatekeepers (CVF, QA, Security).

```mermaid
flowchart LR
  A[User Request / Upwork Spec] --> B[Orchestrator]
  B --> C[Architect + Requirements Analyst]
  C --> D[Backend/API Integrator]
  C --> E[Frontend Specialist]
  D --> F[Database Expert]
  B --> G[AI/ML Specialist]
  D & E & G --> H[User Robot (UI/API)]
  H --> I[CVF Gate]
  I --> J[Quality Guardian]
  J --> K[Security Auditor]
  K --> L[Finalizer/Integrator]
  L --> M[DevOps -> Staging -> (optional) Prod]
```

## Components
- **Orchestrator**: schedules lanes, fans out work, merges evidence, and decides promotions.
- **Sub‑agents**: focused roles (A1…C16) that each emit a **Result Card** (machine-readable).
- **Tool Router (MCP)**: resolves *capabilities* → *tools* using `/mcp/policies.yaml` and `/mcp/registry.yaml`.
- **User Robot**: deterministic UI/API journeys that produce artifacts (videos, traces, HTTP dumps).
- **Gates**:
  - **CVF** (Capability Validator): checks acceptance proofs for the current AUV.
  - **Quality**: lint/type/unit/integration/visual + coverage thresholds.
  - **Security**: SAST/SCA/Secrets/IaC/Container + headers/CSP.
- **DevOps**: builds, deploys to **staging**, wires observability, and rehearses rollback.

## Data & Contracts
- **HTTP contracts** → `contracts/openapi.yaml` (OpenAPI 3.1).  
- **Event contracts** → `contracts/events.yaml` (AsyncAPI 2.6).  
- **Schema** → `db/schema.sql`, migrations in `db/migrations/`.  
- **Docs** → `docs/runbook.md`, `docs/verify.md`, `docs/operate.md`, `docs/ARCHITECTURE.md`.  
- **Policies** → `orchestration/policies.yaml`, `mcp/policies.yaml`.  

## Capability Flow (AUV)
1. **Define the AUV** (`capabilities/AUV-xxxx.yaml`): user story, acceptance, proofs.
2. **Contracts** frozen (OpenAPI/AsyncAPI) and schema validated (no drift).
3. **Build minimal vertical slice** (backend/frontend/ai) with observability and error envelope.
4. **Robot proofs**: run UI/API to capture artifacts under `runs/AUV-ID/RUN-*/`.
5. **Gates**: CVF → Quality → Security. All must be green.
6. **Docs & Release**: update runbook/verify/operate and CHANGELOG.
7. **DevOps**: stage, health-check, attach logs/metrics/traces, **rehearse rollback**.
8. **Promotion (optional)**: canary/blue‑green with approvals.

## Environments
- **Local** (developer/testing) → Docker Compose or equivalent.
- **Staging** (default target) → all gates run here.
- **Prod** (opt-in) → requires policy approval; blue‑green/canary and rollback tested.

## Observability
- Structured **logs** (include `request_id`, `auv_id`), **metrics** (HTTP, latency), **traces** (OpenTelemetry).
- Artifacts: `reports/**`, `coverage/**`, `runs/**` are the source of truth for decisions.

## Security posture
- Contract-first input validation; consistent error envelope; least privilege.
- Secrets in **secret manager** only; no prod by default; waivers must have ID/expiry.

## Parallelization & Serialized Resources
- Parallel-friendly lanes by default; **serialize** on: lockfiles, **DB migrations**, build system switches.
- Declared in `orchestration/policies.yaml`.

## File layout (essentials)
```
.claude/agents, .claude/aux-agents
capabilities/
contracts/{openapi.yaml, events.yaml}
db/{schema.sql, migrations/, seeds/}
docs/{runbook.md, verify.md, operate.md, ARCHITECTURE.md, CHANGELOG.md, releases/}
mcp/{registry.yaml, policies.yaml}
orchestration/policies.yaml
tests/robot/{api, data, playwright, visual/__snapshots__}
```

## Change control & versioning
- Version **paths** and **events** (`.vN`) when breaking changes are unavoidable.
- Schema migrations are additive and reversible; rollbacks tested by DevOps.

## As-Is Architecture
1. **Runbook (Autopilot)**: `orchestration/cli.mjs` → `runbooks/auv_delivery.mjs`
   - Starts **mock server** (`mock/server.js`)
   - Ensures/creates **tests** (`orchestration/lib/test_authoring.mjs`)
   - Runs **Playwright** (UI/API)
   - Runs **Lighthouse** (perf proof)
   - Runs **CVF** (`orchestration/cvf-check.mjs`)
   - Emits **result cards** under `runs/<AUV-ID>/result-cards/`

2. **Policy & Tools**
   - **Policies:** `mcp/policies.yaml` (capability_map, agents.allowlist)
   - **Registry:** `mcp/registry.yaml` (Primary/Secondary metadata)
   - **Hooks:** `scripts/hooks/*.py` (PreToolUse enforces allowlist; session/tool events → `runs/observability/hooks.jsonl`)

3. **Artifacts**
   - Test outputs & screenshots: `runs/<AUV-ID>/ui/*`, `runs/<AUV-ID>/api/*`
   - Perf: `runs/<AUV-ID>/perf/lighthouse.json`
   - Observability: `runs/observability/*.jsonl`, `runs/<AUV-ID>/result-cards/*.json`

## Planned Additions
- **Brief→AUV compiler:** `orchestration/lib/auv_compiler.mjs`
- **DAG runner:** `orchestration/graph/runner.mjs` + `orchestration/graph/projects/<id>.yaml`
- **MCP runtime router library:** `mcp/router.mjs` (policy-aware selection & budgets)
- **Security gate:** Semgrep in CI + `CVF-SEC`
- **Packaging & report:** `orchestration/package.mjs`, `orchestration/report.mjs`