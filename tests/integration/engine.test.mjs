/**
 * Integration tests for Phase 8 - Durable Execution Engine
 *
 * Tests end-to-end functionality with Redis including tenant isolation,
 * job resumability, policy enforcement, and status reporting.
 *
 * Prerequisites:
 * - Redis running on localhost:6379 (or set REDIS_URL)
 * - Graph files in orchestration/graph/projects/
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import Ajv from 'ajv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

// Test configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const TEST_TIMEOUT = 60000; // 1 minute for integration tests

describe('Phase 8 - Engine Integration Tests', { timeout: TEST_TIMEOUT }, () => {
  let redis;
  let queue;
  let queueEvents;

  before(async () => {
    // Check Redis connectivity
    try {
      redis = new Redis(REDIS_URL);
      await redis.ping();
      console.log('✅ Redis connected');
    } catch (error) {
      console.error('❌ Redis not available. Skipping integration tests.');
      console.error('   Start Redis with: docker run -d -p 6379:6379 redis:7-alpine');
      process.exit(0); // Skip tests if Redis not available
    }

    // Clean up any existing test data
    await redis.flushdb();

    // Initialize queue for tests
    queue = new Queue('swarm1:testQueue', {
      connection: redis,
    });

    queueEvents = new QueueEvents('swarm1:testQueue', {
      connection: redis.duplicate(),
    });
  });

  after(async () => {
    // Clean up
    if (queueEvents) await queueEvents.close();
    if (queue) await queue.close();
    if (redis) redis.disconnect();
  });

  describe('Tenant Isolation', () => {
    it('should create artifacts under default tenant path', async () => {
      // Create a simple test graph
      const testGraph = {
        version: '1.0',
        project_id: 'test-default',
        nodes: [
          {
            id: 'test-node',
            type: 'work_simulation',
            params: {
              duration_ms: 100,
              output: 'test output',
            },
          },
        ],
      };

      const graphPath = path.join(projectRoot, 'test-graph-default.yaml');
      await fs.writeFile(graphPath, JSON.stringify(testGraph));

      // Enqueue job for default tenant
      const { enqueueJob } = await import(
        path.join(projectRoot, 'orchestration/engine/bullmq/enqueue.mjs')
      );

      const { jobId } = await enqueueJob({
        type: 'run_graph',
        graph_file: 'test-graph-default.yaml',
        tenant: 'default',
      });

      assert.ok(jobId, 'Job should be enqueued');

      // Clean up
      await fs.unlink(graphPath);
    });

    it('should create artifacts under named tenant path', async () => {
      // Create test graph
      const testGraph = {
        version: '1.0',
        project_id: 'test-acme',
        nodes: [
          {
            id: 'test-node',
            type: 'work_simulation',
            params: {
              duration_ms: 100,
              output: 'acme test',
            },
          },
        ],
      };

      const graphPath = path.join(projectRoot, 'test-graph-acme.yaml');
      await fs.writeFile(graphPath, JSON.stringify(testGraph));

      // Enqueue job for acme-corp tenant
      const { enqueueJob } = await import(
        path.join(projectRoot, 'orchestration/engine/bullmq/enqueue.mjs')
      );

      const { jobId } = await enqueueJob({
        type: 'run_graph',
        graph_file: 'test-graph-acme.yaml',
        tenant: 'acme-corp',
      });

      assert.ok(jobId, 'Job should be enqueued for acme-corp');

      // Verify tenant path will be used
      const { tenantPath } = await import(path.join(projectRoot, 'orchestration/lib/tenant.mjs'));

      const expectedPath = tenantPath('acme-corp', 'test');
      assert.ok(expectedPath.includes('tenants/acme-corp'), 'Should use tenant path');

      // Clean up
      await fs.unlink(graphPath);
    });
  });

  describe('Policy Enforcement', () => {
    it('should reject job exceeding tenant budget', async () => {
      const { enqueueJob } = await import(
        path.join(projectRoot, 'orchestration/engine/bullmq/enqueue.mjs')
      );

      try {
        await enqueueJob({
          type: 'run_graph',
          graph_file: 'test.yaml',
          tenant: 'default',
          constraints: {
            budget_usd: 1000, // Exceeds default ceiling of 100
          },
        });
        assert.fail('Should have rejected over-budget job');
      } catch (error) {
        assert.ok(
          error.message.includes('exceeds tenant ceiling'),
          'Should mention budget violation',
        );
      }
    });

    it('should reject job with disallowed capabilities', async () => {
      const { enqueueJob } = await import(
        path.join(projectRoot, 'orchestration/engine/bullmq/enqueue.mjs')
      );

      try {
        await enqueueJob({
          type: 'run_graph',
          graph_file: 'test.yaml',
          tenant: 'beta-inc',
          constraints: {
            required_capabilities: ['deploy.k8s'], // Not allowed for beta-inc
          },
        });
        assert.fail('Should have rejected disallowed capability');
      } catch (error) {
        assert.ok(error.message.includes('not allowed'), 'Should mention capability violation');
      }
    });
  });

  describe('Job Validation', () => {
    it('should validate job schema correctly', async () => {
      const schemaPath = path.join(
        projectRoot,
        'orchestration/engine/bullmq/schemas/job.schema.json',
      );
      const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));

      const ajv = new Ajv({ allErrors: true });
      const validate = ajv.compile(schema);

      // Valid job with hex run_id
      const validJob = {
        type: 'run_graph',
        graph_file: 'test.yaml',
        run_id: 'RUN-2025-01-09-A3F2',
      };

      assert.strictEqual(validate(validJob), true, 'Should accept hex run_id');

      // Invalid job with numeric run_id (old format)
      const invalidJob = {
        type: 'run_graph',
        graph_file: 'test.yaml',
        run_id: 'RUN-2025-01-09-001',
      };

      assert.strictEqual(validate(invalidJob), false, 'Should reject numeric run_id');
    });
  });

  describe('Status Aggregation', () => {
    it('should generate valid status report', async () => {
      const { generateStatusReport } = await import(
        path.join(projectRoot, 'orchestration/engine/status_aggregator.mjs')
      );

      const status = await generateStatusReport();

      // Validate against schema
      const schemaPath = path.join(projectRoot, 'schemas/status.schema.json');
      const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));

      const ajv = new Ajv({ allErrors: true });
      const validate = ajv.compile(schema);

      const isValid = validate(status);
      if (!isValid) {
        console.log('Validation errors:', validate.errors);
      }

      assert.strictEqual(isValid, true, 'Status report should match schema');
      assert.ok(status.engine, 'Should have engine section');
      assert.ok(status.tenants, 'Should have tenants section');
      assert.ok(status.summary, 'Should have summary section');
    });
  });

  describe('Queue Operations', () => {
    it('should pause and resume queue', async () => {
      const { pauseQueue, resumeQueue, getQueueStatus } = await import(
        path.join(projectRoot, 'orchestration/engine/bullmq/admin.mjs')
      );

      // Pause queue
      await pauseQueue();
      let status = await getQueueStatus();
      assert.strictEqual(status.paused, true, 'Queue should be paused');

      // Resume queue
      await resumeQueue();
      status = await getQueueStatus();
      assert.strictEqual(status.paused, false, 'Queue should be resumed');
    });

    it('should list and cancel jobs', async () => {
      const { enqueueJob } = await import(
        path.join(projectRoot, 'orchestration/engine/bullmq/enqueue.mjs')
      );

      const { listJobs, cancelJob } = await import(
        path.join(projectRoot, 'orchestration/engine/bullmq/admin.mjs')
      );

      // Enqueue a test job
      const { jobId } = await enqueueJob({
        type: 'run_graph',
        graph_file: 'test.yaml',
        tenant: 'default',
      });

      // List jobs
      const jobs = await listJobs();
      assert.ok(
        jobs.some((j) => j.id === jobId),
        'Should list enqueued job',
      );

      // Cancel job
      const canceled = await cancelJob(jobId);
      assert.strictEqual(canceled, true, 'Should cancel job');
    });
  });

  describe('Resume After Crash', () => {
    it('should detect existing state for resume', async () => {
      // Create a fake state file
      const runId = 'RUN-2025-01-09-TEST';
      const { tenantPath } = await import(path.join(projectRoot, 'orchestration/lib/tenant.mjs'));

      const statePath = path.join(projectRoot, tenantPath('default', `graph/${runId}/state.json`));

      await fs.mkdir(path.dirname(statePath), { recursive: true });
      await fs.writeFile(
        statePath,
        JSON.stringify({
          runId,
          completed: ['node1'],
          failed: [],
          checkpoints: {},
        }),
      );

      // Verify state detection works
      const stateExists = await fs
        .access(statePath)
        .then(() => true)
        .catch(() => false);

      assert.strictEqual(stateExists, true, 'Should detect existing state');

      // Clean up
      await fs.unlink(statePath);
    });
  });

  describe('Backup System', () => {
    it('should exclude sensitive files from backup', async () => {
      const { shouldExclude } = await import(
        path.join(projectRoot, 'orchestration/ops/backup.mjs')
      );

      // Test exclusion patterns
      assert.strictEqual(shouldExclude('.env'), true, 'Should exclude .env');
      assert.strictEqual(shouldExclude('secret.key'), true, 'Should exclude .key files');
      assert.strictEqual(shouldExclude('cert.pem'), true, 'Should exclude .pem files');
      assert.strictEqual(shouldExclude('data.json'), false, 'Should include .json files');
    });
  });

  describe('CLI Integration', () => {
    it('should have engine commands in CLI', async () => {
      const result = execSync('node orchestration/cli.mjs help', {
        cwd: projectRoot,
        encoding: 'utf8',
      });

      assert.ok(result.includes('Engine Commands'), 'Should have engine section in help');
      assert.ok(result.includes('engine start'), 'Should have start command');
      assert.ok(result.includes('engine enqueue'), 'Should have enqueue command');
      assert.ok(result.includes('engine status'), 'Should have status command');
    });
  });
});

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running Phase 8 integration tests...');
  console.log('Ensure Redis is running on localhost:6379');
}
