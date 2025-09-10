<!-- Comprehensive, capability-first Phase 12 plan to deliver robust end-to-end demos that are deterministic, policy-compliant, and evidence-first, while exercising tri‑mode orchestration and Phase 11 validators. -->

### Phase 12 — End-to-End Demos (Enhanced Execution Plan)

- Objective: Ship two polished, repeatable, policy-compliant demos that exercise tri‑mode orchestration, router governance, Phase 11 CVF gates, packaging/reporting, and knowledge assets, producing client-ready artifacts.
- Demos:
  - Data → Insights → Chart → TTS → Video → Report
  - SEO Crawl/Search → SEO Audit → Doc Generate → Report
- Constraints: Primary-first tools, test-mode for network where required, deterministic artifacts under `runs/**`, reports under `dist/**`, budgets enforced, no secret leakage.

### Success Criteria

- Deterministic and Claude/hybrid runs produce consistent, policy-compliant artifacts; deterministic gates remain authoritative.
- CVF green including Phase 11 domain validators; no orphaned artifacts; router coverage clean.
- Reports embed data/media/SEO sections; offline assets preserved; Subagent Narrative included when subagents used.
- CI jobs complete within target time; retry logic eliminates flakes; Windows and Linux stable.

### Deliverables

- DAGs: `orchestration/graph/projects/data-video-demo.yaml` and `orchestration/graph/projects/seo-audit-demo.yaml` (finalized).
- Orchestration support: robust node executors, engine selection, subagent handshake, tool executor cache.
- Artifacts:
  - Data demo: `runs/<tenant>/insights.json`, `runs/<tenant>/charts/*.png`, `media/script.txt`, `media/narration.wav`, `media/final.mp4`, `compose.json`.
  - SEO demo: `runs/websearch_demo/*`, `reports/seo/audit.json`, `reports/seo/summary.md`.
- Reports: `dist/<AUV>/report.html` with embedded sections; `dist/<AUV>/assets/**` for large media.
- Verification: CVF strict green, schema validations pass, budgets and allowlists enforced.
- Knowledge: recipes under `.claude/knowledge/` aligned to demo flows.
- Tests: unit for validators, integration for DAG runs (three modes), packaging/report.

### Technical Plan

1. DAGs and Node Contracts

- Finalize `data-video-demo.yaml`:
  - Nodes: `server` (mock), `ingest` (data.ingest), `insights` (data.insights), `chart` (chart.render), `tts` (audio.tts), `video` (video.compose), `report` (report).
  - Params:
    - `ingest.input`: path to `tests/fixtures/sample-data.csv`
    - `tts.text`: generate deterministic script and persist to `media/script.txt`
  - Dependencies: `insights <- ingest`, `chart <- insights`, `tts <- insights`, `video <- chart, tts`, `report <- video`
  - Timeouts/retries consistent with similar nodes; concurrency=3.
- Update `seo-audit-demo.yaml`:
  - `search` uses `web_search_fetch` with `outDir: websearch_demo`
  - `audit`: capability `seo.audit`; ensure inputs read from fetched `first_result.html` or seeded `tests/fixtures/mock-seo-page.html` in TEST_MODE path
  - `doc`: capability `doc.generate` creating `reports/seo/summary.md`
  - Ensure deterministic fallbacks when BRAVE_API_KEY absent (see Section 4: Test-Mode and Fallbacks).

2. Capabilities, Policies, and Budgets

- Ensure `mcp/registry.yaml` and `mcp/policies.yaml` include:
  - Mappings for: `data.ingest`, `data.insights`, `chart.render`, `audio.tts`, `video.compose`, `seo.audit`, `doc.generate`, `web.crawl`/`web.search`/`web.fetch`.
  - Agent allowlists: `B7.rapid_builder` for data/media/docs; `C13.quality_guardian` for seo/report.
  - Per-capability budgets (low flat amounts); TEST_MODE required for `web.search`/external crawl.
- Router validation: run coverage; zero orphaned capabilities; per-role budget ceilings verified.

3. Deterministic Executors and Artifacts

- Data pipeline:
  - `data.ingest`: read CSV to DuckDB; write normalized parquet/csv to `runs/<tenant>/data/processed/` plus checksum manifest.
  - `data.insights`: compute deterministic aggregates (top-3 categories); emit `insights.json` validated by Phase 11 schema.
  - `chart.render`: Chart.js via node-canvas; fixed seed/dimensions (e.g., 1280x720); output `charts/bar.png`; validate via `chart_validator.mjs`.
- Media pipeline:
  - `audio.tts`: `tts-piper` local model; fixed voice/lang; write `media/narration.wav`; duration computed and validated by `media_validator.mjs`.
  - `video.compose`: `ffmpeg` combine slide (from chart) + wav → `media/final.mp4`; validate audio stream + dimensions.
  - `compose.json`: describe input assets and intent; validated by `media-compose.schema.json`.
- SEO pipeline:
  - `web_search_fetch`: write `runs/websearch_demo/brave_search.json`, `first_result.html`, `first_result_snippet.txt`, `summary.json`.
  - `seo.audit`: parse target HTML; produce `reports/seo/audit.json` matching schema; include titles/meta/canonicals/broken-links.
  - `doc.generate`: summarize audit to `reports/seo/summary.md` with links to artifacts; deterministic template.

4. Test-Mode, Fallbacks, and Safety

- Network gating:
  - If `BRAVE_API_KEY` absent or `TEST_MODE=true`, use seeded `tests/fixtures/mock-seo-page.html`; still write `runs/websearch_demo/*` to preserve artifact contract.
- TTS/media safety:
  - Ensure local-only execution; check ffmpeg and tts binaries present; emit helpful error and skip with advisory in TEST_MODE.
- Side-effects:
  - Keep all outputs under `runs/**` and `reports/**`; no external writes; sanitize inputs and paths via `fs-utils.mjs`.

5. Subagent Plan Mode Integration

- For `agent_task` nodes in both demos:
  - Support `execution` override in DAG; run deterministic by default; allow `SWARM_MODE=claude|hybrid`.
  - Subagent handshake:
    - Ensure `subagent_gateway.mjs` synthesizes `tool_requests` if missing, with constraints `{ test_mode: true, max_cost_usd: 0.05 }`.
    - Route all tool executions through router + `tool_executor.mjs`; cache per RUN_ID; append ToolDecision/ToolResult events.
  - Report: ensure Subagent Narrative inclusion (from transcripts and tool_results).

6. CVF and Evidence Wiring

- Extend `orchestration/cvf-check.mjs` invocation in demo graphs:
  - Post-pipeline `cvf` node per demo (or run separately in CI step) with `--strict`.
- Thresholds:
  - Use `capabilities/<demo auv>.yaml` or policy thresholds:
    - `data.min_rows=100`
    - `charts.dimensions=1280x720`
    - `seo.max_broken_links<=0`, `seo.min_canonical_rate>=0.8` (for demo page)
    - `media.duration_tolerance_pct=5`, `media.min_width=1280`, `media.min_height=720`
- Expected artifacts:
  - Ensure `expected_artifacts.mjs` patterns include all demo outputs for domain inference.

7. Packaging and Reporting

- Packaging:
  - Run `orchestration/package.mjs` for each demo AUV ID (assign `AUV-1201` for Data/Media, `AUV-1202` for SEO).
- Reporting:
  - `report.mjs` must:
    - Embed Insights summary, Chart gallery, SEO summary, Media thumbnails and playable link.
    - Include Subagent Narrative section when used.
    - Preserve offline assets in `dist/<AUV>/assets/`.
  - Validate `schemas/manifest.schema.json`; ensure semantic versioning and path safety.

8. Observability and Spend

- Emit events for each stage (DataIngestStart/Complete, InsightsStart/Complete, ChartStart/Complete, TtsStart/Complete, VideoComposeStart/Complete, SeoAuditStart/Complete, DocGenerateStart/Complete).
- Spend:
  - Update ledgers on tool decisions; verify total spend within per-role and per-capability ceilings.
  - Export run summaries to `runs/observability/ledgers/<session>.jsonl`.

9. Knowledge Assets

- Add/refine `.claude/knowledge/capabilities/`:
  - Deterministic playbooks, acceptance criteria, artifact conventions, common failure modes and remedies.
- Add graph pattern docs: “Data → Insights → Report” and “Script → TTS → Video”, “Search → Audit → Doc”.

10. CI Pipeline Integration

- Jobs:
  - Demo deterministic runs:
    - Data/Media demo: run DAG, then `cvf --strict`, then package and report.
    - SEO demo: for TEST_MODE and non-TEST_MODE (with BRAVE_API_KEY present) matrix; fallback to fixture if secret missing.
  - Tri-mode matrix: deterministic | claude | hybrid (subset for speed).
  - Artifact upload: `runs/**`, `dist/**`, router coverage JSON, spend ledgers.
- Stability:
  - Retries for network-bound steps; timeouts aligned to demo sizes; Windows-safe exec; no secrets in logs.

### Implementation Steps (Ordered)

1. Finalize DAG specs:
   - Update `orchestration/graph/projects/data-video-demo.yaml` and `seo-audit-demo.yaml` with params, retries, timeouts, and final dependencies.

2. Deterministic implementations:
   - Ensure `data.*`, `chart.render`, `audio.tts`, `video.compose`, `seo.audit`, `doc.generate` executors produce artifacts exactly where validators expect.

3. Test-mode + fallbacks:
   - Add TEST_MODE branches in `web_search_fetch.mjs` and SEO audit path to use fixture and still write expected files.
   - Add checks for `piper` and `ffmpeg` availability; emit advisory or skip in TEST_MODE while keeping validation green with placeholders where appropriate.

4. Subagent handshake polish:
   - Confirm `subagent_gateway.mjs` response validation and transcript persistence.
   - Add richer tool_request synthesis defaults (acceptance and artifacts aligned with validators).

5. CVF thresholds wiring:
   - Load thresholds from `capabilities/<AUV>.yaml` or `mcp/policies.yaml` and pass into validators.
   - Ensure strict mode auto-detects domains from artifacts.

6. Report enhancements:
   - Embed new sections (insights/charts/seo/media/narrative) and copy assets preserving paths.

7. Policies/router:
   - Re-validate `mcp/registry.yaml` and `mcp/policies.yaml`; run router coverage; fix any allowlist/budget gaps.

8. Tests:
   - Unit: validators for demo data; report embedding checks; tool_executor cache behavior.
   - Integration: run both demos in deterministic; smoke in claude and hybrid; verify artifacts and CVF.
   - Packaging: manifest schema validation; offline asset resolution.

9. CI wiring:
   - Add jobs/workflows to run demos, validate, package, and upload artifacts; include tri-mode subset; handle BRAVE_API_KEY matrix.

10. Documentation:

- Update `docs/ORCHESTRATION.md`, `docs/runbook.md` with demo commands, tri-mode notes, and CVF expectations.
- Add `docs/verify.md` snippets for Phase 12 acceptance.

### Acceptance Checklist

- Data/Media demo:
  - All artifacts present and validated; video playable with audio track; report includes gallery and media section; CVF green.
- SEO demo:
  - `audit.json` schema-valid; summary generated; report section present; CVF green. Works with and without BRAVE_API_KEY via fixture.
- Tri-mode:
  - Deterministic, claude, hybrid runs complete; subagent narrative generated; deterministic gates authoritative.
- Router/policies:
  - No policy violations; spend within ceilings; coverage report clean.
- CI:
  - All demo jobs pass across OS matrix; artifacts uploaded; total runtime within SLO.

### Command Quickstart (Local)

- Data/Media demo:
  - Deterministic: `node orchestration/graph/runner.mjs orchestration/graph/projects/data-video-demo.yaml`
  - Claude: `set SWARM_MODE=claude && node orchestration/graph/runner.mjs orchestration/graph/projects/data-video-demo.yaml`
- SEO demo:
  - Deterministic: `node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml`
  - Claude: `set SWARM_MODE=claude && node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml`
- CVF strict: `node orchestration/cvf-check.mjs AUV-1201 --strict` and `AUV-1202`
- Package/report: `node orchestration/cli.mjs package AUV-1201` and `AUV-1202`

- Commit examples:
  - feat(graph): finalize data-video and seo-audit demo projects
  - feat(report): embed insights/charts/seo/media sections with offline assets
  - feat(cvf): wire thresholds and strict domain inference for demos
  - feat(mcp): tighten policies/allowlists/budgets for demo agents
  - test(integration): end-to-end demos deterministic/claude/hybrid green
  - ci: add Phase 12 demo workflows with artifact upload and matrix runs
