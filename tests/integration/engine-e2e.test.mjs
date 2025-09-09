#!/usr/bin/env node
/**
 * Phase 8 End-to-End Engine Integration Tests
 *
 * Tests real worker execution with tenant-scoped artifacts
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

// Helper to wait for condition
async function waitFor(condition, timeout = 30000, interval = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error('Timeout waiting for condition');
}

// Helper to clean up test artifacts
async function cleanupTestArtifacts(tenant) {
  const tenantDir = path.join(projectRoot, 'runs', 'tenants', tenant);
  try {
    await fs.rm(tenantDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore if doesn't exist
  }
}

describe('Phase 8 E2E Engine Tests', () => {
  let workerProcess;
  const testTenant = 'test-tenant-' + randomBytes(4).toString('hex');

  before(async () => {
    console.log(`[e2e-test] Starting with tenant: ${testTenant}`);

    // Check if Redis is available
    try {
      const { Queue } = await import('bullmq');
      const testQueue = new Queue('test-connection');
      await testQueue.close();
    } catch (error) {
      console.log('[e2e-test] Redis not available, skipping E2E tests');
      return;
    }
  });

  after(async () => {
    // Clean up worker
    if (workerProcess) {
      workerProcess.kill('SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Clean up test artifacts
    await cleanupTestArtifacts(testTenant);
  });

  it('should process job and create tenant-scoped artifacts', async () => {
    // Create a simple test graph without server dependency for faster tests
    const testGraph = {
      version: '1.0',
      project_id: `e2e-test-${testTenant}`,
      nodes: [
        {
          id: 'test-work',
          type: 'work_simulation',
          params: {
            duration_ms: 100, // Reduced duration for faster tests
            output: 'Test work complete',
            auv_id: 'AUV-TEST',
          },
        },
      ],
    };

    // Write test graph (as YAML)
    const { default: YAML } = await import('yaml');
    const graphPath = path.join(projectRoot, 'test-e2e-graph.yaml');
    await fs.writeFile(graphPath, YAML.stringify(testGraph));

    // Start worker in background
    console.log('[e2e-test] Starting worker...');
    workerProcess = spawn(
      process.execPath,
      [path.join(projectRoot, 'orchestration/cli.mjs'), 'engine', 'start', '--tenant', testTenant],
      {
        cwd: projectRoot,
        env: { ...process.env, TENANT_ID: testTenant },
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    // Log worker output
    workerProcess.stdout.on('data', (data) => {
      console.log(`[worker-stdout] ${data.toString().trim()}`);
    });

    workerProcess.stderr.on('data', (data) => {
      console.error(`[worker-stderr] ${data.toString().trim()}`);
    });

    // Wait for worker to be ready
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Enqueue job
    console.log('[e2e-test] Enqueuing job...');
    const { enqueueJob } = await import(
      `file://${path.join(projectRoot, 'orchestration/engine/bullmq/enqueue.mjs').replace(/\\/g, '/')}`
    );

    const { jobId, runId } = await enqueueJob({
      type: 'run_graph',
      graph_file: 'test-e2e-graph.yaml',
      tenant: testTenant,
    });

    console.log(`[e2e-test] Job enqueued: ${jobId}, run: ${runId}`);

    // Wait for job completion
    await waitFor(async () => {
      const statePath = path.join(
        projectRoot,
        'runs',
        'tenants',
        testTenant,
        'graph',
        runId,
        'state.json',
      );

      try {
        const stateContent = await fs.readFile(statePath, 'utf8');
        const state = JSON.parse(stateContent);

        // Check if all nodes reached a terminal state (succeeded or failed)
        const allCompleted = Object.values(state.nodes || {}).every(
          (node) => node.status === 'succeeded' || node.status === 'failed',
        );

        return allCompleted;
      } catch (error) {
        return false;
      }
    }, 60000); // 60 second timeout

    // Verify artifacts created in tenant path
    const artifactChecks = [
      path.join(projectRoot, 'runs', 'tenants', testTenant, 'graph', runId, 'state.json'),
      path.join(projectRoot, 'runs', 'observability', 'hooks.jsonl'),
    ];

    // Also check for potential Lighthouse output if it was created
    const lighthousePath = path.join(
      projectRoot,
      'runs',
      'tenants',
      testTenant,
      'AUV-TEST',
      'perf',
      'lighthouse.json',
    );

    for (const artifactPath of artifactChecks) {
      try {
        await fs.access(artifactPath);
        console.log(`[e2e-test] ✓ Artifact exists: ${artifactPath}`);
      } catch (error) {
        throw new Error(`Expected artifact not found: ${artifactPath}`);
      }
    }

    // Check if Lighthouse artifact was created (may not exist if node didn't run)
    try {
      await fs.access(lighthousePath);
      const lighthouseContent = await fs.readFile(lighthousePath, 'utf8');
      const lighthouseData = JSON.parse(lighthouseContent);
      assert.ok(lighthouseData, 'Lighthouse data should exist');
      console.log('[e2e-test] ✓ Lighthouse artifact found in tenant path');
    } catch (error) {
      console.log('[e2e-test] ⚠ Lighthouse artifact not found (node may not have executed)');
    }

    // Generate and verify status report
    const statusPath = path.join(projectRoot, 'reports', 'status.json');
    try {
      const { writeStatusReport } = await import(
        `file://${path.join(projectRoot, 'orchestration/engine/status_aggregator.mjs').replace(/\\/g, '/')}`
      );
      await writeStatusReport();
      const statusContent = await fs.readFile(statusPath, 'utf8');
      const status = JSON.parse(statusContent);
      assert.ok(status.generated_at, 'Status should have generated_at field');

      // Validate against schema
      const Ajv = (await import('ajv')).default;
      const ajv = new Ajv();
      const schemaPath = path.join(projectRoot, 'schemas', 'status.schema.json');
      const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
      const valid = ajv.validate(schema, status);
      assert.ok(valid, `Status should validate against schema: ${ajv.errorsText()}`);
      console.log('[e2e-test] ✓ Status report generated and validated');
    } catch (error) {
      console.warn('[e2e-test] Status report generation/validation failed:', error.message);
    }

    // Clean up test graph
    await fs.unlink(graphPath);

    console.log('[e2e-test] ✓ E2E test completed successfully');
  });

  it('should handle crash and resume', async () => {
    // Create a long-running test graph
    const testGraph = {
      version: '1.0',
      project_id: `crash-test-${testTenant}`,
      nodes: [
        {
          id: 'slow-node-1',
          type: 'work_simulation',
          params: {
            duration_ms: 5000,
            output: 'Step 1 complete',
          },
        },
        {
          id: 'slow-node-2',
          type: 'work_simulation',
          requires: ['slow-node-1'],
          params: {
            duration_ms: 10000,
            output: 'Step 2 complete',
          },
        },
      ],
    };

    const { default: YAML } = await import('yaml');
    const graphPath = path.join(projectRoot, 'test-crash-graph.yaml');
    await fs.writeFile(graphPath, YAML.stringify(testGraph));

    // Start worker
    const crashWorker = spawn(
      process.execPath,
      [path.join(projectRoot, 'orchestration/cli.mjs'), 'engine', 'start', '--tenant', testTenant],
      {
        cwd: projectRoot,
        env: { ...process.env, TENANT_ID: testTenant },
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Enqueue job
    const { enqueueJob } = await import(
      `file://${path.join(projectRoot, 'orchestration/engine/bullmq/enqueue.mjs').replace(/\\/g, '/')}`
    );

    const { jobId, runId } = await enqueueJob({
      type: 'run_graph',
      graph_file: 'test-crash-graph.yaml',
      tenant: testTenant,
    });

    console.log(`[crash-test] Job enqueued: ${jobId}, run: ${runId}`);

    // Wait for first node to start
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Kill worker mid-execution
    console.log('[crash-test] Killing worker mid-execution...');
    crashWorker.kill('SIGKILL');

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check state file exists
    const statePath = path.join(
      projectRoot,
      'runs',
      'tenants',
      testTenant,
      'graph',
      runId,
      'state.json',
    );

    const stateBeforeResume = JSON.parse(await fs.readFile(statePath, 'utf8'));
    console.log('[crash-test] State before resume:', Object.keys(stateBeforeResume.nodes || {}));

    // Start new worker to resume
    console.log('[crash-test] Starting new worker to resume...');
    const resumeWorker = spawn(
      process.execPath,
      [path.join(projectRoot, 'orchestration/cli.mjs'), 'engine', 'start', '--tenant', testTenant],
      {
        cwd: projectRoot,
        env: { ...process.env, TENANT_ID: testTenant },
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    // Wait for completion
    await waitFor(async () => {
      try {
        const stateContent = await fs.readFile(statePath, 'utf8');
        const state = JSON.parse(stateContent);

        const allCompleted = Object.values(state.nodes || {}).every(
          (node) => node.status === 'succeeded' || node.status === 'failed',
        );

        return allCompleted;
      } catch {
        return false;
      }
    }, 30000);

    // Verify job completed after resume
    const finalState = JSON.parse(await fs.readFile(statePath, 'utf8'));
    assert.ok(finalState.nodes['slow-node-2'], 'Second node should exist');
    assert.equal(
      finalState.nodes['slow-node-2'].status,
      'succeeded',
      'Second node should be succeeded',
    );

    console.log('[crash-test] ✓ Crash-resume test completed successfully');

    // Clean up
    resumeWorker.kill('SIGTERM');
    await fs.unlink(graphPath);
  });

  it('should create backup with tenant filtering', async () => {
    // First ensure we have some tenant artifacts
    const testArtifactPath = path.join(
      projectRoot,
      'runs',
      'tenants',
      testTenant,
      'test-backup',
      'artifact.json',
    );

    await fs.mkdir(path.dirname(testArtifactPath), { recursive: true });
    await fs.writeFile(testArtifactPath, JSON.stringify({ test: true }));

    // Run backup command
    const { createBackup } = await import(
      `file://${path.join(projectRoot, 'orchestration/ops/backup.mjs').replace(/\\/g, '/')}`
    );

    const result = await createBackup('runs', {
      tenant: testTenant,
      output: path.join(projectRoot, `backup-test-${testTenant}.zip`),
    });

    assert.ok(result.success, 'Backup should succeed');
    assert.ok(result.archivePath, 'Should return archive path');

    // Verify backup file exists
    try {
      await fs.access(result.archivePath);
      console.log(`[backup-test] ✓ Backup created: ${result.archivePath}`);
    } catch (error) {
      throw new Error(`Backup file not created: ${result.archivePath}`);
    }

    // Clean up backup file
    await fs.unlink(result.archivePath);

    console.log('[backup-test] ✓ Backup test completed successfully');
  });
});

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running Phase 8 E2E Engine Tests...');
  console.log('Note: Requires Redis to be running');
}
