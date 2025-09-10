- I inspected the Phase 11 changes across schemas, validators, CVF, demos, tests, policies, and reporting. Below is a precise pass/fail audit and the fixes required before we move on.

### What’s correctly implemented (OK)

- Schemas present: `schemas/insights.schema.json`, `schemas/seo-audit.schema.json`, `schemas/media-compose.schema.json`, `schemas/migration-result.schema.json`.
- Validators implemented with CLI and sensible defaults:
  - `orchestration/lib/data_validator.mjs`
  - `orchestration/lib/chart_validator.mjs`
  - `orchestration/lib/seo_validator.mjs`
  - `orchestration/lib/media_validator.mjs`
  - `orchestration/lib/db_migration_validator.mjs`
  - `orchestration/lib/checksum_manifest.mjs`
- CVF: `orchestration/cvf-check.mjs` supports `--domains` and uses domain exit codes 305–309; integrates validators; respects multi-tenant paths.
- Expected artifacts extended: `orchestration/lib/expected_artifacts.mjs` includes Phase 11 demo AUVs and a domain filter.
- Demo DAGs exist: `orchestration/graph/projects/{data-video-demo.yaml, seo-audit-demo.yaml}`.
- Unit tests exist for three validators:
  - `tests/unit/data_validator.test.mjs`
  - `tests/unit/chart_validator.test.mjs`
  - `tests/unit/seo_validator.test.mjs`

### Gaps and required fixes (blocking)

- Reporting (Phase 11 embedding not done):
  - `orchestration/report.mjs` does not embed domain sections (insights summary, charts gallery, SEO summary, media thumbnails) as required. Add sections sourced from validator outputs or known artifact paths and include them in the HTML (keep offline-safe assets behavior consistent with Phase 7).
- CVF strict behavior:
  - Domain checks only run when `--domains` is passed. In strict mode, auto-detect domains to validate based on artifacts and/or AUV capability hints without requiring `--domains`. Plumb policy/auv thresholds to validators (see below).
- Threshold overrides (not wired):
  - Validators run with hardcoded defaults. Wire overrides from `capabilities/<AUV>.yaml` or `mcp/policies.yaml` (e.g., `cvf.thresholds.min_rows`, `seo.max_broken_links`, `seo.min_canonical_rate`, `media.duration_tolerance_pct`). Pass these into `validateInsights`, `validateSEOAudit`, `validateMediaCompose`.
- Documentation (not updated for Phase 11):
  - Update `docs/QUALITY-GATES.md` to list 305–309 exit codes and new domain gates/thresholds.
  - Update `docs/verify.md` with verify steps for data/charts/seo/media/db, including commands and pass criteria.
- Knowledge assets (missing):
  - `.claude/knowledge/capabilities/*.md` not present. Add recipes for `data.ingest`, `data.insights`, `chart.render`, `seo.audit`, `audio.tts`, `video.compose` per plan.
- Tests (incomplete):
  - Synthetic tests for SEO and media are stubs only: `tests/agents/synthetic/{seo.audit.test.mjs, video.compose.test.mjs}`. Implement real fast-tier checks using the validators and small fixtures; add a synthetic for DB migration.
  - Unit tests missing for `media_validator.mjs` and `db_migration_validator.mjs`. Add unit tests mirroring coverage style of data/chart/seo tests.
- CI integration (missing):
  - No `.github/workflows/ci.yml` to run new validators/demos. The `deploy/ci/swarm1.yaml` is a placeholder. Add/extend CI to:
    - Run unit tests for validators.
    - Run synthetic tests.
    - Execute demo DAGs (deterministic) and publish artifacts; optionally run a light `SWARM_MODE=claude` smoke that is non-blocking.
    - Upload validator result cards and domain artifacts.
- Path conventions (SEO artifacts):
  - Plan/docs expect `reports/seo/audit.json` and `reports/seo/summary.md`; `expected_artifacts.mjs` mixes `AUV-SEO-001/seo/audit.json` and `reports/seo-summary.md`. Standardize on one convention or update docs/expected patterns consistently (prefer `reports/seo/audit.json` and `reports/seo/summary.md`).
- Synthetic data checksum (minor but real):
  - `tests/agents/synthetic/data.ingest.test.mjs` writes a `source_manifest` with a fake SHA (`synthetic-test-checksum`) and would fail checksum validation if executed. Either compute the real checksum using `checksum_manifest.mjs` or omit `source_manifest` in this synthetic test.

### Precise edits to apply

- Reporting:
  - Extend `orchestration/report.mjs`:
    - Parse and render:
      - Insights summary (rows, metric counts, top metrics) from `runs/<AUV>/insights.json`.
      - Chart gallery from `runs/<AUV>/charts/*.png` (thumbnail grid).
      - SEO summary (broken links, canonical rate, sitemap) from `reports/seo/audit.json`.
      - Media section: link to `media/final.mp4`, show duration vs expected, audio track presence.
    - Ensure assets are copied to `dist/<AUV>/assets/` preserving paths.
- CVF:
  - In `orchestration/cvf-check.mjs`:
    - When `--strict` and `--domains` not supplied, infer `domains` by scanning `expectedArtifactsByDomain` patterns (if any match for a domain, include it).
    - Read thresholds from capability YAML (e.g., `cvf.thresholds.*`) and/or `mcp/policies.yaml` and pass into validator functions.
- Policies/AUV thresholds:
  - Add optional `cvf.thresholds` in `mcp/policies.yaml` (top-level or per-capability) consistent with defaults:
    - `data.min_rows`, `seo.max_broken_links`, `seo.min_canonical_rate`, `media.duration_tolerance_pct`, `media.min_width`, `media.min_height`.
  - Allow per-AUV overrides in `capabilities/<AUV>.yaml` under `cvf.thresholds`.
- Knowledge:
  - Add `.claude/knowledge/capabilities/{data.ingest.md, data.insights.md, chart.render.md, seo.audit.md, audio.tts.md, video.compose.md}` with deterministic steps and proof obligations aligned with CVF gates.
- Tests:
  - Implement `tests/agents/synthetic/seo.audit.test.mjs`: run validator against a small mock audit; assert thresholds and summary.
  - Implement `tests/agents/synthetic/video.compose.test.mjs`: create a tiny sample `compose-metadata.json` and validate (skip `ffprobe` if unavailable).
  - Add `tests/agents/synthetic/db.migration.test.mjs`: simulate a migration-result JSON and validate.
  - Add unit tests:
    - `tests/unit/media_validator.test.mjs`
    - `tests/unit/db_migration_validator.test.mjs`
- CI:
  - Create `.github/workflows/ci.yml` to run:
    - Lint/typecheck/unit (existing scripts).
    - Synthetic tests (fast-tier).
    - Deterministic demo graphs (data-video, seo-audit) and archive artifacts under `runs/**` and `reports/**`.
    - Optional `SWARM_MODE=claude` smoke on the seo-audit demo (non-blocking).
- Paths:
  - Align expected SEO artifacts in `orchestration/lib/expected_artifacts.mjs` and `expectedArtifactsByDomain` patterns with docs (`reports/seo/audit.json`, `reports/seo/summary.md`), or update docs if you prefer the current convention.

### Go/No-Go

- No-Go until: reporting embeds the new domains, CVF strict auto-checks domains and respects thresholds, tests (unit + synthetic) cover media/db, and CI runs these validators and demos. After these fixes, we can confidently move on to Phase 12.

- Summary:
  - Phase 11 core (schemas, validators, CVF plumbing, demos) is largely in place.
  - Missing: report embedding, threshold wiring, knowledge assets, SEO/media/db synthetic/unit tests, and CI execution.
  - Apply the above edits to make Phase 11 bulletproof and aligned with our evidence-first gates.
