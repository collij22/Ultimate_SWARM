## Swarm1: Strategy & Principles (11 sections)

### 1) Vision & Non‑Goals

Swarm1 executes end‑to‑end **AUVs** that ship value quickly with **evidence**. Not a research toy; not a monolith of agents.
We optimize for **reliability**, **repeatability**, and **low-risk promotion**.

### 2) AUVs & Deliverable Levels

- AUV spec lives in `capabilities/AUV-*.yaml` (id, acceptance, proofs, deliverable_level).
- Deliverable levels: **L1 draft → L2 integrated → L3 runnable** (default target).  
  L3 requires artifacts and rollback plan.

### 3) Orchestrator & Lanes

- Orchestrator fans out to lanes (Requirements → Design/Arch → Build → Robot → Gates → Finalize → DevOps).
- Lanes run **in parallel** when safe; **serialize** on lockfiles, DB migrations, build switches.
- Each lane emits a **Result Card** (machine‑readable XML/JSON).

### 4) Agent Roster & Contracts

- 16 core agents + aux (Performance Optimizer, Code Migrator).
- Each agent has a focused **system prompt**, strict inputs/outputs, and a checklist.
- Agents declare **capabilities**, not tools; Router grants allowlisted tools.

### 5) MCP Strategy & Tool Routing

- `mcp/registry.yaml` (v2) — tool metadata (`capabilities`, `requires_api_key`, `side_effects`, `api_key_env`).
- `mcp/policies.yaml` — **capability_map** + **agents.allowlist** + **tiers/budgets** + **routing**.
- Primary tools first; propose Secondary with budget when needed.
- **Capability derivation**: Router automatically derives capabilities from AUV specs via `deriveCapabilities()` function based on `authoring_hints` (UI→browser.automation, API→api.test, etc.)

### 6) Contracts First (HTTP & Events)

- **OpenAPI** in `contracts/openapi.yaml`.
- **AsyncAPI** in `contracts/events.yaml` (versioned topics `.vN`).
- Schema/migrations additive and reversible.

### 7) User Robot & Proofs

- **Playwright (UI)** and **Request API (HTTP)** under `tests/robot/playwright`.
- Deterministic artifacts in `runs/<AUV-ID>/...` → videos, screenshots, traces, JSON dumps.

### 8) Quality Gates (CVF → QA → Security)

- **CVF** validates **acceptance proofs** exist and match.
- **QA** runs lint/type/unit/integration/visual; thresholds in `docs/QUALITY-GATES.md`.
- **Security** runs SAST/secrets/IaC/container and header checks; waivers require ID/expiry.

### 9) DevOps: Staging‑First & Rollback

- Deterministic builds (digests/SBOM optional), deploy **staging** first, observability wired.
- Promotion only with green gates and approvals; rehearse rollback (blue/green, canary).

### 10) Documentation & Traceability

- Each AUV updates `docs/verify.md`, `docs/runbook.md`, and the **CHANGELOG**.
- Evidence is the source of truth: artifacts in `runs/**`, reports in `reports/**`.

### 11) Continuous Improvement & Roadmap

- Capture issues as **ADRs** (optional) in `docs/decisions/`.
- Roadmap tracked in `docs/ROADMAP.md` (prioritized list).
- Regularly refine **capability_map** and **allowlists** as tools evolve.

## Mapping → Where to look

- Strategy (this doc) → **docs/SWARM1-GUIDE.md**
- Architecture & lifecycle → **docs/ARCHITECTURE.md**, **docs/ORCHESTRATION.md**
- Gates and thresholds → **docs/QUALITY-GATES.md**
- Contracts → **contracts/openapi.yaml**, **contracts/events.yaml**
- MCP routing → **mcp/README.md**, **mcp/registry.yaml**, **mcp/policies.yaml**
- AUV specs & verification → **capabilities/**, **docs/verify.md**
- Operations → **docs/runbook.md**, **docs/operate.md**
