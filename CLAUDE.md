# CLAUDE.md — Swarm1 Global Operating Guide

## 0) Scope & Audience
- Applies to: **Orchestrator (Brain)** and all **sub-agents**.
- Covers: development standards, orchestration rules, testing & release gates, and tool (MCP) usage policy.

## 1) Swarm1 Operating Principles
- **Atomic Unit of Value (AUV):** Every change must add one *independently verifiable capability* (e.g., “user can add to cart”).
- **Capability Validation Framework (CVF):** An AUV is *done* only when its outcome is proven by automated checks and artifacts.
- **Reality-First Development (RFD):** Prefer real data/services and staging environments early; minimize mocks.
- **Deliverable Level-3 Minimum:** Each increment must be runnable and usable end-to-end by a user (or robot).
- **Working at Every Commit:** If regression tests fail, the merge is blocked.
- **Micro-iterations:** Plan → implement the smallest AUV → prove → regress → deploy to staging → repeat.

## 2) Roles & Responsibilities

### 2.1 Orchestrator (Brain)
- Decompose requests into AUVs; maintain `/capabilities/auv_catalog.yaml`.
- Produce a **Tool Plan** per AUV (see §4), pass a minimal **allowlist** of tools to sub-agents, and enforce gates.
- After each increment: run **User Robot** (UI/API/Data modes), **full regression**, and **security gate**.
- Halt on regression or missing proof; never “assume success”.

### 2.2 Sub-Agents (Specialists)
- Execute a *single, narrow* task with the tools in your allowlist.
- **Proof obligations:** attach required artifacts (screenshots, videos, traces, logs, reports) defined by the AUV/CVF.
- If a needed capability lacks an allowed tool, request **escalation** (name the tool, reason, expected cost/impact).
- Keep outputs minimal, composable, and aligned with the AUV’s acceptance criteria.

## 3) Definition of Done (DoD) — Gates
An AUV is **Done** only if all gates pass:

1) **Build & Start Gate**
   - Backends boot; frontends build; migrations apply; containers stay up.

2) **Capability Gate (CVF)**
   - Required **proof artifacts** exist and match the AUV contract (e.g., Playwright video, DOM snapshot, API 200 trace, DB assertion).

3) **Regression Gate**
   - All prior AUV robot tests pass (no capability regressions).

4) **Security Gate**
   - Security scan has no high/critical findings; dependency checks pass.

5) **Deliverable Level-3 Gate**
   - The increment is runnable by a user (or robot) end-to-end with documented steps.

**No green gates → no merge.**

## 4) Tools & MCP Policy (dynamic, not hard-coded)
**Goal:** Use MCPs heavily without baking tool lists into prompts.

- **Registry & Policies:**
  - `/mcp/registry.yaml` — canonical list of tools with metadata (capabilities, `tier: primary|secondary`, auth, cost).
  - `/mcp/policies.yaml` — rules that map AUV **capabilities → tools**, plus bundles (e.g., `payment_enabled_webapp`) and consent/budget rules.

- **Primary vs Secondary:**
  - **Primary:** free/core tools (e.g., filesystem, Playwright, HTTP client, security scan, docs/ref).
  - **Secondary:** paid/provider-specific (e.g., hosted DB, deploy, search/crawl, payments). Require consent/budget.

- **Tool Plan (Orchestrator):**
  For each AUV, compute a plan with:
  - `capabilities_needed`, `selected_tools` (with reasons), any `secondary_tools_requested` (budget & consent), and **required proofs**.

- **Agent Contract:**
  - Use only allowlisted tools; **explain your selection**; attach proofs.
  - If a tool is missing, ask for escalation (state capability gap + proposed tool).

- **“Always check docs” without hard-coding:**
  - Policies add `docs.search` capability when new/unknown APIs are detected; registry resolves it (e.g., Ref MCP).

- **Fallbacks:**
  - If Secondary is denied/unavailable, route to local equivalents (e.g., local Postgres/Docker staging) to keep “working at every commit”.

## 5) Testing Standards (evidence-first)
- **Unit:** Core logic; target high value coverage (not vanity %).
- **Integration:** API, DB, queues, third-party edges.
- **E2E (User Robot):** Real user journeys (UI/API/Data modes) produce **video/snapshots/traces** as proof.
- **Security:** Static scan each green run; fail on high/critical.
- **Performance (as applicable):** Basic SLAs documented per project; test critical paths.

**Artifacts are mandatory**—tests must emit machine-readable logs and human-readable summaries.

## 6) Workflow
- **Branching:** `main` (prod), `develop` (staging), `feature/*`.
- **CI:** On PR, run build/start, CVF, regression, security; block on failure.
- **Day-one Deploy:** If green, auto-deploy to **staging**; prefer real services early (RFD).
- **Release:** Finalizer integrates assets, checks Level-3, and publishes runbook.

## 7) Code & Security Baseline
- **Quality:** SOLID/DRY/KISS; small modules; typed APIs; meaningful tests.
- **Security:** No secrets in VCS; parameterized queries; authZ/authN enforced; secure headers in prod; dependency updates; threat-model major changes.
- **Data:** Explicit migrations; seed only as required by AUVs (no arbitrary bulk fixtures).

## 8) Repository Conventions
```
/.claude/agents/           # Orchestrator + sub-agent SOPs (role-focused)
/capabilities/             # AUV catalog + deliverable levels + CVF templates
/tests/robot/              # UI/API/Data robot specs, fixtures, reporters
/orchestration/            # Orchestrator loop, gates, regression runners
/mcp/                      # registry.yaml, policies.yaml, adapters/
/deploy/                   # CI/CD, infra-as-code, staging/prod configs
/docs/                     # Runbooks, user guides; include “How to verify”
```

## 9) Prompts: Global vs Role-Specific
- **This file (global):** Principles, gates, MCP policy model, and repo norms.
- **Orchestrator.md:** How to decompose, plan tools, delegate, gate, and stop.
- **Sub-agents:** Narrow SOPs and *proof obligations*—focus on execution details, not global doctrine duplication.

## 10) Interaction & Logging
- Keep logs structured + a concise markdown summary per run (artifacts linked).
- Sub-agents should escalate early with *specific* questions (include context, failing artifact, and proposed remedy).
- All tool calls and artifacts are traceable back to AUV IDs.

## 11) Quick Rules of Engagement
- Add **one** AUV at a time; ship it **working**.
- Don’t proceed if the **User Robot** fails. Fix or escalate.
- Prefer editing existing files; avoid dead scaffolds.
- Never mark Done without **proof artifacts** and passing **all gates**.
- MCP lists live in **registry/policies**. Don’t hard-code tools into prompts.

## Glossary
- **AUV:** Atomic Unit of Value — a single user-perceivable capability.
- **CVF:** Capability Validation Framework — definition of outcomes + required proofs per AUV.
- **User Robot:** Automated user/test agent (UI/API/Data modes) producing evidence.
- **Deliverable Level-3:** Runnable, independently usable increment.
- **Primary/Secondary MCP:** Free/core vs. paid/provider-specific tools governed by policy.

## Appendix A — Minimal AUV Template (YAML)
```yaml
auv:
  id: CART-ADD-001
  user_story: "As a user, I can add a product to cart."
  capabilities: ["browser.automation", "api.test", "docs.search"]
  acceptance:
    outcome: ["cart count increases by 1", "item visible in cart view"]
    proofs:
      - playwright_video
      - dom_snapshot: ".cart-count==1"
      - api_trace: "POST /api/cart -> 200"
  deliverable_level: 3
```

## Appendix B — Orchestrator Tool Plan (schema)
```json
{
  "task": "Implement CART-ADD-001",
  "capabilities_needed": ["browser.automation", "api.test", "docs.search"],
  "selected_tools": [
    {"id": "playwright", "reason": "run E2E flow"},
    {"id": "fetch", "reason": "verify API 200"},
    {"id": "refdocs", "reason": "confirm latest framework usage"}
  ],
  "secondary_tools_requested": [],
  "constraints": {"max_runtime_sec": 180},
  "required_proofs": ["playwright_video", "dom_snapshot:.cart-count==1", "api_trace:/api/cart 200"]
}
```