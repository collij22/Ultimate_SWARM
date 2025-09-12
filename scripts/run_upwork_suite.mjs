#!/usr/bin/env node
/**
 * Upwork Suite Runner
 *
 * Runs five medium briefs (graphs) across 4 scenarios:
 *   - Modes: deterministic, claude (subagent-only)
 *   - TEST_MODE: true, false
 *
 * Notes:
 * - Some capabilities are gated in non-TEST_MODE by policy:
 *   payments.test and cloud.db will intentionally fail in TEST_MODE=false
 *   to validate safety. web.search uses fixture fallback when BRAVE_API_KEY
 *   is absent; set BRAVE_API_KEY to exercise live search.
 *
 * Logs/Observability:
 * - Per-run logs: runs/upwork-suite/logs/*.log
 * - Suite JSON summary: runs/upwork-suite/suite-summary.json
 * - Suite Markdown summary: runs/upwork-suite/suite-summary.md
 * - Live events: runs/observability/hooks.jsonl (tail during execution)
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const graphs = [
  {
    id: 'b1_data_analytics',
    name: 'Data Analytics Dashboard',
    file: 'orchestration/graph/projects/upwork-suite/b1_data_analytics.yaml',
    expect: { test_true: 'pass', test_false: 'pass' },
  },
  {
    id: 'b2_seo_audit',
    name: 'SEO Audit + Report',
    file: 'orchestration/graph/projects/upwork-suite/b2_seo_audit.yaml',
    // Falls back to fixtures without keys, so should pass in both
    expect: { test_true: 'pass', test_false: 'pass' },
  },
  {
    id: 'b3_payments',
    name: 'Payments Demo (Test) → Receipt',
    file: 'orchestration/graph/projects/upwork-suite/b3_payments.yaml',
    // Deterministic executors produce safe stubs; enforce via artifact checks
    expect: { test_true: 'pass', test_false: 'pass' },
  },
  {
    id: 'b4_cloud_db',
    name: 'Cloud DB Schema + Roundtrip',
    file: 'orchestration/graph/projects/upwork-suite/b4_cloud_db.yaml',
    // Deterministic executors produce safe stubs; enforce via artifact checks
    expect: { test_true: 'pass', test_false: 'pass' },
  },
  {
    id: 'b5_media',
    name: 'Media TTS + Video + Report',
    file: 'orchestration/graph/projects/upwork-suite/b5_media.yaml',
    expect: { test_true: 'pass', test_false: 'pass' },
  },
];

const modes = /** @type {const} */ (['deterministic', 'claude']);
const testModes = /** @type {const} */ (['true', 'false']);

const logsDir = path.resolve('runs/upwork-suite/logs');
fs.mkdirSync(logsDir, { recursive: true });

/**
 * Run a single graph with the given mode and TEST_MODE.
 * @param {string} graphPath
 * @param {'deterministic'|'claude'} mode
 * @param {'true'|'false'} testMode
 * @returns {Promise<{ success: boolean, exitCode: number, durationMs: number, logPath: string }>}
 */
function runGraph(graphPath, mode, testMode) {
  return new Promise((resolve) => {
    const start = Date.now();
    const baseName = path.basename(graphPath, path.extname(graphPath));
    const logPath = path.join(logsDir, `${baseName}__${mode}__tm-${testMode}.log`);
    const outStream = fs.createWriteStream(logPath, { flags: 'w' });

    const env = {
      ...process.env,
      SWARM_MODE: mode,
      TEST_MODE: testMode,
      // Helpful defaults for claude mode (subset of roles)
      SUBAGENTS_INCLUDE:
        mode === 'claude'
          ? (process.env.SUBAGENTS_INCLUDE || 'A2.requirements_analyst,B7.rapid_builder,C13.quality_guardian')
          : (process.env.SUBAGENTS_INCLUDE || ''),
    };

    const args = ['orchestration/cli.mjs', 'run-graph', graphPath];
    const proc = spawn(process.execPath, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (d) => outStream.write(d));
    proc.stderr.on('data', (d) => outStream.write(d));

    proc.on('exit', (code) => {
      const durationMs = Date.now() - start;
      outStream.end();
      resolve({ success: code === 0, exitCode: code ?? 1, durationMs, logPath });
    });
  });
}

async function main() {
  const results = [];

  console.log('[suite] Running Upwork suite across modes and TEST_MODE variants...');
  console.log(`[suite] Logs dir: ${logsDir}`);

  for (const graph of graphs) {
    for (const mode of modes) {
      for (const tm of testModes) {
        const label = `${graph.id} | mode=${mode} | TEST_MODE=${tm}`;
        console.log(`\n[suite] ▶ ${label}`);
        const r = await runGraph(graph.file, mode, tm);
        const expected = graph.expect[tm === 'true' ? 'test_true' : 'test_false'];
        const artifactsOk = checkArtifacts(graph.id);
        const ok = r.success && artifactsOk && expected === 'pass';

        results.push({
          graph: graph.id,
          name: graph.name,
          file: graph.file,
          mode,
          test_mode: tm,
          exit_code: r.exitCode,
          duration_ms: r.durationMs,
          log: r.logPath,
          expected: expected,
          status: r.success ? 'passed' : 'failed',
          conforms_to_expectation: ok,
        });

        const badge = r.success ? '✅' : expected === 'fail' ? '🟡 (expected fail)' : '❌';
        console.log(`[suite] ${badge} exit=${r.exitCode} in ${(r.durationMs / 1000).toFixed(1)}s → ${r.logPath}`);
      }
    }
  }

  // Summarize
  const summary = {
    ts: new Date().toISOString(),
    totals: {
      runs: results.length,
      passed: results.filter((r) => r.status === 'passed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      expected_failures: results.filter((r) => r.status === 'failed' && r.expected === 'fail').length,
      unexpected_failures: results.filter((r) => r.status === 'failed' && r.expected === 'pass').length,
    },
    results,
    tips: {
      hooks: 'tail -n 200 runs/observability/hooks.jsonl',
      last_logs: `Get-ChildItem -Path '${logsDir}' | Sort-Object LastWriteTime -Descending | Select-Object -First 5`,
    },
  };

  const outDir = path.resolve('runs/upwork-suite');
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'suite-summary.json');
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

  // Markdown summary for quick glance
  const mdLines = [];
  mdLines.push(`# Upwork Suite Summary`);
  mdLines.push(`Date: ${summary.ts}`);
  mdLines.push('');
  mdLines.push(`- Runs: ${summary.totals.runs}`);
  mdLines.push(`- Passed: ${summary.totals.passed}`);
  mdLines.push(`- Failed: ${summary.totals.failed}`);
  mdLines.push(`- Expected failures: ${summary.totals.expected_failures}`);
  mdLines.push(`- Unexpected failures: ${summary.totals.unexpected_failures}`);
  mdLines.push('');
  mdLines.push('| Graph | Mode | TEST_MODE | Exit | Status | Expected | Log |');
  mdLines.push('|---|---|---|---:|---|---|---|');
  for (const r of results) {
    const logRel = path.relative(process.cwd(), r.log).replace(/\\/g, '/');
    mdLines.push(
      `| ${r.graph} | ${r.mode} | ${r.test_mode} | ${r.exit_code} | ${r.status} | ${r.expected} | ${logRel} |`,
    );
  }
  mdLines.push('');
  mdLines.push('Tips:');
  mdLines.push('- tail -n 200 runs/observability/hooks.jsonl');
  const mdPath = path.join(outDir, 'suite-summary.md');
  fs.writeFileSync(mdPath, mdLines.join('\n'));

  console.log(`\n[suite] Summary written:`);
  console.log(` - ${jsonPath}`);
  console.log(` - ${mdPath}`);
}

/**
 * Verify key artifacts exist for each graph id.
 * @param {string} id
 */
function checkArtifacts(id) {
  try {
    switch (id) {
      case 'b1_data_analytics':
        return (
          existsAll(['runs/tenants/default/charts/latest_bar.png']) ||
          globExists(/runs\/tenants\/default\/RUN-[^/\\]+\/charts\/bar\.png/)
        );
      case 'b2_seo_audit':
        return existsAll(['reports/seo/audit.json', 'reports/seo/summary.md', 'reports/seo/summary.html']);
      case 'b3_payments':
        return existsAll([
          'runs/tenants/default/payments_demo/payment_intent.json',
          'runs/tenants/default/payments_demo/receipt.html',
          'runs/tenants/default/payments_demo/receipt.md',
        ]);
      case 'b4_cloud_db':
        return existsAll([
          'runs/tenants/default/db_demo/connectivity.json',
          'runs/tenants/default/db_demo/roundtrip.json',
          'reports/db/summary.md',
          'reports/db/summary.html',
        ]);
      case 'b5_media':
        return existsAll(['media/narration.wav', 'media/final.mp4', 'reports/media/production_report.html']);
      default:
        return true;
    }
  } catch {
    return false;
  }
}

function existsAll(paths) {
  return paths.every((p) => fs.existsSync(path.resolve(p)));
}

function globExists(regex) {
  const root = path.resolve('runs/tenants/default');
  if (!fs.existsSync(root)) return false;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (regex.test(full.replace(/\\/g, '/'))) return true;
    }
  }
  return false;
}

main().catch((err) => {
  console.error('[suite] ERROR:', err?.message || err);
  process.exit(1);
});


