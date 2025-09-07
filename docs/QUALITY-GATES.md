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

### 8. Deliverable Level-3 Gate

- **Requirement**: The increment is runnable by a user (or robot) end-to-end.
- **Validation**: Manual verification or robot journey completion
- **Documentation**: Runbook with clear "How to verify" steps

### Error Handling & Observability

- **Result Cards**: All runs produce structured JSON summary in `runs/<AUV>/result-cards/`
- **Validation**: Cards validated against `schemas/runbook-summary.schema.json` using ajv-cli
- **Timing Data**: Per-step duration tracking for performance analysis
- **Failure Classification**: Transient vs. persistent error detection
- **Repair Loop**: Automatic retry for network/browser/server transients only

### Typed Exit Codes (Updated for Phase 6)

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
