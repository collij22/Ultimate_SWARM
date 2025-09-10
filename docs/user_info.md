### Swarm1 in plain English

- Think of Swarm1 as a small, tireless team of specialists that reads your job post, plans the work, does the work, checks itself, and hands you a neat package with proof it did everything right.
- It breaks big jobs into bite‑sized milestones, runs realistic tests (like a person using a website), checks speed and security, and bundles everything with screenshots and a simple report.
- You get results you can trust, because every claim comes with evidence (files, screenshots, metrics) you can open and review.

---

### What you can use it for

- Website tasks: search/filter pages, carts, checkout, and similar user flows.
- Proof of quality: UI screenshots, speed scores, and security checks.
- Reproducible delivery: A single zip file and an HTML report you can send to a client.

---

### How you’d use it (Upwork job example)

1. You give the system your job description (the plain text is fine).
2. It turns the job into a small list of goals the system can deliver one by one.
3. It runs the work: opens a safe test site, clicks through like a user, takes screenshots, measures speed, checks basic security.
4. If something fails, it retries; if it’s truly blocked, it tells you what it needs (e.g., “need a test account”).
5. It collects all proof into a folder and produces an easy-to-read report.
6. It zips everything so you can send it to a client or attach it in a proposal.

What you receive:

- A neat HTML report showing what was done and the results.
- Screenshots of the features working.
- Performance scores (like “page loads in X seconds”).
- A single zip bundle with everything inside.

If you want me to do this for you: just paste the Upwork job text and say “run it.” I’ll return the finished package.

---

### The sequence of events (bird’s‑eye view)

- Understand: Read your job post and decide the small steps needed.
- Do: Perform the steps, like a person using the site and tools.
- Check: Confirm the results with screenshots, speed tests, and security checks.
- Prove: Save everything as evidence files.
- Package: Create a zip and a one‑page report with the highlights.

---

### The “agents” (your built‑in team)

- Orchestrator: Project manager. Decides who does what and in what order.
- Builder: Implements the steps (like clicking buttons, filling forms).
- QA: Checks screenshots and behavior match the goal.
- Performance: Measures page speed and gives a simple score.
- Security: Scans for obvious issues.
- Finalizer: Packages the results and creates a client‑friendly report.

Which agent is used when?

- The system decides based on the task (“we need a browser expert now,” “we need a speed check next”) and on house rules (budgets, safety). You don’t have to manage them—think of it like assigning the right specialist automatically.

---

### “MCP tools” (the team’s toolbox)

- Each tool is like a power tool the agents can use (e.g., one tool opens a browser and takes screenshots, another measures speed).
- Adding a new tool is like putting a new, labeled tool in the toolbox and setting rules for when it’s allowed and how much it can cost.
- The system prefers safe, allowed tools first, and it respects budgets and “don’t do risky things” rules by default.

---

### Safety and cost controls

- Runs only against safe test environments (not real production systems) unless you explicitly allow it.
- Budgets: Each agent has a cost ceiling, and the system won’t plan more than allowed.
- Everything is logged so you can see what was done and why.

---

### Growing the system over time

- Teach it with examples: Save good samples and templates so it reuses them for similar jobs.
- Tighten quality: Raise the expected speed/security thresholds as your standards grow.
- Add skills: Introduce new tools or checks as you take on more complex work.
- Evaluate agents: Run quick practice tasks to see their scores improve.

---

### Two ways to engage

- Quick demo: Send a short job description. The system runs one or two representative goals and returns screenshots, speed numbers, and a mini report.
- Full delivery: Share the full job description. The system will break it down, run everything end‑to‑end, and send a complete, client‑ready package.

---

### What to send me to get started

- The job description text.
- Any must‑have acceptance criteria (“must filter by price and category”).
- Any known constraints (budget/timebox/test account details).
- I’ll do the rest and return the package and report.

---

### What you can do with Swarm1

- **Deliver verified AUVs end-to-end**: From a plain-language brief to parallel execution, security/visual/perf gates, packaging, and a client-ready HTML report.
- **Run locally or durably**: Use the CLI for one-off runs, or the queue engine for resumable, multi-tenant operations with RBAC.
- **Govern by policy**: Runtime tool routing via MCP policies (primary-first, budgets, allowlists, safety) with auditable decisions and spend ledgers.
- **Improve agent quality**: Standardized outputs, knowledge retrieval, synthetic task scorecards, and per-agent budget governance.

---

## High-level flow (Upwork brief → delivery)

1. **Intake**: Save the job description as a brief; validate and compile into AUV capabilities/backlog.
2. **Plan/Graph**: Create a DAG and run with parallelization (or run a single AUV autopilot).
3. **Execute**: Start mock server → Playwright (UI/API) → Lighthouse (perf) → CVF (security/visual/budgets).
4. **Route tools**: Router resolves capabilities to tools under policy/budgets; decisions recorded with ledgers.
5. **Package**: Create a delivery bundle with manifest, SBOM, and an HTML report.
6. **Durability**: Optionally enqueue the graph to the engine (resume, observe, multi-tenant).
7. **Agent excellence**: Validate outputs, use retrieval assets, run synthetic scorecards, aggregate spend.

---

## Detailed: From an Upwork job description to a finished delivery

### 1) Prepare the brief

- Place your job description (requirements, goals, constraints) at `briefs/<your-brief>/brief.md`.
- Validate and compile AUVs:

```bash
node orchestration/cli.mjs plan briefs/<your-brief>/brief.md
# or dry-run first:
node orchestration/cli.mjs plan briefs/<your-brief>/brief.md --dry-run
```

Artifacts:

- `capabilities/AUV-01xx.yaml` files with acceptance, artifacts, authoring hints, perf budgets.
- `capabilities/backlog.yaml` summarizing AUVs and dependencies.

### 2) Execute a single AUV (autopilot)

- Prereqs (defaults okay):
  - `STAGING_URL=http://127.0.0.1:3000`
  - `API_BASE=http://127.0.0.1:3000/api`

```bash
npm run mock:staging   # optional; runbook will reuse if healthy
node orchestration/cli.mjs AUV-0101
node orchestration/cvf-check.mjs AUV-0101 --strict
```

- Steps performed:
  - Ensures/generates tests from capability hints (respects FORCE_REGEN and manual file protection).
  - Runs Playwright, Lighthouse, CVF with Phase 6 gates (security/visual/perf budgets).
  - Saves a result card and all artifacts under `runs/AUV-0101/**`.

Key outputs per AUV:

- `runs/AUV-0101/ui/*.png` (screenshots)
- `runs/AUV-0101/perf/lighthouse.json` (perf)
- `runs/AUV-0101/result-cards/runbook-summary.json`
- Observability: `runs/observability/hooks.jsonl`

### 3) Execute the entire backlog (DAG with parallelization)

```bash
node orchestration/cli.mjs graph-from-backlog capabilities/backlog.yaml -o orchestration/graph/projects/demo-01.yaml
node orchestration/cli.mjs run-graph orchestration/graph/projects/demo-01.yaml --concurrency 3
```

- Features: resource locks, retries with backoff, server reuse, correct AUV_ID mapping, resumable state at:
  - `runs/graph/<RUN-ID>/state.json`

### 4) Route tools with MCP policies (preview)

```bash
node mcp/router.mjs --validate
node mcp/router.mjs --dry --agent B7.rapid_builder --capabilities browser.automation,web.perf_audit --budget 0.25
```

- Decisions/ledgers:
  - Dry-run artifact: `runs/router/<RUN-ID>/decision.json`
  - Spend ledger: `runs/observability/ledgers/<SESSION>.jsonl`

### 5) Package and report

```bash
node orchestration/cli.mjs package AUV-0101
node orchestration/cli.mjs report AUV-0101
```

Outputs:

- `dist/AUV-0101/manifest.json` (schema-validated)
- `dist/AUV-0101/package.zip`
- `dist/AUV-0101/report.html` (+ assets/ for large screenshots)

### 6) Durable execution (multi-tenant, resumable, RBAC)

```bash
# Start worker (Redis required)
node orchestration/cli.mjs engine start --concurrency 3

# Enqueue a graph run
node orchestration/cli.mjs engine enqueue orchestration/graph/projects/demo-01.yaml --tenant default

# Monitor and manage
node orchestration/cli.mjs engine status
node orchestration/cli.mjs engine pause
node orchestration/cli.mjs engine resume
node orchestration/cli.mjs engine emit-status   # writes reports/status.json
```

Tenant isolation:

- Non-default: `runs/tenants/{tenant}/...` via utilities in `orchestration/lib/tenant.mjs`.

---

## What the final outputs look like

- Per-AUV run:
  - `runs/<AUV>/ui/*.png`
  - `runs/<AUV>/perf/lighthouse.json`
  - `runs/<AUV>/result-cards/runbook-summary.json`
- Quality gates:
  - `reports/security/*` (Semgrep, Gitleaks)
  - `runs/visual/*` and baselines under `tests/robot/visual/baselines/`
- Packaging:
  - `dist/<AUV>/manifest.json`, `package.zip`, `report.html`
- Observability:
  - `runs/observability/hooks.jsonl`, `runs/observability/ledgers/<session>.jsonl`
- Durable status:
  - `reports/status.json` (health, queue metrics, tenant summaries)

---

## Agents, capabilities, and the MCP router

- **Agents** are roles like `A1.orchestrator`, `B7.rapid_builder`, `C13.quality_guardian`.
- **Capabilities** describe needs (e.g., `browser.automation`, `web.perf_audit`, `api.test`).
- **Tools** implement capabilities (e.g., `playwright`, `lighthouse`, `http`), defined in `mcp/registry.yaml`.
- **Policies** determine what’s allowed, budgets, and safety; see `mcp/policies.yaml`.

How tool selection works:

- The orchestrator (or a role-specific agent) requests capabilities.
- Router resolves capability → tool by:
  - Preferring Primary over Secondary.
  - Enforcing agent allowlists and safety rules.
  - Enforcing budgets (global, tier, per-agent, per-capability).
- The plan + rationale is written to artifacts; spend entries go to ledgers.

Per-agent budgets (Phase 9):

- Defined under `agents.budgets` in `mcp/policies.yaml`.
- Router enforces `total_usd` and `per_capability_usd` ceilings.

---

## Adding a new MCP (tool)

1. Update `mcp/registry.yaml`:
   - Add a `tool_id` with `tier` (primary/secondary), `cost_model`, `side_effects`, and `api_key_env` if needed.
2. Map its capability in `mcp/policies.yaml` under `capability_map`.
3. Add the tool to relevant agent allowlists (`agents.allowlist`).
4. If Secondary, consider budget overrides under `tiers.secondary.budget_overrides`.
5. Validate configs:

```bash
node mcp/router.mjs --validate
node mcp/router.mjs --dry --agent B7.rapid_builder --capabilities <your.capability> --budget 0.25
```

---

## Agent output standards, knowledge, and evaluation (Phase 9)

- Output schemas:
  - `schemas/agent-output.schema.json`
  - `schemas/agent-escalation.schema.json`
  - `schemas/agent-changeset.schema.json`
  - `schemas/agent-scorecard.schema.json`
- Validate agent outputs:

```bash
node orchestration/cli.mjs validate agent-output tests/agents/fixtures/agent-output-valid.json
```

- Knowledge index:

```bash
node orchestration/cli.mjs knowledge build-index
# Generates reports/knowledge/index.json
```

- Evaluate agents on synthetic tasks:

```bash
node orchestration/cli.mjs agents score --agent B7.rapid_builder
# Writes runs/agents/scorecards/B7.rapid_builder.json
```

- Aggregate spend:

```bash
node orchestration/cli.mjs observability spend
# Writes reports/observability/spend.json
```

- Docs:
  - `.claude/agents/OUTPUT_STANDARDS.md`
  - `.claude/agents/EVALUATION.md`
  - `.claude/agents/RETRIEVAL.md`

---

## Best practices and tips

- **Environment**: Node.js v20.x. Use `127.0.0.1` for stable perf metrics.
- **Visual baselines**: Store in `tests/robot/visual/baselines/`; strict threshold ~0.1%.
- **Authoring safety**: Autogeneration won’t overwrite manual tests unless `FORCE_REGEN_OVERRIDE_MANUAL=1`.
- **CVF strict mode**: Use `--strict` to enforce security/visual/perf budgets.
- **Artifacts-first**: Everything important lands under `runs/**` and `reports/**`; treat these as the source of truth.
- **Tenants and auth**: Phase 8 adds optional OIDC/JWT and RBAC; see `docs/AUTH.md`.

---

## Typical end-to-end command set

```bash
# 1) Compile from brief
node orchestration/cli.mjs plan briefs/<your-brief>/brief.md

# 2a) Run a specific AUV
node orchestration/cli.mjs AUV-0101
node orchestration/cvf-check.mjs AUV-0101 --strict

# 2b) Or run the whole graph
node orchestration/cli.mjs graph-from-backlog capabilities/backlog.yaml -o orchestration/graph/projects/demo-01.yaml
node orchestration/cli.mjs run-graph orchestration/graph/projects/demo-01.yaml --concurrency 3

# 3) Router preview and validation
node mcp/router.mjs --validate
node mcp/router.mjs --dry --agent B7.rapid_builder --capabilities browser.automation,web.perf_audit --budget 0.25

# 4) Package and report
node orchestration/cli.mjs package AUV-0101
node orchestration/cli.mjs report AUV-0101

# 5) Durable engine (optional)
node orchestration/cli.mjs engine start --concurrency 3
node orchestration/cli.mjs engine enqueue orchestration/graph/projects/demo-01.yaml --tenant default

# 6) Agent excellence
node orchestration/cli.mjs validate agent-output tests/agents/fixtures/agent-output-valid.json
node orchestration/cli.mjs knowledge build-index
node orchestration/cli.mjs agents score --agent B7.rapid_builder
node orchestration/cli.mjs observability spend
```

---

## How to extend next

- **New capability**: Add `capabilities/AUV-xxxx.yaml` with acceptance/artifacts/budgets/authoring_hints; run autopilot.
- **New visual route**: Add to capability `visual.routes`, capture baselines, re-run visual compare.
- **New agent task**: Add synthetic spec in `tests/agents/synthetic/` and re-score.
- **New MCP**: Update `mcp/registry.yaml` + `mcp/policies.yaml`, validate, and dry-run the router.
- **Tighten budgets**: Tune perf/security/visual thresholds; Phase 9 budgets enforce per-agent cost ceilings.

You now have a fully autonomous, artifact-first swarm that turns an Upwork-style brief into a verified, packaged delivery—with policies, budgets, and agent scorecards ensuring consistent quality and governance.

---

Is it ready for different type of jobs???????????????

### Short answer

- Today, Swarm1 is production‑ready for web/app tasks (UI flows, speed, visual checks, packaging).
- For “create a database → analyze data → produce a spoken video”, the planner/orchestrator is ready, but we need to add a few domain tools (database/data/voice/video) and simple quality checks. That’s a fast extension rather than a rewrite.

---

### High level: What would happen for that Upwork job

- You paste the job text in. Swarm1 turns it into small, clear steps (e.g., Setup DB → Ingest data → Find insights → Generate narration → Produce video).
- It runs each step automatically, saving proof after every step (files, logs, screenshots, reports).
- At the end, you get a neat package with:
  - The database or a portable data file
  - A short insights report (JSON + human‑readable summary)
  - An audio narration and a final MP4 video with voiceover
  - A one‑page HTML report that links to everything

---

### Is it ready right now?

- Ready: planning, parallel execution, evidence logging, safety/budgets, packaging/reporting, results validation framework.
- Needs small add‑ons: domain “tools” for database/data/voice/video and a few new checks. These plug into the existing router and runner the same way our browser and performance tools do.

---

### What needs adding (plain English)

- Database/data tools
  - A way to spin up a local database (or use a portable one like DuckDB) and run queries.
  - A simple “data ingest” step to load CSV/JSON files.
  - A “find insights” step that runs a few common analyses and exports a JSON summary.
- Voice and video tools
  - A voice maker (text‑to‑speech) that works locally or with a safe, budgeted online service.
  - A video maker that turns a script/slides into an MP4 with the voiceover (uses ffmpeg under the hood).
- Proof and checks
  - A small checklist to confirm: “data loaded”, “insights JSON present with expected fields”, “audio plays and matches the script”, “video has audio and correct length”.
- Policy and budgets
  - Add the new tools to the allowlist and set small dollar ceilings so nothing unexpected runs.
- A couple of templates
  - Example queries and “insights JSON” shape, a sample narration script, and a sample ffmpeg command—so the system has good defaults.

---

### How it would run end‑to‑end (after we add those tools)

1. You paste the Upwork job text. Swarm1 turns it into ~4–5 small tasks:
   - Setup a database (or DuckDB file), Ingest data, Analyze and export insights, Generate narration (audio), Produce a short MP4.
2. Swarm1 asks its “router” which tool to use for each step (local safe ones by default).
3. It runs the steps in the right order. If something is missing (e.g., data file), it raises a clear “needs this” message.
4. It saves all proof (data, insights JSON, audio, video) and then builds a delivery package + a one‑page HTML report.
5. You review the report (listen to the audio, watch the video, scan the insights), and send the package to your client.

Outputs you’d expect:

- Data: the DB file (e.g., `.duckdb`) or CSV/JSON snapshots.
- Insights: `insights.json` + a short bullet summary (also in the HTML report).
- Media: `narration.wav/mp3` and `final.mp4` with the voiceover.
- A simple HTML report that links to each file and shows basic checks (duration, file sizes, etc.)

---

### What we’d add under the hood (no code, just the idea)

- New “capabilities” the team understands:
  - data.ingest, data.query, data.insights
  - audio.tts (text‑to‑speech), video.compose
- New “tools” for those capabilities:
  - Local database (DuckDB or a safe Postgres container), simple query runner
  - A tiny analysis step (top categories, trends, outliers) → writes `insights.json`
  - TTS (local engine first; cloud options only with consent + budget)
  - ffmpeg wrapper to assemble voiceover + slides into MP4
- New light checks:
  - For data: “insights.json exists and has the fields we promised”
  - For audio: “file is present, non‑empty, duration reasonable”
  - For video: “mp4 exists, has audio, duration within expected range”
- Budget and safety:
  - All new tools go behind small per‑agent budgets and “test‑mode only” rules by default.

---

### What you do next (non‑technical)

- Share a small sample of the data (CSV or JSON) and the job description.
- Tell us the voice style (“friendly”, “professional”) and target video length (e.g., 60–90s).
- We’ll run the system and send you:
  - A short insights report (plain English + the JSON)
  - An MP4 video with voiceover
  - A zip with everything and a single HTML page to view it all

---

### Timeline to enable this

- Quick prototype: 1–2 days
  - Local tools (DuckDB + ffmpeg + offline TTS), basic checks, simple report additions.
- Polished delivery: ~1 week
  - More robust data checks, refined narration templates, nicer video templates, and a couple of “example jobs” you can reuse.

---

### Why this fits Swarm1

- It’s still the same proven flow:
  - Break work into steps → run tools safely → save proof → produce a clean package.
- We’re just adding new “skills” (data and media tools) that plug into the same planner and quality gates we already use.

If you want, I can set up the data/audio/video tools with safe defaults and give you a ready‑to‑run example job—so you can try it by just pasting a job description and one sample data file.

---

I'll write a comprehensive next-steps plan into `docs/nextsteps.md`, covering job themes, capability/tool additions, artifacts, agent roles, policies, knowledge assets, evaluation, and a sprint roadmap.

[1 tool called]

I'll write a comprehensive, adaptable next-steps plan into `docs/nextsteps.md`, covering job themes, required capabilities/tools, prioritized subset, and a sprint roadmap with safety/budget controls.

[1 tool called]

I'll write a comprehensive next-steps plan into `docs/nextsteps.md` covering job themes, required capabilities/tools, prioritized subset, MCP additions, artifacts/gates, agents, safety/budget controls, and a sprint roadmap.

[1 tool called]

Let me write the comprehensive next-steps plan into docs/nextsteps.md now.

[1 tool called]

I'll write a detailed, adaptable next-steps plan into `docs/nextsteps.md`, covering job themes, required capabilities/tools, prioritized subset, artifacts/gates, agents, safety/budgets, knowledge assets, evaluation, and a sprint roadmap.

[1 tool called]

Let me write the comprehensive next-steps plan directly into `docs/nextsteps.md`.

[1 tool called]

I'll create a comprehensive plan in docs/nextsteps.md with themes, required capabilities/tools, prioritized subset, agents, safety/budget controls, knowledge assets, evaluation, and a sprint roadmap.

[1 tool called]

I'll write the comprehensive next-steps plan into docs/nextsteps.md now.

[1 tool called]
