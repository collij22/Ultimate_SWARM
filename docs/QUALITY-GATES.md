## Quality Gates — Definition of Done (DoD) Contract

**An AUV is DONE only when ALL gates pass. No exceptions.**

### 1. Build & Start Gate

- **Requirement**: Backends boot; frontends build; migrations apply; containers stay up.
- **Exit Code**: 105 (Server startup failed)
- **Validation**: Health check passes at `${STAGING_URL}/health` within 20s
- **Retry Policy**: Exponential backoff with transient failure detection

### 2. Capability Gate (CVF)

- **Requirement**: Required proof artifacts exist and match the AUV contract.
- **Exit Code**: 103 (CVF gate failed)
- **Script**: `node orchestration/cvf-check.mjs <AUV-ID>`
- **Artifacts**: Screenshots, videos, API traces, performance reports per `capabilities/<AUV>.yaml`
- **Validation**: File existence + format validation (JSON parsing, performance scores)
- **Source of Truth**: Expected artifacts defined in `orchestration/lib/expected_artifacts.mjs`

### 3. Functional Gate (Playwright)

- **Requirement**: All UI and API tests pass for current AUV.
- **Exit Code**: 101 (Playwright tests failed)
- **Retry Policy**: Single retry for transient failures (timeouts, network, browser crashes)
- **Evidence**: Test videos, DOM snapshots, API response logs

### 4. Regression Gate

- **Requirement**: All prior AUV robot tests pass (no capability regressions).
- **Exit Code**: 101 (Playwright tests failed)
- **Scope**: Full test suite across all implemented AUVs
- **Failure Mode**: Block merge immediately

### 5. Security Gate (Phase 6)

- **Requirement**: No unwaived high/critical findings or secrets.
- **Exit Codes**:
  - 301 (Semgrep high/critical findings)
  - 302 (Gitleaks secrets detected)
- **Scripts**:
  - `node orchestration/security/semgrep.mjs`
  - `node orchestration/security/gitleaks.mjs`
- **Waivers**: Time-bound (30 days) in `.security/waivers.yaml`
- **Reports**: `reports/security/*.json` with scan results

### 6. Visual Regression Gate (Phase 6)

- **Requirement**: Visual changes within configured thresholds.
- **Exit Code**: 303 (Visual regression exceeded)
- **Scripts**:
  - `node orchestration/visual/capture.mjs --auv <ID>`
  - `node orchestration/visual/compare.mjs --auv <ID>`
- **Threshold**: Default 0.1% pixel difference (configurable per route)
- **Baselines**: Version-controlled in `tests/robot/visual/baselines/`

### 7. Performance Budget Gate (Phase 6)

- **Requirement**: Metrics within defined budgets.
- **Script**: Integrated in CVF via `orchestration/lib/budget_evaluator.mjs`
- **Metrics**: LCP, TTI, CLS, FCP, TBT, SI, size, score
- **Budgets**: Defined in `capabilities/<AUV>.yaml` under `perf_budgets`
- **Enforcement**: >20% over = high severity (blocking)
- **TEST_MODE Behavior (Phase 12)**: If Lighthouse results are unavailable in TEST_MODE, performance budget evaluation is marked as "skipped" and does not block CVF. A budget evaluation summary is still written to `runs/<AUV>/perf/budget-evaluation.json` documenting the skip reason.

### 8. Deliverable Level-3 Gate

- **Requirement**: The increment is runnable by a user (or robot) end-to-end.
- **Validation**: Manual verification or robot journey completion
- **Documentation**: Runbook with clear "How to verify" steps

### 9. Domain-Specific Gates (Phase 11)

#### Data Domain (Exit Code 305)

- **Validates**: `insights.json` against schema
- **Thresholds**: `min_rows` (default: 10), `min_metrics` (default: 1)
- **Script**: `node orchestration/lib/data_validator.mjs <path>`
- **Checksum**: Validates source file integrity if manifest present

#### Charts Domain (Exit Code 306)

- **Validates**: PNG chart files (format, dimensions, content)
- **Thresholds**: `min_width/height` (400x300); optional `max_width/height` when configured via policy/AUV
- **Script**: `node orchestration/lib/chart_validator.mjs <path>`
- **Content Check**: Ensures charts aren't blank/uniform

#### SEO Domain (Exit Code 307)

- **Validates**: SEO audit results JSON
- **Thresholds**: `max_broken_links` (5), `min_canonical_rate` (0.8), `max_load_time_ms` (3000), `pageIssueFailRate` (default 0.9)
- **Script**: `node orchestration/lib/seo_validator.mjs <path>`
- **Checks**: Broken links, canonical tags, sitemap presence, page load times; page-level issues fail only when the share of affected pages exceeds `pageIssueFailRate`

#### Media Domain (Exit Code 308)

- **Validates**: Media composition metadata
- **Thresholds**: `duration_tolerance_pct` (10%), `min_width/height` (640x480), `required_audio_track` (true)
- **Script**: `node orchestration/lib/media_validator.mjs <path>`
- **Checks**: Duration variance, video dimensions, audio track presence

### 10. Secondary Tool Gates (Phase 13)

Phase 13 introduces capability-aware validation for Secondary (paid/external) tool artifacts:

#### Web Crawl (firecrawl)

- **Validates**: `runs/tenants/{tenant}/crawl_demo/urls.json` and `graph.json`
- **Checks**: Valid JSON array format, graph nodes/edges structure
- **TEST_MODE**: Generates deterministic fixture with synthetic URLs

#### Payments Test (Stripe)

- **Validates**: `runs/tenants/{tenant}/payments_demo/payment_intent.json` and `charge.json`
- **Checks**: payment_intent.status === 'succeeded', charge.paid === true
- **TEST_MODE**: Synthesizes test payment data with test IDs

#### Cloud DB (Supabase)

- **Validates**: `runs/tenants/{tenant}/db_demo/connectivity.json` and `roundtrip.json`
- **Checks**: status === 'connected', roundtrip query success
- **TEST_MODE**: Returns connectivity stub with mock latency

#### Cloud TTS

- **Validates**: `runs/tenants/{tenant}/tts_cloud_demo/narration.wav`
- **Checks**: Valid WAV format, duration within tolerance
- **TEST_MODE**: Generates WAV header with silence matching text duration

All Secondary tools require:

- **TEST_MODE=true** for restricted categories (payments, external_crawl, cloud_db, tts.cloud)
- **Explicit consent** via `secondary_consent: true` or `consent_token`
- **Budget allocation** with per-tool overrides in policies.yaml
- **API keys** normally required; in `TEST_MODE=true`, Secondary stubs bypass real key checks in routing for deterministic planning

#### Database Domain (Exit Code 309)

- **Validates**: Migration execution results
- **Thresholds**: `max_failed_migrations` (default 0), `validation_required` (default false; enable in CI as required)
- **Script**: `node orchestration/lib/db_migration_validator.mjs <path>`
- **Checks**: Migration status, validation queries, schema snapshot; JSON parsing errors reported explicitly

#### Auto-detection in Strict Mode

When `--strict` is used without `--domains`, CVF automatically detects and validates all domains with artifacts present.

#### Demo Nodes and Fixtures (Phase 12)

- `demo_runbook` node (graphs: data-video-demo, seo-audit-demo) generates a minimal runbook summary only for demo AUVs (AUV‑1201/1202) under DEMO_MODE/TEST_MODE. Production runs should rely on the standard runbook.
- `web_search_fetch` honors TEST_MODE and uses a canonical-rich local HTML fixture to produce deterministic SEO artifacts when API keys are unavailable.

#### Threshold Configuration

Domain thresholds can be configured at multiple levels:

1. **Global defaults**: `mcp/policies.yaml` under `cvf.thresholds.<domain>`
2. **Per-AUV overrides**: `capabilities/<AUV>.yaml` under `cvf.thresholds.<domain>`
3. **Hardcoded fallbacks**: In each validator module as constants

### Error Handling & Observability

- **Result Cards**: All runs produce structured JSON summary in `runs/<AUV>/result-cards/`
- **Validation**: Cards validated against `schemas/runbook-summary.schema.json` using ajv-cli
- **Timing Data**: Per-step duration tracking for performance analysis
- **Failure Classification**: Transient vs. persistent error detection
- **Repair Loop**: Automatic retry for network/browser/server transients only

### Typed Exit Codes (Updated for Phase 6 and utility gates)

```
0   - Success
1   - General error
2   - Usage error

# Phase 1-5 Exit Codes
101 - Playwright tests failed
102 - Lighthouse performance check failed
103 - CVF gate failed
104 - Test authoring failed
105 - Server startup failed

# Phase 5 Build Lane Exit Codes
201 - Format failed
202 - Lint failed
203 - Typecheck failed
204 - Unit tests failed
205 - Integration tests failed
206 - Autopilot smoke failed
207 - Git push failed
208 - PR creation failed
209 - Patch apply failed

# Phase 6 Security & Quality Exit Codes
301 - Semgrep high/critical findings
302 - Gitleaks secrets detected
303 - Visual regression exceeded threshold
304 - Performance budget violation (reserved)

# Phase 11 Domain Validation Exit Codes
305 - Data validation failed (insights.json)
306 - Charts validation failed (PNG integrity/dimensions)
307 - SEO audit failed (broken links/canonical rate)
308 - Media composition failed (duration/tracks)
309 - Database migration failed (schema/validation)

# Phase 11+ Utility Gates
501 - Preflight failed (environment/binaries/router health)
502 - Graph normalization required (graph-lint detected canonical fixes)
503 - Router enforcement failed (coverage/orphans/unmapped tools)
```

### Quality Standards (Additional Gates)

#### QA Gate

- **Lint**: no errors; warnings allowed below N.
- **Typecheck**: no errors.
- **Unit/Integration**: pass rate ≥ 99%; flaky tests quarantined.
- **Visual regression**: no critical diffs (use `visual-compare` MCP).
- **Coverage** (optional): lines ≥ 80% on changed files.

#### Security Gate (Optional)

- **SAST (semgrep)**: no P0/P1; P2 allowed with waiver (ID, owner, expiry).
- **Secrets (gitleaks)**: 0 findings.
- **IaC (checkov)**: no criticals.
- **Container (trivy)**: no criticals; highs require note/waiver.
- **Headers/CSP (fetch)**: HTTPS + HSTS + CSP present on staging.

#### Performance Gate (Per AUV)

- **Web**: LCP ≤ 2500ms, TTI ≤ 3000ms, CLS ≤ 0.10, transfer ≤ 250KB.
- **API**: p95 ≤ 200ms for hot endpoints.
- **DB**: hot query ≤ 50ms; rows scanned ≤ 1k.
- **Lighthouse**: Required for all AUVs with UI components

### Enforcement

- **Autopilot**: `node orchestration/cli.mjs <AUV-ID>` runs all mandatory gates
- **CI Integration**: Pipeline mirrors autopilot execution with same gates
- **No Green Gates → No Merge**: All gates must pass before AUV is considered complete

> Thresholds are defaults; adjust per AUV in `mcp/policies.yaml` or capability-specific overrides.

---

## Advisory Sections (Phase 14)

- Intent comparison and reference visuals are **advisory only** and do not affect CVF or exit codes.
- Reports must remain fully offline: assets are embedded or copied under `dist/<AUV>/assets/**`; no `runs/**` or external URLs in HTML.
- `report-metadata.json` may include `report.sections.intent_compare` and `spend_summary` for client-facing transparency; these are not gates.
