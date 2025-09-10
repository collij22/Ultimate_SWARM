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

1. Subagent emits a `tool_requests` array:
   - Each item: `{ capability, purpose, params, constraints, expected_artifacts }`
2. Orchestrator validates against `mcp/policies.yaml`:
   - Allowlist, budgets, safety gates (e.g., TEST_MODE requirements)
3. Orchestrator executes via MCP router:
   - Produces artifacts in `runs/**` and a `tool_results` array
4. Orchestrator returns `tool_results` to the subagent:
   - Includes artifact paths, summaries, and any normalized outputs
5. Subagent updates the plan or returns final `agent-output.json`

If a request violates policy/budget, the orchestrator responds with a normalized rejection message and the subagent must propose alternatives.

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

### Observability & Evidence

- Store subagent transcripts and decisions under `runs/agents/<role>/**`.
- Link tool results and artifacts to each subagent step.
- Maintain router decisions under `runs/router/**` for auditability.
- Preserve CVF/gate outputs unchanged.

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
- For the same brief, all three modes produce:
  - Valid `agent-output.json` per role with consistent top-level conclusions
  - Artifacts in expected locations; CVF/gates pass in deterministic and hybrid; in claude mode, gates pass with tool-handshake execution via router
- Safety: attempts to use gated capabilities without TEST_MODE/consent are denied and surfaced to the subagent with alternatives requested.
- Coverage: Router coverage report shows no orphaned capabilities newly introduced by subagents.

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

### Next Steps (Implementation Order)

1. Add `subagent_gateway.mjs`, request/response schemas, and engine selector.
2. Update `agent_task` to route through engine selector and persist transcripts.
3. Implement handshake round-trip with router execution and artifact linking.
4. Enable hybrid for `A2.requirements_analyst`; add smoke tests and acceptance run.
5. Document prompts per-role referencing `.claude/agents/**` and preferred MCPs.
6. Expand to `B7.rapid_builder`, then limited `C13.quality_guardian` narrative tasks.
7. Add CLI/env/graph selection knobs and docs.
