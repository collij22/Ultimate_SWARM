<!-- I reviewed phase_chat.md and the Phase 10–14 docs, then expanded the plan into a contract-first, self-healing pipeline with schemas, normalization, preflight, deterministic executors, router health checks, CI governance, and domain packs to support diverse workflows without rework. -->

```yaml
ultimate_plan:
  version: 1.0
  owner: orchestration-core
  date: 2025-09-12

  problem_statement:
    - Repeated manual tweaks stem from missing machine-checkable contracts, absent pre-run health checks, and lack of automatic graph normalization/repair.
    - New job types expose capability gaps (schemas, deterministic executors, fixtures) and policy drift (router coverage, budgets).
    - Secondary tools and environment differences cause flakiness without deterministic fallbacks and strict TEST_MODE behavior.

  guiding_principles:
    - contract_first: Capability params/outputs are validated against versioned JSON Schemas.
    - deterministic_by_default: Prefer Primary, offline/local, reproducible paths; Secondary only by consent+budget in TEST_MODE.
    - normalize_then_execute: Graphs are auto-repaired (prereqs/autowiring/param shape) before any node runs.
    - fail_fast_with_remediation: Preflight catches environment/policy gaps with precise fixes; CI blocks on missing contracts.
    - evidence_first: Every step emits artifacts; CVF strictly validates domain outputs with schemas/thresholds.
    - extensibility_at_edges: New domains plug in via "Domain Packs" (schemas + executors + fixtures + templates + tests + knowledge).
    - single_source_of_truth: Policies/registry/schemas drive planning, execution, and gates; no tool IDs hard-coded in prompts.

  scope:
    - target_domains:
        - data: data.ingest, data.query, data.insights
        - charts: chart.render
        - seo: web.search, web.crawl, seo.audit
        - media: audio.tts, audio.transcribe (new), video.compose, image.process
        - docs: doc.generate, doc.convert, nlp.translate, nlp.summarize (new), nlp.extract (new)
        - db: db.schema, db.migration.validate
        - ops: packaging.sbom (advisory), deploy.preview (secondary), observability.spend
        - optional_vision: ocr.extract (new, primary-offline path)
        - optional_3d: gltf.validate (new, deterministic validator only)
    - out_of_scope_initial: live prod deployments, large external crawls without TEST_MODE consent.

  deliverables:
    - capability_schema_registry:
        path: mcp/capability-schemas/
        format: jsonschema-draft-07
        items:
          - data.ingest.input.schema.json
          - data.insights.output.schema.json
          - chart.render.input.schema.json
          - seo.audit.output.schema.json
          - audio.tts.input.schema.json
          - video.compose.input.schema.json
          - doc.generate.input.schema.json
          - nlp.summarize.input.schema.json
          - nlp.extract.output.schema.json
          - audio.transcribe.output.schema.json
          - ocr.extract.output.schema.json
          - gltf.validate.input.schema.json
        rules:
          - semver: major/minor/patch with backward-compat checks
          - $id naming: capability@vX.Y (+ "latest" pointer)
          - test_fixtures: tests/fixtures/schemas/<capability>/*

    - deterministic_executors_library:  # DEL
        path: orchestration/lib/deterministic/
        contract:
          function: execute(capability: str, input: object, ctx: ExecutionContext) -> ExecutorResult
          common:
            - stable_seeding: true
            - test_mode_support: true
            - artifact_paths: returned deterministically
        initial_implementations:
          - data_ingest_executor.mjs
          - insights_executor.mjs
          - chart_render_executor.mjs
          - audio_tts_executor.mjs
          - video_compose_executor.mjs
          - doc_generate_executor.mjs
          - image_process_executor.mjs
        new_capabilities:
          - nlp_summarize_executor.mjs       # pure local heuristics + templates; no LLM by default
          - nlp_extract_executor.mjs         # rule-based patterns + small lib where needed
          - audio_transcribe_executor.mjs    # primary: offline whisper.cpp/vosk with TEST_MODE stubs
          - ocr_extract_executor.mjs         # primary: tesseract CLI integration with TEST_MODE stubs
          - gltf_validate_executor.mjs       # structural checks; no external deps
        artifact_mirrors:
          - runs/<AUV>/latest/<domain>/*    # "latest" mirrors to stabilize downstream consumers

    - graph_normalizer:
        path: orchestration/lib/graph_normalizer.mjs
        features:
          - prereq_autowire: adds missing prerequisite nodes based on capability contracts
          - param_shape_normalization: coerce strings/paths → objects per schema (with defaults)
          - canonical_chains:
              - [data.ingest → data.insights → chart.render]
              - [audio.tts → video.compose]
              - [web.search → seo.audit → doc.generate]
              - [ocr.extract → doc.generate]
              - [audio.transcribe → nlp.summarize → doc.generate]
          - safety_rules:
              - deny_secondary_when_no_TEST_MODE
              - deny_external_network_without_consent
          - output:
              - writes runs/diagnostics/graph-normalized.diff
              - emits NormalizationApplied event

    - preflight_doctor:
        path: orchestration/lib/preflight.mjs
        checks:
          system:
            - node>=20,<21
            - ffmpeg, piper, tesseract, whisper-cpp/vosk (if enabled)
            - playwright deps health
          env:
            - TEST_MODE, BRAVE_API_KEY (non-test web.search), REF_API_KEY
            - SECONDARY_CONSENT for secondary tiers
          fixtures:
            - presence of canonical CSV/HTML/MD/Media demo files
          router_health:
            - capability→tool coverage; no orphans
            - policies.tenants.* ceilings sane
          outcomes:
            - writes runs/diagnostics/preflight.json
            - exit_on_error with explicit remediation
            - --auto-remediate: bootstrap ffmpeg/piper; generate fixtures
        cli:
          - node orchestration/cli.mjs preflight <graph.yaml|auv_id> [--auto-remediate]

    - router_health_contracts:
        registry_fields:
          - requires_binaries: [ffmpeg, tesseract]
          - requires_env: [BRAVE_API_KEY]
          - test_mode_only: [payments, external_crawl, tts.cloud, cloud_db]
        behavior:
          - pre_checks: tool health validation before plan
          - fallback_to_deterministic: where available; otherwise structured escalation
          - coverage_report_enforced: node mcp/router-report.mjs --enforce (CI)

    - cvf_extensions_phase11:
        - schemas:
            - reports/seo/audit.schema.json
            - runs/<AUV>/data/insights.schema.json
            - media/compose-metadata.schema.json
        - validators:
            - data_validator.mjs: min_rows, schema check, checksums
            - chart_validator.mjs: PNG dims/content
            - seo_validator.mjs: broken links, canonical rate, sitemap
            - media_validator.mjs: duration tolerance, audio track
            - ocr_validator.mjs: text coverage ratio (new)
            - asr_validator.mjs: WER proxy via sample text (new)
        - strict_default: true for CI and suite; TEST_MODE performance budgets can "skip with reason"

    - error_catalog_and_escalation:
        catalog:
          - PreflightFailed.missing_binary(ffmpeg)
          - GraphInvalid.param_shape(capability, path)
          - GraphInvalid.missing_prereq(capability, requires)
          - Router.MissingPrimary(capability)
          - Router.SecondaryConsentRequired(tool)
          - Executor.NonDeterministicOutput(domain)
        escalation_cards:
          path: runs/agents/<role>/<session>/escalations/
          content: reason, impact, proposed_fix, normalization_diff?, consent_request?, cost_estimate?

    - knowledge_and_templates:
        knowledge_assets:
          - .claude/knowledge/capabilities/<capability>.md (canonical chains, examples, pitfalls)
          - .claude/knowledge/patterns/domain_packs.md
        graph_templates:
          path: orchestration/graph/templates/
          packs:
            - data_report.yaml
            - seo_audit.yaml
            - media_narration.yaml
            - ocr_to_doc.yaml
            - asr_to_summary.yaml
          generator_cli:
            - node orchestration/cli.mjs graph new --template <pack> --out <file> --params ...

    - developer_experience_cli:
        new_commands:
          - node orchestration/cli.mjs graph-lint <graph.yaml> [--fix]
          - node orchestration/cli.mjs capability new <capability>   # scaffolds schema, executor stub, tests, knowledge, router mapping
          - node orchestration/cli.mjs capability validate <path|capability>
          - node orchestration/cli.mjs suite run <demo|theme> [--strict] [--mode deterministic|claude|hybrid]
          - node orchestration/cli.mjs observability spend --tenant <id>
        exit_codes:
          - 501: Preflight failed
          - 502: Graph normalization required (CI forbids auto-fix)
          - 503: Router coverage/enforcement failed
          - 504: Capability schema missing/incompatible

    - ci_governance_gates:
        pipeline:
          - preflight → graph-lint --fix (CI: assert no diff) → run deterministic+claude → CVF → package/report → router --enforce
        required_for_new_capability:
          - schema + deterministic executor or mapped tool bridge
          - knowledge page + synthetic tests + fixtures
          - router mapping + allowlists + budgets
          - cvf validator coverage (if domain applicable)
        block_on:
          - any "orphan" capability/tool
          - secondary usage without TEST_MODE+consent
          - missing fixtures for templates
          - normalization diff detected in CI

  extensibility_for_diverse_workflows:
    domain_packs:
      - content_ops:
          capabilities: [nlp.summarize, nlp.extract, doc.generate, nlp.translate]
          fixtures: briefs/content/*.md
          deterministic: template-driven summaries/extractions; no LLM required
      - localization:
          capabilities: [nlp.translate, doc.convert]
          deterministic: argos-translate primary; glossary injection via templates
      - ocr_forms:
          capabilities: [ocr.extract, nlp.extract, doc.generate]
          deterministic: tesseract + region hints in schema; JSON field map outputs
      - audio_transcription:
          capabilities: [audio.transcribe, nlp.summarize, doc.generate]
          deterministic: whisper.cpp/vosk (primary-offline) + short fixtures; WER proxy
      - 3d_assets_validation:
          capabilities: [gltf.validate, doc.generate]
          deterministic: schema + linting validators; no rendering required
      - db_reporting:
          capabilities: [data.ingest, data.query, data.insights, chart.render, doc.generate]
          deterministic: duckdb primary; stable CSV fixtures
    add_new_domain_process:
      - capability new <id> → scaffolds schema/executor/tests/knowledge/router entries
      - add fixtures and templates
      - run suite for the domain pack in deterministic & claude modes
      - add to router coverage; update policies/allowlists/budgets
      - document verify steps in docs/verify.md

  observability_events:
    - PreflightStart/PreflightComplete
    - GraphLintStart/GraphLintNormalized/GraphLintAbort
    - NormalizationApplied (diff path)
    - DomainValidationStart/DomainValidationComplete
    - ToolDecision/ToolResult (tier, consent, fallback)
    - SecondaryEscalationRaised/SecondaryConsentGranted
    - SpendLedgerUpdated
    - PackagingStart/ReportStart/ReportComplete

  policy_decisions_to_lock_in:
    - primary_first_always: true
    - secondary_requirements:
        - TEST_MODE: true
        - explicit_consent: true
        - per_tool_budget_override_required: true
    - deterministic_fallbacks_required: true  # if available for capability; else escalation
    - strict_mode_default:
        local_dev: opt_out_with_flag
        ci: always_on
    - router_enforcement_in_ci: true

  phased_delivery:
    phase_11_evidence_and_evaluation (week_1-2):
      - add schemas for all in-scope capabilities
      - implement preflight + graph-lint --fix
      - wire cvf strict defaults and new validators (ocr/asr)
      - expand DEL for new capabilities (summarize/extract/transcribe/ocr/validate-gltf)
      - acceptance:
          - npx ajv validate (schemas pass)
          - preflight artifacts contain full checks and remediation
          - demo graphs pass deterministic+claude; CVF green

    phase_12_end_to_end_demos (week_3):
      - publish domain pack graphs and fixtures
      - embed "latest/" artifact mirrors
      - reporting: add sections for new domains (ocr/asr summaries, intent blocks)
      - acceptance:
          - artifacts present for each pack; report sections render offline

    phase_13_secondary_integrations (week_4, gated):
      - enforce consent flows, TEST_MODE stubs
      - router coverage includes Secondary decisions
      - acceptance:
          - escalations generated when consent missing
          - spend ledgers show secondary spend breakdowns

    phase_14_reporting_ux_polish (week_5):
      - spend summary, intent compare, references strict
      - manifest v1.2 fields finalized for new domains
      - acceptance:
          - report offline, no external/runs links; metadata present

  suggested_commits:
    - feat(cvf): add capability JSON Schemas and validators for data/charts/seo/media/ocr/asr
    - feat(orchestration): graph normalizer with prereq autowire and param normalization
    - feat(cli): add preflight and graph-lint commands (+ exit codes 501–504)
    - feat(deterministic): add summarize/extract/transcribe/ocr/gltf executors
    - feat(mcp): extend registry with requires_binaries/env and test_mode_only flags
    - feat(policies): enforce primary-first, TEST_MODE+consent for secondary, router --enforce
    - feat(graph): add domain pack templates and demo graphs
    - feat(report): render new domain sections; latest/ mirrors
    - docs(verify): add verification steps for new domain packs
    - ci(governance): add enforcement jobs for preflight, normalization, router coverage

  acceptance_criteria:
    - zero_manual_first_run: All domain pack demos pass end-to-end in deterministic mode on clean env after preflight --auto-remediate
    - schema_completeness: 100% schemas for mapped capabilities; ajv validation green
    - router_health: no orphans; coverage report green; --enforce passes
    - ci_strict: CI fails on normalization diff, missing schema, missing fixtures, or secondary without TEST_MODE+consent
    - reports_offline: no external/runs links; assets embedded or copied
    - observability: events emitted for preflight/normalization/validators; spend ledgers accurate

  risks_and_mitigations:
    - risk: binary availability on Windows/macOS/Linux
      mitigate: bootstrap installers + TEST_MODE stubs; skip with reason when user opts-out locally
    - risk: schema churn blocking progress
      mitigate: semver discipline; compat checks; migration notes; "advisory" gate until stable
    - risk: executor drift with policies
      mitigate: router --enforce in CI; knowledge updates required in PR template
    - risk: demo fixture brittleness
      mitigate: store canonical fixtures in repo; checksum manifest; update via PR only

  success_metrics:
    - 95%+ first-run success on domain packs (local deterministic mode)
    - < 5 minutes end-to-end per demo pack on reference machine
    - 0 router orphans; 100% coverage for in-scope capabilities
    - CI reliability ≥ 98% with strict gates on
```

```text
proposed_tree
mcp/
  capability-schemas/
    data.ingest.input.schema.json
    data.insights.output.schema.json
    chart.render.input.schema.json
    seo.audit.output.schema.json
    audio.tts.input.schema.json
    video.compose.input.schema.json
    doc.generate.input.schema.json
    nlp.summarize.input.schema.json
    nlp.extract.output.schema.json
    audio.transcribe.output.schema.json
    ocr.extract.output.schema.json
    gltf.validate.input.schema.json

orchestration/
  cli.mjs                      # extended: preflight, graph-lint, capability new/validate, suite
  lib/
    preflight.mjs
    graph_normalizer.mjs
    deterministic/
      nlp_summarize_executor.mjs
      nlp_extract_executor.mjs
      audio_transcribe_executor.mjs
      ocr_extract_executor.mjs
      gltf_validate_executor.mjs

orchestration/graph/
  templates/
    data_report.yaml
    seo_audit.yaml
    media_narration.yaml
    ocr_to_doc.yaml
    asr_to_summary.yaml
  projects/
    data-report-demo.yaml
    ocr-doc-demo.yaml
    asr-summary-demo.yaml

docs/
  verify.md                    # updated with new domain packs
  phase_chat.md                # updated policy decisions + acceptance
  QUALITY-GATES.md             # updated exit codes (501–504)
  ARCHITECTURE.md              # references to schemas/normalizer/preflight

tests/
  agents/synthetic/
    nlp.summarize.test.mjs
    nlp.extract.test.mjs
    audio.transcribe.test.mjs
    ocr.extract.test.mjs
    gltf.validate.test.mjs
  fixtures/
    content/*.md
    ocr/*.png
    audio/*.wav
    data/*.csv

runs/
  diagnostics/
    preflight.json
    graph-normalized.diff
```
