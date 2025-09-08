#!/usr/bin/env node
/**
 * Integration test for graph parallelization
 * Verifies that parallel execution is faster than serial
 */

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { fileURLToPath } from 'url';
import { GraphRunner } from '../../orchestration/graph/runner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🚀 Graph Parallelization Integration Test\n');

// Determine work duration based on environment
const isCI = process.env.CI === 'true';
const WORK_DURATION_MS = process.env.GRAPH_TEST_MS 
  ? +process.env.GRAPH_TEST_MS 
  : (isCI ? 1000 : 400); // Allow override via GRAPH_TEST_MS env var

// Create a test graph with independent parallel paths
const testGraph = {
  version: '1.0',
  project_id: 'parallel-test',
  // Note: concurrency is set by the runner, not the graph
  defaults: {
    retries: { max: 0 },
    timeout_ms: 30000,
  },
  nodes: [
    // Three independent chains that can run in parallel (no external server noise)
    // Each node does simulated work to make parallelization benefits measurable
    // Chain 1
    {
      id: 'chain1-step1',
      type: 'work_simulation',
      requires: [],
      params: { label: 'chain1-step1', duration_ms: WORK_DURATION_MS },
    },
    {
      id: 'chain1-step2',
      type: 'work_simulation',
      requires: ['chain1-step1'],
      params: { label: 'chain1-step2', duration_ms: WORK_DURATION_MS },
    },
    // Chain 2
    {
      id: 'chain2-step1',
      type: 'work_simulation',
      requires: [],
      params: { label: 'chain2-step1', duration_ms: WORK_DURATION_MS },
    },
    {
      id: 'chain2-step2',
      type: 'work_simulation',
      requires: ['chain2-step1'],
      params: { label: 'chain2-step2', duration_ms: WORK_DURATION_MS },
    },
    // Chain 3
    {
      id: 'chain3-step1',
      type: 'work_simulation',
      requires: [],
      params: { label: 'chain3-step1', duration_ms: WORK_DURATION_MS },
    },
    {
      id: 'chain3-step2',
      type: 'work_simulation',
      requires: ['chain3-step1'],
      params: { label: 'chain3-step2', duration_ms: WORK_DURATION_MS },
    },
  ],
};

// Write test graph to temp file
const tempGraphPath = path.join(__dirname, 'temp-parallel-test.yaml');
fs.writeFileSync(tempGraphPath, yaml.stringify(testGraph));

async function runTest(concurrency, label, attempt = 1) {
  const runner = new GraphRunner({
    concurrency,
    runId: `TEST-${label}-${Date.now()}-attempt${attempt}`,
  });

  await runner.loadGraph(tempGraphPath);
  const startTime = Date.now();
  const result = await runner.run();
  const duration = Date.now() - startTime;

  return {
    label,
    concurrency,
    duration,
    success: result.success,
    completed: result.completed.length,
    failed: result.failed.length,
    runId: runner.runId,
  };
}

// Run test multiple times and take the best result
async function runTestWithRetries(concurrency, label, maxAttempts = 3) {
  let bestResult = null;
  const allDurations = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await runTest(concurrency, label, attempt);
    allDurations.push(result.duration);

    if (!result.success) {
      console.log(`  ⚠️ Attempt ${attempt} failed: ${result.failed} nodes failed`);
      continue;
    }

    if (!bestResult || result.duration < bestResult.duration) {
      bestResult = result;
    }
  }

  if (bestResult) {
    bestResult.allDurations = allDurations;
    bestResult.avgDuration = allDurations.reduce((a, b) => a + b, 0) / allDurations.length;
  }

  return bestResult;
}

async function main() {
  try {
    console.log('Testing graph parallelization...');
    console.log(`Environment: ${isCI ? 'CI' : 'Local'}`);
    console.log(`Work duration per node: ${WORK_DURATION_MS}ms`);
    console.log(`Expected total work: 6 nodes × ${WORK_DURATION_MS}ms = ${6 * WORK_DURATION_MS}ms\n`);

    // Run with serial execution (concurrency=1)
    console.log('Running serial test (concurrency=1, best of 3)...');
    const serialResult = await runTestWithRetries(1, 'serial');
    if (!serialResult || !serialResult.success) {
      throw new Error('Serial test failed to complete successfully');
    }
    console.log(
      `✅ Serial execution: ${serialResult.duration}ms (avg: ${serialResult.avgDuration.toFixed(0)}ms)\n`,
    );

    // Run with parallel execution (concurrency=3)
    console.log('Running parallel test (concurrency=3, best of 3)...');
    const parallelResult = await runTestWithRetries(3, 'parallel');
    if (!parallelResult || !parallelResult.success) {
      throw new Error('Parallel test failed to complete successfully');
    }
    console.log(
      `✅ Parallel execution: ${parallelResult.duration}ms (avg: ${parallelResult.avgDuration.toFixed(0)}ms)\n`,
    );

    // Calculate speedup
    const speedup = (
      ((serialResult.duration - parallelResult.duration) / serialResult.duration) *
      100
    ).toFixed(1);
    const speedupRatio = (serialResult.duration / parallelResult.duration).toFixed(2);

    // Analyze parallelization from state files
    const parallelStateFile = `runs/graph/${parallelResult.runId}/state.json`;
    let parallelismDetected = false;
    let parallelismDetails = '';
    let maxConcurrent = 1;

    if (fs.existsSync(parallelStateFile)) {
      const state = JSON.parse(fs.readFileSync(parallelStateFile, 'utf8'));

      // Build intervals for all work_simulation nodes
      const nodeIds = Object.keys(state.nodes).filter((id) => id.includes('chain'));
      const intervals = nodeIds.map((id) => ({
        id,
        start: new Date(state.nodes[id].started_at).getTime(),
        end: new Date(state.nodes[id].finished_at).getTime(),
      }));

      // Sweep-line to compute max concurrency
      const events = [];
      intervals.forEach(({ start, end }) => {
        events.push({ t: start, d: 1 });
        events.push({ t: end, d: -1 });
      });
      events.sort((a, b) => {
        if (a.t !== b.t) return a.t - b.t;
        // start (+1) before end (-1) at same timestamp
        if (a.d === b.d) return 0;
        return a.d > b.d ? -1 : 1;
      });

      let cur = 0;
      maxConcurrent = 0;
      for (const e of events) {
        cur += e.d;
        if (cur > maxConcurrent) maxConcurrent = cur;
      }

      parallelismDetected = maxConcurrent >= 2;
      parallelismDetails = `\n  Max concurrent nodes: ${maxConcurrent}\n`;
      console.log(parallelismDetails);
    }

    // Results
    console.log('\n📊 Results:');
    console.log(`  Serial time:   ${serialResult.duration}ms`);
    console.log(`  Parallel time: ${parallelResult.duration}ms`);
    console.log(`  Speedup:       ${speedup}% faster`);
    console.log(`  Speedup ratio: ${speedupRatio}x`);
    console.log(`  Parallelism:   ${parallelismDetected ? '✅ Detected' : '⚠️ Not verified'}`);

    // Success criteria with environment-aware thresholds
    const minSpeedupRequired = isCI ? 15 : 20; // Lower threshold in CI due to variance
    const speedupAchieved = parseFloat(speedup);

    // For CI, also check if parallelism was actually detected
    const success =
      parallelResult.success &&
      serialResult.success &&
      (speedupAchieved >= minSpeedupRequired || (isCI && parallelismDetected && speedupAchieved > 10));

    if (success) {
      console.log('\n✅ Test PASSED: Parallel execution shows significant improvement');

      if (speedupAchieved >= 30) {
        console.log(`   Excellent speedup achieved: ${speedup}%`);
      } else if (speedupAchieved >= 20) {
        console.log(`   Good speedup achieved: ${speedup}%`);
      } else {
        console.log(`   Acceptable speedup achieved: ${speedup}% (CI variance considered)`);
      }
    } else {
      console.log('\n❌ Test FAILED: Insufficient parallelization benefit');
      console.log(`   Required: >${minSpeedupRequired}% speedup, Got: ${speedup}%`);

      if (isCI) {
        console.log('\n   Note: This test can be flaky in CI environments due to:');
        console.log('   - Shared resources and CPU contention');
        console.log('   - Variable system load');
        console.log('   - Container/VM overhead');
        console.log('   Consider running locally for more accurate results.');
      }
    }

    // Cleanup
    fs.unlinkSync(tempGraphPath);

    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Test error:', error.message);

    // Cleanup on error
    if (fs.existsSync(tempGraphPath)) {
      fs.unlinkSync(tempGraphPath);
    }

    process.exit(1);
  }
}

// Run the test
main();
