## Quality Gates — Definitions & Thresholds

### CVF (Capability Validation & Fitness)
- Confirms that **required proofs** for the AUV exist and match acceptance (HTTP, UI, traces).
- Script example: `node orchestration/cvf-check.mjs AUV-0001`.
- Fails if artifacts missing or stale.

### QA Gate
- **Lint**: no errors; warnings allowed below N.
- **Typecheck**: no errors.
- **Unit/Integration**: pass rate ≥ 99%; flaky tests quarantined.
- **Visual regression**: no critical diffs (use `visual-compare` MCP).
- **Coverage** (optional): lines ≥ 80% on changed files.

### Security Gate
- **SAST (semgrep)**: no P0/P1; P2 allowed with waiver (ID, owner, expiry).
- **Secrets (gitleaks)**: 0 findings.
- **IaC (checkov)**: no criticals.
- **Container (trivy)**: no criticals; highs require note/waiver.
- **Headers/CSP (fetch)**: HTTPS + HSTS + CSP present on staging.

### Performance (if applicable)
- **Web**: LCP ≤ 2500ms, TTI ≤ 3000ms, CLS ≤ 0.10, transfer ≤ 250KB.
- **API**: p95 ≤ 200ms for hot endpoints.
- **DB**: hot query ≤ 50ms; rows scanned ≤ 1k.

> All thresholds are defaults; adjust per AUV in `mcp/policies.yaml` or a per‑AUV override.
