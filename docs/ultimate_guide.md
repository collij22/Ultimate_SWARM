<!-- Comprehensive master guide synthesized from repo docs, CLI/help text, and source to provide an end‑to‑end, evidence‑first playbook (current as of 2025‑09‑10). -->

# Swarm1 — The Ultimate Guide

Swarm1 is a general‑purpose Agent Swarm that delivers AUV‑sized (Atomic Units of Value) increments end‑to‑end with contract‑first development, deterministic “User Robot” tests, and evidence‑based gates (CVF → QA → Security → DevOps). It turns a brief (e.g., an Upwork job) into executable AUVs, runs them deterministically, and produces verifiable deliverables (artifacts, bundle, report) with clear logs.

- What it’s great for: repeatable, provable delivery of small vertical slices (web features, SEO audits, data→insights→report, media composition, basic DB work), with packaging and evidence.
- What you get: reproducible artifacts under `runs/**`, structured result cards, a signed/validated bundle under `dist/**`, and an HTML report that renders offline.
- How you run it: one‑button autopilot for a single AUV, or parallel DAGs (deterministic, subagent, or hybrid modes), or durable queue (multi‑tenant) for production‑grade orchestration.

This guide starts with concepts and architecture, then provides concrete workflows (brief→AUV→run→package→report), commands, artifacts, logs, gates, docs map, state of the project, and next steps.

---

## 1) High‑level overview

- AUV (Atomic Unit of Value): one user‑perceivable capability delivered end‑to‑end (e.g., “user can submit checkout and see success banner”). AUV specs live in `capabilities/AUV-*.yaml` and include acceptance criteria, required proofs, and authoring hints.
- User Robot: Playwright and API tests that generate deterministic artifacts (videos, screenshots, traces, JSON). Proofs are stored under `runs/<AUV-ID>/**`.
- CVF (Capability Validation Framework): Validates that the required artifacts exist and meet thresholds; integrates perf budgets (Lighthouse) and domain validators (data/charts/seo/media/db). Typed exit codes make failures explicit.
- Orchestrator: Fans out work across lanes/phases (Requirements → Design/Arch → Build → Robot → Gates → Finalize → DevOps), parallelizing when safe and serializing on locks (migrations, build switches).
- MCP Router: Agents request capabilities; the router selects tools under policy, tier preference (Primary first), consent/budget, and allowlists indicated by `mcp/registry.yaml` and `mcp/policies.yaml`.
- Deliverable Level‑3 minimum: Each increment is runnable end‑to‑end and packaged with evidence so clients can verify.

Key promise: Every claim comes with proof you can open and review, and everything is reproducible from a single CLI.

---

## 2) Core concepts

- AUV specs (`capabilities/AUV-*.yaml`):
  - id, acceptance, proofs, deliverable_level (target L3), `authoring_hints` used for test auto‑authoring.
- Contracts‑first (`contracts/openapi.yaml`, `contracts/events.yaml`):
  - APIs and events are explicit, versioned, and additively evolved.
- Lanes & parallelization:
  - UI/API robot → perf → CVF; gates block on red; resource locks serialize risky areas.
- Evidence:
  - Proof artifacts live under `runs/<AUV-ID>/<RUN-ID>/**`; result cards summarize outcomes in machine‑readable JSON.
- Quality gates (DoD):
  - Build/Start, Functional (UI/API), Regression, Security, Performance Budgets, Deliverable Level‑3, and Domain‑specific validators.
- Execution modes:
  - Deterministic (reference implementation), Subagent/Claude (Plan Mode with router), or Hybrid (select roles).
- Multi‑tenant durability:
  - BullMQ/Redis engine for queued jobs, isolation by `tenant`, resumability, quotas, budgets, and operations.

---

## 3) Repository tour (what’s where)

- `.claude/agents/**`: Role prompts and SOPs (orchestrator + sub‑agents).
- `capabilities/**`: AUV specs, backlog (`backlog.yaml`), templates.
- `contracts/**`: `openapi.yaml`, `events.yaml`, `brief.schema.json`.
- `db/**`: Schema and migrations.
- `docs/**`: Architecture, orchestration, gates, runbook/operate, verification.
- `mcp/**`: `registry.yaml` (catalog), `policies.yaml` (routing, allowlists, budgets), adapters.
- `orchestration/**`: CLI, runbooks, graph runner (DAG), engine (BullMQ), gates, tooling.
- `reports/**`: Generated reports (security, visual, observability, media, etc.).
- `runs/**`: All artifacts and logs per AUV/RUN_ID; per‑tenant under `runs/tenants/{tenant}/...`.
- `tests/**`: Robot specs, synthetic agent tasks, unit tests.
- `dist/**`: Packaged deliverables per AUV (bundle, manifest, report).

---

## 4) Quickstart (single AUV autopilot)

Prereqs:
- Node.js 20+, Playwright browsers installed:
  - `npm i`
  - `npx playwright install`
- Staging URLs:
  - `STAGING_URL=http://127.0.0.1:3000`
  - `API_BASE=http://127.0.0.1:3000/api`

Run (Windows CMD examples):
- Product search & filter (AUV‑0003):
  - `node orchestration\cli.mjs AUV-0003`
- Cart totals (AUV‑0004):
  - `node orchestration\cli.mjs AUV-0004`
- Checkout (AUV‑0005):
  - `node orchestration\cli.mjs AUV-0005`

What happens:
1) Checks/starts `mock/server.js` and waits on `/health`.
2) Ensures/spec‑authors tests (from `authoring_hints` if missing).
3) Runs Playwright UI/API tests with resilient retry.
4) Runs Lighthouse, writes `runs/<AUV>/perf/lighthouse.json`.
5) Runs CVF (`orchestration/cvf-check.mjs`) to enforce gates.
6) Writes `runs/<AUV>/result-cards/runbook-summary.json`.

Outputs you’ll see:
- Proofs: `runs/<AUV>/ui/*.png`, `runs/<AUV>/api/*.json`, `runs/<AUV>/perf/lighthouse.json`
- Result card: `runs/<AUV>/result-cards/runbook-summary.json`
- Logs/observability: `runs/observability/hooks.jsonl` (structured events)

Typed exit codes (partial):
- 101 Playwright; 102 Lighthouse; 103 CVF; 105 Server start; see “Quality gates” section for full matrix.

---

## 5) End‑to‑end from a brief (Upwork → AUVs → graph → deliver)

Example inputs:
- Brief file: `briefs/demo-01/brief.md`

Plan AUVs from brief:
- Dry‑run (heuristic):
  `node orchestration\cli.mjs plan briefs\demo-01\brief.md --dry-run`
- Full (Requirements Analyst agent):
  `node orchestration\cli.mjs plan briefs\demo-01\brief.md`

This generates:
- `capabilities/AUV-01xx.yaml` (with acceptance + authoring_hints)
- `capabilities/backlog.yaml`
- `reports/requirements/<RUN-ID>.json`

Validate:
- Brief: `node orchestration\cli.mjs validate brief briefs\demo-01\brief.md`
- AUV: `node orchestration\cli.mjs validate auv AUV-0101`

Compile backlog → executable graph:
- `node orchestration\cli.mjs graph-from-backlog capabilities\backlog.yaml -o orchestration\graph\projects\demo-01.yaml --concurrency 3`

Run the graph (parallel with resource locks):
- `node orchestration\cli.mjs run-graph orchestration\graph\projects\demo-01.yaml`
- Resume after crash:
  `node orchestration\cli.mjs run-graph orchestration\graph\projects\demo-01.yaml --resume RUN-abc123xyz`

Package and report:
- Package an AUV:
  `node orchestration\cli.mjs package AUV-0005`
- Report from manifest:
  `node orchestration\cli.mjs report AUV-0005`
- Full delivery (test → package → report):
  `node orchestration\cli.mjs deliver AUV-0005`

What you receive:
- `dist/AUV-0005/package.zip` (deterministic bundle)
- `dist/AUV-0005/manifest.json` (checksums, provenance, SBOM)
- `dist/AUV-0005/report.html` (offline report with screenshots, metrics, narratives)

---

## 6) Execution modes: deterministic, subagent (Claude), hybrid

Global selection (Windows CMD):
- Deterministic (default):
  `node orchestration\graph\runner.mjs orchestration\graph\projects\seo-audit-demo.yaml`
- Subagents (Plan Mode):
  `set SWARM_MODE=claude && node orchestration\graph\runner.mjs orchestration\graph\projects\seo-audit-demo.yaml`
- Hybrid (include targeted roles):
  `set SWARM_MODE=hybrid && set SUBAGENTS_INCLUDE=A2.requirements_analyst,B7.rapid_builder && node orchestration\graph\runner.mjs orchestration\graph\projects\seo-audit-demo.yaml`

Per‑node override:
- In graph YAML: `params.execution: claude | deterministic`

Artifacts for subagent/hybrid:
- Gateway transcripts, tool plans/results under:
  - `runs/agents/<role>/<session>/thread.jsonl`
  - `runs/tenants/{tenant}/agents/<node>/{result-gateway.json, tool_results.json}`

Safety/policy:
- The router maps capabilities→tools; Primary first; Secondary require `TEST_MODE=true` + consent + budget.

Demo pipelines (Phase 12–13):
- Data→Video:
  `set TEST_MODE=true && node orchestration\graph\runner.mjs orchestration\graph\projects\data-video-demo.yaml`
- SEO Search/Fetch→Audit→Doc:
  `set TEST_MODE=true && node orchestration\graph\runner.mjs orchestration\graph\projects\seo-audit-demo.yaml`
- Secondary demos (budget‑gated):
  `set TEST_MODE=true && node orchestration\graph\runner.mjs orchestration\graph\projects\seo-audit-large.yaml`
  `set TEST_MODE=true && node orchestration\graph\runner.mjs orchestration\graph\projects\payments-test-demo.yaml`
  `set TEST_MODE=true && node orchestration\graph\runner.mjs orchestration\graph\projects\cloud-db-demo.yaml`
  `set TEST_MODE=true && node orchestration\graph\runner.mjs orchestration\graph\projects\tts-cloud-demo.yaml`

---

## 7) Durable engine (BullMQ/Redis): multi‑tenant, resumable, ops‑ready

Start worker:
- Dev: `node orchestration\cli.mjs engine start`
- Prod:
  `NODE_ENV=production node orchestration\cli.mjs engine start`

Enqueue work:
- Run a graph:
  `node orchestration\cli.mjs engine enqueue run_graph --graph orchestration\graph\projects\demo-01.yaml --tenant acme-corp --priority 5`
- Compile a brief:
  `node orchestration\cli.mjs engine enqueue compile_brief --brief briefs\demo-01\brief.md --tenant beta-inc --metadata "{\"project\":\"demo\"}"`

Monitor & admin:
- Status, live monitor, emit JSON:
  `node orchestration\cli.mjs engine status | cat`
  `node orchestration\cli.mjs engine monitor`
  `node orchestration\cli.mjs engine emit-status > reports\status.json`
- Queue control:
  `node orchestration\cli.mjs engine pause` / `resume` / `cancel <job-id>` / `list` / `metrics`
- Backups:
  `node orchestration\cli.mjs engine backup` (`--list`, `--clean`, `S3_BUCKET=...`)

Auth & RBAC (optional):
- Enable: `AUTH_REQUIRED=true`
- Modes: JWKS (recommended) or HMAC; roles: `admin|developer|viewer`
- Tenant authorization enforced for non‑admin tokens.

Tenant isolation:
- Default: `runs/AUV-XXXX/**`
- Named tenants: `runs/tenants/{tenant}/AUV-XXXX/**`
- Policies and quotas under `mcp/policies.yaml`.

---

## 8) MCP Router: capability→tool with budgets, consent, allowlists

Configs:
- `mcp/registry.yaml` — canonical tool metadata (`tier`, `capabilities`, `requires_api_key`, `side_effects`, `cost_model`, `api_key_env`).
- `mcp/policies.yaml` — `capability_map`, `agents.allowlist`, `agents.budgets`, `router.defaults`, `safety.require_test_mode_for`.

Try router in dry‑run:
- With fixture scripts: `npm run router:dry`
- Custom:
  `node mcp\router.mjs --dry --agent B7.rapid_builder --capabilities browser.automation,web.perf_audit --budget 0.25`
- Secondary (consent needed):
  `node mcp\router.mjs --dry --agent C16.devops_engineer --capabilities deploy.preview --budget 0.50 --secondary-consent`

Coverage report:
`node mcp\router-report.mjs` → `runs/router/coverage-report.json`

Search+Fetch tangible proof (Phase 10a):
- `node orchestration\cli.mjs search-fetch "ref-tools MCP server"`
- Artifacts: `runs/websearch_demo/{summary.json, brave_search.json, first_result.html, first_result_snippet.txt}`
  Note: `BRAVE_API_KEY` required; planning typically requires `TEST_MODE=true`.

---

## 9) Quality gates (DoD) and domain validators

Swarm1 is “no green gates → no merge”.

Core gates:
- Build/Start: health check on `${STAGING_URL}/health` (exit 105)
- Functional (UI/API): Playwright green; retries for transients (exit 101)
- Regression: prior AUV robot tests green (exit 101)
- CVF: required proofs exist and validate (exit 103)
- Security (Phase 6): Semgrep/Gitleaks/… with waivers (exits 301–302)
- Visual regression (Phase 6): pixel diff threshold (exit 303)
- Performance budgets: Lighthouse budgets evaluated; in TEST_MODE, perf may be “skipped” but summarized
- Deliverable Level‑3: runnable end‑to‑end

Domain validators (Phase 11+):
- Data (305): `insights.json` schema + thresholds
- Charts (306): PNG integrity, dimensions, non‑blank content
- SEO (307): audit JSON checks (broken links, canonicals, sitemap, page issue fail rate)
- Media (308): composition metadata: duration tolerance, dimensions, audio track
- DB (309): migrations apply; validation queries; schema snapshot

Strict mode auto‑detection:
- `node orchestration\cvf-check.mjs <AUV-ID> --strict`
- Or specify: `--domains data,charts,seo,media,db`

Typed exit code matrix is documented in `docs/QUALITY-GATES.md`.

---

## 10) Artifacts, logs, and result cards (what to look at)

Where artifacts go:
- Per AUV: `runs/<AUV-ID>/<RUN-ID>/{ui,api,perf,visual,...}`
- Subagent modes: `runs/agents/<role>/<session>/**` and `runs/tenants/{tenant}/agents/<node>/**`
- Router: `runs/router/<RUN-ID>/decision.json`, `runs/router/coverage-report.json`
- Observability: `runs/observability/hooks.jsonl` (event stream), `runs/observability/ledgers/*.jsonl` (spend)
- Packaging: `dist/<AUV-ID>/{package.zip, manifest.json, report.html, report-metadata.json}`

Result cards:
- `runs/<AUV-ID>/result-cards/runbook-summary.json` (versioned, machine‑readable)
- Include `ok`, steps, durations, env, and artifact pointers.

Common troubleshooting:
- Windows env: prefer `127.0.0.1` over `localhost` for Lighthouse.
- If a gate fails, check:
  - Artifact existence/paths
  - `hooks.jsonl` for typed events / failure classification (transient vs persistent)
  - Exit codes to identify failing stage quickly

---

## 11) How to run each workflow (cheat‑sheet)

Single AUV autopilot:
- `node orchestration\cli.mjs AUV-0003`

Brief→AUVs→graph:
- `node orchestration\cli.mjs plan briefs\demo-01\brief.md`
- `node orchestration\cli.mjs graph-from-backlog capabilities\backlog.yaml -o orchestration\graph\projects\demo-01.yaml`
- `node orchestration\cli.mjs run-graph orchestration\graph\projects\demo-01.yaml`

Deterministic vs Subagent vs Hybrid:
- `node orchestration\graph\runner.mjs orchestration\graph\projects\seo-audit-demo.yaml`
- `set SWARM_MODE=claude && node orchestration\graph\runner.mjs orchestration\graph\projects\seo-audit-demo.yaml`
- `set SWARM_MODE=hybrid && set SUBAGENTS_INCLUDE=A2.requirements_analyst,B7.rapid_builder && node orchestration\graph\runner.mjs orchestration\graph\projects\seo-audit-demo.yaml`

Durable engine:
- `node orchestration\cli.mjs engine start`
- `node orchestration\cli.mjs engine enqueue run_graph --graph orchestration\graph\projects\demo-01.yaml --tenant default`
- `node orchestration\cli.mjs engine status`

Packaging and reporting:
- `node orchestration\cli.mjs deliver AUV-0005`
- Or: `package` then `report`.

Router, coverage, and search proof:
- `npm run router:dry`
- `node mcp\router-report.mjs`
- `node orchestration\cli.mjs search-fetch "ref-tools MCP server"`

Verification (per AUV):
- `npm run validate:cards`
- `node orchestration\cvf-check.mjs AUV-0005 --strict`

---

## 12) Docs map (what matters, and what’s advisory vs current)

Most important (canonical):
- `README.md`: Quickstart and repo layout
- `docs/ORCHESTRATION.md`: Lifecycle, DAG, modes, strict CVF, demos, packaging/reporting, durable engine usage
- `docs/QUALITY-GATES.md`: DoD gates, thresholds, domain validators, exit codes
- `docs/runbook.md`: One‑button AUV delivery; practical CLI examples
- `docs/verify.md`: Copy‑paste verification per AUV and per domain
- `docs/SWARM1-GUIDE.md`: Strategy & principles (11 sections) mapping to concrete files
- `docs/AUTH.md`: Enabling auth/RBAC for the engine

Supporting (current and useful):
- `docs/README.md`: Index of docs
- `docs/operate.md`: Hooks, router coverage, bundle verification, durable engine ops
- `docs/phases10-14.md`: Phase deliverables and acceptance; very detailed and current
- `docs/plan.md`: Enhanced technical roadmap; phase status (current), notes “phase_chat.md” is a working doc
- `docs/ROADMAP.md`, `docs/CHANGELOG.md`, `docs/CONTRIBUTING.md`, `docs/ONBOARDING.md`: Standard hygiene docs

Advisory/working notes:
- `docs/phase_chat.md`: Intentionally a working scratchpad (currently empty)
- `docs/deep_technical_plan_06sep2025.md`: Background depth; keep for context (not authoritative over newer phase docs)

Summary:
- Follow `README.md` → `ORCHESTRATION.md` → `QUALITY-GATES.md` for day‑to‑day.
- Use `runbook.md` for single AUV and `verify.md` for explicit pass criteria.
- Treat `phases10-14.md` and `plan.md` as the source of truth on “what’s implemented now.”

---

## 13) State of the project (strengths, weaknesses)

Strengths (today):
- Evidence‑first delivery: CVF + artifacts + typed exit codes
- Deterministic autopilot and parallel DAGs with resource locks and resume
- Packaging/reporting: reproducible bundle, offline HTML, SBOM, provenance
- Router with policy: Primary‑first, consent/budget, allowlists, coverage report
- Durable engine: multi‑tenant isolation, resumability, queue operations, backups
- Subagent/hybrid execution: gateway transcripts, tool plans/results, spend ledgers
- Clear docs, CI parity, and Windows‑safe commands

Weaknesses / risks:
- Many moving parts and env vars; onboarding can feel heavy
- Secondary tool flows require TEST_MODE and keys/consent; confusion if omitted
- Duplicated info across some docs risks drift; `phase_chat.md` is intentionally non‑canonical
- Local Lighthouse/Playwright stability depends on browser and host setup
- Without a “single magical CLI” for brief→deliver, new users must chain commands

---

## 14) Where to go next (optimize for UX and scale)

Make the “Upwork brief → deliver” path one‑command:
- New CLI façade: `node orchestration\cli.mjs brief-deliver briefs\my-brief.md` to do plan → graph → run → package → report (interactive consent for Secondary if proposed).
- Add `--tenant` and `--mode deterministic|claude|hybrid` to that command.

Defaults and ergonomics:
- Provide `npm run` aliases for common tasks (`run:auv`, `run:graph`, `deliver`, `engine:start`, `brief:plan`, `brief:deliver`).
- A small TUI (text UI) for selecting AUVs/graphs and toggling TEST_MODE/consent/budgets.

Docs coherence:
- Keep `ORCHESTRATION.md` and `QUALITY-GATES.md` as canonical; link others as supporting.
- Fold “golden commands” into `README.md` and this guide; minimize duplication.

Safety/budget UX:
- Inline consent prompts with clear budget summaries before Secondary execution.
- Always write a “router preview” artifact (`ROUTER_DRY=true`) even on green runs for traceability.

Performance and stability:
- Cache Lighthouse and heavy steps per RUN_ID (already partially done for router/tool execution); expose `--cache` to users.
- Add “preflight” checker (browsers, ports, env, API keys) to fail fast with actionable messages.

---

## 15) Example playbooks (copy‑paste)

One‑line “proposal‑worthy” SEO demo (offline‑safe artifacts in TEST_MODE):
- `set TEST_MODE=true && node orchestration\graph\runner.mjs orchestration\graph\projects\seo-audit-demo.yaml && node orchestration\cli.mjs deliver AUV-1202`

Data→video:
- `set TEST_MODE=true && node orchestration\graph\runner.mjs orchestration\graph\projects\data-video-demo.yaml && node orchestration\cli.mjs report AUV-1201`

Run a single AUV end‑to‑end with strict validation:
- `node orchestration\cli.mjs AUV-0005 && node orchestration\cvf-check.mjs AUV-0005 --strict && node orchestration\cli.mjs deliver AUV-0005`

Brief→backlog→graph→run:
- `node orchestration\cli.mjs plan briefs\demo-01\brief.md`
- `node orchestration\cli.mjs graph-from-backlog capabilities\backlog.yaml -o orchestration\graph\projects\demo-01.yaml`
- `node orchestration\cli.mjs run-graph orchestration\graph\projects\demo-01.yaml`

Durable mode (enqueue and monitor):
- `node orchestration\cli.mjs engine start`
- `node orchestration\cli.mjs engine enqueue run_graph --graph orchestration\graph\projects\demo-01.yaml --tenant default`
- `node orchestration\cli.mjs engine monitor`

Router coverage and web search proof:
- `node mcp\router-report.mjs`
- `node orchestration\cli.mjs search-fetch "ref-tools MCP server"`

---

## 16) FAQs (quick answers)

- Where are my logs?
  `runs/observability/hooks.jsonl` (JSONL events), plus result cards under `runs/<AUV>/result-cards/`.
- Where are the proofs?
  `runs/<AUV>/**` (ui/api/perf/...), and subagent evidence under `runs/agents/**` or `runs/tenants/**/agents/**`.
- I’m on Windows—any gotchas?
  Use `127.0.0.1` over `localhost` for Lighthouse, and `set VAR=value && command` to set env inline.
- Can I run everything offline?
  Yes for Primary tools and demos with `TEST_MODE=true`. Secondary flows require consent and (normally) keys; in TEST_MODE, planning stubs unblock deterministic demos.
- How do I validate outputs?
  `npm run validate:cards`, `node orchestration\cvf-check.mjs <AUV> --strict`, and `npx ajv validate` for manifests/status.

---

## 17) Reference (files, schemas, and paths)

- AUV specs: `capabilities/AUV-*.yaml` (+ `templates/` and `backlog.yaml`)
- Contracts: `contracts/openapi.yaml`, `contracts/events.yaml`, `contracts/brief.schema.json`
- Orchestrator: `orchestration/cli.mjs`, `orchestration/graph/**`, `orchestration/cvf-check.mjs`
- Validators: `orchestration/lib/{chart_validator.mjs, seo_validator.mjs, media_validator.mjs, db_migration_validator.mjs, budget_evaluator.mjs}`
- Router: `mcp/router.mjs`, `mcp/{registry.yaml, policies.yaml}`, `mcp/router-report.mjs`
- Engine: `orchestration/engine/bullmq/**`, `schemas/status.schema.json`
- Packaging/report: `orchestration/package.mjs`, `orchestration/report.mjs`, `schemas/manifest.schema.json`
- Observability: `runs/observability/**`, spend ledgers; `reports/**` for summarized outputs

---

## 18) Final notes

If you only remember one thing: every step is evidence‑first. Run a slice, check the artifacts, package a bundle, and hand over a report. For new users, start with `runbook.md` (single AUV), then advance to `ORCHESTRATION.md` (graphs and modes), then durable engine if you need scale.

```
