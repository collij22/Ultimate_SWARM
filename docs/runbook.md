# Runbook — One-Button AUV Delivery

This runbook uses the autopilot to: start the mock staging server → ensure or auto-author tests → run Playwright (UI/API) → run Lighthouse → run CVF → write a result card.

## Prerequisites

- `STAGING_URL=http://127.0.0.1:3000`
- `API_BASE=http://127.0.0.1:3000/api`
- Node 20+, Playwright deps installed (`npx playwright install --with-deps`)

## Run (examples)

```bash
# Product search & filter
node orchestration/cli.mjs AUV-0003

# Cart summary totals
node orchestration/cli.mjs AUV-0004

# Checkout
node orchestration/cli.mjs AUV-0005
```

### Phase 10b — Execution Modes (DAG)

```bash
# Deterministic
node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml --mode deterministic

# Claude subagents (Plan Mode; TEST_MODE recommended for web.search)
set SWARM_MODE=claude && node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml

# Hybrid (include specific roles)
set SWARM_MODE=hybrid && set SUBAGENTS_INCLUDE=A2.requirements_analyst,B7.rapid_builder && node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml

# Demo pipelines (Phase 12)
set TEST_MODE=true && node orchestration/graph/runner.mjs orchestration/graph/projects/data-video-demo.yaml
set TEST_MODE=true && node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml
```

### Phase 10a — Search & Fetch Proof

```bash
# Tangible artifacts for web search + fetch
node orchestration/cli.mjs search-fetch "ref-tools MCP server"

# Artifacts:
# runs/websearch_demo/summary.json
# runs/websearch_demo/brave_search.json
# runs/websearch_demo/first_result.html
# runs/websearch_demo/first_result_snippet.txt
```

## What it does

1. **Checks for healthy server** (or starts `mock/server.js`) and waits for `/health`
2. **Ensures tests exist** (or generates them) per `capabilities/<AUV>.yaml`
3. **Runs Playwright specs** (UI/API) with retry logic for transient failures
4. **Runs Lighthouse perf** → `runs/<AUV>/perf/lighthouse.json`
5. **Runs CVF gate** → `orchestration/cvf-check.mjs <AUV>` with proper ENV propagation
6. **Writes a versioned result card** → `runs/<AUV>/result-cards/runbook-summary.json`

## Outputs

- **UI/API proofs** → `runs/<AUV>/ui/*`, `runs/<AUV>/api/*`
- **Perf proof** → `runs/<AUV>/perf/lighthouse.json`
- **CVF status** → console & exit code
- **Result card** → `runs/<AUV>/result-cards/runbook-summary.json`

## Troubleshooting (Windows)

- **Prefer PowerShell env**: `$env:STAGING_URL="http://127.0.0.1:3000"` (avoid inline `FOO=bar` cmd)
- **If Lighthouse fails on localhost**: use `127.0.0.1` (avoids Chrome interstitials)

### Environment for Search

- `BRAVE_API_KEY` must be set for Brave Search.
- Router planning for `web.search` typically requires `TEST_MODE=true`.

## CI Integration

CI runs autopilot for AUV-0002, AUV-0003, AUV-0004, and AUV-0005 with full artifact validation.

## Validation

After running AUVs, validate result cards:

```bash
npm run validate:cards
```

This uses ajv-cli to validate all result cards against `schemas/runbook-summary.schema.json`
