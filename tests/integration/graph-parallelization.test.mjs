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

// Create a test graph with independent parallel paths
const testGraph = {
  version: '1.0',
  project_id: 'parallel-test',
  concurrency: 3,
  defaults: {
    retries: { max: 0 },
    timeout_ms: 30000,
  },
  nodes: [
    {
      id: 'server',
      type: 'server',
      timeout_ms: 1000,
      resources: ['server'],
    },
    // Three independent chains that can run in parallel
    // Chain 1
    {
      id: 'chain1-step1',
      type: 'cvf',
      requires: ['server'],
      params: { auv: 'AUV-0002' },
    },
    {
      id: 'chain1-step2',
      type: 'cvf',
      requires: ['chain1-step1'],
      params: { auv: 'AUV-0002' },
    },
    // Chain 2
    {
      id: 'chain2-step1',
      type: 'cvf',
      requires: ['server'],
      params: { auv: 'AUV-0003' },
    },
    {
      id: 'chain2-step2',
      type: 'cvf',
      requires: ['chain2-step1'],
      params: { auv: 'AUV-0003' },
    },
    // Chain 3
    {
      id: 'chain3-step1',
      type: 'cvf',
      requires: ['server'],
      params: { auv: 'AUV-0004' },
    },
    {
      id: 'chain3-step2',
      type: 'cvf',
      requires: ['chain3-step1'],
      params: { auv: 'AUV-0004' },
    },
  ],
};

// Write test graph to temp file
const tempGraphPath = path.join(__dirname, 'temp-parallel-test.yaml');
fs.writeFileSync(tempGraphPath, yaml.stringify(testGraph));

async function runTest(concurrency, label) {
  const runner = new GraphRunner({
    concurrency,
    runId: `TEST-${label}-${Date.now()}`,
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
  };
}

async function main() {
  try {
    console.log('Testing with different concurrency levels...\n');

    // Run with serial execution (concurrency=1)
    console.log('Running serial test (concurrency=1)...');
    const serialResult = await runTest(1, 'serial');
    console.log(`✅ Serial execution: ${serialResult.duration}ms\n`);

    // Run with parallel execution (concurrency=3)
    console.log('Running parallel test (concurrency=3)...');
    const parallelResult = await runTest(3, 'parallel');
    console.log(`✅ Parallel execution: ${parallelResult.duration}ms\n`);

    // Calculate speedup
    const speedup = (
      ((serialResult.duration - parallelResult.duration) / serialResult.duration) *
      100
    ).toFixed(1);
    const speedupRatio = (serialResult.duration / parallelResult.duration).toFixed(2);

    // Analyze parallelization from state files
    const parallelStateFile = `runs/graph/TEST-parallel-${parallelResult.duration}/state.json`;
    let parallelismDetected = false;

    if (fs.existsSync(parallelStateFile)) {
      const state = JSON.parse(fs.readFileSync(parallelStateFile, 'utf8'));

      // Check if multiple chains started at similar times
      const chain1Start = new Date(state.nodes['chain1-step1'].started_at).getTime();
      const chain2Start = new Date(state.nodes['chain2-step1'].started_at).getTime();
      const chain3Start = new Date(state.nodes['chain3-step1'].started_at).getTime();

      // If all chains started within 100ms of each other, they ran in parallel
      const maxDiff = Math.max(
        Math.abs(chain1Start - chain2Start),
        Math.abs(chain2Start - chain3Start),
        Math.abs(chain1Start - chain3Start),
      );

      parallelismDetected = maxDiff < 100;

      if (parallelismDetected) {
        console.log('✅ Parallelism confirmed: All chains started within 100ms of each other');
      }
    }

    // Results
    console.log('\n📊 Results:');
    console.log(`  Serial time:   ${serialResult.duration}ms`);
    console.log(`  Parallel time: ${parallelResult.duration}ms`);
    console.log(`  Speedup:       ${speedup}% faster`);
    console.log(`  Speedup ratio: ${speedupRatio}x`);
    console.log(`  Parallelism:   ${parallelismDetected ? '✅ Detected' : '⚠️ Not verified'}`);

    // Success criteria
    const success =
      parallelResult.success &&
      serialResult.success &&
      parallelResult.duration < serialResult.duration;

    if (success) {
      console.log('\n✅ Test PASSED: Parallel execution is faster than serial');

      // Looser threshold for CI environments
      if (parseFloat(speedup) > 10) {
        console.log(`   Significant speedup achieved: ${speedup}%`);
      } else {
        console.log(`   Modest speedup achieved: ${speedup}% (CI variance expected)`);
      }
    } else {
      console.log('\n❌ Test FAILED: Parallel execution did not show improvement');
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
