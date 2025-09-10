# Roadmap (Swarm1)

## ✅ Completed

### Phase 1: Foundation Hardening (Completed 2025-09-06)

- **Typed Exit Codes**: Standardized error reporting (101-105)
- **Result Card Validation**: ajv-cli integration for schema validation
- **CI Simplification**: All AUV-0002..0005 using autopilot approach
- **Server Health Checks**: Prevents double starts in CI and local runs
- **Artifact Consistency**: Automated verification of CVF expectations
- **ENV Propagation**: Fixed CVF step to receive proper environment variables

## Near-term (P0) — Phase 2: Brief Intake & AUV Compiler (Completed)

- **Brief Schema**: Create `contracts/brief.schema.json` for structured intake
- **AUV Compiler**: Build `orchestration/lib/auv_compiler.mjs` to convert briefs to capabilities
- **Requirements Agent Integration**: Wire `orchestration/lib/call_agent.mjs` for A2 analyst
- **Backlog Management**: Generate `capabilities/backlog.yaml` with dependencies
- **AUV-0006 — Order confirmation**: `GET /api/orders/{id}` + `/order.html`; CVF artifacts added

## Short-term (P1)

- **Security Gate in CI**: Semgrep + Gitleaks (fail on P0/P1 or any secret); upload findings to `runs/security/*`
- **QA Gate**: add lint + typecheck + unit to CI; publish `reports/qa/*`
- **Autopilot v0.6**: basic DAG runner scaffold for multi-step AUVs (`orchestration/graph/*`) — completed
- **Tool Router dry-run**: fixtures in `/mcp/adapters/router-fixtures` with budget telemetry

- **Blue/Green & canary toggles** in DevOps lane; rollback rehearsal docs
- **Visual regression lane** (`visual-compare` MCP) with an example spec
- **ADRs** for key decisions (`docs/decisions/ADR-0001.md`)

## Mid-term (P2)

- **Performance Optimizer lane** with budgets and per-AUV perf dashboards (partially via Phase 6 budgets)
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
