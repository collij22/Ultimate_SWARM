### Next steps to make Swarm1 handle broader Upwork jobs (beyond web)

#### Goal

Expand Swarm1 from web/app tasks to a flexible, capability-first system that can deliver common Upwork jobs end-to-end (data, backend, content, media), with the same evidence-first rigor, budgets/safety, and agent evaluation.

---

### Job themes (common, high-value) and what they require

- Website feature builds (forms, search, carts, checkout)
  - Capabilities: browser.automation, api.test, web.perf_audit, visual.regression
  - Proofs: screenshots, Lighthouse JSON, passing UI/API specs
- SEO audit + remediation
  - Capabilities: seo.audit, header.csp, web.perf_audit
  - Proofs: SEO report (JSON + HTML), CSP/HSTS checks, before/after perf deltas
- Performance optimization (web/app/API)
  - Capabilities: web.perf_audit, perf.api, perf.db, trace.profile
  - Proofs: baseline vs optimized metrics, traces, budget-eval JSON
- Security hardening (code + app)
  - Capabilities: security.scan, security.secrets, security.iac/container
  - Proofs: Semgrep/Gitleaks/Checkov/Trivy reports + waivers if needed
- API integration (third-party REST/GraphQL)
  - Capabilities: api.test, code.codemod, typecheck, lint
  - Proofs: integration tests (UI/API), contract snippets, result cards
- Data ingestion + analysis (insights/dashboards)
  - Capabilities: data.ingest, data.query, data.insights, db.query
  - Proofs: ingested dataset, insights.json, chart PNGs, SQL/DSL scripts
- Database design/migration
  - Capabilities: db.schema, db.migration, db.query
  - Proofs: schema diff, migration scripts, post-migration checks
- ETL mini-pipelines
  - Capabilities: data.ingest, data.transform, data.export
  - Proofs: input→output dataset pairs, transform logs, checksum manifests
- Reporting/BI-lite (automated reports)
  - Capabilities: doc.generate, chart.render, data.insights
  - Proofs: report.html/pdf, charts, underlying JSON
- Spoken video deliverables (voiceover + composition)
  - Capabilities: audio.tts, video.compose
  - Proofs: narration audio, final.mp4, script alignment checks
- DevOps: CI/CD quickstart and preview deployments
  - Capabilities: container.build, deploy.preview
  - Proofs: preview URLs, build logs, SBOM/license reports
- CMS migration/content ops
  - Capabilities: data.ingest, api.test, doc.generate
  - Proofs: content mapping table, migrated content samples, checksums

Focus first on a pragmatic subset (8 themes) to reach “arbitrary but safe” quickly:

- Data ingestion/analysis, Reporting/BI-lite, Database design/migration, SEO audit, Performance optimization, API integration, Spoken video deliverable, Security hardening.

---

### Capabilities and MCPs to add (Primary vs Secondary)

- Data/DB
  - Primary: data.ingest, data.query, data.insights, db.schema, db.migration, chart.render
  - Tools to add:
    - duckdb (local DB for ingest/query)
    - insights (Node-based analysis: aggregates, trends, outliers → insights.json)
    - chart-renderer (node-canvas/Chart.js to PNG)
  - Secondary: cloud-warehouse connectors (bigquery/snowflake) — gated by budgets/consent

- Media
  - Primary: audio.tts (local voice), video.compose (ffmpeg)
  - Tools to add:
    - tts-local (offline model or OS TTS)
    - ffmpeg (compose slides + audio → mp4)
  - Secondary: cloud-tts (polly/11labs) — opt-in only, budget-capped

- SEO
  - Primary: seo.audit (headings, meta, links, sitemap checks)
  - Tools to add:
    - seo-auditor (simple Node/link-check + metadata audit)
  - Secondary: site-crawl (long crawl) — time/budget limited

- Reporting/Docs
  - Primary: doc.generate (HTML/PDF from templates + data)
  - Tools to add:
    - report-lite (html template + puppeteer-to-pdf optional), or reuse current `report.mjs` templating for non-AUV

- Existing you will reuse
  - playwright, lighthouse, http, semgrep, gitleaks, checkov, trivy, zip, checksum, depgraph, tsc, eslint

Example policy additions (sketch)

- capability_map:
  - data.ingest: [duckdb]
  - data.query: [duckdb]
  - data.insights: [insights]
  - chart.render: [chart-renderer]
  - db.schema: [postgres, duckdb]
  - db.migration: [postgres]
  - audio.tts: [tts-local, tts-cloud]
  - video.compose: [ffmpeg]
  - seo.audit: [seo-auditor]
  - doc.generate: [report-lite]
- agents.allowlist: add the new tool IDs to relevant agents
- agents.budgets: set low ceilings and per-capability caps for audio/video/cloud tools

---

### Artifacts and quality gates (per theme)

- Data/DB/Insights
  - Artifacts: `data/raw/*`, `data/processed/*`, `insights.json`, `charts/*.png`, `queries/*.sql`
  - Gates: schema validated (JSON schema), checksum match, min-row counts, insight fields present, chart image readable
- Reporting/BI-lite
  - Artifacts: `reports/<id>/report.html`, `reports/<id>/report.pdf` (optional), `reports/<id>/data.json`
  - Gates: templating filled, links and images valid, file sizes sane
- Database design/migration
  - Artifacts: `db/schema.sql`, `db/migrations/*.sql`, `migration-result.json`
  - Gates: migration applies cleanly on a blank DB; post-migration validation queries pass
- SEO audit
  - Artifacts: `reports/seo/audit.json`, summary.md
  - Gates: required checks present (titles/meta/canonicals), no critical broken links
- Perf optimization
  - Artifacts: lighthouse before/after JSON, budget-evaluation.json
  - Gates: budget improvements (e.g., LCP/TTI reduced by threshold)
- API integration
  - Artifacts: `tests/api/*.mjs`, `reports/api/*.json`
  - Gates: all API tests passing; rate-limit/backoff behaviors respected
- Security hardening
  - Artifacts: security reports + waivers (time-bound)
  - Gates: no high/critical unwaived findings
- Spoken video
  - Artifacts: `media/script.txt`, `media/narration.wav`, `media/final.mp4`, `media/compose.json`
  - Gates: audio duration ≈ expected; mp4 playable; audio present; file sizes within bounds

---

### Agent roles for new domains

- A1.orchestrator: plans DAG and budgets
- B6.project_architect: designs data/DB/report structure
- B7.rapid_builder: implements data ingest/query/insights, composes reports
- B9.backend_api_integrator / B10.database_expert: DB schema/migrations, API glue
- B11.ai_ml_specialist: optional advanced analysis (secondary tools, budget-gated)
- C13.quality_guardian: validates artifacts and charts, checks report completeness
- A5.finalizer_integrator: packages and produces final client report/bundle

If a specialist is missing

- Use retrieval assets (templates/recipes) and “insight recipes” to guide generalists
- Prefer Primary local tools (duckdb/ffmpeg/tts-local) and smaller scoped acceptance criteria
- If blocked, emit a structured escalation (what’s needed: sample data, format, constraints)
- As a last resort, propose Secondary MCP with tight budgets and rationale

---

### Knowledge assets to add (deterministic templates)

- `.claude/knowledge/capabilities/`:
  - data.ingest: CSV/JSON → DuckDB scripts
  - data.insights: recipe templates (top-N, trends, outliers)
  - chart.render: Bar/line/pie templates
  - doc.generate: HTML report skeletons for data/SEO
  - seo.audit: checklists and selector patterns
- Graph patterns:
  - “Data → Insights → Report”
  - “DB schema → Migration → Validate”
  - “Script → TTS → Video”
- CI snippets:
  - Fast-tier synthetic tasks for each new capability
  - Budget enforcement (per-agent/per-capability) examples

---

### Synthetic tasks and scorecards (evaluation)

- Minimal tasks per capability (fast-tier)
  - data.ingest: load small CSV → 100 rows expected
  - data.insights: compute top-3 categories → insights.json structure match
  - chart.render: render a bar chart → PNG dims and checksum
  - audio.tts: produce 10s narration → duration tolerance check
  - video.compose: compose static slide + audio → mp4 with audio track
  - seo.audit: crawl a tiny mock page → required fields present
- Score dimensions
  - Correctness (schema conformance), Quality (hygiene), Determinism (repeatability), Efficiency (time), Budget adherence
- Thresholds
  - Avg ≥ 0.85 per capability across ≥ 5 tasks (adjustable)
- Wire commands (already present)
  - `node orchestration/cli.mjs agents score --agent <ID>`

---

### Safety, budgets, and observability

- Add new tools to `mcp/registry.yaml` with:
  - tier (primary/secondary), cost_model (flat_per_run), side_effects (file_write, exec)
  - api_key_env only if cloud tools used; default to local toolchain
- Policies (`mcp/policies.yaml`):
  - capability_map and agents.allowlist updated with new tool IDs
  - agents.budgets ceilings (e.g., audio.tts: $0.10, video.compose: $0.05 per run)
  - safety.require_test_mode_for: “email, external_video, external_storage” (if any)
- Telemetry:
  - Keep ledger spend entries and aggregate with `observability spend` (already implemented)
  - Add hooks events for new capabilities (DataIngestStart/Done, VideoComposeStart/Done)

---

### Implementation roadmap (3 sprints)

- Sprint 1: Data + Media foundations (1–2 weeks)
  - Add Primary MCPs: duckdb, insights, chart-renderer, tts-local, ffmpeg
  - Capabilities: data.ingest, data.query, data.insights, chart.render, audio.tts, video.compose
  - Policies: map capabilities, set budgets, add allowlists
  - Artifacts/gates: insights.json, chart.png, mp4/audio checks
  - Knowledge assets: ingestion/insights/report templates
  - Synthetic tasks: fast-tier for each capability
  - Demo jobs: “analyze CSV and produce 60s narrated video with charts”

- Sprint 2: SEO + DB migration + API integration (1–2 weeks)
  - Add Primary MCPs: seo-auditor, db.schema/migration wrappers
  - Extend capabilities: seo.audit, db.schema, db.migration
  - Artifacts/gates: audit.json schema, migration validation, API tests
  - Knowledge assets: SEO checklists, migration templates, API contract samples
  - Synthetic tasks: seo audit sample page; migration apply + validate
  - Demo jobs: “SEO audit + quick fixes”, “add table + migrate data”

- Sprint 3: Reporting/BI-lite + polish (1 week)
  - Add Primary MCP: report-lite (HTML/PDF from templates)
  - Integrate charts into report, unify packaging for non-AUV tasks
  - Expand scorecards; harden spend dashboards; improve docs
  - Demo job: “data → insights → report → narrated video”

---

### Example “arbitrary” end-to-end (data → video)

- Steps
  - Ingest CSV → DuckDB
  - Generate insights.json (+ 1–2 charts)
  - Draft script from insights → TTS (local)
  - Compose MP4 (slide(s) + audio)
  - Build client report (HTML with embeds/links)
- Proofs
  - data files, queries, insights.json, chart.png, narration.wav, final.mp4
- Budgets
  - All local/Primary by default; cloud TTS is Secondary and opt-in
- Safety
  - No production access, no external uploads by default

---

### What if we don’t have the perfect agent?

- Use recipes/templates (knowledge index) to guide generalists.
- Keep acceptance criteria modular and measurable (schemas, durations, checks).
- Let the router select safe Primary tools; propose Secondary only with explicit consent + budget.
- If blocked, emit a clear escalation with requests (e.g., “need column dictionary”).
- Expand agent skills over time by adding targeted synthetic tasks and knowledge assets.

---

### Minimal changes to make now

- Add MCPs (Primary): `duckdb`, `insights`, `chart-renderer`, `tts-local`, `ffmpeg`, `seo-auditor`, `report-lite`
- Update `mcp/policies.yaml`: capability_map, allowlists, agents.budgets for new caps
- Seed `.claude/knowledge/**` with recipes/templates for the new domains
- Add synthetic tasks for each new capability (fast-tier)
- Extend `orchestration/report.mjs` to include non-AUV media/insights in HTML report
- Create demo graphs:
  - `projects/data-video-demo.yaml`: data → insights → tts → video → report
  - `projects/seo-audit-demo.yaml`: crawl → analyze → report

---

### How you’ll run these (once added)

- Data → video demo:
  - `node orchestration/cli.mjs run-graph orchestration/graph/projects/data-video-demo.yaml`
- SEO audit demo:
  - `node orchestration/cli.mjs run-graph orchestration/graph/projects/seo-audit-demo.yaml`
- Spend dashboard:
  - `node orchestration/cli.mjs observability spend`
- Agent scoring:
  - `node orchestration/cli.mjs agents score --agent B7.rapid_builder`

This plan keeps Swarm1’s strengths (evidence-first, budgets, safety, determinism) and extends skills to data, media, SEO, and DB—covering a large share of real Upwork-style jobs with modular capabilities that scale over time.

---

I also like the idea of being able to add a screenshot or video showing what the end solution might look like (for example for a website, a few examples of an ideal or template website), which can supplement an initial task description. Think what might be needed to do that, or if that's something our agents could help with, without us adding more complexity to the project.

### Short answer

- Yes—add “reference visuals” (images/videos) to briefs and have the swarm treat them as inspiration. No new tools needed.
- Minimal wiring: accept references with the brief, copy into run artifacts, show side‑by‑side in the final report, and optionally compute a soft “similarity” score using the visual compare we already have.

---

### What to add (minimal, low‑complexity)

- **Brief references (new, optional)**
  - In your brief folder, add `references/` with images/videos (or URLs in `references.json`).
  - Brief schema: add optional `references[]` with `{ type: image|video|url, path|url, label }`.

- **Ingestion**
  - On brief intake, copy `briefs/<id>/references/*` to `runs/<AUV>/references/` and record them in the result card.

- **Report**
  - Embed each reference with a caption in the HTML report.
  - If a matching captured screenshot exists (same route/label), show side‑by‑side.
  - No blocking gates; purely informative.

- **Optional “soft compare” (uses existing visual module)**
  - Reuse visual compare in a non‑blocking “intent mode” to compute approximate similarity (SSIM/pixelmatch) per reference → store `similarity.json` and diff PNG (for images only).
  - Keep this advisory (not a CVF gate).

No new MCPs or agents required; just small extensions to brief intake and report generation.

---

### How agents help (without extra complexity)

- **Requirements Analyst**: reads references; tags pages (e.g., “products grid”), turns them into acceptance notes (e.g., “include hero image, 3‑column grid”).
- **Quality Guardian**: attaches a non‑blocking “fit” score from the soft compare to the result card (“82% similarity to ref-landing.png”).
- **Finalizer**: places references and comparisons into the report, so clients see intent vs outcome at a glance.

---

### Simple workflow you can follow

1. Put your examples in `briefs/<your-brief>/references/` (PNG/JPG/MP4) or list external links in `references.json`.
2. Run the normal flow (plan → run AUVs/graph → package → report).
3. Open the report: you’ll see a “Reference visuals” section, side‑by‑side with captured screenshots, and (optionally) a soft similarity indicator.

Outputs:

- `runs/<AUV>/references/*` (copied originals)
- `runs/<AUV>/visual/intent/*` (optional diffs/scores)
- Report section with references and side‑by‑side comparisons

---

### Optional light enhancements (still simple)

- **Reference mapping hints**: allow a label → route mapping (e.g., `ref:landing → /index.html`) to pick which screenshot to compare.
- **Storyboard from video**: for MP4s, show first frame as a thumbnail; link to video (no processing needed).
- **Color palette only**: extract dominant colors (simple image pass) and list them in the report as design cues; still advisory.

All of these remain non‑blocking and avoid expanding the CVF gate surface.

---

### Why this fits

- Adds clarity to what “good” looks like without enforcing pixel‑perfect matches.
- Zero new external services; reuses our existing capture/compare and report plumbing.
- Keeps references as evidence, not requirements—great for proposals and stakeholder alignment.
