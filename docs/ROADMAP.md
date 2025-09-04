# Roadmap (Swarm1)

## Near-term (P0)
- Real staging integration (env + secrets via secret manager MCP).
- CI: add lint/type/unit to QA gate; wire semgrep/gitleaks/checkov/trivy to Security gate.
- Expand AUV catalog (AUV‑0002, AUV‑0003) and link verify steps.
- Implement Tool Router dry‑run with fixtures (see `/mcp/adapters/router-fixtures`).

## Short-term (P1)
- Blue/Green in DevOps lane with canary toggles and auto‑abort.
- Add `visual-compare` MCP and a sample visual regression test.
- Introduce ADRs for significant decisions (`docs/decisions/ADR-0001.md`).

## Mid-term (P2)
- Add Performance Optimizer lane with budgets and reports.
- Add Code Migrator workflows (codemods + serialize_globs).
- Replace mock with real app(s) as targets (feature‑flagged).

## Long-term (P3)
- Multi-tenant project orchestration (Upwork‑style ingestion).
- Cost telemetry & budgets per AUV.
- Self‑service web UI for evidence browsing and gate status.
