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

## What it does

1. **Starts** `mock/server.js` and waits for `/health`
2. **Ensures tests exist** (or generates them) per `capabilities/<AUV>.yaml`
3. **Runs Playwright specs** (UI/API)
4. **Runs Lighthouse perf** → `runs/<AUV>/perf/lighthouse.json`
5. **Runs CVF gate** → `orchestration/cvf-check.mjs <AUV>`
6. **Writes a result card** → `runs/<AUV>/result-cards/runbook-summary.json`

## Outputs

- **UI/API proofs** → `runs/<AUV>/ui/*`, `runs/<AUV>/api/*`
- **Perf proof** → `runs/<AUV>/perf/lighthouse.json`
- **CVF status** → console & exit code
- **Result card** → `runs/<AUV>/result-cards/runbook-summary.json`

## Troubleshooting (Windows)

- **Prefer PowerShell env**: `$env:STAGING_URL="http://127.0.0.1:3000"` (avoid inline `FOO=bar` cmd)
- **If Lighthouse fails on localhost**: use `127.0.0.1` (avoids Chrome interstitials)

## CI Integration

CI mirrors autopilot for AUV-0003; others can be added progressively to `.github/workflows/ci.yml`