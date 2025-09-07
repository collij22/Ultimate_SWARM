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
version: "1.0"
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
- `agent_task`: Placeholder for agent execution
- `package`/`report`: Future packaging/reporting

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
    page: "/products.html"
    selectors: "..."
    screenshot: "products_search.png"
  api: 
    base_path: "/products"
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