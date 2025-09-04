## Orchestration — AUV Lifecycle & Scheduling

### AUV Lifecycle
1. **Define** AUV (`capabilities/AUV-*.yaml`): goals, acceptance, proofs, level target (L3).
2. **Design**: Requirements Analyst + Architect clarify scope, risks, contracts.
3. **Build**: Rapid Builder, Frontend, Backend, Database, AI (as needed).
4. **Robot**: Playwright/UI + API prove acceptance; artifacts under `runs/<AUV-ID>/...`.
5. **Gates**: CVF → QA → Security — all must be green to proceed.
6. **Finalize**: docs/runbooks, changelog, readiness checklist.
7. **DevOps**: staging deploy, observability, rollback rehearsal; optional promotion.

### Parallelization
- Default **parallel** across independent lanes.
- **Serialize** on: lockfiles, `db/migrations/**`, build system switches, and releases.
- See `orchestration/policies.yaml` for globs and rules.

### Inputs/Outputs (per lane)
- Each agent emits a **Result Card** (XML/JSON) with a concise summary + artifacts + next steps.
- Orchestrator merges results and decides promotion or escalation.

### Escalations
- If blocked, agents emit an `<escalation>` block with reason, requests, and impact.
- Orchestrator routes escalations to owners or re‑plans the AUV.

### Evidence & Traceability
- All proofs go to `runs/<AUV-ID>/<RUN-ID>/...` with stable filenames referenced in gates.
- Reports (lint/tests/security) go to `reports/**` and are linked from Result Cards.
