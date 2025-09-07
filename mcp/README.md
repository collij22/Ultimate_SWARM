# Swarm1 MCP Router — Phase 4 Implementation

This repo uses a **capability-first** approach. Sub‑agents describe **what** they need
(`capabilities`) and the router decides **which tools** to grant based on
`/mcp/policies.yaml` and `/mcp/registry.yaml`.

Agents **do not** hard‑code specific tools in their prompts.

---

## Key Files

- **/mcp/registry.yaml** — catalog of 30 tools with `tier` (primary/secondary), capabilities, costs, and side effects
- **/mcp/policies.yaml** — global policy including:
  - `capability_map`: capability → candidate tools
  - `tiers`: consent & budgets (primary vs secondary) with budget overrides
  - `agents.allowlist`: per‑agent tool restrictions
  - `router`: preferences & behavior when a primary is missing
- **/mcp/router.mjs** — pure, deterministic routing engine with schema validation
- **/mcp/schemas/** — JSON schemas for registry and policies validation

---

## How the Router Decides (at a glance)

1. **Agent emits capabilities** (e.g., `perf.web`, `api.test`) — not tool names.
2. **Resolve candidates** via `capability_map` in `/mcp/policies.yaml`.
3. **Filter by agent allowlist** (if present under `agents.<agent>.allowlist`):
   - Keep only tools listed for that agent (`primary` / `secondary` buckets).
   - If no allowlist for the agent, use all candidates from `capability_map`.
4. **Prefer primary tools** (`routing.prefer_primary: true`).  
   If no primary remains:
   - Follow `routing.on_missing_primary` → `propose_secondary_with_budget` with `tiers.secondary.default_budget_usd`.
   - The Orchestrator seeks consent (and can apply `budget_overrides` per tool).
5. **Produce a Tool Plan** (passed to the agent as `<tool_allowlist>`), e.g.:
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

1. Add to **registry**:
   ```yaml
   tools:
     my-cool-tool:
       tier: primary
       kind: perf.web
       description: Lighthouse alternative
   ```
2. Map a capability in **policies**:
   ```yaml
   capability_map:
     perf.web: [lighthouse, bundle-analyzer, my-cool-tool]
   ```
3. (Optional) Add to an **agent allowlist**:
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
  1. `capability_map` includes a candidate for the requested capability, and
  2. `agents.<agent>.allowlist` hasn’t accidentally excluded it.
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

---

## Phase 4 Enhancements

### Schema Validation

All configurations are validated against JSON schemas on load:

- Registry schema enforces required fields: tier, capabilities, cost_model, side_effects
- Policies schema validates router defaults, capability mappings, and agent allowlists
- Detailed error messages pinpoint configuration issues

### Budget Management

```yaml
# Per-tool budget overrides
tiers:
  secondary:
    budget_overrides:
      vercel: 0.10 # Override default for specific tools
      k6: 0.50
      datadog: 0.20

# on_missing_primary policy
router:
  on_missing_primary:
    action: propose_secondary_with_budget
    default_budget_usd: 0.10
```

### API Key Configuration

Tools can specify custom environment variable names:

```yaml
tools:
  vercel:
    requires_api_key: true
    api_key_env: VERCEL_TOKEN # Optional: defaults to VERCEL_API_KEY
```

### Cost Models

All tools define explicit cost structures:

```yaml
cost_model:
  type: flat_per_run
  usd: 0.10
```

### Observability

- **Decision artifacts**: Written to `runs/router/<run_id>/decision.json`
- **Hooks log**: Router events in `runs/observability/hooks.jsonl`
- **Spend ledger**: Per-session tracking in `runs/observability/ledgers/<session_id>.jsonl`

### Testing

Comprehensive test suite (`tests/router.test.mjs`) validates:

- Schema validation errors
- Primary tier preference
- Budget enforcement and overrides
- Secondary consent requirements
- Agent allowlist filtering
- on_missing_primary policy
- API key validation
- Total budget ceilings
- Side effects tracking

### CLI Usage

```bash
# Validate configuration
node mcp/router.mjs --validate

# Dry run with verbose output
node mcp/router.mjs --dry --agent B7.rapid_builder --capabilities browser.automation,api.test

# With secondary consent and budget
node mcp/router.mjs --agent C16.devops_engineer --capabilities deploy.preview --secondary-consent --budget 0.50

# With custom session ID for ledger tracking
node mcp/router.mjs --agent A1.orchestrator --capabilities browser.automation --session my-session-123

# Test with custom environment
VERCEL_API_KEY=xxx DATADOG_API_KEY=yyy node mcp/router.mjs --agent A1.orchestrator --capabilities monitoring.saas
```

### Router Coverage Report

Generate a comprehensive analysis of your router configuration:

```bash
# Generate coverage report
node mcp/router-report.mjs

# Output includes:
# - Capabilities without primary tools
# - Unmapped tools not in any capability
# - Agents with restrictive allowlists
# - Missing budget overrides
# - Configuration statistics
```

The router is now bulletproof with deterministic tool selection, comprehensive validation, and full observability.
