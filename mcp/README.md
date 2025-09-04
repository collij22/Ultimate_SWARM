# Swarm1 MCP Router — Quick Guide

This repo uses a **capability-first** approach. Sub‑agents describe **what** they need
(`capabilities`) and the router decides **which tools** to grant based on
`/mcp/policies.yaml` and `/mcp/registry.yaml`.

Agents **do not** hard‑code specific tools in their prompts.

---

## Key Files
- **/mcp/registry.yaml** — catalog of tool IDs with `tier` (primary/secondary), `kind`, and description.
- **/mcp/policies.yaml** — global policy including:
  - `capability_map`: capability → candidate tools
  - `tiers`: consent & budgets (primary vs secondary)
  - `agents`: per‑agent allowlists and notes
  - `routing`: preferences & behavior when a primary is missing

---

## How the Router Decides (at a glance)

1) **Agent emits capabilities** (e.g., `perf.web`, `api.test`) — not tool names.
2) **Resolve candidates** via `capability_map` in `/mcp/policies.yaml`.
3) **Filter by agent allowlist** (if present under `agents.<agent>.allowlist`):
   - Keep only tools listed for that agent (`primary` / `secondary` buckets).
   - If no allowlist for the agent, use all candidates from `capability_map`.
4) **Prefer primary tools** (`routing.prefer_primary: true`).  
   If no primary remains:
   - Follow `routing.on_missing_primary` → `propose_secondary_with_budget` with `tiers.secondary.default_budget_usd`.
   - The Orchestrator seeks consent (and can apply `budget_overrides` per tool).
5) **Produce a Tool Plan** (passed to the agent as `<tool_allowlist>`), e.g.:
   ```yaml
   tool_plan:
     auv: AUV-001
     agent: performance-optimizer
     capabilities: [perf.web, perf.api]
     allowlist: [lighthouse, bundle-analyzer, latency-sampler]
     secondary_candidates: [k6]
     budgets:
       secondary_total_usd: 0.10
   ```

### Effective Allowlist = capability candidates ∩ agent allowlist
If the intersection is empty for a capability:
- Router proposes a **secondary** tool (if available) with a budget, or
- Emits an **escalation** to add a tool to `capability_map` or update the agent allowlist.

---

## Examples

### 1) Requirements Analyst → `docs.search`
- `capability_map.docs.search` → `[refdocs]` (primary)
- No agent allowlist overrides → **`refdocs` granted**

### 2) Performance Optimizer → `perf.api`
- `capability_map.perf.api` → `[latency-sampler]` (primary)
- Agent allowlist adds optional `k6` (secondary)  
  → Router grants **`latency-sampler`**; may propose **`k6`** if load test is required and consented.

### 3) Code Migrator → `code.codemod`
- `capability_map.code.codemod` → `[jscodeshift, ts-morph]` (both primary)
- Agent allowlist includes both → Router may pick **`jscodeshift`** by default; can add **`ts-morph`** for typed transforms.

---

## Adding a New Tool
1) Add to **registry**:
   ```yaml
   tools:
     my-cool-tool:
       tier: primary
       kind: perf.web
       description: Lighthouse alternative
   ```
2) Map a capability in **policies**:
   ```yaml
   capability_map:
     perf.web: [lighthouse, bundle-analyzer, my-cool-tool]
   ```
3) (Optional) Add to an **agent allowlist**:
   ```yaml
   agents:
     performance-optimizer:
       allowlist:
         primary: [lighthouse, bundle-analyzer, my-cool-tool]
   ```

---

## Tiers, Consent, & Budgets
- **Primary** tools: `require_consent: false` (free/local).
- **Secondary** tools: `require_consent: true` with per‑tool budgets (see `tiers.secondary`).
- Router proposes secondaries **only** when needed (missing primary or explicit capability requiring it).

---

## Safety Defaults
From `/mcp/policies.yaml`:
- `safety.allow_production_mutations: false` (no prod by default).
- Test‑mode required for payments/external calls where specified.
- Logs redact secrets by default (`api_keys`, `access_tokens`, `passwords`).

---

## Gotchas & Tips
- If a sub‑agent complains “tool not allowlisted,” check **both**:
  1) `capability_map` includes a candidate for the requested capability, and
  2) `agents.<agent>.allowlist` hasn’t accidentally excluded it.
- The order inside `capability_map` hints **preference** among equals.
- Keep agent prompts **capability‑oriented** so you can expand/replace tools without editing prompts.
- Use `agents.<agent>.serialized_files` to prevent parallel edits on lockfiles/migrations during migrations.

---

## File Layout (suggested)
```
/mcp/
  registry.yaml      # Tool catalog
  policies.yaml      # Capability map, agents allowlists, routing
  README.md          # This guide
```

Short and sweet: **Agents ask for capabilities, policies map to tools, allowlists shape the final set.**  
The router handles the rest.