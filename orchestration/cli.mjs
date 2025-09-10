#!/usr/bin/env node
/**
 * Swarm1 — Orchestration CLI
 *
 * Commands:
 *   node orchestration/cli.mjs <AUV-ID>                    - Run AUV autopilot
 *   node orchestration/cli.mjs plan <brief-path> [--dry-run] - Generate AUVs from brief
 *   node orchestration/cli.mjs validate auv <AUV-ID>       - Validate AUV spec
 *   node orchestration/cli.mjs run-graph <graph.yaml> [--resume <RUN-ID>] - Run DAG graph
 *   node orchestration/cli.mjs graph-from-backlog <backlog.yaml> [-o output.yaml] - Compile backlog to graph
 *   node orchestration/cli.mjs build-lane <AUV-ID> --patch <file> [options] - Run build lane
 *   node orchestration/cli.mjs package <AUV-ID>            - Create distribution bundle
 *   node orchestration/cli.mjs report <AUV-ID>             - Generate HTML report from manifest
 *   node orchestration/cli.mjs deliver <AUV-ID>            - Full delivery pipeline (run → package → report)
 *   node orchestration/cli.mjs help                        - Show help
 *
 * Exit codes:
 *   0 - Success
 *   1 - General error
 *   2 - Usage error
 *   101 - Playwright tests failed
 *   102 - Lighthouse performance check failed
 *   103 - CVF gate failed
 *   104 - Test authoring failed
 *   105 - Server startup failed
 *   201 - Format failed (Build Lane)
 *   202 - Lint failed (Build Lane)
 *   203 - Typecheck failed (Build Lane)
 *   204 - Unit tests failed (Build Lane)
 *   205 - Integration tests failed (Build Lane)
 *   206 - Autopilot smoke failed (Build Lane)
 *   207 - Git push failed (Build Lane)
 *   208 - PR creation failed (Build Lane)
 *   209 - Patch apply failed (Build Lane)
 *   401 - Packaging failed
 *   402 - Report generation failed
 */
import { runAuv, RunbookError } from './runbooks/auv_delivery.mjs';
import { compileBrief, validateAuv } from './lib/auv_compiler.mjs';
import { validateBriefCLI } from './lib/validate_brief.mjs';
import { GraphRunner } from './graph/runner.mjs';
import { compileBacklogToGraph, loadBacklog, saveGraph } from './graph/compile_from_backlog.mjs';
import { PackageBuilder } from './package.mjs';
import { ReportGenerator } from './report.mjs';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const command = args[0];

// Show help
function showHelp() {
  console.log(`
Swarm1 Orchestration CLI

Commands:
  <AUV-ID>                                        Run AUV autopilot (e.g., AUV-0003)
  plan <brief-path> [--dry-run]                   Generate AUVs from brief
  validate brief <brief-path>                     Validate brief against schema
  validate auv <AUV-ID>                           Validate AUV spec
  run-graph <graph.yaml> [--resume <RUN-ID>]      Run DAG graph with parallel execution
  graph-from-backlog <backlog.yaml> [-o output]   Compile backlog to executable graph
  build-lane <AUV-ID> --patch <file> [options]    Run autonomous build lane
  package <AUV-ID>                                Create distribution bundle for AUV
  report <AUV-ID>                                 Generate HTML report from manifest
  deliver <AUV-ID>                                Full delivery pipeline (run → package → report)

Engine Commands (Durable Execution):
  engine start [--tenant <ID>] [--concurrency N]  Start worker for queue processing
  engine enqueue <graph.yaml> [--tenant <ID>]     Submit job to queue
  engine status [--tenant <ID>] [--job <ID>]      Show queue/job status
  engine pause                                    Pause queue processing
  engine resume                                   Resume queue processing
  engine cancel --job <ID>                        Cancel a specific job
  engine list [--state <state>]                   List jobs by state
  engine metrics                                   Show queue metrics
  engine monitor                                   Monitor queue events (live)
  engine emit-status                              Generate status report
  engine backup [runs|dist|both] [--tenant <ID>]  Create backup archive

  help                                             Show this help message

Examples:
  node orchestration/cli.mjs AUV-0003
  node orchestration/cli.mjs plan briefs/demo-01/brief.md
  node orchestration/cli.mjs plan briefs/demo-01/brief.md --dry-run
  node orchestration/cli.mjs validate brief briefs/demo-01/brief.md
  node orchestration/cli.mjs validate auv AUV-0101
  node orchestration/cli.mjs run-graph orchestration/graph/projects/demo-01.yaml
  node orchestration/cli.mjs run-graph orchestration/graph/projects/demo-01.yaml --resume RUN-abc123
  node orchestration/cli.mjs graph-from-backlog capabilities/backlog.yaml -o graph.yaml
  node orchestration/cli.mjs build-lane AUV-0003 --patch changes.diff --open-pr
  node orchestration/cli.mjs build-lane AUV-0003 --patch changes.json --dry-run
  node orchestration/cli.mjs package AUV-0005
  node orchestration/cli.mjs report AUV-0005
  node orchestration/cli.mjs deliver AUV-0005

Engine Examples:
  node orchestration/cli.mjs engine start --concurrency 5
  node orchestration/cli.mjs engine enqueue orchestration/graph/projects/demo-01.yaml --tenant acme-corp
  node orchestration/cli.mjs engine status --job run_graph-default-123456
  node orchestration/cli.mjs engine list --state active
  node orchestration/cli.mjs engine backup runs --tenant acme-corp

Environment Variables:
  STAGING_URL    Staging server URL (default: http://127.0.0.1:3000)
  API_BASE       API base URL (default: http://127.0.0.1:3000/api)
  SWARM_MODE     deterministic|claude|hybrid (Phase 10b)
  SUBAGENTS_INCLUDE Comma-separated roles for hybrid inclusion
  SUBAGENTS_EXCLUDE Comma-separated roles for hybrid exclusion
  SUBAGENT_MAX_STEPS   Max subagent steps (default 6)
  SUBAGENT_MAX_SECONDS Max subagent seconds (default 120)
  SUBAGENT_MAX_COST_USD Max planned tool spend (default 0.5)
`);
}

// Main command router
async function main() {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }

  // Handle plan command
  if (command === 'plan') {
    const briefPath = args[1];
    if (!briefPath) {
      console.error('Usage: node orchestration/cli.mjs plan <brief-path> [--dry-run]');
      process.exit(2);
    }

    const dryRun = args.includes('--dry-run');

    console.log(`[cli] Planning from brief: ${briefPath}`);
    if (dryRun) console.log('[cli] Running in dry-run mode (heuristic extraction)');

    try {
      const startTime = Date.now();

      // Compile brief to AUVs
      const result = await compileBrief(briefPath, { dryRun });

      const duration = Date.now() - startTime;

      console.log('[cli] ✅ Compilation successful');
      console.log(`[cli] Generated ${result.auvs.length} AUVs in ${duration}ms`);
      console.log('[cli] Summary:');
      console.log(`  - Total complexity: ${result.summary.totalComplexity}`);
      console.log(`  - Total hours: ${result.summary.totalHours}`);
      console.log(`  - Total cost: $${result.summary.totalCost.toFixed(2)}`);
      console.log(`  - Backlog: ${result.backlogPath}`);

      if (result.auvs.length > 0) {
        console.log('[cli] Generated AUVs:');
        result.auvs.forEach((auv) => {
          const deps =
            auv.dependencies.length > 0 ? ` (depends on: ${auv.dependencies.join(', ')})` : '';
          console.log(`  - ${auv.id}: ${auv.title}${deps}`);
        });

        console.log(`\n[cli] Next step: node orchestration/cli.mjs ${result.auvs[0].id}`);
      }

      process.exit(0);
    } catch (error) {
      console.error('[cli] Plan failed:', error.message);
      process.exit(1);
    }
  }

  // search-fetch <query...>
  if (command === 'search-fetch') {
    const query = args.slice(1).join(' ');
    if (!query) {
      console.error('Usage: node orchestration/cli.mjs search-fetch <query>');
      process.exit(2);
    }
    try {
      const { runWebSearchFetch } = await import('./lib/web_search_fetch.mjs');
      const result = await runWebSearchFetch({
        query,
        tenant: process.env.TENANT_ID || 'default',
        outDir: 'websearch_demo',
      });
      console.log(`\n✅ Search-Fetch complete: ${result.title}\n${result.url}`);
      console.log('Artifacts under runs/websearch_demo');
      process.exit(0);
    } catch (err) {
      console.error('Search-Fetch error:', err.message);
      process.exit(1);
    }
  }

  // Handle validate command
  if (command === 'validate') {
    const subCommand = args[1];
    const target = args[2];

    if (subCommand === 'brief') {
      if (!target) {
        console.error('Usage: node orchestration/cli.mjs validate brief <brief-path>');
        process.exit(2);
      }

      const valid = validateBriefCLI(target);
      process.exit(valid ? 0 : 1);
    }

    if (subCommand === 'auv') {
      if (!target) {
        console.error('Usage: node orchestration/cli.mjs validate auv <AUV-ID>');
        process.exit(2);
      }

      console.log(`[cli] Validating AUV: ${target}`);
      const validation = validateAuv(target);

      if (validation.valid) {
        console.log(`[cli] ✅ ${target} is valid and ready for execution`);
        if (validation.data) {
          console.log(`[cli] Title: ${validation.data.title}`);
          console.log(`[cli] Owner: ${validation.data.owner}`);
          console.log(`[cli] Complexity: ${validation.data.estimates?.complexity || 'unknown'}`);
        }
        process.exit(0);
      } else {
        console.error(`[cli] ❌ ${target} validation failed:`);
        validation.errors.forEach((err) => {
          console.error(`  - ${err}`);
        });
        process.exit(1);
      }
    }

    // Phase 9: validate agent output
    if (subCommand === 'agent-output') {
      const file = target;
      if (!file) {
        console.error('Usage: node orchestration/cli.mjs validate agent-output <file.json>');
        process.exit(2);
      }
      try {
        const { validateAgentOutputFile, writeValidationReport } = await import(
          './lib/agent_output_validator.mjs'
        );
        const result = validateAgentOutputFile(file);
        if (!result.ok) {
          const report = writeValidationReport(result.errors);
          console.error('❌ Agent output validation failed. See:', report);
          process.exit(501);
        }
        console.log('✅ Agent output valid');
        process.exit(0);
      } catch (err) {
        console.error('Validator error:', err.message);
        process.exit(1);
      }
    }

    console.error('Usage: node orchestration/cli.mjs validate <brief|auv|agent-output> <target>');
    process.exit(2);
  }

  // Handle run-graph command
  if (command === 'run-graph') {
    const graphPath = args[1];
    if (!graphPath) {
      console.error(
        'Usage: node orchestration/cli.mjs run-graph <graph.yaml> [--resume <RUN-ID>] [--concurrency N]',
      );
      process.exit(201);
    }

    const resumeIdx = args.indexOf('--resume');
    const resumeId = resumeIdx > -1 ? args[resumeIdx + 1] : null;

    const concurrencyIdx = args.indexOf('--concurrency');
    const concurrency = concurrencyIdx > -1 ? parseInt(args[concurrencyIdx + 1]) : 3;

    console.log(`[cli] Running graph: ${graphPath}`);
    if (resumeId) console.log(`[cli] Resuming from run: ${resumeId}`);

    const runner = new GraphRunner({
      concurrency,
      runId: resumeId,
    });

    try {
      await runner.loadGraph(graphPath);
      console.log(
        `[cli] Graph loaded: ${runner.graph.project_id} with ${runner.graph.nodes.length} nodes`,
      );

      const result = await runner.run(!!resumeId);

      console.log('\n📊 Graph execution complete:');
      console.log(`  Run ID: ${result.runId}`);
      console.log(`  Success: ${result.success ? '✅' : '❌'}`);
      console.log(`  Duration: ${(result.duration / 1000).toFixed(2)}s`);
      console.log(`  Completed: ${result.completed.length}`);
      console.log(`  Failed: ${result.failed.length}`);
      console.log(`  State: ${result.stateFile}`);

      process.exit(result.success ? 0 : 204);
    } catch (error) {
      console.error(`[cli] Graph execution error: ${error.message}`);

      if (error.code === 'CYCLE_DETECTED') {
        process.exit(203);
      } else if (error.code === 'INVALID_SCHEMA') {
        process.exit(202);
      } else {
        process.exit(204);
      }
    }
  }

  // Handle build-lane command
  if (command === 'build-lane') {
    const auvId = args[1];
    const patchIdx = args.indexOf('--patch');
    const patchFile = patchIdx > -1 ? args[patchIdx + 1] : null;

    if (!auvId || !patchFile) {
      console.error(
        'Usage: node orchestration/cli.mjs build-lane <AUV-ID> --patch <file> [options]',
      );
      console.error('Options:');
      console.error('  --branch <name>    Specify branch name');
      console.error('  --open-pr          Open a PR after push');
      console.error('  --dry-run          Dry run mode (no git operations)');
      console.error('  --no-format        Skip format check');
      console.error('  --no-lint          Skip lint check');
      console.error('  --no-typecheck     Skip typecheck');
      console.error('  --no-unit          Skip unit tests');
      console.error('  --no-integration   Skip integration tests');
      console.error('  --no-autopilot     Skip autopilot smoke test');
      process.exit(2);
    }

    // Parse options
    const options = {
      auvId,
      patch: {
        type: patchFile.endsWith('.json') ? 'changeset' : 'diff',
        path: patchFile,
      },
      branch: args.includes('--branch') ? args[args.indexOf('--branch') + 1] : null,
      openPr: args.includes('--open-pr'),
      dryRun: args.includes('--dry-run'),
      qa: {
        format: !args.includes('--no-format'),
        lint: !args.includes('--no-lint'),
        typecheck: !args.includes('--no-typecheck'),
        unit: !args.includes('--no-unit'),
        integration: !args.includes('--no-integration'),
        autopilot: !args.includes('--no-autopilot'),
      },
    };

    // Load changeset if JSON
    if (options.patch.type === 'changeset') {
      try {
        const changesetContent = fs.readFileSync(patchFile, 'utf8');
        options.patch.changes =
          JSON.parse(changesetContent).changes || JSON.parse(changesetContent);
      } catch (error) {
        console.error(`[cli] Failed to load changeset: ${error.message}`);
        process.exit(2);
      }
    }

    console.log(`[cli] Starting build lane for ${auvId}`);
    console.log(`[cli] Patch type: ${options.patch.type}`);
    console.log(`[cli] Dry run: ${options.dryRun}`);

    import('./lib/build_lane.mjs')
      .then(async ({ runBuildLane, BuildLaneError }) => {
        try {
          const result = await runBuildLane(options);

          console.log('\n✅ Build lane complete:');
          console.log(`  Branch: ${result.branch}`);
          console.log(`  Artifacts: ${result.artifacts.length}`);

          if (result.prUrl) {
            console.log(`  PR: ${result.prUrl}`);
          }

          // Display QA results
          console.log('  QA Results:');
          for (const [check, res] of Object.entries(result.qaResults)) {
            const status = res.success ? '✅' : '❌';
            const time = res.duration_ms ? ` (${res.duration_ms}ms)` : '';
            console.log(`    ${status} ${check}${time}`);
          }

          process.exit(0);
        } catch (error) {
          console.error(`[cli] Build lane failed: ${error.message}`);

          if (error instanceof BuildLaneError) {
            process.exit(error.exitCode);
          }

          process.exit(1);
        }
      })
      .catch((error) => {
        console.error(`[cli] Failed to load build lane module: ${error.message}`);
        process.exit(1);
      });

    return; // Exit early to prevent fall-through
  }

  // Handle package command
  if (command === 'package') {
    const auvId = args[1];
    if (!auvId) {
      console.error('Usage: node orchestration/cli.mjs package <AUV-ID>');
      process.exit(2);
    }

    console.log(`[cli] Creating package for ${auvId}`);

    try {
      const builder = new PackageBuilder(auvId);
      const manifest = await builder.build();

      console.log('\n✅ Package created successfully:');
      console.log(`  AUV: ${manifest.auv_id}`);
      console.log(`  Version: ${manifest.version}`);
      console.log(`  Bundle: ${manifest.bundle.zip_path}`);
      console.log(`  Size: ${(manifest.bundle.bytes / 1024).toFixed(2)} KB`);
      console.log(`  Artifacts: ${manifest.artifacts.length}`);
      console.log(`  Manifest: dist/${auvId}/manifest.json`);

      process.exit(0);
    } catch (error) {
      console.error(`[cli] Packaging failed: ${error.message}`);
      process.exit(401);
    }
  }

  // Handle report command
  if (command === 'report') {
    const auvId = args[1];
    if (!auvId) {
      console.error('Usage: node orchestration/cli.mjs report <AUV-ID>');
      process.exit(2);
    }

    console.log(`[cli] Generating report for ${auvId}`);

    try {
      const generator = new ReportGenerator(auvId);
      const reportPath = await generator.generate();

      console.log('\n✅ Report generated successfully:');
      console.log(`  AUV: ${auvId}`);
      console.log(`  Report: ${reportPath}`);
      console.log(`  Open: file://${path.resolve(reportPath)}`);

      process.exit(0);
    } catch (error) {
      console.error(`[cli] Report generation failed: ${error.message}`);
      process.exit(402);
    }
  }

  // Handle deliver command (full pipeline)
  if (command === 'deliver' || command === 'deliver:full') {
    const auvId = args[1];
    if (!auvId) {
      console.error('Usage: node orchestration/cli.mjs deliver <AUV-ID>');
      process.exit(2);
    }

    console.log(`[cli] Running full delivery pipeline for ${auvId}`);
    const startTime = Date.now();

    try {
      // Step 1: Run AUV
      console.log('\n📋 Step 1/3: Running AUV tests...');
      await runAuv(auvId);
      console.log('  ✅ AUV tests passed');

      // Step 2: Create package
      console.log('\n📦 Step 2/3: Creating package...');
      const builder = new PackageBuilder(auvId);
      const manifest = await builder.build();
      console.log(`  ✅ Package created: ${manifest.bundle.zip_path}`);

      // Step 3: Generate report
      console.log('\n📊 Step 3/3: Generating report...');
      const generator = new ReportGenerator(auvId);
      const reportPath = await generator.generate();
      console.log(`  ✅ Report generated: ${reportPath}`);

      const duration = Date.now() - startTime;

      console.log('\n🎉 Delivery complete!');
      console.log(`  Total time: ${(duration / 1000).toFixed(2)}s`);
      console.log(`  Bundle: dist/${auvId}/${path.basename(manifest.bundle.zip_path)}`);
      console.log(`  Report: ${reportPath}`);
      console.log(`  View: file://${path.resolve(reportPath)}`);

      process.exit(0);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(
        `[cli] Delivery failed after ${(duration / 1000).toFixed(2)}s: ${error.message}`,
      );

      // Return appropriate exit code based on error type
      if (error instanceof RunbookError) {
        process.exit(error.exitCode);
      } else if (error.message?.includes('Package')) {
        process.exit(401);
      } else if (error.message?.includes('Report')) {
        process.exit(402);
      }
      process.exit(1);
    }
  }

  // Phase 9: knowledge index build
  if (command === 'knowledge') {
    const sub = args[1];
    if (sub === 'build-index') {
      try {
        const { buildKnowledgeIndex } = await import('./lib/knowledge_indexer.mjs');
        const out = buildKnowledgeIndex();
        console.log('✅ Knowledge index built at:', out);
        process.exit(0);
      } catch (err) {
        console.error('Knowledge index error:', err.message);
        process.exit(502);
      }
    }
    console.error('Usage: node orchestration/cli.mjs knowledge build-index');
    process.exit(2);
  }

  // Phase 9: agents evaluation
  if (command === 'agents') {
    const sub = args[1];
    if (sub === 'score') {
      const agentIdx = args.indexOf('--agent');
      if (agentIdx === -1 || !args[agentIdx + 1]) {
        console.error('Usage: node orchestration/cli.mjs agents score --agent <ID>');
        process.exit(2);
      }
      const agentId = args[agentIdx + 1];
      try {
        const { evaluateAgent } = await import('./agents/evaluator.mjs');
        const { outPath, scorecard } = await evaluateAgent({ agentId });
        console.log('✅ Scorecard written to:', outPath);
        console.log('Average score:', scorecard.summary.avg_score.toFixed(2));
        process.exit(scorecard.summary.avg_score >= 0.85 ? 0 : 503);
      } catch (err) {
        console.error('Agent scoring error:', err.message);
        process.exit(503);
      }
    }
    console.error('Usage: node orchestration/cli.mjs agents score --agent <ID>');
    process.exit(2);
  }

  // Phase 9: spend aggregation
  if (command === 'observability') {
    const sub = args[1];
    if (sub === 'spend') {
      try {
        const { aggregateSpend } = await import('./observability/spend_aggregator.mjs');
        const out = aggregateSpend();
        console.log('✅ Spend report at:', out);
        process.exit(0);
      } catch (err) {
        console.error('Spend aggregation error:', err.message);
        process.exit(1);
      }
    }
    console.error('Usage: node orchestration/cli.mjs observability spend');
    process.exit(2);
  }

  // Handle graph-from-backlog command
  if (command === 'graph-from-backlog') {
    const backlogPath = args[1];
    if (!backlogPath) {
      console.error(
        'Usage: node orchestration/cli.mjs graph-from-backlog <backlog.yaml> [-o output.yaml] [--concurrency N]',
      );
      process.exit(201);
    }

    const outputIdx = args.indexOf('-o');
    const outputPath =
      outputIdx > -1
        ? args[outputIdx + 1]
        : `orchestration/graph/projects/${path.basename(backlogPath, '.yaml')}.graph.yaml`;

    const concurrencyIdx = args.indexOf('--concurrency');
    const concurrency = concurrencyIdx > -1 ? parseInt(args[concurrencyIdx + 1]) : 3;

    try {
      console.log(`[cli] Loading backlog from: ${backlogPath}`);
      const backlog = await loadBacklog(backlogPath);

      console.log(`[cli] Compiling graph for ${backlog.auvs?.length || 0} AUVs`);
      const graph = compileBacklogToGraph(backlog, {
        projectId: backlog.brief_id || path.basename(backlogPath, '.yaml'),
        concurrency,
      });

      console.log(`[cli] Writing graph to: ${outputPath}`);
      await saveGraph(graph, outputPath);

      console.log('\n✅ Graph compilation complete:');
      console.log(`  Project ID: ${graph.project_id}`);
      console.log(`  Nodes: ${graph.nodes.length}`);
      console.log(`  Edges: ${graph.edges.length}`);
      console.log(`  Concurrency: ${graph.concurrency}`);
      console.log(`  Output: ${outputPath}`);

      console.log(`\nNext step: node orchestration/cli.mjs run-graph ${outputPath}`);

      process.exit(0);
    } catch (error) {
      console.error(`[cli] Graph compilation error: ${error.message}`);
      process.exit(201);
    }
  }

  // Handle engine commands for durable execution (Phase 8)
  if (command === 'engine') {
    const subCommand = args[1];

    if (!subCommand || subCommand === 'help') {
      console.log('Engine Commands (Durable Execution):');
      console.log('  engine start [--tenant <ID>] [--concurrency N]  - Start worker');
      console.log('  engine enqueue <graph.yaml> [--tenant <ID>]     - Submit job to queue');
      console.log('  engine status [--tenant <ID>] [--job <ID>]      - Show status');
      console.log('  engine pause                                    - Pause queue');
      console.log('  engine resume                                   - Resume queue');
      console.log('  engine cancel --job <ID>                        - Cancel job');
      console.log('  engine list [--state <state>]                   - List jobs');
      console.log('  engine metrics                                   - Show metrics');
      console.log('  engine monitor                                   - Monitor events');
      console.log('  engine emit-status                              - Generate status report');
      console.log('  engine backup [runs|dist|both] [--tenant <ID>]  - Create backup');
      process.exit(0);
    }

    // Start worker
    if (subCommand === 'start') {
      const { startWorker } = await import('./engine/bullmq/worker.mjs');
      const { printConfig } = await import('./engine/bullmq/config.mjs');

      const tenantIdx = args.indexOf('--tenant');
      const concurrencyIdx = args.indexOf('--concurrency');

      if (tenantIdx > -1) {
        process.env.DEFAULT_TENANT = args[tenantIdx + 1];
      }

      if (concurrencyIdx > -1) {
        process.env.ENGINE_CONCURRENCY = args[concurrencyIdx + 1];
      }

      try {
        printConfig();
        await startWorker();
        // Worker runs indefinitely - this line should never be reached
        // unless the worker exits cleanly
        return;
      } catch (error) {
        console.error('[engine] Failed to start worker:', error.message);
        process.exit(401); // Redis unavailable
      }
      return; // Ensure we don't fall through to "Unknown subcommand"
    }

    // Enqueue job
    if (subCommand === 'enqueue') {
      const graphFile = args[2];
      if (!graphFile) {
        console.error('Usage: engine enqueue <graph.yaml> [--tenant <ID>] [--resume <RUN-ID>]');
        process.exit(2);
      }

      const { enqueueJob } = await import('./engine/bullmq/enqueue.mjs');

      const tenantIdx = args.indexOf('--tenant');
      const resumeIdx = args.indexOf('--resume');
      const priorityIdx = args.indexOf('--priority');
      const tokenIdx = args.indexOf('--auth-token');

      const jobData = {
        type: 'run_graph',
        graph_file: graphFile,
        tenant: tenantIdx > -1 ? args[tenantIdx + 1] : 'default',
        resume: resumeIdx > -1,
        run_id: resumeIdx > -1 ? args[resumeIdx + 1] : undefined,
        priority: priorityIdx > -1 ? parseInt(args[priorityIdx + 1]) : 50,
      };

      try {
        const options = {};
        if (tokenIdx > -1) options.authToken = args[tokenIdx + 1];
        const result = await enqueueJob(jobData, options);
        console.log('\n✅ Job enqueued:');
        console.log(`  Job ID: ${result.jobId}`);
        console.log(`  Run ID: ${result.runId}`);
        console.log(`  Tenant: ${result.tenant}`);
        console.log(`  Status: ${result.status}`);
        process.exit(0);
      } catch (error) {
        console.error('[engine] Failed to enqueue:', error.message);
        process.exit(405); // Permission denied or validation error
      }
    }

    // Queue status
    if (subCommand === 'status') {
      const { getQueueStatus, getJob } = await import('./engine/bullmq/admin.mjs');

      const jobIdx = args.indexOf('--job');

      try {
        if (jobIdx > -1) {
          const jobId = args[jobIdx + 1];
          const job = await getJob(jobId);
          console.log('Job Details:', JSON.stringify(job, null, 2));
        } else {
          const status = await getQueueStatus();
          console.log('Queue Status:', JSON.stringify(status, null, 2));
        }
        process.exit(0);
      } catch (error) {
        console.error('[engine] Status error:', error.message);
        process.exit(1);
      }
    }

    // Pause queue
    if (subCommand === 'pause') {
      const { pauseQueue } = await import('./engine/bullmq/admin.mjs');

      try {
        await pauseQueue();
        console.log('✅ Queue paused');
        process.exit(0);
      } catch (error) {
        console.error('[engine] Failed to pause:', error.message);
        process.exit(1);
      }
    }

    // Resume queue
    if (subCommand === 'resume') {
      const { resumeQueue } = await import('./engine/bullmq/admin.mjs');

      try {
        await resumeQueue();
        console.log('✅ Queue resumed');
        process.exit(0);
      } catch (error) {
        console.error('[engine] Failed to resume:', error.message);
        process.exit(1);
      }
    }

    // Cancel job
    if (subCommand === 'cancel') {
      const jobIdx = args.indexOf('--job');
      if (jobIdx === -1 || !args[jobIdx + 1]) {
        console.error('Usage: engine cancel --job <ID>');
        process.exit(2);
      }

      const { cancelJob } = await import('./engine/bullmq/admin.mjs');
      const jobId = args[jobIdx + 1];

      try {
        await cancelJob(jobId);
        console.log(`✅ Job ${jobId} cancelled`);
        process.exit(0);
      } catch (error) {
        console.error('[engine] Failed to cancel:', error.message);
        process.exit(407); // Cancelled by user
      }
    }

    // List jobs
    if (subCommand === 'list') {
      const { listJobs } = await import('./engine/bullmq/admin.mjs');

      const stateIdx = args.indexOf('--state');
      const states = stateIdx > -1 ? [args[stateIdx + 1]] : undefined;

      try {
        const jobs = await listJobs(states);
        console.log(`Found ${jobs.length} jobs:`);
        for (const job of jobs) {
          console.log(`  ${job.id} [${job.state}] - ${job.data.graph_file} (${job.data.tenant})`);
        }
        process.exit(0);
      } catch (error) {
        console.error('[engine] List error:', error.message);
        process.exit(1);
      }
    }

    // Get metrics
    if (subCommand === 'metrics') {
      const { getMetrics } = await import('./engine/bullmq/admin.mjs');

      try {
        const metrics = await getMetrics();
        console.log('Queue Metrics:', JSON.stringify(metrics, null, 2));
        process.exit(0);
      } catch (error) {
        console.error('[engine] Metrics error:', error.message);
        process.exit(1);
      }
    }

    // Monitor events
    if (subCommand === 'monitor') {
      const { monitorQueue } = await import('./engine/bullmq/admin.mjs');

      try {
        await monitorQueue((event) => {
          console.log(`[${event.timestamp}] ${event.event}:`, event.jobId || '');
        });
        // Runs indefinitely
      } catch (error) {
        console.error('[engine] Monitor error:', error.message);
        process.exit(1);
      }
    }

    // Emit status report
    if (subCommand === 'emit-status') {
      const { writeStatusReport } = await import('./engine/status_aggregator.mjs');

      try {
        const path = await writeStatusReport();
        console.log(`✅ Status report written to: ${path}`);
        process.exit(0);
      } catch (error) {
        console.error('[engine] Status error:', error.message);
        process.exit(1);
      }
    }

    // Create backup
    if (subCommand === 'backup') {
      const { createBackup } = await import('./ops/backup.mjs');

      const scope = args[2] || 'both';
      const tenantIdx = args.indexOf('--tenant');
      const tenant = tenantIdx > -1 ? args[tenantIdx + 1] : null;

      try {
        const backup = await createBackup(scope, { tenant });
        if (backup) {
          console.log('✅ Backup created:');
          console.log(`  ID: ${backup.id}`);
          console.log(`  Path: ${backup.path}`);
          if (backup.archive) {
            console.log(
              `  Archive: ${backup.archive.fileCount} files, ${Math.round((backup.archive.size / 1024 / 1024) * 100) / 100} MB`,
            );
          }
          if (backup.s3) {
            console.log(`  S3: s3://${backup.s3.bucket}/${backup.s3.key}`);
          }
        }
        process.exit(0);
      } catch (error) {
        console.error('[engine] Backup error:', error.message);
        process.exit(1);
      }
    }

    // Unknown subcommand
    console.error(`Unknown engine subcommand: ${subCommand}`);
    console.error('Run "node orchestration/cli.mjs engine help" for usage');
    process.exit(2);
  }

  // Default: treat as AUV ID for backwards compatibility
  if (command.startsWith('AUV-')) {
    const auvId = command;
    const startTime = Date.now();

    try {
      await runAuv(auvId);
      const duration = Date.now() - startTime;
      console.log(`[cli] SUCCESS: ${auvId} completed in ${duration}ms`);
      process.exit(0);
    } catch (err) {
      const duration = Date.now() - startTime;
      console.error('[cli] FAILED:', err?.message || err);

      // Write failure result card
      const cardPath = `runs/${auvId}/result-cards/cli-summary.json`;
      try {
        fs.mkdirSync(path.dirname(cardPath), { recursive: true });
        fs.writeFileSync(
          cardPath,
          JSON.stringify(
            {
              version: '1.0',
              ts: Date.now() / 1000,
              event: 'CliFailed',
              auv: auvId,
              duration_ms: duration,
              error: err?.message || String(err),
              error_step: err?.step || 'unknown',
              env: {
                STAGING_URL: process.env.STAGING_URL,
                API_BASE: process.env.API_BASE,
                NODE_ENV: process.env.NODE_ENV,
              },
              ok: false,
            },
            null,
            2,
          ),
        );
      } catch (cardErr) {
        console.error('[cli] Failed to write error card:', cardErr.message);
      }

      // Return typed exit codes based on error type
      if (err instanceof RunbookError) {
        process.exit(err.exitCode);
      }

      process.exit(1);
    }
  }

  // Unknown command
  console.error(`Unknown command: ${command}`);
  console.error('Run "node orchestration/cli.mjs help" for usage information');
  process.exit(2);
}

// Run main function
main().catch((err) => {
  console.error('[cli] Unexpected error:', err);
  process.exit(1);
});
