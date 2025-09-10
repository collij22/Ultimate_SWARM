# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- (planned) AUV-0006: Order confirmation (GET `/api/orders/{id}` + `/order.html`).
- Phase 10a: New Primary MCPs `ref` (docs.search/docs.read), `brave-search` (web.search), and extended `fetch` (web.fetch); CLI `search-fetch`; DAG node `web_search_fetch`; router coverage report path.
- Phase 10b: Tri‑mode orchestration (deterministic/claude/hybrid) with:
  - Engine selector (`orchestration/lib/engine_selector.mjs`)
  - Subagent gateway (`orchestration/lib/subagent_gateway.mjs`) with Plan Mode, stop conditions, schemas, transcripts
  - Router handshake + executor (`mcp/router.mjs` + `orchestration/lib/tool_executor.mjs`) with per‑RUN_ID checksum caching
  - DAG integration for `agent_task`; observability events and spend ledgers
  - Report: Subagent Narrative section in `orchestration/report.mjs`
  - Role subagents: `.claude/agents/{requirements-analyst.md, rapid-builder.md, quality-guardian.md}`

### Changed

- Updated `mcp/policies.yaml` with capability mappings, allowlists, budgets, and TEST_MODE gating for `web.search`.
- Updated `orchestration/graph/projects/seo-audit-demo.yaml` to start with `web_search_fetch` step.
- Policies: Added per‑role budgets for A2 and C13; added informational `agents.claude.capabilities` hint list.
- `docs/*` updated for Phase 10b (execution modes, env vars, verification, report narrative).

### Fixed

- `mcp/router-report.mjs` Windows CLI detection; now writes `runs/router/coverage-report.json` reliably.

### Changed

- N/A

### Fixed

- N/A

### Security

- N/A

## [0.4.0] - 2025-09-06 — Phase 1 Complete

### Added

- **Result Card Validation**: Integrated ajv-cli for schema validation via `npm run validate:cards`
- **Artifact Consistency Check**: `orchestration/lib/artifact_consistency.mjs` verifies CVF expectations match runbook
- **Server Health Check**: Runbook checks for existing healthy server before starting to prevent double starts
- **Typed Exit Codes**: Standardized exit codes (101-105) for precise error reporting
- **Structured Failure Cards**: Version field added to all result cards for consistency

### Changed

- **CI Simplified**: All AUV-0002..0005 now use autopilot as single source of truth
- **ENV Propagation**: CVF step now receives proper environment variables including AUV_ID and SWARM_ACTIVE
- **AUV-0002 Specs**: Corrected to run products tests instead of cart tests to generate required artifacts
- **CI Resilience**: Added `if: always()` to artifact consistency and validation steps

### Fixed

- **Double Server Start**: Health check prevents duplicate server instances in CI and local runs
- **Validation Schema Path**: Uses correct `schemas/runbook-summary.schema.json` path
- **AUV-0002 Artifacts**: Now generates correct products UI screenshots and API JSONs per CVF requirements

### Documentation

- Marked Phase 1 as complete in roadmap
- Updated orchestration docs to reflect server health check behavior
- Removed obsolete `phase1_correction.md` as changes are now applied

## [0.2.0] - 2025-09-05

### Added

- **AUV capabilities & flows**
  - **AUV-0003 — Product Search & Filter**: query, price bounds, sorting; UI search; perf & CVF.
  - **AUV-0004 — Cart Summary**: `/api/cart/summary` with totals; `/cart.html` rows/totals UI; perf & CVF.
  - **AUV-0005 — Checkout**: `POST /api/checkout` returns `201 { orderId }`; `/checkout.html` form submit UI; perf & CVF.
- **Runbook v0.5** (`orchestration/runbooks/auv_delivery.mjs`):
  - Auto-authoring of Playwright specs from `capabilities/<AUV>.yaml` via `ensureTests()`.
  - One-shot **repair+retry** that captures failure context to `runs/<AUV>/repair/failure.json` and retries Playwright.
- **Test authoring library** (`orchestration/lib/test_authoring.mjs`):
  - New generators: **UI Checkout** (`genUiCheckoutSpec`) and **API Custom Cases** (`genApiCustomSpec`).
  - Cart summary generator accepts `setup + summary_path`.
  - Normalizes `/api/...` vs `API_BASE` paths.
- **Mock staging server** (`mock/server.js`):
  - `/api/products` now supports **q**, **minPrice**, **maxPrice**, **sort**.
  - **`/api/cart/summary`** (priced lines + totals).
  - **`POST /api/checkout`** with field validation → `201`.
  - Static pages **/products.html**, **/cart.html**, **/checkout.html** with data-testids aligned to specs.
- **CVF gate** (`orchestration/cvf-check.mjs`):
  - Expected artifact sets added for **AUV-0003/0004/0005**.
- **CI** (`.github/workflows/ci.yml`):
  - Added Lighthouse + CVF steps for **AUV-0003**, **AUV-0004**, **AUV-0005** with artifact uploads.
- **Hooks & Observability**:
  - `scripts/hooks/*` (session start/end, subagent stop, post tool) + `docs/Hooks.md`.
  - JSONL event stream at `runs/observability/hooks.jsonl` and per-AUV result cards.

### Changed

- **/products.html** updated to include search & price filter controls (aligned to AUV-0003 tests).
- Runbook uses shell-based spawn for cross-platform quoting; Playwright invocation consolidated.

### Fixed

- **Windows/PowerShell** env usage guidance; removed inline `FOO=bar npx ...` patterns.
- Lighthouse interstitial on localhost by using **127.0.0.1** and explicit Chrome flags.

### Security

- No new externally reachable services; mock server remains local-only. Policies unchanged.

## [0.1.0] - 2025-09-04

### Added

- Initial Swarm1 repository layout and contracts:
  - `contracts/openapi.yaml` baseline with `/health` endpoint.
  - `contracts/events.yaml` (AsyncAPI) with `cart.item.added.v1` sample.
- Core docs: `runbook.md`, `verify.md`, `operate.md`, `ARCHITECTURE.md`, and this `CHANGELOG.md`.
- MCP configuration: `mcp/policies.yaml`, `mcp/registry.yaml`.
- Test harness folders under `tests/` and robot structure for UI/API/visual.
- Orchestrator & agent prompts for core roles (A/B/C series) and aux agents.

### Changed

- None yet.

### Fixed

- None yet.

### Security

- Security policy defaults in `mcp/policies.yaml` (no prod by default, secret redaction).

## [0.3.0] - 2025-09-06

### Added

- Autopilot runbook (`orchestration/cli.mjs`, `runbooks/auv_delivery.mjs`).
- Auto-authoring of UI/API specs (`orchestration/lib/test_authoring.mjs`).
- AUV-0003/0005 proofs (UI, perf) locally and CI wiring for AUV-0003.
- Hooks result cards under `runs/<AUV-ID>/result-cards/`.

### Changed

- `docs/ARCHITECTURE.md`, `docs/ORCHESTRATION.md`, `docs/QUALITY-GATES.md` to reflect current operation.

### Fixed

- Playwright spec stability (network waits) and Lighthouse interstitials via 127.0.0.1.

### Security

- Semgrep gate designed; enforcement planned next minor.
