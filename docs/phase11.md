<!-- This plan deepens Phase 11 by adding concrete schemas, validators, CLI/CI wiring, observability, tests, and docs so evidence for data, charts, SEO, media, and DB steps becomes deterministic, policy-governed, and reportable across tri‑mode orchestration. -->

### Phase 11 — Evidence & Evaluation (Execution Plan)

#### Objectives

- Elevate CVF from web UI/perf/security to cross-domain, artifact-verified evidence for data, charts, SEO, media, and DB migration.
- Make deterministic validations the single source of truth; Claude/hybrid modes add narrative but never relax gates.
- Integrate with existing MCP router, DAG, packaging/reporting, spend ledgers, and multi-tenant engine.

---

### Scope and Ground Truth

- Prior phases 1–10b are complete (autopilot, compiler, DAG, router, build lane, security/visual, packaging, durable engine, agents; tri‑mode with subagent gateway).
- Phase 11 implements only: new artifact schemas, validators, CVF extensions, knowledge assets, synthetic tasks, CI wiring, and reporting UX upgrades.

---

### Deliverables (What “Done” looks like)

- Schemas: `schemas/{insights.schema.json, seo-audit.schema.json, media-compose.schema.json, migration-result.schema.json}`
- Validators: `orchestration/lib/{data_validator.mjs, chart_validator.mjs, seo_validator.mjs, media_validator.mjs, db_migration_validator.mjs, checksum_manifest.mjs}`
- CVF extensions: `orchestration/cvf-check.mjs` strict mode enforces new domains (toggle-able per AUV and graph).
- Expected artifacts extended: `orchestration/lib/expected_artifacts.mjs` covers new paths.
- Observability: new Start/Complete events and metrics; spend ledgers unchanged.
- Knowledge assets: recipes in `.claude/knowledge/capabilities/` and graph patterns.
- Synthetic tasks: `tests/agents/synthetic/*.test.mjs` covering each new capability.
- Graphs: golden demos execute deterministically and under `SWARM_MODE=claude|hybrid` with consistent artifacts.
- CI: workflows run validators and publish reports; thresholds enforced.
- Reporting: `orchestration/report.mjs` embeds insights, chart galleries, SEO summary, media thumbnails.
- Docs: `docs/QUALITY-GATES.md`, `docs/verify.md`, `docs/ORCHESTRATION.md` updated.

---

### Technical Design

#### 1) Schemas (JSON Schema draft-07/2020-12)

- `schemas/insights.schema.json`
  - Top-level: `version`, `source_manifest`, `metrics[]`, `dimensions[]`, `findings[]`.
  - Required: at least 1 metric; include `data_row_count` and `generated_at`.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Insights",
  "type": "object",
  "required": ["version", "metrics", "generated_at", "data_row_count"],
  "properties": {
    "version": { "type": "string", "pattern": "^1\\.0(\\.\\d+)?$" },
    "generated_at": { "type": "string", "format": "date-time" },
    "data_row_count": { "type": "integer", "minimum": 1 },
    "source_manifest": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["path", "sha256"],
        "properties": {
          "path": { "type": "string" },
          "sha256": { "type": "string", "pattern": "^[a-f0-9]{64}$" }
        }
      }
    },
    "metrics": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["id", "value"],
        "properties": {
          "id": { "type": "string" },
          "label": { "type": "string" },
          "value": { "type": ["number", "string", "boolean"] },
          "unit": { "type": "string" }
        }
      }
    },
    "dimensions": { "type": "array", "items": { "type": "string" } },
    "findings": { "type": "array", "items": { "type": "string" } }
  }
}
```

- `schemas/seo-audit.schema.json`
  - Required fields: `pages[]`, `summary`, `broken_links_count`, `has_sitemap`, `canonical_present_rate`.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SEO Audit",
  "type": "object",
  "required": [
    "generated_at",
    "summary",
    "pages",
    "broken_links_count",
    "canonical_present_rate",
    "has_sitemap"
  ],
  "properties": {
    "generated_at": { "type": "string", "format": "date-time" },
    "summary": { "type": "string" },
    "has_sitemap": { "type": "boolean" },
    "broken_links_count": { "type": "integer", "minimum": 0 },
    "canonical_present_rate": { "type": "number", "minimum": 0, "maximum": 1 },
    "pages": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["url", "title", "meta_description", "h1_count", "canonical_ok"],
        "properties": {
          "url": { "type": "string", "format": "uri" },
          "title": { "type": "string", "minLength": 1 },
          "meta_description": { "type": "string" },
          "h1_count": { "type": "integer", "minimum": 0 },
          "canonical_ok": { "type": "boolean" }
        }
      }
    }
  }
}
```

- `schemas/media-compose.schema.json`
  - Validates `media/script.txt`→`media/narration.wav`→`media/final.mp4` pipeline metadata and checks reported durations/dimensions.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Media Compose",
  "type": "object",
  "required": [
    "script_path",
    "audio_path",
    "video_path",
    "expected_duration_s",
    "actual_duration_s",
    "video_width",
    "video_height",
    "has_audio_track"
  ],
  "properties": {
    "script_path": { "type": "string" },
    "audio_path": { "type": "string" },
    "video_path": { "type": "string" },
    "expected_duration_s": { "type": "number", "minimum": 1 },
    "actual_duration_s": { "type": "number", "minimum": 1 },
    "video_width": { "type": "integer", "minimum": 1 },
    "video_height": { "type": "integer", "minimum": 1 },
    "has_audio_track": { "type": "boolean" }
  }
}
```

- `schemas/migration-result.schema.json`
  - Ensures migration applied cleanly and validation queries passed.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "DB Migration Result",
  "type": "object",
  "required": ["engine", "applied", "migrations", "validation_ok"],
  "properties": {
    "engine": { "type": "string", "enum": ["duckdb", "sqlite", "postgres-local"] },
    "applied": { "type": "boolean" },
    "migrations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "status"],
        "properties": {
          "id": { "type": "string" },
          "status": { "type": "string", "enum": ["applied", "skipped", "failed"] }
        }
      }
    },
    "validation_ok": { "type": "boolean" },
    "validation_results": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "rows"],
        "properties": {
          "name": { "type": "string" },
          "rows": { "type": "integer", "minimum": 0 }
        }
      }
    }
  }
}
```

#### 2) Validators (Node, Windows-safe)

- `orchestration/lib/checksum_manifest.mjs`
  - Compute SHA‑256 for input data (CSV/Parquet/images) and emit `source_manifest[]`. Reuse existing checksum MCP where available; fallback to built-in crypto.
- `orchestration/lib/data_validator.mjs`
  - Validate `insights.json` against schema; cross-check `data_row_count ≥ MIN_ROWS` from policy or defaults (e.g., 100).
- `orchestration/lib/chart_validator.mjs`
  - Read PNGs in `runs/<AUV>/charts/*.png`; assert decodable, expected dimensions (from AUV hints), and basic readability (non-uniform pixels).
- `orchestration/lib/seo_validator.mjs`
  - Validate `reports/seo/audit.json` schema; enforce thresholds: `broken_links_count ≤ N`, `canonical_present_rate ≥ 0.8`, `has_sitemap true OR documented pass reason`.
- `orchestration/lib/media_validator.mjs`
  - Use `ffprobe` (FFmpeg) to check duration of `narration.wav`, track existence, and presence of audio stream in `final.mp4`; enforce duration tolerance ±5% of script expectation; validate `media-compose.schema.json`.
- `orchestration/lib/db_migration_validator.mjs`
  - Spin up ephemeral DuckDB/SQLite for tests; apply `db/migrations/*.sql` to blank DB; run validation queries declared in capability YAML; emit `migration-result.json` and validate schema.

All validators emit machine-readable result cards to `runs/<AUV>/result-cards/<domain>-validation.json` and log observability events.

#### 3) CVF Extensions and Expected Artifacts

- Update `orchestration/lib/expected_artifacts.mjs`:
  - Data/Insights/Charts: `runs/<AUV>/data/raw/*`, `runs/<AUV>/data/processed/*`, `runs/<AUV>/insights.json`, `runs/<AUV>/charts/*.png`
  - SEO: `reports/seo/audit.json`, `reports/seo/summary.md`
  - Media: `media/script.txt`, `media/narration.wav`, `media/final.mp4`, `runs/<AUV>/media/compose.json`
  - DB: `db/schema.sql`, `db/migrations/*.sql`, `runs/<AUV>/db/migration-result.json`
- Extend `orchestration/cvf-check.mjs`:
  - `--strict` enforces domain checks when artifacts present or AUV declares relevant capabilities.
  - Pull thresholds from `capabilities/<AUV>.yaml` (e.g., `perf_budgets`, `cvf.thresholds.*`) with sane defaults.

#### 4) Policies & Router Alignment

- Ensure `mcp/policies.yaml`:
  - Capabilities present: `data.ingest`, `data.insights`, `chart.render`, `seo.audit`, `audio.tts`, `video.compose`, `doc.generate`, `doc.convert`, `image.process`.
  - Thresholds optional under `cvf.thresholds` per capability (e.g., `min_rows`, `seo.max_broken_links`, `media.duration_tolerance_pct: 5`).
- No tool hard-coding; runtime router still selects Primary-first; deterministic validators remain authoritative.

#### 5) Observability

- Emit events (with `auv_id`, tenant, durations, counts):
  - `DataIngestStart/Complete`, `InsightsStart/Complete`, `ChartRenderStart/Complete`
  - `SeoAuditStart/Complete`, `TtsStart/Complete`, `VideoComposeStart/Complete`
  - `DbMigrationStart/Complete`
- Write domain validator result cards and include to `runs/observability/hooks.jsonl`.
- Continue spend ledgers unchanged.

#### 6) Knowledge Assets

- Add `.claude/knowledge/capabilities/` recipes:
  - `data.ingest.md`, `data.insights.md`, `chart.render.md`, `seo.audit.md`, `audio.tts.md`, `video.compose.md`
- Patterns: “Data → Insights → Report”, “Script → TTS → Video”, “Schema → Migration → Validate”.
- Include deterministic prompts for Claude Plan Mode with explicit proof obligations.

#### 7) Synthetic Tasks (Fast-tier)

- Files:
  - `tests/agents/synthetic/data.ingest.test.mjs` (ingest CSV ≥ 100 rows; manifest + insights schema pass)
  - `tests/agents/synthetic/data.insights.test.mjs` (compute top‑3 categories; insights schema)
  - `tests/agents/synthetic/chart.render.test.mjs` (bar chart → PNG dims + decode)
  - `tests/agents/synthetic/seo.audit.test.mjs` (crawl mock page; audit schema + thresholds)
  - `tests/agents/synthetic/audio.tts.test.mjs` (10s narration; duration tolerance)
  - `tests/agents/synthetic/video.compose.test.mjs` (compose slide+audio; MP4 has audio track)
  - (optional) `tests/agents/synthetic/db.migration.test.mjs` (blank DB → apply → validate rows)
- Score via `orchestration/agents/evaluator.mjs`; target average ≥ 0.85 across correctness, determinism, efficiency, budget.

#### 8) Reporting/UX

- `orchestration/report.mjs`:
  - Embed `insights.json` summary; chart gallery (thumbnails → full in `assets/`).
  - SEO summary (broken links, canonical rate, sitemap).
  - Media thumbnails; link to MP4; show duration vs expected.
  - Reference section remains advisory; deterministic gates remain source of truth.

---

### Implementation Plan (Step-by-step)

#### A) Schema and Validator Layer (Week 1)

- Create schemas under `schemas/`.
- Implement validators in `orchestration/lib/` with:
  - Ajv validation helpers (reuse existing ajv CLI patterns).
  - Cross-platform `spawn(process.execPath, ...)` patterns where needed.
  - `ffprobe` invocation guarded (fail with clear message when missing).
- Unit tests for each validator (`tests/unit/*.test.mjs`).

#### B) CVF + Expected Artifacts (Week 1)

- Extend `orchestration/lib/expected_artifacts.mjs`.
- Update `orchestration/cvf-check.mjs`:
  - Add domain checks; plumb `--domains` flag for targeted runs.
  - Respect AUV-declared thresholds; default otherwise.
- Unit tests for CVF branching and thresholds.

#### C) Knowledge & Synthetic (Week 2)

- Add capability recipes and patterns.
- Implement synthetic tests; wire into evaluator and CI “fast-tier”.

#### D) Graphs & Demos (Week 2)

- Ensure `orchestration/graph/projects/data-video-demo.yaml` and `seo-audit-demo.yaml` run:
  - Deterministic mode: artifacts + validators green.
  - `SWARM_MODE=claude` and `hybrid`: narrative artifacts present; deterministic gates still pass.
- Add minimal fixtures: small CSV (≥ 150 rows), a slide PNG, mock HTML page for SEO.

#### E) CI Integration (Week 2)

- Update workflow:
  - Run schema/unit tests.
  - Run synthetic tasks.
  - Execute demo graphs deterministically; then `SWARM_MODE=claude` smoke (non-blocking).
  - Publish `reports/seo/*`, `runs/<AUV>/*`, validator result cards as artifacts.
- Enforce thresholds; map failures to exit codes (reuse 301–304; reserve 304 for budget violations if used).

#### F) Reporting & Docs (Week 2)

- Update `orchestration/report.mjs` to render new sections.
- Docs:
  - `docs/QUALITY-GATES.md` (add new gates/thresholds).
  - `docs/verify.md` (How to verify Data/SEO/Media/DB sections with commands).
  - `docs/ORCHESTRATION.md` (tri‑mode notes remain; link to new demos).

---

### File and Config Changes

- `schemas/insights.schema.json`
- `schemas/seo-audit.schema.json`
- `schemas/media-compose.schema.json`
- `schemas/migration-result.schema.json`
- `orchestration/lib/checksum_manifest.mjs`
- `orchestration/lib/{data_validator.mjs, chart_validator.mjs, seo_validator.mjs, media_validator.mjs, db_migration_validator.mjs}`
- `orchestration/lib/expected_artifacts.mjs` (extend)
- `orchestration/cvf-check.mjs` (extend with domain gates)
- `mcp/policies.yaml` (optional thresholds under `cvf.thresholds`)
- `.claude/knowledge/capabilities/*.md` (new)
- `tests/agents/synthetic/*.test.mjs`, plus fixtures under `tests/agents/fixtures/`
- CI workflow (`.github/workflows/ci.yml`) to run validators and demos
- `orchestration/report.mjs` (embed new sections)

---

### Thresholds (Defaults; override per AUV via capability YAML)

- Data: `min_rows = 100`
- Charts: width = 800, height = 600 (or from hints); PNG decodes; non-uniform histogram
- SEO: `broken_links_count ≤ 3`, `canonical_present_rate ≥ 0.8`, `has_sitemap = true` OR pass reason
- Media: duration tolerance ±5%; MP4 has 1+ audio track; 1920×1080 default if unspecified
- DB: all validation queries return ≥ expected rows; no migration failures

---

### Commands (Local)

- Deterministic demos:
  - `node orchestration/graph/runner.mjs orchestration/graph/projects/data-video-demo.yaml`
  - `node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml`
- Tri‑mode demos (Windows):
  - `set SWARM_MODE=claude && node orchestration/graph/runner.mjs orchestration/graph/projects/seo-audit-demo.yaml`
- CVF checks:
  - `node orchestration/cvf-check.mjs AUV-XXXX --strict --domains data,charts,seo,media,db`

---

### Risks & Mitigations

- FFmpeg tooling availability: Detect `ffprobe`; if missing, mark media gate “skipped (tool missing)” with advisory, fail in CI environments where required.
- Flaky external pages for SEO: use mock server or `crawler-lite` bounded to `127.0.0.1`; require `TEST_MODE=true` for `web.search`.
- Non-deterministic data: pin fixtures; checksum manifests; fail when inputs mismatch.
- Cross-platform issues: reuse prior Windows-safe spawn patterns; add timeouts.

---

### Acceptance Criteria

- All new schemas validated with Ajv; unit tests cover happy paths and edge cases.
- Demo graphs produce deterministic artifacts; CVF strict mode green in deterministic; claude/hybrid produce consistent narratives with identical deterministic results.
- Synthetic tasks pass; evaluator scorecards show ≥ 0.85 averages across targeted capabilities.
- CI blocks on threshold violations; uploads artifacts/reports.
- Reports include insights, chart gallery, SEO summary, media section; links resolve offline.

---

### Conventional Commits (suggested)

- feat(cvf): add data/seo/media/db schemas and validators
- feat(orchestration): extend cvf-check with domain gates and thresholds
- feat(report): embed insights, chart gallery, SEO and media sections
- feat(tests): add synthetic tasks and fixtures for data/seo/media/db
- feat(knowledge): add capability recipes and graph patterns
- chore(ci): run domain validators and demo graphs; publish artifacts
- docs(gates): update QUALITY-GATES/verify/orchestration with Phase 11

---

### Timeline (2 weeks)

- Week 1: Schemas, validators, CVF/expected artifacts, unit tests.
- Week 2: Knowledge assets, synthetic tasks, demo graphs, CI, reporting, docs.

---

- Summary:
  - New schemas + validators enforce evidence for data, charts, SEO, media, and DB.
  - CVF strict mode covers these domains with policy-driven thresholds.
  - Demos, synthetic tasks, CI, and reporting ensure reproducible, auditable outcomes across tri‑mode orchestration.
