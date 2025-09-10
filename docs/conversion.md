### Swarm1 Conversion Plan — Three Execution Modes (Deterministic, Claude Subagents, Hybrid)

#### Objectives

- Introduce three rigorously defined execution modes while preserving safety, evidence, and reproducibility:
  1. Deterministic (current): Node/DAG + MCP router executes all work.
  2. Claude subagents only: Orchestrator delegates reasoning/planning to Claude subagents, still executes tools via router for safety.
  3. Hybrid: Per-role selection of deterministic vs Claude subagent execution.
- Ensure every step remains policy-aware (allowlists, budgets, TEST_MODE), leaves verifiable artifacts, and passes existing CVF/gates.

---

### Mode Definitions

#### 1) Deterministic (Current — default)

- Planner: Swarm1 orchestrator and MCP router select tools; DAG nodes call shared libraries and CLIs.
- Execution: Local modules call MCP servers directly, enforcing budgets and safety.
- Evidence: Artifacts in `runs/**` (JSON, HTML, media); CVF and quality gates validate success.

Use when: tasks are well-scoped, repeatable, and benefit from strict cost controls and determinism.

#### 2) Claude Subagents Only

- Planner: Claude orchestrator + subagents plan steps and request tools.
- Execution: Orchestrator executes all tool requests via our MCP router (not the subagent directly) to enforce allowlists, TEST_MODE, and budgets.
- Evidence: Subagent messages are stored as `runs/agents/<role>/**`; tool results written as usual under `runs/**` and linked back into the subagent thread transcript.

Use when: briefs are ambiguous, cross-domain, or require iterative synthesis (requirements, refactoring, doc generation, analysis).

#### 3) Hybrid

- Selection: Roles map to execution engines. Example:
  - Claude subagents: `A2.requirements_analyst`, `B7.rapid_builder`
  - Deterministic: `C13.quality_guardian`, `A1.orchestrator`
- Planner: Mixed — role-driven. Each node resolves to a role, then invokes the appropriate engine.
- Execution & Evidence: Same rules — orchestrator executes tools, budgets enforced, artifacts persisted.

Use when: some roles benefit from adaptivity while others need deterministic guardrails (e.g., gating, packaging).

---

### Subagent Contract (Claude)

- Blank context requirement: Each subagent receives a zero-context window; we must “pin” all essentials in the system prompt and the first user message.
- System prompt sources:
  - `.claude/agents/<role>.md` (role goals, constraints)
  - `.claude/agents/OUTPUT_STANDARDS.md` (formats, schemas to honor)
  - `.claude/agents/RETRIEVAL.md` (retrieval and citation guidance)
  - Tool guidance: reference capabilities and preferred MCPs (see below)
- First user message content (structured):
  - Brief summary and acceptance criteria (subset from `briefs/**` and `docs/QUALITY-GATES.md`)
  - Allowed capabilities, allowlisted MCPs, and per-capability budgets (from `mcp/policies.yaml`)
  - Artifact conventions (`runs/**` paths) and expected outputs (target schemas under `schemas/**`)
  - Current graph node context (inputs, prior artifacts)
- Response contract:
  - JSON “plan” with steps and tool_requests (see Handshake below)
  - Updated plan after each tool_result
  - Final `agent-output.json` conforming to `schemas/agent-output.schema.json`

---

### MCP Usage by Subagents (Preferred Map)

- docs.search, docs.read → `ref`
- web.search → `brave-search` (Router may require TEST_MODE=true for planning)
- web.fetch → `fetch`
- web.crawl → `crawler-lite` (primary) / `firecrawl` (secondary)
- data.ingest, data.query → `duckdb`
- data.insights → `insights`
- chart.render → `chart-renderer`
- seo.audit → `seo-auditor`
- doc.generate → `report-lite`
- image.process → `imagemagick`
- doc.convert → `pandoc`
- nlp.translate → `argos-translate`
- audio.tts → `tts-piper`
- video.compose → `ffmpeg`

Note: Even in “subagents only”, tool execution is performed by Swarm1 (not the subagent directly) to maintain safety, logs, and budgets.

---

### Tool Handshake (Subagent ↔ Orchestrator)

1. Subagent emits a `tool_requests` array, Plan Mode only:
   - Each item MUST include:
     - `capability`: string (e.g., `web.search`)
     - `purpose`: reason for the tool request
     - `input_spec`: normalized inputs (e.g., query/url/paths)
     - `expected_artifacts`: stable paths under `runs/**`
     - `constraints`: `{ test_mode?: boolean, max_cost_usd?: number, side_effects?: string[] }`
     - `acceptance`: explicit pass criteria (e.g., schema checks, counts)
     - `cost_estimate_usd`: estimated spend for this request
   - Subagents MUST NOT directly execute tools or mutate files; they only propose requests and diffs/changesets.
2. Orchestrator validates against `mcp/policies.yaml` (allowlists, budgets, TEST_MODE, safety gates) and evaluates spend envelope.
3. Orchestrator executes via MCP router and returns a normalized decision:
   - `{ decision, approved_budget_usd, selected_tools[], rejections[], artifacts[], normalized_outputs[] }`
4. Orchestrator delivers `tool_results` back to the subagent and updates spend ledgers; subagent updates the plan accordingly.
5. If any request is denied, orchestrator returns a structured policy denial; the subagent MUST propose policy-compliant alternatives or escalate.
6. On completion, subagent returns a validated `agent-output.json`.

Notes:

- All execution happens within the orchestrator to preserve safety, evidence, and budget control.

---

### Mode Selection (User/CLI/Graph)

- CLI flags:
  - `--mode deterministic|claude|hybrid`
  - `--subagents <ROLE_IDs>` (hybrid include)
  - `--no-subagents <ROLE_IDs>` (hybrid exclude)
- Environment:
  - `SWARM_MODE=deterministic|claude|hybrid`
  - `SUBAGENTS_INCLUDE=A2.requirements_analyst,B7.rapid_builder`
  - `SUBAGENTS_EXCLUDE=C13.quality_guardian`
- Graph-level override (optional):
  - Node param: `execution: claude|deterministic` (wins over global for that node)

---

### Plan Mode & Safety Defaults

- Subagents operate in Plan Mode by default: propose plans, `tool_requests`, and diffs/changesets only; no direct file writes or exec.
- Gated capabilities require TEST_MODE and/or explicit consent: `web.search`, `external_crawl`, `cloud_db`, `tts.cloud`, `payments`.
- Secondary tools require consent and budget; budgets are enforced per-agent and per-capability.
- Deterministic gates (CVF, security, packaging) remain authoritative in all modes.

---

### Orchestrator Changes (High Level)

1. `orchestration/lib/subagent_gateway.mjs` (new)
   - Sends/receives messages to Claude using your subscription setup
   - Injects system prompt + first message with policy/tool context
   - Persists transcripts under `runs/agents/<role>/thread.jsonl`
   - Enforces max-steps, rate limits, and timeouts
2. `orchestration/lib/engine_selector.mjs` (new)
   - Resolves role → deterministic or claude engine based on mode flags/env
3. `orchestration/graph/runner.mjs`
   - `agent_task` path updated: if engine=claude → call `subagent_gateway`
   - Otherwise retain current deterministic behavior
4. `schemas/subagent-request.schema.json` and `schemas/subagent-response.schema.json` (new)
   - Validate tool_request/plan shapes and final outputs
5. `mcp/policies.yaml`
   - Optional `agents.claude.allowed_capabilities` and per-role hard budgets
   - Safety: ensure `web.search`, `external_crawl`, `cloud_db`, `tts.cloud`, `payments` still require TEST_MODE or explicit consent

---

### System Prompt Guidance (Per-Role)

Embed the following references in each subagent’s system prompt:

- “Honor OUTPUT_STANDARDS; when producing files, use the target schemas in `schemas/**`.”
- “When a tool is needed, propose a `tool_request` with capability and purpose; the orchestrator will execute and return artifacts.”
- “Preferred MCPs per capability (see list above). Avoid secondary unless budget/consent provided.”
- “Always produce a concise plan, then iterate. End with a validated `agent-output.json`.”

Append role-specific goals/constraints from `.claude/agents/<role>.md` (e.g., `requirements-analyst.md`, `rapid-builder.md`, `quality-guardian.md`).

---

### Role Subagents (Prompts & Tool Access)

- A2.requirements_analyst
  - Tools: minimal (Read, Grep); no Edit/Bash.
  - Focus: clarify briefs, propose AUV plans, produce `tool_requests` for discovery (e.g., `docs.search`, `web.search` in TEST_MODE).
  - Stop conditions: max steps, time, or budget; escalate if blocked using `agent-escalation` schema.
- B7.rapid_builder
  - Tools: minimal (Read, Grep); diffs/changesets only (applied by build lane/orchestrator).
  - Focus: small, reversible edits aligned to CVF; prefer Primary MCPs; justify Secondary with impact and budget.
- C13.quality_guardian
  - Tools: Read, Grep; may request additional proofs via safe capabilities (e.g., `fetch`, `seo.audit`).
  - Focus: adjudication and verification; deterministic CVF/security remain authoritative.

Each subagent file SHOULD include precise descriptions to enable automatic delegation and limit tool scope.

---

### Observability & Evidence

- Store subagent transcripts and decisions under `runs/agents/<role>/**`.
- Link tool results and artifacts to each subagent step.
- Maintain router decisions under `runs/router/**` for auditability.
- Preserve CVF/gate outputs unchanged.
- Emit structured events: `SubagentStart`, `ToolRequest`, `ToolDecision`, `ToolResult`, `PlanUpdated`, `PolicyDenied`, `SubagentStop`.
- Spend ledgers updated per session to reflect planned vs actual tool usage.

---

### Execution Controls & Stop Conditions

- CLI/env knobs:
  - `--mode deterministic|claude|hybrid`
  - `--subagents <ROLE_IDs>` / `--no-subagents <ROLE_IDs>`
  - `SWARM_MODE`, `SUBAGENTS_INCLUDE`, `SUBAGENTS_EXCLUDE`
  - `SUBAGENT_MAX_STEPS`, `SUBAGENT_MAX_SECONDS`, `SUBAGENT_MAX_COST_USD`
  - `SECONDARY_CONSENT=true|false`, `TEST_MODE=true|false`
- Node-level `execution` override: deterministic wins for CVF/security/packaging nodes.

---

### Testing Strategy

- Unit: validate engine selection (modes, role maps), schema validation for subagent requests/responses.
- Integration: golden-path runs for each mode on a fixed brief; assert artifacts and gate results.
- Safety: simulate budget exceed/denial and verify fallback/alternate planning.
- Regression: ensure deterministic mode behavior remains unchanged.

---

### Rollout Plan (Incremental)

1. Wire `A2.requirements_analyst` in hybrid mode only; keep others deterministic.
2. Add `B7.rapid_builder` once tool-handshake is stable.
3. Add `C13.quality_guardian` for narrative/report generation only (deterministic gates remain deterministic).
4. Enable full “claude” mode after passing acceptance below.

---

### Acceptance Criteria

- Mode selection works via CLI/env and graph override; recorded in `runs/graph/<RUN_ID>/state.json`.
- Same brief, three modes produce consistent conclusions and passing gates:
  - Valid `agent-output.json` per role with consistent top-level conclusions across modes.
  - Artifacts in expected locations; deterministic and hybrid pass CVF/security; claude mode passes gates via router-executed tools.
- Safety: gated capabilities require TEST_MODE/consent; denials are structured; subagents replan policy-compliantly.
- Coverage: router coverage report shows no orphaned capabilities for newly introduced subagent flows.
- Reproducibility: reruns with same inputs produce identical artifacts unless plan inputs change.

---

### Operational Notes

- Budgets: Keep secondary MCPs budget-gated; subagents must request justification for secondary use.
- Caching: Cache tool results per RUN_ID + checksum to reduce duplicative calls during subagent loops.
- Idempotency: Re-running a node with same inputs produces same artifacts unless subagent plan explicitly changes.
- Reproducibility: Persist subagent plans and diffs between iterations.

---

### Example CLI

```bash
# Deterministic (current)
node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml --mode deterministic

# Claude subagents only
SWARM_MODE=claude node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml

# Hybrid (specific roles via subagents)
node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml --mode hybrid --subagents A2.requirements_analyst,B7.rapid_builder
```

---

### Risks & Mitigations

- Drift in outputs between modes → enforce schemas and gate acceptance; keep deterministic gates authoritative.
- Cost/rate limits → orchestrator-level budgets and caching; fast-fail on exceed and request alternate plan.
- Tool misuse by subagents → handshake ensures router executes tools, not subagent.

---

### Phase 10b — Sub‑Phases (Plan → Implement → Verify)

1. 10b‑1: Subagent Gateway & Schemas
   - Deliverables: `orchestration/lib/subagent_gateway.mjs` (Plan Mode, stop conditions), `schemas/subagent-request.schema.json`, `schemas/subagent-response.schema.json`, transcript persistence under `runs/agents/**`.
   - Tests: Unit validation for request/response; timeout/step/budget cutoffs; transcript write/read.
   - Acceptance: Gateway enforces Plan Mode; emits events; writes transcripts.

2. 10b‑2: Engine Selector & Graph Integration
   - Deliverables: `orchestration/lib/engine_selector.mjs`; `agent_task` path in `graph/runner.mjs` routes to gateway when engine=claude; CLI/env/graph knobs wired.
   - Tests: Engine selection matrix (deterministic/claude/hybrid + node override); state.json records mode; resume works.
   - Acceptance: Graph runs in all modes with correct routing; deterministic nodes remain deterministic.

3. 10b‑3: Router Handshake Execution & Caching
   - Deliverables: Orchestrator executes `tool_requests` via router; normalized decisions and denials; per‑RUN_ID+checksum caching of tool results.
   - Tests: Policy denial and replan flow; artifact linking; spend ledger deltas; cache hit/miss behavior.
   - Acceptance: Requests execute with artifacts; denials are structured; router coverage shows no orphans.

4. 10b‑4: Role Subagents & Policies
   - Deliverables: `.claude/agents/{requirements-analyst.md, rapid-builder.md, quality-guardian.md}` (minimal tools); `mcp/policies.yaml` adds `agents.claude.allowed_capabilities` and per‑role budgets.
   - Tests: Auto‑delegation sanity (descriptions precise), budget ceilings enforced, TEST_MODE gates for `web.search`/crawl/cloud.
   - Acceptance: Subagents operate within scopes; budgets enforced; TEST_MODE respected.

5. 10b‑5: Observability, Reports, and Mode Acceptance
   - Deliverables: New events (`Subagent*`), spend ledger integration, report narrative section linking transcripts/artifacts; golden brief run across three modes.
   - Tests: Events emitted and correlated to artifacts; report renders narrative; golden brief yields consistent conclusions and passing gates.
   - Acceptance: All criteria in “Acceptance Criteria” satisfied; hybrid mode approved for broader use.

---

### References

- Claude Code Subagents — concepts, file format, tool scoping, best practices: [docs](https://docs.anthropic.com/en/docs/claude-code/sub-agents)
- Claude Code Common Workflows — plan/apply, safe operations: [docs](https://docs.anthropic.com/en/docs/claude-code/common-workflows)
- Building Effective Agents — plan→act→observe loops, verifiable outcomes: [article](https://www.anthropic.com/engineering/building-effective-agents)
- Multi‑Agent Research System — adjudication/verification patterns: [article](https://www.anthropic.com/engineering/multi-agent-research-system)
