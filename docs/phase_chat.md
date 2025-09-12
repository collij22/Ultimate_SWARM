Run an in-depth analysis of the Swarm1 project which identifies key areas for improvement. My goal is to be able to run an almost arbitrary task request, like an upwork job brief. Right now I feel we might be a little limited and not able to cope with more diverse requests. I also want to be able to easily create things like n8n workflows (or some equivalent) which will achieve arbitrary repeatable workflows. For example, I want to create a faceless youtube channel. I would need a workflow which goes out each week, researches news, researches youtube videos from selected youtubers, can ingest the transcripts, make conclusions, summarise key topics, trends, then take that information and create a podcast which will be posted to youtube. And it would need graphics. And I would want advice on how to create the youtube channel, what to call it, etc. Esssentially a simple brief like i want to create a new youtube channel about weekly trends in X, would be developed into a complex project and repeatable workflow. And this is just one example of a project, it could be almost anything. Think how we can improve our current implementation to be more flexible, and other enhancements we can use. Think about our use of MCPs.  What can we and can't we achieve at the moment, for an upwork-style job? what types of tasks can and can't we achieve, what types of media can and can't we deal with. And have we tested enough end to end examples? specifically those which use both test and more importantly real APIs. And i want to also be able to use the subagent workflow more easily, and have better visibility of it. like which agents are used, can i see a clear flow of what happened, what each agent did, what they communicated back to the main agent, what the flow looked like. Something visual would be great, something a human would like to see and be clear what happened. Right now we have a nice report and detailed json logs, but we don't really have something i can look at as a human to see which agents ran, what they did, what they communicated, maybe a summary or each step in the whole workflow. Based upon this, provide a detailed plan to enhance where we are right now, and make sure you are clear exactly on the current functionality we have and how we can extend it. Make a detailed plan of what's needed to improve it so it's absolutely cutting edge and state of the art, and gives even more value. Ultrathink this and give me your best possible ideas and plan

---
required updates to deal with this:

I'll scan the router configs, subagent engine modules, demo graph, and recent reports to precisely assess current capabilities and gaps before proposing the enhancement plan.

[10 tools called]

I reviewed the router configs, subagent modules, tool executor, demo graphs, and phase docs. I’ll outline what’s possible today, what’s missing for broader Upwork-style jobs, and a concrete, phased plan to reach “arbitrary brief → repeatable workflow” including visual subagent traces.

### Executive summary
- Current system excels at deterministic AUV delivery for web/data/SEO/media basics with policy‑governed MCP routing and packaging. Real API coverage for Secondary MCPs is stubbed; visualizations of subagent activity are JSON-only. Broaden capability packs, add real API executors, a scheduler, and a visual “agent flow” report to unlock arbitrary, repeatable workflows (e.g., weekly faceless YouTube).

### What we can do today (reliably)
- Web/UI/API/perf CVF gates with artifacts and packaging/reporting (AUV‑0002..0005; parallel DAG runner; tri‑mode; durable engine).
- Data → insights → charts, SEO audit basics, local TTS and video composition, doc generation, image processing (Primary-first).
- Policy‑governed tool selection (allowlists, budgets, TEST_MODE on risky domains), router coverage artifacts, subagent transcripts and tool plans.
- Deterministic demo graphs (data-video, seo-audit) and TEST_MODE stubs for Secondary domains.

```389:413:orchestration/lib/subagent_gateway.mjs
  // Persist result summary alongside transcript for convenience
  const resultPath = path.join(path.dirname(transcriptPath), 'result-gateway.json');
  const result = {
    ok,
    errors,
    steps,
    consent_state: {
      secondary_consent: hasSecondaryConsent,
      consent_token: options.consentToken || null,
    },
    summary: ok
      ? {
          // @ts-ignore - lastAssistantJson is typed as any
          plan_length: lastAssistantJson?.plan?.length || 0,
          // @ts-ignore - lastAssistantJson is typed as any
          tool_request_count: lastAssistantJson?.tool_requests?.length || 0,
        }
      : null,
    response: lastAssistantJson || null,
    escalation: escalation || null,
  };
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
```

```10:21:orchestration/graph/projects/seo-audit-demo.yaml
  - id: search
    type: web_search_fetch
    params:
      query: 'ref-tools MCP server'
      outDir: websearch_demo

  - id: audit
    type: agent_task
    requires: [search]
    params:
      capability: seo.audit
```

```159:161:mcp/router-report.mjs
    const outputPath = join(outputDir, 'coverage-report.json');
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
```

### What’s limited right now (gaps)
- Live Secondary MCP execution (implemented as TEST_MODE stubs only):
```186:188:orchestration/lib/tool_executor.mjs
      // Live mode would use FIRECRAWL_API_KEY
      throw new Error('Live firecrawl not implemented (requires FIRECRAWL_API_KEY)');
```
```240:242:orchestration/lib/tool_executor.mjs
      // Live mode would use STRIPE_API_KEY (test mode keys only)
      throw new Error('Live Stripe not implemented (requires STRIPE_API_KEY in test mode)');
```
```303:305:orchestration/lib/tool_executor.mjs
      // Live mode would use SUPABASE_SERVICE_KEY
      throw new Error('Live Supabase not implemented (requires SUPABASE_SERVICE_KEY)');
```
```361:363:orchestration/lib/tool_executor.mjs
      // Live mode would use TTS_CLOUD_API_KEY
      throw new Error('Live Cloud TTS not implemented (requires TTS_CLOUD_API_KEY)');
```
- No first‑class capabilities for: RSS/news aggregation, YouTube search/upload/transcripts, ASR/OCR, PDF/slide templating, social scheduling, or “workflow schedules” (cron) in DAGs.
- Subagent UX: excellent machine logs, but no human‑friendly “agent flow” visualization (timeline/graph/sequence with per‑step summaries).
- Graph ergonomics: no “graph-from-template” for common content ops (e.g., “weekly trend show”), and no exporter to n8n-like runtimes.

### What types of Upwork tasks we can and can’t achieve today
- Achievable now (deterministic, Primary-first):
  - Web feature slices with UI/API/perf proofs; SEO mini audits; data→insights→charts reports; offline TTS; video composition; doc/report generation; image processing; local DB/duckdb analytics; packaging/reporting.
- Partially achievable (needs real API bridges or new MCPs):
  - Larger site crawling; payments demo with live test API; hosted DB ops; cloud TTS; web search at scale; content workflows with external platforms; channel/podcast publishing.
- Not yet (requires new domain packs/connectors):
  - Weekly faceless YouTube channel E2E: multi-source research (RSS/news/YouTube), transcript ingest/ASR, summarization/extraction, TTS voices (cloud or enhanced local), thumbnail/graphics templates, video SLATEs, YouTube upload + metadata, social promo posts, and scheduling.

### Plan: make Swarm1 deliver arbitrary briefs and repeatable workflows

- Domain packs (capabilities + schemas + deterministic executors + fixtures + validators)
  - Content Ops Pack
    - Capabilities: nlp.summarize, nlp.extract, doc.generate (templated), nlp.translate.
    - Executors: local heuristics + templates, deterministic outputs, CVF schema validators.
  - Media Ops Pack
    - Capabilities: audio.transcribe (whisper.cpp or vosk), audio.tts (piper) + audio.tts.cloud (opt), video.compose, image.process (thumbnail templates).
    - Validators: WER proxy, duration/stream checks, dims.
  - Web Research Pack
    - Capabilities: rss.fetch (Primary), web.search (Brave live), web.crawl (crawler-lite Primary; firecrawl Secondary live).
    - Validators: feed integrity, crawl graph sanity, robots/meta honoring.
  - Platform Connectors (Secondary)
    - youtube.data (search/list/upload), youtube.transcript (pull captions; fallback ASR), twitter.post, notion.page, google.docs/sheets (adapters).
    - All TEST_MODE stubs + live-mode execution with budgets/consent + schema’d outputs.

- Real API execution for Secondary MCPs (unlock live mode)
  - Implement live bridges in `tool_executor.mjs` with safety/budget checks:
    - firecrawl (web.crawl), stripe (payments.test in test mode), supabase (cloud.db), tts-cloud (audio.tts.cloud).
  - Add dry-run parity fixtures and acceptance checks; CI runs stubs; “Live Suite” runs only when keys present.

- Scheduler and repeatability
  - Add BullMQ repeatable jobs (cron) and “workflow schedules” to DAG runner:
    - New CLI: engine enqueue run_graph --repeat "0 9 * * MON" --tenant <t>.
    - Persist last-success metadata; write runbook deltas.

- Visual “Agent Flow” (human-readable)
  - Build agent timeline/graph for each run:
    - Aggregate hooks + subagent transcripts into `runs/<RUN_ID>/agent-flow.json`.
    - Render HTML with:
      - Gantt-style timeline of nodes (start/end, retries).
      - Sequence view (agents, tool decisions, escalations).
      - Per-step summaries + artifact links.
    - Embed in `dist/<AUV>/report.html` as “Agent Flow” section (offline, no external refs).

- Graph ergonomics and templates
  - Graph templates + generator:
    - `orchestration/graph/templates/{content_weekly.yaml, video_podcast.yaml, seo_audit.yaml, db_report.yaml}`
    - CLI: graph new --template content_weekly --out projects/weekly-trends.yaml --params topic="AI Trends"
  - n8n exporter/importer (optional)
    - Export Swarm1 graph → n8n JSON nodes where possible (http, function, schedule, webhook).
    - MCP n8n (Secondary): workflow.create/update/run/status (TEST_MODE stubs).

- Example: “Weekly faceless YouTube channel” workflow (end-to-end)
  - High-level nodes (deterministic + optional Secondary):
    - rss.fetch (selected feeds) → web.search (Brave) → youtube.data.search (channels) → youtube.transcript or audio.transcribe (whisper) → nlp.extract + nlp.summarize → doc.generate (script) → audio.tts (piper or cloud) → image.process (thumbnail) → video.compose → youtube.data.upload → doc.generate (show notes) → report/package
  - Sketch graph (template; deterministic-first; live where keys exist)
```yaml
version: '1.0'
project_id: weekly-trends
concurrency: 3
nodes:
  - { id: sources_rss,  type: agent_task, params: { capability: rss.fetch, inputs: ['https://.../feed.xml'] } }
  - { id: search_news,  type: agent_task, requires: [sources_rss], params: { capability: web.search, query: 'weekly trends in ${TOPIC}' } }
  - { id: yt_lookup,    type: agent_task, requires: [search_news], params: { capability: youtube.data.search, channels: ['...'] } }
  - { id: transcripts,  type: agent_task, requires: [yt_lookup], params: { capability: youtube.transcript, fallback: 'audio.transcribe' } }
  - { id: extract,      type: agent_task, requires: [transcripts], params: { capability: nlp.extract, schema: 'topics@v1' } }
  - { id: summarize,    type: agent_task, requires: [extract], params: { capability: nlp.summarize, style: 'podcast' } }
  - { id: script,       type: agent_task, requires: [summarize], params: { capability: doc.generate, template: 'podcast_script' } }
  - { id: voice,        type: agent_task, requires: [script], params: { capability: audio.tts, voice: 'en-GB' } }
  - { id: thumbnail,    type: agent_task, requires: [summarize], params: { capability: image.process, template: 'yt_thumbnail' } }
  - { id: video,        type: agent_task, requires: [voice, thumbnail], params: { capability: video.compose, template: 'slate+slides' } }
  - { id: yt_upload,    type: agent_task, requires: [video], params: { capability: youtube.data.upload, privacy: 'public' } }
  - { id: show_notes,   type: agent_task, requires: [summarize], params: { capability: doc.generate, template: 'show_notes' } }
  - { id: cvf,          type: cvf,         requires: [video] }
  - { id: package,      type: package,     requires: [cvf], params: { auv: AUV-1301 } }
  - { id: report,       type: report,      requires: [package], params: { auv: AUV-1301, includeAgentFlow: true } }
```

### MCP expansion (Primary-first; Secondary budget-gated)
- Primary (offline/local or free):
  - rss.fetch, pdf.parse, ocr.extract (tesseract), audio.transcribe (whisper.cpp/vosk), text.embed (optional local), sitemap.read.
- Secondary (live APIs; TEST_MODE stubs + budgets):
  - youtube.data, youtube.transcript, firecrawl (scale crawls), stripe (test), supabase, tts.cloud, n8n.

### Subagent UX improvements
- Controls:
  - Per-node `params.role`, live toggles for SWARM_MODE and inclusion lists; CLI preset profiles.
- Visibility:
  - “Agent Flow” in report; per-step summaries; escalation cards rendered; spend summary per capability.
- Governance:
  - Router preview always embedded; consent prompts with budgets before Secondary execution (interactive or via flags).

### E2E testing matrix (deterministic + live)
- Deterministic suite (CI default): All domain packs using fixtures; CVF strict; router coverage enforce.
- Live suite (keys present): Brave search, firecrawl (small), stripe test-mode, supabase connectivity, youtube.data search/upload (unlisted), tts.cloud sample; all with budgets/consent + logs and artifacts.

### Developer experience
- CLI façade:
  - brief-deliver: plan → graph template selection → run → package → report → agent flow.
  - graph new, capability new/validate, preflight doctor (binaries/env/fixtures/router), graph-lint --fix; exit codes 501–504.
- n8n-friendly:
  - Export current graph to n8n JSON; optional “n8n MCP” driver.

### Acceptance criteria (per enhancement)
- Real Secondary bridges: Live API calls logged, artifacts schema-validated, budgets enforced, and CVF extends with domain validators.
- Agent Flow: HTML renders offline with timeline/sequence, step summaries, artifacts linked; report includes spend summary and router preview.
- Content/Media/RSS/ASR/OCR packs: Schemas + validators; deterministic executors with fixtures; demo graphs pass both deterministic and hybrid modes.
- Scheduler: Repeatable job creates weekly artifacts and a new dist bundle; last-run metadata recorded.

### Risks and mitigations
- API keys and quotas: TEST_MODE stubs, per-tool budgets, consent prompts, and small-scale live runs in CI “optional” job.
- Cross-platform binaries: preflight doctor auto-installs or guides; “skip with reason” recorded.
- Drift across policies/registry/executors: router coverage enforce, schema contracts, graph-lint normalization.

### Suggested commit series (conventional)
- feat(mcp): add rss.fetch, youtube.data, youtube.transcript, ocr.extract, audio.transcribe
- feat(orchestration): agent flow renderer + report section
- feat(executor): live bridges for firecrawl/stripe/supabase/tts-cloud with budgets/consent
- feat(engine): repeatable jobs (cron) and schedule CLI
- feat(graph): templates for content_weekly, media_narration; graph generator
- feat(cvf): validators for rss/ocr/asr/youtube outputs; strict extensions
- feat(cli): brief-deliver, preflight, graph-lint --fix, capability new/validate
- feat(observability): spend summaries and router preview embeds in report
- docs(verify): add E2E steps for live demos; update ultimate guide
- ci(governance): router --enforce; optional live suite when keys present

- - -

- Clear flow demo nodes exist and subagent artifacts are persisted; we’ll add a human‑readable “Agent Flow” to `report.html`.
- Real API coverage is currently stubbed for key Secondary MCPs; we’ll implement live bridges and a gated live suite with budgets/consent.
- A content/media “weekly trends” template plus scheduler, RSS/YouTube connectors, ASR/OCR, and doc/thumbnail/video pipelines will enable truly arbitrary, repeatable briefs end‑to‑end.

----
technical implementation guide:

I’m going to capture the implementation as a structured TODO list so we can track progress, then I’ll provide the detailed step-by-step guide with file paths, diffs, and snippets.

[1 tool called]

<!-- I’ll produce a precise, code-oriented implementation guide with filenames, diffs/snippets, and acceptance checks, aligned to your repo’s phases and policies, to enable another agent to implement end-to-end. -->

### 1) Capability contracts and router updates

- mcp/capability-schemas/ (new JSON Schemas; draft-07)
  - rss.fetch.input.schema.json
  - nlp.summarize.input.schema.json
  - nlp.extract.output.schema.json
  - audio.transcribe.output.schema.json
  - ocr.extract.output.schema.json
  - youtube.data.search.input.schema.json
  - youtube.transcript.output.schema.json
  - youtube.upload.input.schema.json

- mcp/registry.yaml: add Primary/Secondary tools
  - Primary: rss, tesseract, whisper-local
  - Secondary: youtube-data, youtube-transcript, n8n, firecrawl (live), stripe (test), supabase, tts-cloud (already listed but live bridge missing)
  - Add requires_binaries (ffmpeg, tesseract, whisper), requires_env (YOUTUBE_API_KEY, N8N_BASE_URL, N8N_API_KEY)

- mcp/policies.yaml:
  - capability_map:
    - rss.fetch: [rss]
    - nlp.summarize: [report-lite]  // deterministic summarizer will run via executor
    - nlp.extract: [report-lite]
    - audio.transcribe: [whisper-local]
    - ocr.extract: [tesseract]
    - youtube.data.search: [youtube-data]
    - youtube.transcript: [youtube-transcript]
    - youtube.upload: [youtube-data]
    - n8n.workflow: [n8n]  // optional
  - agents.allowlist:
    - B7.rapid_builder: add rss, tesseract, whisper-local, youtube-*, n8n
  - agents.budgets: per-cap ceilings for new caps; tiers.secondary.budget_overrides for youtube-*, n8n
  - safety.require_test_mode_for: add external_crawl (already), social.publish (new), youtube.upload

- Acceptance
  - node mcp/router.mjs --validate
  - node mcp/router-report.mjs --enforce (writes runs/router/coverage-report.json; zero orphans)
  - policies and registry cross-reference pass

### 2) Deterministic executors and CVF validators

- orchestration/lib/deterministic/ (new)
  - nlp_summarize_executor.mjs
    - Inputs: text[] or markdown path; style preset
    - Output: runs/<RUN_ID>/content/summary.json, summary.md
  - nlp_extract_executor.mjs
    - Inputs: text; schema for topics/entities
    - Output: runs/<RUN_ID>/content/extract.json
  - audio_transcribe_executor.mjs (Primary path)
    - Drives whisper.cpp/vosk if available; TEST_MODE: stub from fixtures; outputs runs/.../transcript.json, .srt
  - ocr_extract_executor.mjs
    - tesseract CLI; TEST_MODE: fixtures; outputs runs/.../ocr.json, .txt

- orchestration/lib/{data_validator.mjs, chart_validator.mjs, seo_validator.mjs, media_validator.mjs}:
  - Add new validators:
    - asr_validator.mjs (WER proxy: compare transcript length/coverage; JSON schema)
    - ocr_validator.mjs (text coverage ratio; schema)
    - rss_validator.mjs (feed items >= N; required fields present)
    - youtube_validator.mjs (upload result schema; transcript present)

- orchestration/cvf-check.mjs:
  - Domain auto-detect: asr, ocr, rss, youtube
  - Map new exit codes if necessary (reuse 305–309; add 310–312 if needed)

- Acceptance
  - npx ajv validate -s mcp/capability-schemas/*.json -d tests/fixtures/schemas/**/*
  - node orchestration/cvf-check.mjs AUV-1201 --strict (when artifacts present)

### 3) Live tool execution bridges and safety

- orchestration/lib/tool_executor.mjs: implement live-mode for Secondary
  - web.crawl: firecrawl live (FIRECRAWL_API_KEY)
  - payments.test: stripe test keys, create PaymentIntent
  - cloud.db: supabase connectivity/DDL (respect TEST_MODE; record outputs)
  - audio.tts.cloud: provider adapter switch by env
  - youtube-data:
    - search: GET search list
    - upload: resumable upload; set unlisted; write upload.json
  - youtube-transcript:
    - Try official captions; fallback: download audio + audio.transcribe chain (respect budgets)
  - n8n: workflow.create/update/run/status (TEST_MODE stubs; live behind N8N_API_KEY)

- Safety guards:
  - Enforce TEST_MODE for youtube.upload/social.publish
  - Budget checks via router decision; write ToolDecision/ToolResult hook events
  - Redact keys in logs per policies.safety.redact_logs

- Acceptance
  - With keys present, run minimal live demos (small calls) and persist artifacts
  - Without keys, stubs produce deterministic outputs; CVF strict passes

### 4) Preflight doctor and graph normalizer + CLI

- orchestration/lib/preflight.mjs (new)
  - Check Node version, binaries (ffmpeg, tesseract, whisper), API keys if live features selected, Playwright health, router coverage
  - Output runs/diagnostics/preflight.json; exit 501 on failure
  - --auto-remediate: bootstrap_ffmpeg.mjs, generate fixtures

- orchestration/lib/graph_normalizer.mjs (new)
  - Prereq autowire canonical chains:
    - data.ingest → data.insights → chart.render
    - web.search → seo.audit → doc.generate
    - transcripts → nlp.extract → nlp.summarize → doc.generate
    - audio.tts → video.compose
  - Param normalization via schemas (capability-schemas/)
  - Safety rules: deny secondary without TEST_MODE/consent; write normalization diff runs/diagnostics/graph-normalized.diff
  - Exit 502 in CLI if normalization required (CI disallows auto-fix)

- orchestration/cli.mjs: add commands
  - preflight [graph] [--auto-remediate]
  - graph-lint <graph.yaml> [--fix]
  - capability new <id>, capability validate <path|id>
  - brief-deliver <brief.md> [--tenant] [--mode] [--consent] (chains plan → graph template → run → package → report)

- Acceptance
  - CLI exit codes honored (501–504)
  - Normalization diff created when needed; CI job fails on diff

### 5) Agent Flow renderer and report integration

- orchestration/lib/agent_flow_renderer.mjs (new)
  - Input: runs/observability/hooks.jsonl, runs/agents/**/thread.jsonl, per-node tool_results
  - Output: runs/<RUN_ID>/agent-flow.json and agent-flow.html (pure HTML+inline assets)
  - Sections: timeline (Gantt), sequence diagram, per-step summaries, escalations, spend breakdown

- orchestration/report.mjs:
  - Include “Agent Flow” section when present; embed agent-flow.html content or render a simplified inline version
  - Add spend summary; router preview snippet
  - Ensure offline: no external URLs; copy assets to dist/<AUV>/assets/**

- Acceptance
  - dist/<AUV>/report.html shows Agent Flow timeline, sequence, and step summaries
  - reports/observability/spend.json generated via aggregator (existing)

### 6) Scheduler (repeatable jobs) and weekly workflow templates

- orchestration/engine/bullmq/enqueue.mjs:
  - Support --repeat-cron "0 9 * * MON" and metadata persistence (last_success.json)
- orchestration/graph/templates/ (new)
  - content_weekly.yaml
  - media_narration.yaml
  - seo_audit.yaml
- orchestration/cli.mjs:
  - graph new --template content_weekly --out orchestration/graph/projects/weekly-trends.yaml --params topic="AI"
- Projects:
  - orchestration/graph/projects/weekly-trends.yaml (from template; uses new capabilities)

- Acceptance
  - Enqueue repeatable job; verify weekly-trends graph runs under TEST_MODE and live mode (keys present), artifacts and dist produced

### 7) n8n exporter and optional MCP

- orchestration/lib/n8n_exporter.mjs (new)
  - Convert Swarm1 graph to n8n JSON nodes (http, function, schedule)
  - CLI: graph export-n8n <graph.yaml> -o exports/weekly-trends-n8n.json
- mcp/registry.yaml: add n8n
- mcp/policies.yaml: map n8n.workflow to [n8n]
- orchestration/lib/tool_executor.mjs: implement n8n TEST_MODE stubs + live create/run (optional)

- Acceptance
  - Export JSON imports cleanly to n8n; round-trip minimal workflow

### 8) E2E demos and fixtures

- tests/agents/synthetic/: add rss/nlp/ocr/asr/youtube tests
- tests/fixtures/: content markdown, sample images for OCR, short WAVs, RSS feeds
- orchestration/graph/projects/: weekly-trends-demo.yaml (deterministic), weekly-trends-live.yaml (conditional on keys)

- Acceptance
  - Deterministic suite green in CI; live suite gated by keys and budgets; artifacts validated via CVF

### 9) CI governance and docs

- CI
  - Jobs: preflight, graph-lint, router-report --enforce, deterministic demos; optional live suite (if secrets present)
  - Artifacts: preflight.json, graph-normalized.diff, coverage-report.json, agent-flow.json/html, dist/**
- Docs
  - docs/verify.md: new domain packs verification
  - docs/ORCHESTRATION.md: commands, templates, scheduler, agent flow
  - docs/QUALITY-GATES.md: new validators and exit code mentions
  - docs/ultimate_guide_11sep2025_phases1-14.md: append new packs and demos

- Acceptance
  - CI passes deterministic suite; live suite runs when keys present; enforcement gates block config drift

### Code snippets (illustrative)

- mcp/policies.yaml (capability_map additions)
```yaml
capability_map:
  rss.fetch: [rss]
  nlp.summarize: [report-lite]
  nlp.extract: [report-lite]
  audio.transcribe: [whisper-local]
  ocr.extract: [tesseract]
  youtube.data.search: [youtube-data]
  youtube.transcript: [youtube-transcript]
  youtube.upload: [youtube-data]
  n8n.workflow: [n8n]
```

- orchestration/lib/preflight.mjs (skeleton)
```javascript
export async function runPreflight({ graphPath } = {}) {
  const checks = { node: process.version, binaries: {}, env: {}, router: {} };
  // check binaries
  for (const bin of ['ffmpeg', 'tesseract']) checks.binaries[bin] = await which(bin).catch(() => null);
  // env keys
  for (const k of ['BRAVE_API_KEY','YOUTUBE_API_KEY','FIRECRAWL_API_KEY']) checks.env[k] = !!process.env[k];
  // router coverage
  checks.router.coverage = await generateCoverageSafely();
  await writeJson('runs/diagnostics/preflight.json', checks);
  if (!checks.binaries.ffmpeg) process.exit(501);
}
```

- orchestration/lib/agent_flow_renderer.mjs (skeleton)
```javascript
export function renderAgentFlow({ hooksPath, agentsDir, outDir }) {
  const events = readJsonl(hooksPath);
  const steps = collectSubagentSteps(agentsDir);
  const flow = buildTimeline(events, steps);
  writeFileSync(join(outDir, 'agent-flow.json'), JSON.stringify(flow, null, 2));
  writeFileSync(join(outDir, 'agent-flow.html'), renderHtml(flow));
  return flow;
}
```

- orchestration/graph/templates/content_weekly.yaml (excerpt)
```yaml
version: '1.0'
project_id: content-weekly
concurrency: 3
nodes:
  - { id: rss, type: agent_task, params: { capability: rss.fetch, feeds: '${FEEDS}' } }
  - { id: summarize, type: agent_task, requires: [rss], params: { capability: nlp.summarize, style: 'podcast' } }
  - { id: tts, type: agent_task, requires: [summarize], params: { capability: audio.tts } }
  - { id: video, type: agent_task, requires: [tts], params: { capability: video.compose, template: 'slate' } }
  - { id: upload, type: agent_task, requires: [video], params: { capability: youtube.upload, privacy: 'unlisted' } }
  - { id: report, type: report, requires: [upload], params: { auv: AUV-1301, includeAgentFlow: true } }
```

- orchestration/lib/tool_executor.mjs (youtube upload sketch)
```javascript
if (capability === 'youtube.upload') {
  if (process.env.TEST_MODE !== 'true' && !process.env.YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY required');
  }
  const meta = await (process.env.TEST_MODE === 'true'
    ? stubYoutubeUpload()
    : liveYoutubeUpload({ apiKey: process.env.YOUTUBE_API_KEY, videoPath, title, description }));
  const outDir = tenantPath(tenant, 'youtube');
  fs.mkdirSync(outDir, { recursive: true });
  const p = path.join(outDir, 'upload.json');
  fs.writeFileSync(p, JSON.stringify(meta, null, 2));
  const payload = { capability, cached: false, artifacts: [p], outputs: { videoId: meta.id } };
  writeCache(cachePath, payload);
  return payload;
}
```

- - -

