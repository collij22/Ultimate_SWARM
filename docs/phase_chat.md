<!-- Choosing BullMQ + Redis over Temporal to keep dependencies light, align with Node/ESM stack, and deliver resumable, observable, multi-tenant runs with minimal churn to existing CLI/runner modules. -->

## Phase 8 — Durable Execution & Multi‑Tenant Ops (Enhanced Plan)

### Objectives
- Durable, resumable execution of multi‑AUV briefs via a queue/worker engine.
- Multi‑tenant namespacing for artifacts, budgets, and policies.
- Live status and auditability via `reports/status.json` sourced from existing hooks.
- DR/backups for `runs/` and `dist/` with safe, deterministic outputs.

### Decision Record (ADR-008): BullMQ + Redis
- Chosen: BullMQ + Redis (Node-friendly, minimal deps, robust job semantics).
- Not chosen: Temporal (heavier SDK, steeper learning, larger surface area).
- Dependencies: `bullmq`, `ioredis`. No other runtime deps required.
- Alignment: ESM `.mjs`, Windows-safe, existing CLI integration, artifact-first design.

---

## High-Level Architecture

- Queue layer: BullMQ `graphQueue` (job = “run AUV graph”).
- Worker: `orchestration/engine/bullmq/worker.mjs` consumes jobs, invokes `orchestration/graph/runner.mjs` with `--resume` on crashes.
- Multi‑tenant scoping: `TENANT_ID` prefixes artifact roots: `runs/tenants/<TENANT_ID>/<AUV-ID>/...`, `dist/tenants/<TENANT_ID>/<AUV-ID>/...`.
- Observability: Continue emitting to `runs/observability/hooks.jsonl`; aggregate into `reports/status.json`.
- Admin controls: pause/resume/cancel via CLI over BullMQ.
- DR: periodic snapshot to `backups/` (local by default), optional S3 if configured.

---

## Implementation Plan (Milestones and Edits)

### M1 — Engine Skeleton and Configuration
- New files:
  - `orchestration/engine/bullmq/config.mjs`:
    - Parse `REDIS_URL`, `ENGINE_CONCURRENCY` (default 3), `ENGINE_NAMESPACE` (default `swarm1`).
    - Validate connectivity and emit clear exit code on failure.
  - `orchestration/engine/bullmq/schemas/job.schema.json`:
    - Job payload schema:
      - `{ type: "run_graph", graph_file: string, tenant: string, run_id?: string, resume?: boolean, env?: Record<string,string>, concurrency?: number }`
    - Use Ajv (already present via repo) for validation.
- Exit codes (engine):
  - 401 RedisUnavailable, 409 InvalidJobPayload.

### M2 — Worker and Job Lifecycle
- New files:
  - `orchestration/engine/bullmq/worker.mjs`:
    - Create BullMQ `Worker` on `graphQueue`.
    - For each job:
      - Derive `AUV_ID`s from graph (only for context), compute or reuse `run_id`.
      - Call `orchestration/graph/runner.mjs` with:
        - `--resume <RUN_ID>` when `resume === true` or when prior state exists.
        - `--concurrency <n>` (reuse runner’s internal parallelization).
        - Pass through `TENANT_ID` via env.
      - Stream progress back via `job.updateProgress()`; on completion, set job result with artifact paths.
    - On crash: allow BullMQ retry policy; runner resumes using `runs/graph/<RUN_ID>/state.json`.
  - `orchestration/engine/bullmq/enqueue.mjs`:
    - Validate payload against schema, enqueue to `graphQueue`.
    - Set retry/backoff: `attempts=3`, exponential backoff 2s/4s/8s.
  - `orchestration/engine/bullmq/admin.mjs`:
    - Functions: `pauseQueue`, `resumeQueue`, `cancelJob(jobId)`, `listJobs(states)`, `getJob(jobId)`.
- Edits:
  - `orchestration/graph/runner.mjs`:
    - Ensure stable `RUN-ID` is accepted from env/arg to guarantee resume.
    - Accept `TENANT_ID` and use it to prefix artifact roots (no breaking changes to file naming).

### M3 — Multi‑Tenant Namespacing
- New files:
  - `orchestration/lib/tenant.mjs`:
    - `tenantPath(tenant: string, relative: string): string` → scoped path.
    - `resolveRunRoot(tenant: string, auvId: string): string`.
  - `orchestration/lib/policy.mjs` (lightweight):
    - Load per‑tenant restrictions from `mcp/policies.yaml` (optional `tenants:` section).
    - Validate job request against tenant policy (allowed capabilities, budget ceilings).
- Edits:
  - `orchestration/lib/expected_artifacts.mjs`:
    - Add optional `tenant` param to path helpers; default to current behavior if omitted.
  - `orchestration/cvf-check.mjs`, `orchestration/package.mjs`, `orchestration/report.mjs`:
    - Accept `TENANT_ID` via env and apply `tenantPath()` when constructing artifact destinations.
- Exit codes:
  - 405 PermissionDenied (tenant policy violation), 406 ResumeStateMissing.

### M4 — CLI Surface and Admin Commands
- Edits:
  - `orchestration/cli.mjs`:
    - `engine start [--tenant <ID>] [--concurrency N]`
      - Starts worker; prints health (Redis, queue namespace).
    - `engine enqueue graph <graph.yaml> [--tenant <ID>] [--resume <RUN-ID>]`
      - Returns `jobId` and `RUN-ID`.
    - `engine status [--tenant <ID>] [--job <ID>]`
      - Prints queue/worker health, job summary, and the path to `reports/status.json`.
    - `engine pause|resume`
    - `engine cancel --job <ID>`
- Windows‑safe: use `process.execPath` for subprocess calls; avoid shell-specific features.

### M5 — Status Aggregation and Reporting
- New files:
  - `orchestration/engine/status_aggregator.mjs`:
    - Read BullMQ job states and `runs/observability/hooks.jsonl`.
    - Compute summary per tenant:
      - counts: waiting/active/completed/failed/delayed
      - recent runs: jobId, AUV set, started_at, completed_at, ok, key artifact links
    - Write `reports/status.json` (atomically).
  - `schemas/status.schema.json` for `reports/status.json`.
- Edits:
  - Add CLI: `engine emit-status` (single-shot) and schedule from worker every 30s when active.

### M6 — DR/Backups (Safe by Default)
- New files:
  - `orchestration/ops/backup.mjs`:
    - Zip and timestamp `runs/` and `dist/` to `backups/YYYYMMDDTHHMMSSZ/`.
    - Optional S3 upload if `BACKUP_S3_BUCKET` and AWS creds present.
- CLI:
  - `engine backup [--scope runs|dist|both]`
- Safety:
  - Never include `node_modules/`, `.git/`, secrets; enforce allowlist.

### M7 — Policies, Budgets, and Safety
- Edits:
  - `mcp/policies.yaml`:
    - Optional:
      - `tenants: { <TENANT_ID>: { budget_ceiling_usd, allowed_capabilities[], router_overrides? } }`
- Enforcement:
  - On enqueue, validate budget against `budget_evaluator.mjs` predicted spend (if available) or static ceilings.
- Exit codes:
  - 408 Timeout (job exceeded max runtime), 407 CancelledByUser.

### M8 — Documentation and Guides
- Edits:
  - `docs/ARCHITECTURE.md`: add queue/worker sequence diagrams, tenant namespace.
  - `docs/ORCHESTRATION.md`: CLI usage for engine, status, backups.
  - `docs/QUALITY-GATES.md`: add engine exit codes (401–409) and artifacts for status/backups.
  - `docs/verify.md`: new acceptance proofs for durable runs and resume behavior.

---

## Contracts and Schemas

- Job payload (`orchestration/engine/bullmq/schemas/job.schema.json`):
  - `type`: enum [`run_graph`]
  - `graph_file`: string (path under repo)
  - `tenant`: string (slug) default `default`
  - `run_id`: string (optional; generated if absent)
  - `resume`: boolean (default false)
  - `env`: object<string,string> (optional)
  - `concurrency`: integer (1..5)

- Status document (`schemas/status.schema.json` → `reports/status.json`):
  - `version`: "1.0"
  - `generated_at`: date-time
  - `engine`: { `mode`, `redis`: { `connected`: boolean }, `workers`: [{ `id`, `pid`, `started_at`, `tenants` }] }
  - `tenants`: { "<TENANT_ID>": { `queue_counts`: {...}, `recent_runs`: [{ `job_id`, `run_id`, `auv_ids`: [string], `started_at`, `ended_at`, `ok`, `artifacts`: [string] }] } }

---

## Configuration and ENV

- `REDIS_URL` (e.g., `redis://127.0.0.1:6379`)
- `ENGINE_NAMESPACE` (default: `swarm1`)
- `ENGINE_CONCURRENCY` (default: `3`)
- `TENANT_ID` (default: `default`)
- `BACKUP_S3_BUCKET` (optional)
- `SAFETY_ALLOW_PROD` (must be false by default)

---

## Testing Strategy

- Unit:
  - Validate job schema, tenant path derivation, policy checks, status reduction.
- Integration (with Redis service):
  - Enqueue graph → worker executes → artifacts created under tenant path.
  - Crash/restart: kill worker mid‑run, restart, verify resume via `--resume` and state file.
  - Pause/resume/cancel behavior and exit codes.
- E2E:
  - Compile backlog → graph → enqueue → status emission → CVF strict → package/report → backup.
- CI:
  - Start Redis service, run engine integration tests on a small demo graph.
  - Always upload `reports/status.json` and engine logs as artifacts.

---

## Acceptance Criteria (Phase 8)

- A multi‑AUV graph runs non‑interactively via queue; worker restart resumes and completes.
- `reports/status.json` reflects accurate queue/job/run summaries for all tenants.
- Artifacts for AUV runs, packaging, and reports are written under tenant‑scoped paths.
- Admin controls (pause/resume/cancel/status) work via CLI.
- Backups of `runs/` and `dist/` are created and validated; optional S3 supported.
- All new schemas pass validation; all new modules Windows‑safe and ESM‑compliant.

---

## Risks and Mitigations

- Redis availability: health checks with fast fail (401), retry/backoff on transient errors.
- State drift on resume: single source of truth remains `runs/graph/<RUN-ID>/state.json`; runner is authoritative.
- Tenant leakage: strict path scoping via `tenantPath()`, policy validation before enqueue.
- Queue overload: per‑tenant concurrency cap, backpressure via enqueue validation.

---

## Work Breakdown (2–3 weeks)

- Week 1: M1–M3 (engine, worker, tenant, CLI enqueue; basic happy path).
- Week 2: M4–M5 (admin commands, status aggregator, schemas, docs).
- Week 3: M6–M7 (backups, policies/budgets, hardening, tests, CI).

---

## Minimal Dependency Additions

- Install:
  - `npm i bullmq ioredis`
- No other runtime dependencies required.

---

## Proposed File Additions and Key Edits (Tree)

```text
orchestration/
  engine/
    bullmq/
      admin.mjs
      config.mjs
      enqueue.mjs
      worker.mjs
      schemas/
        job.schema.json
  engine/
    status_aggregator.mjs
  lib/
    tenant.mjs
    policy.mjs
  ops/
    backup.mjs
schemas/
  status.schema.json
docs/
  ARCHITECTURE.md        (updated)
  ORCHESTRATION.md       (updated)
  QUALITY-GATES.md       (updated)
  verify.md              (updated)
```

- **Key edits**: `orchestration/cli.mjs`, `orchestration/graph/runner.mjs`, `orchestration/lib/expected_artifacts.mjs`, `orchestration/cvf-check.mjs`, `orchestration/package.mjs`, `orchestration/report.mjs`, `mcp/policies.yaml`.

- **Exit codes added**: 401–409 (engine layer).

- **Artifacts added**: `reports/status.json`, `backups/**`.

- **CI**: Start Redis service, run engine integration tests, upload status/engine logs.

- **Safety**: Tenant scoping, policy enforcement, no prod by default.
