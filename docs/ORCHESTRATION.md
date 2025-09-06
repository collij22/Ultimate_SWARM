# Orchestration — AUV Lifecycle & Scheduling

## AUV Lifecycle

1. **Define** AUV (`capabilities/AUV-*.yaml`): goals, acceptance, proofs, level target (L3)
2. **Design**: Requirements Analyst + Architect clarify scope, risks, contracts
3. **Build**: Rapid Builder, Frontend, Backend, Database, AI (as needed)
4. **Robot**: Playwright/UI + API prove acceptance; artifacts under `runs/<AUV-ID>/...`
5. **Gates**: CVF → QA → Security — all must be green to proceed
6. **Finalize**: docs/runbooks, changelog, readiness checklist
7. **DevOps**: staging deploy, observability, rollback rehearsal; optional promotion

## Parallelization

- **Default parallel** across independent lanes
- **Serialize on**: lockfiles, `db/migrations/**`, build system switches, and releases
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

1. **Start mock server**, wait `/health`
2. **Ensure tests exist** (`orchestration/lib/test_authoring.mjs`; generates from `capabilities/<AUV>.yaml` if missing)
3. **Run Playwright** (UI/API)
4. **Run Lighthouse** → `runs/<AUV>/perf/lighthouse.json`
5. **Run CVF gates** (`orchestration/cvf-check.mjs`)

Artifacts live under `runs/<AUV-ID>/...`. CI replays similar steps and uploads artifacts.

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

CI mirrors autopilot for 0003; others can be added progressively