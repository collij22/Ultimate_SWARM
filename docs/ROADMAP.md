# Roadmap (Swarm1)

## Near-term (P0)

- **AUV-0006 — Order confirmation**: `GET /api/orders/{id}` + `/order.html`; CVF artifacts added
- **Security Gate in CI**: Semgrep + Gitleaks (fail on P0/P1 or any secret); upload findings to `runs/security/*`
- **QA Gate**: add lint + typecheck + unit to CI; publish `reports/qa/*`
- **Autopilot v0.6**: basic DAG runner scaffold for multi-step AUVs (`orchestration/graph/*`)
- **Tool Router dry-run**: fixtures in `/mcp/adapters/router-fixtures` with budget telemetry

## Short-term (P1)

- **Blue/Green & canary toggles** in DevOps lane; rollback rehearsal docs
- **Visual regression lane** (`visual-compare` MCP) with an example spec
- **ADRs** for key decisions (`docs/decisions/ADR-0001.md`)

## Mid-term (P2)

- **Performance Optimizer lane** with budgets and per-AUV perf dashboards
- **Code Migrator workflows** (codemods + serialize_globs)
- **Swap mock** for a feature-flagged real app target

## Long-term (P3)

- **Multi-tenant Upwork-style ingestion** (brief → backlog of AUVs)
- **Cost telemetry & per-AUV budgets** (router-integrated)
- **Self-service web UI** for evidence browsing and gate status

---

## Priority Legend

- **P0**: Critical/blocking for next milestone
- **P1**: High priority for current quarter
- **P2**: Medium priority for next quarter  
- **P3**: Future vision/nice-to-have
