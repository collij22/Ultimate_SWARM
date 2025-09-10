<!-- I’m proposing a focused, capability-first MCP expansion that keeps Primary (free/local) tools as defaults, adds a few high-impact Secondary options behind budgets/consent, wires artifacts/gates for evidence, and fits cleanly into your existing registry/policies, DAG, CVF, packaging, and agent-evaluation stack. -->

### Swarm1 MCP Expansion Plan (vNext) — Capability-first, Evidence-first

#### Executive summary

- Add a pragmatic set of Primary MCPs for data, media, SEO, docs, and crawling; keep Secondary to a minimum and budget-gated.
- Align with existing policies/router: capability→tool resolution, agent allowlists, per-capability budgets, safety rules.
- Extend artifacts and gates so every new job theme remains verifiable (deterministic outputs under `runs/**` + validations).
- Ship in short phases: wire tools → policies/knowledge/tests → demo DAGs → reporting/observability polish.

---

### What we’ll target (job themes) and why these MCPs

- Data ingestion/analysis and BI-lite: unlocks many Upwork-style gigs (dashboards, insights, reports) with all-local, zero-cost Primary.
- SEO audit: quick wins and measurable outcomes for web sites without external cost.
- Database schema/migration: reliable DB work with local-first posture.
- Media deliverables: simple narrated videos with charts for marketing or lightweight course content (fully local).
- API integration: safer adapters and contract proofs; only escalate to paid services when needed (and in test mode).
- Security hardening: reuse existing Semgrep/Gitleaks/Checkov/Trivy gates with better reporting.

---

### Proposed MCPs (Primary by default, Secondary only if truly valuable)

#### Primary MCPs (free/local)

- Data/DB/Analytics
  - `duckdb`: `data.ingest`, `data.query` — local columnar DB (CSV/Parquet); deterministic; zero infra.
  - `insights`: `data.insights` — small Node-based metrics/aggregations → `insights.json`.
  - `chart-renderer`: `chart.render` — Chart.js + node-canvas → `charts/*.png` for reports.
- Media
  - `tts-piper`: `audio.tts` — offline TTS via rhasspy/piper; outputs WAV; cross-platform; predictable.
  - `ffmpeg`: `video.compose` — compose slides + audio → `final.mp4`; also transcode/trim/concat.
- SEO
  - `seo-auditor`: `seo.audit` — headings/meta/canonicals/links/sitemap snapshot → `audit.json`.
- Docs/Reporting and File tooling
  - `report-lite`: `doc.generate` — HTML+template to standalone HTML (and optional PDF via Puppeteer).
  - `imagemagick`: `image.process` — convert/resize/crop/thumbnails; deterministic for visual assets.
  - `pandoc`: `doc.convert` — robust doc format conversions (md/html/docx/pdf pipelines).
  - `argos-translate`: `nlp.translate` — offline translation (Argos Translate models) for content ops.
- Crawling (safe baseline)
  - `crawler-lite`: `web.crawl` — constrained local spider (domain-bound, depth/time-limited) for small audits.

Already present Primary you’ll continue to use: `playwright`, `http`, `refdocs`, `semgrep`, `gitleaks`, `checkov`, `trivy`, `lighthouse`, `zip`, `checksum`, `depgraph`, `tsc`, `eslint`.

#### Secondary MCPs (optional, budget-gated, test-only)

- `firecrawl` (scraper): `web.crawl` — powerful site crawling when `crawler-lite` is insufficient (rate-limited, budgeted).
- `stripe` (payments): `payments.test` — validate payment flows in strict test mode; never prod keys.
- `supabase` (cloud DB/backend): `cloud.db` — quick hosted DB/storage for demos; treat as Secondary due to keys/network.
- Already present: `vercel` (preview deploy), `browser-mcp` (remote browser) — keep gated for special cases.

Why the split: protects determinism, cost, and safety by default; high-power SaaS only when explicitly justified and budgeted.

---

### Policy and registry changes (minimal, aligned with current schemas)

#### Add to `mcp/registry.yaml` (new tools; keep IDs stable)

```yaml
tools:
  duckdb:
    name: DuckDB MCP
    tier: primary
    capabilities: [data.ingest, data.query]
    requires_api_key: false
    cost_model: { type: flat_per_run, usd: 0.00 }
    side_effects: [file_read, file_write]

  insights:
    name: Insights MCP
    tier: primary
    capabilities: [data.insights]
    requires_api_key: false
    cost_model: { type: flat_per_run, usd: 0.00 }
    side_effects: [file_read, file_write]

  chart-renderer:
    name: Chart Renderer MCP
    tier: primary
    capabilities: [chart.render]
    requires_api_key: false
    cost_model: { type: flat_per_run, usd: 0.00 }
    side_effects: [file_read, file_write]

  tts-piper:
    name: Piper TTS MCP
    tier: primary
    capabilities: [audio.tts]
    requires_api_key: false
    cost_model: { type: flat_per_run, usd: 0.00 }
    side_effects: [exec, file_write]

  ffmpeg:
    name: FFmpeg MCP
    tier: primary
    capabilities: [video.compose]
    requires_api_key: false
    cost_model: { type: flat_per_run, usd: 0.00 }
    side_effects: [exec, file_read, file_write]

  seo-auditor:
    name: SEO Auditor MCP
    tier: primary
    capabilities: [seo.audit]
    requires_api_key: false
    cost_model: { type: flat_per_run, usd: 0.00 }
    side_effects: [network, file_write]

  report-lite:
    name: Report Lite MCP
    tier: primary
    capabilities: [doc.generate]
    requires_api_key: false
    cost_model: { type: flat_per_run, usd: 0.00 }
    side_effects: [file_read, file_write]

  imagemagick:
    name: ImageMagick MCP
    tier: primary
    capabilities: [image.process]
    requires_api_key: false
    cost_model: { type: flat_per_run, usd: 0.00 }
    side_effects: [exec, file_read, file_write]

  pandoc:
    name: Pandoc MCP
    tier: primary
    capabilities: [doc.convert]
    requires_api_key: false
    cost_model: { type: flat_per_run, usd: 0.00 }
    side_effects: [exec, file_read, file_write]

  argos-translate:
    name: Argos Translate MCP
    tier: primary
    capabilities: [nlp.translate]
    requires_api_key: false
    cost_model: { type: flat_per_run, usd: 0.00 }
    side_effects: [exec, file_read, file_write]

  crawler-lite:
    name: Crawler Lite MCP
    tier: primary
    capabilities: [web.crawl]
    requires_api_key: false
    cost_model: { type: flat_per_run, usd: 0.00 }
    side_effects: [network, file_write]

  firecrawl:
    name: Firecrawl MCP
    tier: secondary
    capabilities: [web.crawl]
    requires_api_key: true
    api_key_env: FIRECRAWL_API_KEY
    cost_model: { type: flat_per_run, usd: 0.05 }
    side_effects: [network, file_write]

  stripe:
    name: Stripe MCP
    tier: secondary
    capabilities: [payments.test]
    requires_api_key: true
    api_key_env: STRIPE_API_KEY
    cost_model: { type: flat_per_run, usd: 0.05 }
    side_effects: [network]

  supabase:
    name: Supabase MCP
    tier: secondary
    capabilities: [cloud.db]
    requires_api_key: true
    api_key_env: SUPABASE_SERVICE_KEY
    cost_model: { type: flat_per_run, usd: 0.05 }
    side_effects: [network, file_write]
```

#### Update `mcp/policies.yaml` (capability_map + allowlists + budgets + safety)

```yaml
capability_map:
  # Data/Insights/Charts
  data.ingest: [duckdb]
  data.query: [duckdb]
  data.insights: [insights]
  chart.render: [chart-renderer]

  # Media
  audio.tts: [tts-piper]
  video.compose: [ffmpeg]

  # SEO and Crawl
  seo.audit: [seo-auditor]
  web.crawl: [crawler-lite, firecrawl] # primary-first; secondary gated

  # Docs/Conversion/Translation
  doc.generate: [report-lite]
  doc.convert: [pandoc]
  image.process: [imagemagick]
  nlp.translate: [argos-translate]

  # Cloud / Payments (Secondary)
  payments.test: [stripe]
  cloud.db: [supabase]

agents:
  allowlist:
    B7.rapid_builder:
      - duckdb
      - insights
      - chart-renderer
      - report-lite
      - imagemagick
      - pandoc
      - argos-translate
      - crawler-lite
      - playwright
      - http
      - lighthouse
      - tsc
      - eslint
    B8.frontend_specialist:
      - playwright
      - lighthouse
      - visual-compare
      - chart-renderer
      - imagemagick
    B9.backend_api_integrator:
      - http
      - duckdb
      - postgres
      - depgraph
      - explain
    B10.database_expert:
      - duckdb
      - postgres
    C13.quality_guardian:
      - seo-auditor
      - crawler-lite
      - report-lite
      - lighthouse
      - visual-compare
    C15.security_auditor:
      - semgrep
      - gitleaks
      - checkov
      - trivy
    C16.devops_engineer:
      - docker-buildx
      - vercel

  budgets:
    B7.rapid_builder:
      total_usd: 1.50
      per_capability_usd:
        data.ingest: 0.05
        data.query: 0.05
        data.insights: 0.05
        chart.render: 0.05
        doc.generate: 0.05
        web.crawl: 0.05
        audio.tts: 0.05
        video.compose: 0.05
    C16.devops_engineer:
      total_usd: 1.00
      per_capability_usd:
        deploy.preview: 0.50

tiers:
  secondary:
    budget_overrides:
      firecrawl: 0.10
      stripe: 0.10
      supabase: 0.10
      vercel: 0.10

safety:
  require_test_mode_for:
    - payments
    - external_crawl
    - cloud_db
    - tts.cloud
```

Notes:

- We keep Primary-first ordering in `capability_map`.
- New capabilities follow your schema patterns (`^[a-z][a-z0-9._-]*$`).
- Secondary budgets are modest and individually override-able.

---

### Artifacts and gates for the new domains

- Data/Insights/Charts
  - Artifacts: `runs/<AUV>/data/raw/*`, `data/processed/*`, `insights.json`, `charts/*.png`.
  - Gates: JSON schema for `insights.json`, min-row counts, checksum manifest for inputs, PNG readability check.
- SEO audit
  - Artifacts: `reports/seo/audit.json`, `reports/seo/summary.md`, optional crawl logs.
  - Gates: presence of titles/meta/canonicals; broken links ≤ threshold; sitemap found or explicit pass reason.
- DB schema/migration
  - Artifacts: `db/schema.sql`, `db/migrations/*.sql`, `migration-result.json`.
  - Gates: migration applies cleanly to blank DB; validation queries return expected rows.
- Media (TTS + Video)
  - Artifacts: `media/script.txt`, `media/narration.wav`, `media/final.mp4`, `compose.json`.
  - Gates: audio duration within ±5% of expected; mp4 playable; has audio track; file sizes sane.

All validations are wired through CVF extensions and/or `--strict` mode to remain evidence-first.

---

### Knowledge assets and synthetic evaluation

- Add to `.claude/knowledge/`:
  - `capabilities/` recipes for `data.ingest`, `data.insights`, `chart.render`, `doc.generate`, `seo.audit`, `audio.tts`, `video.compose`.
  - Graph patterns: “Data → Insights → Report” and “Script → TTS → Video”.
- Synthetic tasks under `tests/agents/synthetic/` (fast-tier):
  - `data.ingest`: load CSV (100 rows min).
  - `data.insights`: compute top-3 categories → schema-checked `insights.json`.
  - `chart.render`: render bar chart → expected dims + checksum delta tolerance.
  - `audio.tts`: 10s narration → duration check.
  - `video.compose`: slide+audio → mp4 with audio stream present.
  - `seo.audit`: tiny mock page → required fields present.
- Score with existing `orchestration/agents/evaluator.mjs`; fold into agent scorecards.

---

### Demo DAGs (parallel, resumable) for end-to-end proofs

```yaml
# orchestration/graph/projects/data-video-demo.yaml
version: '1.0'
project_id: data-video-demo
concurrency: 3
nodes:
  - { id: server, type: server, resources: [server] }
  - {
      id: ingest,
      type: agent_task,
      params: { capability: data.ingest, input: briefs/demo-01/data.csv },
    }
  - { id: insights, type: agent_task, requires: [ingest], params: { capability: data.insights } }
  - { id: chart, type: agent_task, requires: [insights], params: { capability: chart.render } }
  - { id: tts, type: agent_task, requires: [insights], params: { capability: audio.tts } }
  - { id: video, type: agent_task, requires: [chart, tts], params: { capability: video.compose } }
  - { id: report, type: report, requires: [video], params: { auv: AUV-XXXX } }
```

```yaml
# orchestration/graph/projects/seo-audit-demo.yaml
version: '1.0'
project_id: seo-audit-demo
concurrency: 3
nodes:
  - { id: crawl, type: agent_task, params: { capability: web.crawl, url: 'http://127.0.0.1:3000' } }
  - { id: audit, type: agent_task, requires: [crawl], params: { capability: seo.audit } }
  - { id: report, type: agent_task, requires: [audit], params: { capability: doc.generate } }
```

---

### Reporting, references, and observability

- Brief references (visuals): extend `contracts/brief.schema.json` with optional `references[]` and show side-by-side in `orchestration/report.mjs` (non-blocking “intent mode” + optional soft visual compare).
- Report enhancements:
  - Include `insights.json` blocks, chart galleries, media thumbnails; link large assets under `dist/<AUV-ID>/assets/`.
- Hooks/observability:
  - Emit `DataIngestStart/Complete`, `InsightsStart/Complete`, `SeoAuditStart/Complete`, `TtsStart/Complete`, `VideoComposeStart/Complete`.
  - Keep spend ledgers per session; aggregate in existing spend dashboard.

---

### Phased delivery plan

- Phase 10a — MCP Foundations (Primary-first) — Complete
  - Added Primary MCPs (`duckdb`, `insights`, `chart-renderer`, `tts-piper`, `ffmpeg`, `seo-auditor`, `report-lite`, `imagemagick`, `pandoc`, `argos-translate`, `crawler-lite`).
  - Updated `mcp/registry.yaml` and `mcp/policies.yaml` capability_map/allowlists/safety.
  - Implemented deltas (post-plan):
    - Added `ref` (docs.search, docs.read), `brave-search` (web.search), and extended `fetch` (web.fetch) as Primary; mapped in policies; expanded agent allowlists; gated `web.search` with TEST_MODE.
    - New DAG node `web_search_fetch` + schema update; updated `seo-audit-demo.yaml` to use it; added CLI `search-fetch`.
    - Seeded knowledge assets: `.claude/knowledge/capabilities/{data.ingest.md, seo.audit.md, video.compose.md}`.
    - Added synthetic stubs: `tests/agents/synthetic/{data.ingest.test.mjs, seo.audit.test.mjs, video.compose.test.mjs}`.
    - Router coverage report CLI made Windows-safe; coverage written to `runs/router/coverage-report.json`.
    - Produced router dry-run decisions for all new Primary capabilities.
  - Acceptance: router validation green; coverage report shows no orphaned capabilities; dry runs write decisions.

- Phase 10b — Tri‑mode orchestration (Deterministic, Claude Subagents, Hybrid) — Complete
  - Implemented:
    - Engine selector `orchestration/lib/engine_selector.mjs` (global + node override, hybrid include/exclude)
    - Subagent gateway `orchestration/lib/subagent_gateway.mjs` (Plan Mode, stop conditions, schema validation, transcripts, synthesized tool_requests when absent)
    - Router handshake + executor: `mcp/router.mjs` + `orchestration/lib/tool_executor.mjs` with per‑RUN_ID checksum caching
    - DAG integration: `agent_task` routes through gateway when engine=claude
    - Observability: `SubagentStart/PlanUpdated/SubagentStop`, `ToolDecision/ToolResult`; spend ledgers updated
    - Reporting: `orchestration/report.mjs` now renders a Subagent Narrative from gateway/tool_results artifacts
    - Role subagents: `.claude/agents/{requirements-analyst.md, rapid-builder.md, quality-guardian.md}` (Plan Mode, minimal tools)
    - Policies: `mcp/policies.yaml` per‑role budgets for A2 and C13; added claude capability hints
    - Golden runs: `orchestration/graph/projects/seo-audit-demo.yaml` passes in deterministic/claude/hybrid modes
  - Usage:
    - Global: `SWARM_MODE=deterministic|claude|hybrid`, `SUBAGENTS_INCLUDE`, `SUBAGENTS_EXCLUDE`
    - Node override: `params.execution: claude|deterministic`
    - Windows example: `set SWARM_MODE=claude && node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml`
  - Acceptance: three modes produce consistent, policy‑compliant artifacts; deterministic gates authoritative; reports include subagent narrative; router caching reduces duplicate calls

- Phase 11 — Evidence & Evaluation
  - CVF extensions (aligned with broader job themes):
    - Data/Insights: JSON Schema for `insights.json`; checksum manifests for inputs; min‑row counts
    - Charts: PNG readability check; expected dimensions per chart type
    - SEO: JSON Schema for `reports/seo/audit.json`; required fields (titles/meta/canonicals) present
    - Media: duration tolerance (±5%) for `media/narration.wav`; MP4 playback + audio track present for `media/final.mp4`
    - DB Migration (advisory): migration applies on blank DB; post‑migration validation queries pass
  - Knowledge assets (deterministic templates):
    - `.claude/knowledge/capabilities/` recipes for `data.ingest`, `data.insights`, `chart.render`, `doc.generate`, `seo.audit`
    - Graph patterns: “Data → Insights → Report”, “DB schema → Migration → Validate”, “Script → TTS → Video”
  - Synthetic tasks (fast‑tier) and scorecards:
    - data.ingest: CSV → ≥100 rows
    - data.insights: top‑3 categories → `insights.json` schema match
    - chart.render: bar chart → PNG dims + checksum tolerance
    - seo.audit: tiny page → required fields present
    - audio.tts: 10s narration → duration tolerance (±5%)
    - video.compose: slide+audio → MP4 with audio stream present
    - (optional) db.migration: apply + validate
  - Score dimensions & thresholds: correctness, determinism, efficiency, budget; target avg ≥ 0.85 across ≥ 5 tasks/capability
  - Acceptance: synthetic tasks pass; scorecards improved; CVF validates extended artifacts strictly.

- Phase 12 — End-to-End Demos
  - Demos:
    - `data-video-demo.yaml`: data → insights → chart → tts → video → report (artifacts: `insights.json`, `charts/*.png`, `media/narration.wav`, `media/final.mp4`)
    - `seo-audit-demo.yaml`: search/crawl → seo.audit → doc.generate (artifacts: `reports/seo/audit.json`, report HTML)
    - (optional) db‑migration demo: schema → migration → validate (artifacts: `db/schema.sql`, `db/migrations/*.sql`, `migration-result.json`)
  - Usage:
    - Deterministic: `node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml`
    - Claude: `SWARM_MODE=claude` to exercise subagent planning/execution (Plan Mode)
  - Acceptance: artifacts deterministic; CVF green; report includes Subagent Narrative and embeds.

- Phase 13 — Optional Secondary Integrations (budget-gated)
  - Tools/capabilities:
    - `firecrawl` (web.crawl) for larger sites; `require_test_mode_for: external_crawl`; per‑tool budget override
    - `stripe` (payments.test) in strict test mode; never prod keys
    - `supabase` (cloud.db) for hosted DB/storage; keys gated; TEST_MODE required
    - (optional) `tts.cloud` for voices; consent + budget required
  - Policies & safety: Primary‑first; Secondary only when absent or consented; TEST_MODE enforced; per‑cap ceilings
  - Observability: ledgers reflect Secondary spend; ToolDecision events record alternatives
  - Acceptance: Secondary proposed only under policy; spend recorded; artifacts remain deterministic and auditable.

- Phase 14 — Reporting/UX Polish (Completed)
  - Reference visuals (advisory): brief schema `references[]` (image/video/url, label); tenant-aware ingestion to `runs/tenants/{tenant}/<AUV>/references/`; rendered in report; small assets embedded, large copied under `dist/<AUV>/assets/**`.
  - Side‑by‑side (advisory): intent compare renders offline-safe sliders with sanitized IDs; method/threshold/avg diff summarized; diffs linked if present.
  - Spend summary: aggregator-first (`reports/observability/spend.json`), ledger fallback; totals and per-capability breakdown; tenant-aware.
  - Manifest v1.2: `references`, `report.sections.intent_compare` and `spend_summary`; bundle path uses `bundle.zip_path` with tenant variants.
  - Offline/UX: strict removal of `runs/**` links, data-URI policy for small assets, a11y on sliders, deterministic ordering.
  - Acceptance: reports render offline with references/intent/spend; metadata written to `dist/<AUV>/report-metadata.json`; hooks emitted for `ReportStart/Complete` and `IntentCompare*`.

---

### Why these choices move us forward

- **Breadth without bloat**: Primary tools give wide coverage (data, media, SEO, docs) with deterministic, offline-friendly execution.
- **Cost/safety built-in**: Secondary only when needed, budget-capped, and test-mode enforced (`payments`, `external_crawl`, `cloud_db`).
- **Evidence-first**: Every new capability comes with machine-verifiable artifacts and CVF validations.
- **Agent excellence**: Knowledge recipes and synthetic tasks improve consistency and measurable performance.
- **Minimal friction**: Cleanly extends your current MCP router, DAG, CVF, and reporting without framework churn.

---

### Suggested commits (conventional)

- feat(mcp): add duckdb/insights/chart-renderer/tts-piper/ffmpeg/seo-auditor/report-lite/imagemagick/pandoc/argos-translate/crawler-lite
- feat(policies): map new capabilities, update allowlists, budgets, and safety gates
- feat(cvf): validations for insights/charts/seo/media artifacts
- feat(graph): add data-video and seo-audit demo projects
- feat(report): embed data/media sections and brief reference visuals
- feat(agents): synthetic tasks and knowledge assets for new capabilities

If you want, I can apply the `registry.yaml` and `policies.yaml` edits, add the demo graphs, and scaffold the knowledge assets/tests in one pass.

---

### Phase 10a — Acceptance Evidence (artifacts)

- Coverage report: `runs/router/coverage-report.json`
- Router dry-run artifacts (examples):
  - data.ingest → `runs/router/4ddfda6d-5500-4b78-ac52-a82bca045a2e/decision.json`
  - data.query,data.insights,chart.render → `runs/router/40b4fd0a-6412-4a80-99ff-07e9ff0d8ddc/decision.json`
  - seo.audit → `runs/router/484a4a95-e3a2-4dfa-826d-df6a1853ab86/decision.json`
  - doc.generate,doc.convert,image.process,nlp.translate → `runs/router/1e43e7b4-f8b3-4593-93d5-3c32333c7a85/decision.json`
  - web.crawl → `runs/router/421a215e-7207-4281-9b6e-269112e46391/decision.json`
  - audio.tts,video.compose → `runs/router/fe460306-9f56-469b-b2e5-59472d8632a8/decision.json`

Notes:

- Secondary-only capabilities without primaries (expected): `packaging.sbom`, `deploy.preview`, `perf.load`, `monitoring.saas`, `payments.test`, `cloud.db`.
