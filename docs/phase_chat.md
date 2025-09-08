<!-- Key mismatches: artifacts list for AUV-0002, manifest field mapping, report asset paths, and bundling of generated docs; fix these before Phase 7 delivery to ensure CVF passes and packages are self-contained. -->

_Must fix before Phase 7 delivery_
-AUV-0002 expectedArtifacts mismatch: expectedArtifacts('AUV-0002') points to products_search.png; docs/tests expect products_grid.png and product_detail.png. Why: strict CVF will fail, blocking autopilot/deliver. Fix: update orchestration/lib/expected_artifacts.mjs.

-Manifest field mapping from runbook: package.mjs reads runbookSummary.durations?.total and lighthouse_score, but runbook writes duration_ms and perf.perf_score. Why: manifest currently records zeros; report shows wrong perf/timings. Fix: map to duration_ms and perf.perf_score (and include perf.lcp_ms).

-Report image paths: report.html references runs/... relative to dist/AUV/..., which breaks when opening the report standalone. Why: screenshots won’t render offline. Fix: either embed all screenshots as base64 or rewrite src to a proper relative path (e.g., path.relative(dirname(outputPath), join(PROJECT_ROOT, artifact.path))) or copy assets into dist/AUV/assets.

-Bundling generated docs: extractDocumentation() writes dist/<AUV>/docs/verify-<AUV>.md, but createBundle() only zips files found under project root, so the verify doc isn’t included. Why: missing doc in package. Fix: source files from this.outputPath when present (or store sourcePath alongside path for bundling).

_Should fix soon (not blocking)_
-CLI package output fields: CLI prints manifest.bundle.path and size_bytes; schema and package.mjs use zip_path and bytes. Why: confusing UX; easy fix in orchestration/cli.mjs.
-Run ID derivation: package.mjs falls back to "latest" because runbook summary lacks run_id. Why: weak provenance. Fix: generate a deterministic run id (e.g., timestamp or hash of runbook-summary.json).
-Manifest budgets section: Currently hard-coded pass. Why: under-reports real budget outcomes. Fix: read runs/<AUV>/perf/budget-evaluation.json and populate cvf.budgets with status/violations.
-Operate doc naming: docs/operate.md references AUV-XXXX_bundle.zip but code uses package.zip. Why: doc drift. Fix: align to package.zip.

_Nice to have (later)_
-SBOM enrichment: Add license/repo via a light tool (e.g., license-checker) to replace placeholder MIT. Not required for Phase 7 acceptance.
-Consistent screenshot naming across tests/docs: Reduces future drift.

---
