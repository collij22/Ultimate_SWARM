# Orchestration — AUV Lifecycle & Scheduling

## Brief → Backlog (Phase 2 - Completed)

### Convert Brief to AUVs

```bash
# Generate AUVs from an Upwork-style brief
node orchestration/cli.mjs plan briefs/demo-01/brief.md --dry-run

# Without --dry-run, uses Requirements Analyst agent
node orchestration/cli.mjs plan briefs/demo-01/brief.md
```

This generates:

- `capabilities/AUV-01xx.yaml` files with acceptance criteria and authoring hints
- `capabilities/backlog.yaml` with dependencies and estimates
- `reports/requirements/<RUN-ID>.json` with extracted requirements

### Validate Generated AUVs

```bash
# Validate a specific AUV
node orchestration/cli.mjs validate auv AUV-0101

# Validate brief format
node orchestration/cli.mjs validate brief briefs/demo-01/brief.md
```

## AUV Lifecycle

1. **Brief** → Compile to AUVs using NLP extraction and Requirements Analyst
2. **Define** AUV (`capabilities/AUV-*.yaml`): goals, acceptance, proofs, level target (L3)
3. **Design**: Requirements Analyst + Architect clarify scope, risks, contracts
4. **Build**: Rapid Builder, Frontend, Backend, Database, AI (as needed)
5. **Robot**: Playwright/UI + API prove acceptance; artifacts under `runs/<AUV-ID>/...`
6. **Gates**: CVF → QA → Security — all must be green to proceed
7. **Finalize**: docs/runbooks, changelog, readiness checklist
8. **DevOps**: staging deploy, observability, rollback rehearsal; optional promotion

## DAG Execution (Phase 3 - Completed)

### Graph-Based Parallel Execution

The DAG runner enables parallel execution of multiple AUVs with dependency management, retries, and resumability.

#### Compile Backlog to Graph

```bash
# Convert backlog.yaml to executable graph
node orchestration/cli.mjs graph-from-backlog capabilities/backlog.yaml \
  -o orchestration/graph/projects/demo-01.yaml \
  --concurrency 3
```

This generates a graph with:

- One `server` node (shared resource)
- For each AUV: `ui`, `perf`, and `cvf` nodes
- Dependency edges based on `depends_on` relationships
- Concurrency limit for parallel execution

#### Run Graph

```bash
# Execute graph with parallel processing
node orchestration/cli.mjs run-graph orchestration/graph/projects/demo-01.yaml

# Resume after failure/crash
node orchestration/cli.mjs run-graph orchestration/graph/projects/demo-01.yaml \
  --resume RUN-abc123xyz

# Custom concurrency
node orchestration/cli.mjs run-graph orchestration/graph/projects/demo-01.yaml \
  --concurrency 5
```

#### Graph Features

- **Parallel Execution**: Up to N nodes run concurrently (default: 3)
- **Resource Locks**: Serialize access to shared resources (e.g., server startup)
- **Dependency Management**: Topological ordering with cycle detection
- **Retry Logic**: Transient failures retry with exponential backoff
- **State Persistence**: `runs/graph/<RUN-ID>/state.json` tracks progress
- **Resume Capability**: Continue from last checkpoint after crash
- **Observability**: Events logged to `runs/observability/hooks.jsonl`

#### Graph Schema

Graphs follow `orchestration/graph/spec.schema.yaml`:

```yaml
version: '1.0'
project_id: demo-01
concurrency: 3
defaults:
  retries: { max: 1, backoff_ms: 1000 }
  timeout_ms: 180000
nodes:
  - id: server
    type: server
    resources: [server]
  - id: AUV-0101-ui
    type: playwright
    requires: [server]
    params:
      specs: [tests/robot/playwright/auv-0101.spec.ts]
edges:
  - [server, AUV-0101-ui]
  - [AUV-0101-ui, AUV-0101-perf]
```

Node types:

- `server`: Ensure mock server is running
- `playwright`: Execute UI tests
- `lighthouse`: Run performance audit
- `cvf`: Validate capability artifacts
- `agent_task`: Agent execution node (Phase 10b tri‑mode)
  - Deterministic: placeholder or deterministic path
  - Claude: routes through subagent gateway → router plan → tool executor (caching) → artifacts
- `web_search_fetch`: Brave search + fetch first result; writes `runs/websearch_*` artifacts
- `package`/`report`: Future packaging/reporting

#### Phase 10a Node Example

### Phase 10b — Execution Modes

- Global selection:
  - `SWARM_MODE=deterministic|claude|hybrid`
  - `SUBAGENTS_INCLUDE` / `SUBAGENTS_EXCLUDE` (hybrid role lists)
- Node override:
  - `params.execution: claude|deterministic`
- Windows examples:
  - `set SWARM_MODE=claude && node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml`

Engine components:

- `orchestration/lib/engine_selector.mjs` — route engine per node
- `orchestration/lib/subagent_gateway.mjs` — Plan Mode only, schemas, transcripts, stop conditions
- `orchestration/lib/tool_executor.mjs` — execute router-selected tools with caching

```yaml
# orchestration/graph/projects/seo-audit-demo.yaml (excerpt)
nodes:
  - id: search
    type: web_search_fetch
    params:
      query: 'ref-tools MCP server'
      outDir: websearch_demo
  - id: audit
    type: agent_task
    requires: [search]
    params:
      capability: seo.audit
```

#### Performance Benefits

With dependency-aware parallel execution:

- Serial: 8 AUVs × 30s avg = 4 minutes
- Parallel (concurrency=3): ~1.5 minutes (60%+ reduction)
- Resource locks prevent conflicts
- Failed nodes don't block independent lanes

#### Technical Implementation Notes

- **Run ID Generation**: Uses `crypto.randomUUID()` (no external dependencies)
- **Process Management**: Unix systems use process groups (`detached: true`, `unref()`)
- **AUV_ID Extraction**: Base ID extracted from node IDs (e.g., AUV-0101 from AUV-0101-ui)
- **Server Cleanup**: Automatic cleanup in finally block prevents orphaned processes

## Parallelization

- **Default parallel** across independent lanes in DAG
- **Serialize on**: lockfiles, `db/migrations/**`, build system switches, and releases
- **Resource locks**: Managed by DAG runner for shared resources
- See `orchestration/policies.yaml` for globs and rules

## Inputs/Outputs (per lane)

- Each agent emits a **Result Card** (XML/JSON) with a concise summary + artifacts + next steps
- Orchestrator merges results and decides promotion or escalation

## Escalations

- If blocked, agents emit an `<escalation>` block with reason, requests, and impact
- Orchestrator routes escalations to owners or re‑plans the AUV

## Evidence & Traceability

- All proofs go to `runs/<AUV-ID>/<RUN-ID>/...` with stable filenames referenced in gates
- Reports (lint/tests/security) go to `reports/**` and are linked from Result Cards

## Autopilot (AUV Delivery)

### Prerequisites

- `STAGING_URL=http://127.0.0.1:3000`
- `API_BASE=http://127.0.0.1:3000/api`

### Run

```bash
node orchestration/cli.mjs AUV-0003
```

This will:

1. **Start mock server** (or reuse existing if healthy), wait `/health`
   - The runbook checks if a server is already running and healthy before starting a new instance
   - This prevents double-start issues when running multiple AUVs or in CI environments
2. **Ensure tests exist** (`orchestration/lib/test_authoring.mjs`; generates from `capabilities/<AUV>.yaml` if missing)
3. **Run Playwright** (UI/API)
4. **Run Lighthouse** → `runs/<AUV>/perf/lighthouse.json`
5. **Run CVF gates** (`orchestration/cvf-check.mjs`)

Artifacts live under `runs/<AUV-ID>/...`. CI replays similar steps and uploads artifacts.

### Typed Exit Codes & Error Handling

The autopilot uses [typed exit codes](QUALITY-GATES.md) for precise error reporting:

- **101**: Playwright tests failed
- **102**: Lighthouse performance check failed
- **103**: CVF gate failed
- **104**: Test authoring failed
- **105**: Server startup failed

### Artifact Expectations

Both the runbook (`orchestration/runbooks/auv_delivery.mjs`) and CVF checker (`orchestration/cvf-check.mjs`) source their expected artifact definitions from a shared module (`orchestration/lib/expected_artifacts.mjs`). This ensures consistency and provides a single source of truth for artifact requirements across the system.

### Repair Loop Behavior

When transient failures are detected (timeouts, network issues, browser crashes), the system:

1. Analyzes the error type in `maybeRepair()`
2. Writes failure context to `runs/<AUV>/repair/failure.json`
3. Automatically retries once for transient failures
4. Logs repair attempts and outcomes for debugging

## Test Auto-Authoring

If no spec files are present for an AUV, the system generates baseline tests guided by:

```yaml
authoring_hints:
  ui:
    page: '/products.html'
    selectors: '...'
    screenshot: 'products_search.png'
  api:
    base_path: '/products'
    cases: [...]
```

See `orchestration/lib/test_authoring.mjs` for supported hints (cart summary, list/search, before_steps).

---

## Quality Gates

### Gates in Effect

- **Functional (UI/API):** Playwright must pass; artifacts under `runs/<AUV>/ui/*`, `runs/<AUV>/api/*`
- **Performance:** Lighthouse JSON under `runs/<AUV>/perf/lighthouse.json`; `cvf-check.mjs` verifies presence & parses score (target ≥ 0.9 where applicable)
- **Security:** Semgrep planned; will write to `runs/security/semgrep.json` and fail on High severity

### CVF: AUV Examples

- **AUV-0003:** UI screenshot `runs/AUV-0003/ui/products_search.png` + `perf/lighthouse.json`
- **AUV-0005:** UI screenshot `runs/AUV-0005/ui/checkout_success.png` + `perf/lighthouse.json`

---

CI runs autopilot for AUV-0002, AUV-0003, AUV-0004, and AUV-0005 with full artifact validation

---

## Brief → Backlog (Phase 2)

### Overview

The Brief Intake & AUV Compiler transforms unstructured project briefs (Upwork-style) into executable AUVs with complete specifications, dependencies, and resource estimates.

### Process Flow

```
Brief (MD/YAML/JSON) → Validation → Requirements Extraction → Capability Mapping → AUV Generation → Backlog
```

### Commands

```bash
# Plan from a brief (full analysis)
node orchestration/cli.mjs plan briefs/demo-01/brief.md

# Plan with dry-run (heuristic extraction)
node orchestration/cli.mjs plan briefs/demo-01/brief.md --dry-run

# Validate brief structure
node orchestration/cli.mjs validate brief briefs/demo-01/brief.md

# Validate generated AUV
node orchestration/cli.mjs validate auv AUV-0101
```

### Brief Structure

Required sections:

- **business_goals**: High-level objectives (1-10 items)
- **must_have**: Essential features (1-20 items)

Optional sections:

- **nice_to_have**: Enhancement features
- **constraints**: Budget, timeline, tech stack
- **technical_requirements**: Performance, scale, security
- **sample_urls**: Reference sites

### Compilation Pipeline

1. **Parse & Validate** (`orchestration/lib/validate_brief.mjs`)
   - Load brief file (MD/YAML/JSON)
   - Validate against `contracts/brief.schema.json`
   - Extract structured data from markdown

2. **Requirements Analysis** (`orchestration/lib/call_agent.mjs`)
   - Invoke A2 Requirements Analyst (or heuristic in dry-run)
   - Extract capabilities, risks, dependencies
   - Persist to `reports/requirements/<RUN-ID>.json`

3. **AUV Generation** (`orchestration/lib/auv_compiler.mjs`)
   - Map capabilities to AUV specs
   - Generate authoring hints for test generation
   - Calculate complexity and resource estimates
   - Detect dependencies (UI→API, cart→checkout, etc.)

4. **Output Generation**
   - Individual AUVs: `capabilities/AUV-01xx.yaml`
   - Backlog: `capabilities/backlog.yaml`
   - Requirements report: `reports/requirements/*.json`

### Authoring Hints

Generated AUVs include hints compatible with `test_authoring.mjs`:

```yaml
authoring_hints:
  ui:
    page: /products.html
    search_input: '#q'
    card_selector: '[data-testid="product-card"]'
    screenshot: 'products_catalog.png'
  api:
    base_path: /products
    cases:
      - name: list products
        method: GET
        path: /
        expect: array
```

### Dependency Detection

Automatic dependency inference:

- UI components depend on corresponding APIs
- Checkout depends on cart
- Cart depends on product catalog
- All authenticated features depend on auth
- Data consumers depend on data providers

### Resource Estimation

Each AUV includes estimates:

- **complexity**: 1-10 scale based on feature analysis
- **tokens**: Estimated LLM tokens (complexity × 15000 × 1.2)
- **mcp_usd**: Estimated MCP tool costs (complexity × 0.03 × 1.2)
- **time_hours**: Implementation time (complexity × 3 × 1.2)

20% buffer included for conservative estimation.

### Example Output

From `briefs/demo-01/brief.md` (e-commerce marketplace):

```bash
[cli] Generated 8 AUVs
[cli] Summary:
  - Total complexity: 42
  - Total hours: 154
  - Total cost: $1.51
  - Backlog: capabilities/backlog.yaml

Generated AUVs:
  - AUV-0101: Product Catalog (depends on: AUV-0104)
  - AUV-0102: Shopping Cart (depends on: AUV-0101, AUV-0104)
  - AUV-0103: Checkout Flow (depends on: AUV-0102, AUV-0104)
  - AUV-0104: User Authentication
  ...
```

### Integration with Autopilot

Generated AUVs are immediately executable:

```bash
# Run first generated AUV
node orchestration/cli.mjs AUV-0101
```

The autopilot will:

1. Auto-generate tests from authoring hints
2. Run Playwright UI/API tests
3. Run Lighthouse performance checks
4. Validate CVF gates
5. Produce artifacts in `runs/AUV-0101/`

### Observability

All compilation events logged to `runs/observability/hooks.jsonl`:

- BriefValidated / BriefValidationFailed
- RequirementsAnalysisStart / RequirementsAnalysisComplete
- CompilationStart / CompilationComplete
- AuvSpecWritten
- BacklogWritten

### Next Phase Integration

The generated `backlog.yaml` feeds Phase 3 (DAG Runner):

- Provides dependency graph for parallel execution
- Includes resource estimates for scheduling
- Tracks status for incremental delivery

---

## MCP Router - Runtime Tool Selection (Phase 4)

### Overview

The MCP Router enables capability-based tool selection at runtime, enforcing policies around tool tiers (Primary/Secondary), budgets, consent requirements, and agent allowlists. This moves Swarm1 toward fully autonomous tool selection based on what agents need to accomplish rather than hard-coded tool lists.

### Core Concepts

- **Capabilities**: What an agent needs to accomplish (e.g., `browser.automation`, `security.scan`)
- **Tools**: Concrete implementations that provide capabilities (e.g., Playwright, Semgrep)
- **Primary Tools**: Free, local tools with no side effects or costs
- **Secondary Tools**: Paid or rate-limited tools requiring explicit consent and budget
- **Allowlists**: Per-agent restrictions on which tools they can use

### Router Usage

#### CLI Dry Run

```bash
# Test with fixture
npm run router:dry

# Test with custom parameters
node mcp/router.mjs --dry \
  --agent B7.rapid_builder \
  --capabilities browser.automation,web.perf_audit \
  --budget 0.25

# Test secondary tools (requires consent)
node mcp/router.mjs --dry \
  --agent C16.devops_engineer \
  --capabilities deploy.preview \
  --budget 0.50 \
  --secondary-consent
```

#### Programmatic Usage

```javascript
import { planTools, loadConfig } from './mcp/router.mjs';

const { registry, policies } = loadConfig();

const result = planTools({
  agentId: 'B7.rapid_builder',
  requestedCapabilities: ['browser.automation', 'web.perf_audit'],
  budgetUsd: 0.25,
  secondaryConsent: false,
  env: process.env,
  registry,
  policies,
});

if (result.ok) {
  console.log('Selected tools:', result.toolPlan);
  console.log('Total cost:', result.budget);
} else {
  console.log('Failed to satisfy capabilities:', result.warnings);
  console.log('Rejected tools:', result.rejected);
}
```

### Configuration

#### Registry (`mcp/registry.yaml`)

Each tool must define:

- `tier`: primary or secondary
- `capabilities`: list of capabilities it provides
- `requires_api_key`: boolean
- `cost_model`: { type: 'flat_per_run', usd: 0.00 }
- `side_effects`: list of effects (network, file_read, file_write, exec)

#### Policies (`mcp/policies.yaml`)

- `router.defaults`: Global defaults for budget, tier preference, consent
- `capability_map`: Maps capabilities to candidate tools (ordered by preference)
- `agents.allowlist`: Per-agent tool restrictions

### Router Algorithm

1. Deduplicate requested capabilities
2. Resolve capability → tool candidates from capability_map
3. Filter by agent allowlist
4. Enforce tier preference (Primary first)
5. Check secondary consent and budget
6. Validate API key requirements
7. Coalesce capabilities per tool
8. Return tool plan with rationale

### Observability

Router decisions are logged to `runs/observability/hooks.jsonl`:

- `RouterDecisionStart`: Beginning evaluation
- `RouterDecisionComplete`: Final decision with selected tools
- Decision artifacts: `runs/router/<RUN-ID>/decision.json`

### Integration with Runbook

Enable router preview (read-only) in autopilot:

```bash
ROUTER_DRY=true node orchestration/cli.mjs AUV-0003
```

This writes a router preview to `runs/<AUV>/router_preview.json` without changing tool execution.

### Testing

```bash
# Run router unit tests
npm run test:unit

# Test fixtures
npm run router:dry
npm run router:dry:security
npm run router:dry:secondary
```

### Future Phases

- Phase 5: Enforce router decisions in build lane
- Phase 6: Add security tool integration
- Phase 7: Package router decisions in delivery reports

## Packaging & Client Delivery (Phase 7 - Completed)

### Overview

Phase 7 introduces professional packaging and delivery capabilities that transform AUV verification artifacts into client-ready bundles with cryptographic signatures, SBOM tracking, and visual reports.

### Key Features

- **Manifest v1.1**: Enhanced schema with signatures, SBOM, and deliverable versioning
- **Deterministic Packaging**: Reproducible ZIP bundles with stable checksums
- **HTML Reports**: Professional delivery reports with performance metrics and screenshots
- **Full Pipeline**: Integrated run → package → report workflow

### CLI Commands

#### Package Command

Create a distribution bundle from AUV artifacts:

```bash
# Package a specific AUV
node orchestration/cli.mjs package AUV-0005

# Output:
# ✅ Package created successfully:
#   AUV: AUV-0005
#   Version: 1.1
#   Bundle: dist/AUV-0005/AUV-0005_bundle.zip
#   Size: 245.67 KB
#   Artifacts: 42
#   Manifest: dist/AUV-0005/manifest.json
```

#### Report Command

Generate HTML report from manifest:

```bash
# Generate report for packaged AUV
node orchestration/cli.mjs report AUV-0005

# Output:
# ✅ Report generated successfully:
#   AUV: AUV-0005
#   Report: dist/AUV-0005/report.html
#   Open: file:///path/to/dist/AUV-0005/report.html
```

#### Deliver Command

Run full delivery pipeline (test → package → report):

```bash
# Complete delivery pipeline
node orchestration/cli.mjs deliver AUV-0005

# Steps:
# 📋 Step 1/3: Running AUV tests...
#   ✅ AUV tests passed
# 📦 Step 2/3: Creating package...
#   ✅ Package created: dist/AUV-0005/AUV-0005_bundle.zip
# 📊 Step 3/3: Generating report...
#   ✅ Report generated: dist/AUV-0005/report.html
#
# 🎉 Delivery complete!
#   Total time: 45.23s
#   Bundle: dist/AUV-0005/AUV-0005_bundle.zip
#   Report: dist/AUV-0005/report.html
```

### Manifest Schema v1.1

The enhanced manifest includes:

```json
{
  "version": "1.1",
  "auv_id": "AUV-0005",
  "build_id": "build-abc123",
  "timestamp": "2025-01-09T10:30:00Z",
  "provenance": {
    "git_commit": "abc123def",
    "git_branch": "main",
    "built_by": "user@example.com",
    "ci_run": "https://github.com/org/repo/runs/123"
  },
  "signatures": {
    "manifest": "sha256:signature...",
    "artifacts": "sha256:merkle-root..."
  },
  "sbom": {
    "bomFormat": "SPDX",
    "specVersion": "2.3",
    "packages": [...]
  },
  "artifacts": [...],
  "bundle": {
    "path": "dist/AUV-0005/AUV-0005_bundle.zip",
    "size_bytes": 251576,
    "sha256": "abc123..."
  },
  "deliverable": {
    "level": 3,
    "version": "0.0.1",
    "capabilities": ["browser.automation", "web.perf_audit"]
  }
}
```

### Package Structure

```
dist/AUV-XXXX/
├── manifest.json           # Package manifest with signatures
├── package.zip            # Compressed artifact bundle
└── report.html            # Client-ready delivery report
```

#### Bundle Contents

The ZIP bundle includes:

- All test artifacts (videos, screenshots, traces)
- Performance reports (Lighthouse)
- Result cards (CVF validation)
- Runbook and operate guides
- SBOM with dependency tracking

### Validation

Validate manifest against schema:

```bash
# Validate all manifests
npm run validate:manifest

# Strict validation with all errors
npm run validate:manifest:strict
```

### DAG Integration

Package and report nodes can be used in graphs:

```yaml
nodes:
  - id: package-auv-0005
    type: package
    params:
      auv: AUV-0005
    depends_on: [cvf-auv-0005]

  - id: report-auv-0005
    type: report
    params:
      auv: AUV-0005
    depends_on: [package-auv-0005]
```

### CI Integration

The CI workflow automatically packages AUV-0005:

1. Runs AUV tests
2. Creates package bundle
3. Validates manifest schema
4. Generates HTML report
5. Uploads artifacts to GitHub

### Observability

Packaging events are logged to `runs/observability/hooks.jsonl`:

- `PackagingStarted`: Begin packaging
- `ArtifactsCollected`: Number and size of artifacts
- `ManifestCreated`: Manifest with checksums
- `BundleCreated`: Final bundle path and size
- `PackagingComplete`: Success with metrics

### Security Features

- **SHA-256 Checksums**: Every artifact and bundle
- **Signature Placeholders**: Ready for cryptographic signing
- **SBOM Generation**: Full dependency tracking
- **Vulnerability Scanning**: Via SBOM integration

### Report Features

The HTML report includes:

- **Executive Summary**: CVF status, performance score, security status
- **Build Information**: Git commit, branch, CI details
- **Performance Metrics**: Lighthouse scores, timing budgets
- **Visual Proofs**: Screenshot gallery
- **Artifacts Inventory**: Complete list with checksums
- **Delivery Bundle**: Size, checksum, download link
- **Provenance**: Build attestation

### Testing

```bash
# Run packaging unit tests
npm run test:unit tests/unit/package.test.mjs

# Run report unit tests
npm run test:unit tests/unit/report.test.mjs

# End-to-end test
node orchestration/cli.mjs deliver AUV-0005
```

### Exit Codes

- `401`: Packaging failed
- `402`: Report generation failed

### Next Steps

- Phase 9: Cryptographic signing with SLSA provenance
- Phase 10: Automated vulnerability scanning via SBOM
- Phase 11: Client portal with download authentication

## Durable Execution & Multi-Tenant Operations (Phase 8 - Completed)

### Overview

Phase 8 transforms Swarm1 from a CLI-based system to a queue-based durable execution engine using BullMQ + Redis. This enables job resumability, multi-tenant isolation, resource governance, and enterprise-scale orchestration.

### Key Features

- **Durable Job Queue**: BullMQ + Redis for persistent job state
- **Multi-Tenant Isolation**: Namespace-based artifact and resource separation
- **Job Resumability**: State persistence enables recovery from crashes
- **Policy Enforcement**: Per-tenant budgets, capabilities, and resource limits
- **Status Aggregation**: Real-time monitoring and health checks
- **Backup System**: Automatic backups with optional S3 support

### Engine Commands

#### Start Worker

Launch the BullMQ worker to process jobs:

```bash
# Start worker in development mode
node orchestration/cli.mjs engine start

# Start in production mode
NODE_ENV=production node orchestration/cli.mjs engine start

# With custom Redis URL
REDIS_URL=redis://my-redis:6379 node orchestration/cli.mjs engine start
```

#### Enqueue Jobs

Submit jobs to the queue:

```bash
# Enqueue a graph execution job
node orchestration/cli.mjs engine enqueue run_graph \
  --graph orchestration/graph/projects/demo-01.yaml \
  --tenant acme-corp \
  --priority 5

# Enqueue with metadata
node orchestration/cli.mjs engine enqueue compile_brief \
  --brief briefs/demo-01/brief.md \
  --tenant beta-inc \
  --metadata '{"project":"demo","owner":"user@example.com"}'
```

#### Monitor Status

```bash
# Get comprehensive status report
node orchestration/cli.mjs engine status

# Monitor in real-time (updates every 5s)
node orchestration/cli.mjs engine monitor

# Emit status JSON for CI/CD
node orchestration/cli.mjs engine emit-status > status.json
```

#### Queue Management

```bash
# Pause queue processing
node orchestration/cli.mjs engine pause

# Resume queue processing
node orchestration/cli.mjs engine resume

# Cancel a specific job
node orchestration/cli.mjs engine cancel job-abc123

# List active jobs
node orchestration/cli.mjs engine list

# Get queue metrics
node orchestration/cli.mjs engine metrics
```

#### Backup Operations

```bash
# Create backup (excludes sensitive data)
node orchestration/cli.mjs engine backup

# List available backups
node orchestration/cli.mjs engine backup --list

# Clean old backups (keep last 5)
node orchestration/cli.mjs engine backup --clean
```

### Multi-Tenant Configuration

Tenants are configured in `mcp/policies.yaml`:

```yaml
tenants:
  default:
    budget_ceiling_usd: 100
    allowed_capabilities: [browser.automation, api.test]
    max_concurrent_jobs: 3
    max_job_runtime_ms: 300000 # 5 minutes
    resource_limits:
      max_artifacts_size_mb: 100
      max_auv_count: 50

  acme-corp: # Premium tenant
    budget_ceiling_usd: 500
    allowed_capabilities: [browser.automation, deploy.preview]
    max_concurrent_jobs: 5
    max_job_runtime_ms: 600000 # 10 minutes
    allow_secondary_tools: true
```

### Tenant Isolation

- **Default tenant**: Uses original paths (`runs/AUV-XXXX/...`) for backward compatibility
- **Named tenants**: Use namespaced paths (`runs/tenants/{tenant}/AUV-XXXX/...`)
- **Resource limits**: Per-tenant quotas for storage, concurrent jobs, and runtime
- **Policy enforcement**: Budget ceilings and capability restrictions

### Job Schema

Jobs must conform to `orchestration/engine/bullmq/schemas/job.schema.json`:

```json
{
  "type": "run_graph",
  "graph_file": "orchestration/graph/projects/demo-01.yaml",
  "tenant": "acme-corp",
  "priority": 5,
  "constraints": {
    "budget_usd": 50,
    "max_runtime_ms": 180000,
    "required_capabilities": ["browser.automation"]
  },
  "metadata": {
    "project": "demo",
    "owner": "user@example.com"
  }
}
```

### Status Report Schema

The engine emits structured status reports conforming to `schemas/status.schema.json`:

```json
{
  "version": "1.0",
  "generated_at": "2025-01-09T10:00:00Z",
  "engine": {
    "mode": "production",
    "queue": {
      "name": "swarm1:graphQueue",
      "counts": {
        "waiting": 5,
        "active": 2,
        "completed": 100
      }
    },
    "health": {
      "status": "healthy",
      "checks": {
        "redis_connected": true,
        "queue_responsive": true,
        "workers_available": true
      }
    }
  },
  "tenants": {
    "acme-corp": {
      "metrics": {
        "jobs_per_hour": 12,
        "success_rate_hour": "91.7%",
        "avg_duration_ms": 45000
      },
      "recent_runs": [...]
    }
  }
}
```

### Configuration

Engine configuration via environment variables:

```bash
# Redis connection
REDIS_URL=redis://localhost:6379

# Engine settings
ENGINE_MODE=production         # development|production|test
ENGINE_CONCURRENCY=3           # Worker concurrency (1-10)
ENGINE_JOB_TIMEOUT=300000      # Job timeout in ms
ENGINE_MAX_RETRIES=2           # Max retry attempts

# Tenant defaults
ENGINE_DEFAULT_TENANT=default  # Default tenant ID
ENGINE_NAMESPACE=swarm1        # Queue namespace
```

### Job States

Jobs progress through these states:

1. **waiting**: Queued, awaiting worker
2. **active**: Currently being processed
3. **completed**: Successfully finished
4. **failed**: Terminated with error
5. **delayed**: Scheduled for future
6. **paused**: Queue is paused

### Exit Codes

Engine-specific exit codes (401-409):

- **401**: Redis connection failed
- **402**: Queue initialization failed
- **403**: Worker startup failed
- **404**: Job validation failed
- **405**: Policy violation
- **406**: Tenant quota exceeded
- **407**: Backup operation failed
- **408**: Status aggregation failed
- **409**: Resource limit exceeded

### Observability

Engine events are logged to `runs/observability/hooks.jsonl`:

- `EngineWorkerStarted`: Worker initialized
- `EngineJobQueued`: Job added to queue
- `EngineJobStarted`: Job processing began
- `EngineJobCompleted`: Job finished successfully
- `EngineJobFailed`: Job terminated with error
- `EngineJobRetrying`: Retry attempt initiated

---

## Agent Excellence & Knowledge Assets (Phase 9 - Completed)

### Agent Output Standards

All agent outputs must conform to standardized schemas for consistency and validation:

```bash
# Validate agent output against schema
node orchestration/cli.mjs validate agent-output runs/agents/<agent>/<run>/result-cards/agent-output.json
```

#### Output Types

1. **Diff/Patch**: Code changes in unified diff format
2. **Changeset**: Multiple file changes with metadata
3. **Escalation**: Structured request for human intervention or additional capabilities

#### Schemas

- `schemas/agent-output.schema.json`: Base output validation
- `schemas/agent-escalation.schema.json`: Escalation format
- `schemas/agent-changeset.schema.json`: Multi-file changes
- `schemas/agent-scorecard.schema.json`: Performance metrics

### Knowledge System

Build and query reusable knowledge assets:

```bash
# Build knowledge index from curated assets
node orchestration/cli.mjs knowledge build-index

# Retrieve relevant templates/patterns (programmatic)
# Uses orchestration/lib/knowledge_retriever.mjs
```

#### Knowledge Structure

```
.claude/knowledge/
  exemplars/            # High-quality example outputs
  patterns/             # Reusable design patterns
  templates/            # Code templates
  domain/               # Domain-specific knowledge
```

### Agent Evaluation

Score agents on synthetic tasks to measure improvement:

```bash
# Run synthetic tasks for an agent
node orchestration/cli.mjs agents score --agent B7.rapid_builder
```

#### Scorecard Metrics

- **Latency**: Time to complete task
- **Accuracy**: Pass/fail on acceptance criteria
- **Cost**: Token usage and MCP tool costs
- **Quality**: Code quality metrics (if applicable)

Synthetic tasks defined in `tests/agents/synthetic/` with pass/fail criteria.

### Cost Governance

Track and control agent spending:

```bash
# Generate spend dashboard
node orchestration/cli.mjs observability spend

# View per-agent budgets
cat mcp/policies.yaml | grep -A 10 "agents.budgets"
```

#### Budget Enforcement

The MCP router enforces budgets at two levels:

1. **Per-Agent Budget**: Total budget for an agent across all capabilities
2. **Per-Capability Budget**: Budget for specific capability usage

Budgets defined in `mcp/policies.yaml`:

```yaml
agents:
  budgets:
    B7.rapid_builder: 0.50
    B9.backend_api: 0.75
    C14.debugger: 0.25
    # Falls back to tier defaults if not specified
```

### CLI Commands

```bash
# Phase 9 commands
node orchestration/cli.mjs validate agent-output <file>   # Validate output
node orchestration/cli.mjs knowledge build-index          # Build index
node orchestration/cli.mjs agents score --agent <ID>      # Score agent
node orchestration/cli.mjs observability spend            # Spend dashboard
```

### Documentation

- `.claude/agents/OUTPUT_STANDARDS.md`: Output format guidelines
- `.claude/agents/EVALUATION.md`: Evaluation methodology
- `.claude/agents/RETRIEVAL.md`: Knowledge retrieval system

---

## Testing

```bash
# Run engine unit tests
npm run test:unit tests/unit/engine.test.mjs

# Run basic engine tests (no complex imports)
node --test tests/unit/engine-basic.test.mjs

# Test job validation
npx ajv validate -s orchestration/engine/bullmq/schemas/job.schema.json \
  -d examples/job.json

# Test status schema
npx ajv validate -s schemas/status.schema.json \
  -d examples/status.json
```

### Integration with Existing Systems

- **CLI**: Engine commands integrated into main CLI
- **DAG Runner**: Can be invoked via job queue or directly
- **Hooks**: Engine events flow through hooks system
- **Policies**: Tenant policies enforced at job submission
- **Artifacts**: Tenant-namespaced artifact storage

### Migration Path

1. **Backward Compatible**: Default tenant uses original paths
2. **Gradual Adoption**: Start with CLI, optionally use queue
3. **Full Migration**: Submit all work via queue for durability

### Production Deployment

```bash
# Docker Compose setup
docker-compose up -d redis

# Start worker with monitoring
NODE_ENV=production \
REDIS_URL=redis://redis:6379 \
node orchestration/cli.mjs engine start

# Monitor health
curl http://localhost:3000/engine/health
```

### Backup Strategy

- **Automatic**: Daily backups via cron
- **Exclusions**: Sensitive data (secrets, keys) excluded
- **Retention**: Keep last 5 backups by default
- **S3 Support**: Optional cloud backup with `S3_BUCKET` env var

### Authentication & RBAC (Phase 8)

Auth is optional and disabled by default for backward compatibility. When enabled (`AUTH_REQUIRED=true`), job enqueue and queue admin operations require valid JWTs and appropriate roles.

Env configuration:

- JWKS mode (recommended):
  - `AUTH_JWKS_URL` – JWKS endpoint URL
  - `AUTH_ISSUER` – expected issuer (optional, recommended)
  - `AUTH_AUDIENCE` – expected audience (optional, recommended)
- HMAC mode (dev/local):
  - `AUTH_JWT_SECRET` – HS256 secret
- Toggle enforcement:
  - `AUTH_REQUIRED=true`

Roles:

- `admin`: queue_admin, enqueue_jobs, view_status
- `developer`: enqueue_jobs, view_status
- `viewer`: view_status

Tenant authorization:

- Admins can operate on any tenant
- Non-admin tokens must include a `tenant` claim matching the requested `--tenant`

Usage examples:

- Enqueue with token:
  ```bash
  export AUTH_REQUIRED=true
  node orchestration/cli.mjs engine enqueue orchestration/graph/projects/demo-01.yaml \
    --tenant acme-corp \
    --auth-token "Bearer <JWT>"
  ```
- Admin status (requires admin token):
  ```bash
  export AUTH_REQUIRED=true
  export AUTH_TOKEN="Bearer <ADMIN_JWT>"
  node orchestration/engine/bullmq/admin.mjs status | cat
  ```

See `docs/AUTH.md` for full details.
