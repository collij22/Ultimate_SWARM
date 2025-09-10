#!/usr/bin/env node
/**
 * Phase 11 test runner
 * Runs validator unit tests and synthetic tests sequentially, aggregates results,
 * and writes a JSON + markdown summary under reports/phase11/.
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const cwd = process.cwd();
const REPORT_DIR = join(cwd, 'reports', 'phase11');

/**
 * Run a single Node test file and collect stdout/stderr
 */
function runTest(filePath) {
  return new Promise((resolve) => {
    const start = Date.now();
    console.log(`[RUN] ${filePath}`);
    const child = spawn(process.execPath, [filePath], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('close', (code) => {
      console.log(`[DONE] ${filePath} → exit ${code} (${Date.now() - start}ms)`);
      resolve({
        file: filePath,
        exitCode: code ?? -1,
        durationMs: Date.now() - start,
        stdout,
        stderr,
      });
    });
  });
}

async function main() {
  const unitTests = [
    'tests/unit/data_validator.test.mjs',
    'tests/unit/chart_validator.test.mjs',
    'tests/unit/seo_validator.test.mjs',
    'tests/unit/media_validator.test.mjs',
    'tests/unit/db_migration_validator.test.mjs',
    'tests/unit/engine-basic.test.mjs',
    'tests/unit/engine.test.mjs',
  ];

  const syntheticTests = [
    'tests/agents/synthetic/data.ingest.test.mjs',
    'tests/agents/synthetic/seo.audit.test.mjs',
    'tests/agents/synthetic/video.compose.test.mjs',
    'tests/agents/synthetic/db.migration.test.mjs',
  ];

  const results = [];

  // Ensure report directory
  try {
    if (!existsSync(REPORT_DIR)) {
      await mkdir(REPORT_DIR, { recursive: true });
    }
  } catch (e) {
    console.error('Failed to create report directory:', REPORT_DIR, e.message);
  }

  // Run unit tests
  for (const file of unitTests) {
    const r = await runTest(file);
    if (r.exitCode !== 0) {
      console.error(`\n[FAIL] ${file}\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}\n`);
    }
    results.push({ type: 'unit', ...r });
    // If data validator checksum failed due to test manifest, rerun allowing warning mode
    if (file.includes('data_validator') && r.exitCode !== 0) {
      await runTest(
        'node -e "import(\'file:///' +
          cwd.replace(/\\\\/g, '/') +
          '/tests/unit/data_validator.test.mjs\')"',
      );
      // Note: best effort; primary failure output already captured above
    }
  }

  // Run synthetic tests
  for (const file of syntheticTests) {
    const r = await runTest(file);
    if (r.exitCode !== 0) {
      console.error(`\n[FAIL] ${file}\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}\n`);
    }
    results.push({ type: 'synthetic', ...r });
  }

  const summary = {
    generated_at: new Date().toISOString(),
    total: results.length,
    passed: results.filter((r) => r.exitCode === 0).length,
    failed: results.filter((r) => r.exitCode !== 0).length,
    results: results.map((r) => ({
      type: r.type,
      file: r.file,
      exitCode: r.exitCode,
      durationMs: r.durationMs,
    })),
  };

  // Write JSON report
  const jsonPath = join(REPORT_DIR, 'phase11-test-results.json');
  try {
    await writeFile(jsonPath, JSON.stringify({ summary, raw: results }, null, 2));
  } catch (e) {
    console.error('Failed to write JSON report:', jsonPath, e.message);
  }

  // Write brief markdown summary
  const mdLines = [];
  mdLines.push('# Phase 11 Test Summary');
  mdLines.push('');
  mdLines.push(`Generated: ${summary.generated_at}`);
  mdLines.push(`Total: ${summary.total}`);
  mdLines.push(`Passed: ${summary.passed}`);
  mdLines.push(`Failed: ${summary.failed}`);
  mdLines.push('');
  mdLines.push('## Results');
  for (const r of results) {
    mdLines.push(`- [${r.type}] ${r.file} → exit ${r.exitCode} (${r.durationMs}ms)`);
  }
  const mdPath = join(REPORT_DIR, 'phase11-test-summary.md');
  try {
    await writeFile(mdPath, mdLines.join('\n'));
  } catch (e) {
    console.error('Failed to write markdown report:', mdPath, e.message);
  }

  // Print summary to stdout for CI/analysis
  console.log('[SUMMARY]', JSON.stringify(summary));

  // Exit with failure if any test failed
  process.exit(summary.failed > 0 ? 1 : 0);
}

import { fileURLToPath as furl } from 'node:url';

try {
  if (process.argv[1] && furl(import.meta.url) === process.argv[1]) {
    await main();
  }
} catch (err) {
  console.error('Test runner failed:', err);
  process.exit(1);
}
