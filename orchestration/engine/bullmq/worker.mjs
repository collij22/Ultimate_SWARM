/**
 * BullMQ Worker for Durable Graph Execution
 *
 * Consumes jobs from the queue and executes graph runner with proper
 * tenant isolation, resumability, and observability.
 *
 * Exit codes:
 * - 401: Redis unavailable
 * - 406: Resume state missing
 * - 408: Job timeout exceeded
 */

import { Worker } from 'bullmq';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRedisConnection, engineConfig, getQueueName, validateConfig } from './config.mjs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { randomBytes } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');

// Load and compile job schema
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
let validateJob;

async function loadJobSchema() {
  const schemaPath = path.join(__dirname, 'schemas', 'job.schema.json');
  const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
  validateJob = ajv.compile(schema);
}

/**
 * Generate run ID if not provided
 */
function generateRunId() {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0];
  const seq = randomBytes(2).toString('hex').toUpperCase();
  return `RUN-${dateStr}-${seq}`;
}

/**
 * Resolve tenant-scoped artifact path
 */
function getTenantPath(tenant, relativePath) {
  if (tenant && tenant !== 'default') {
    return path.join('runs', 'tenants', tenant, relativePath);
  }
  return path.join('runs', relativePath);
}

/**
 * Check if state file exists for resume
 */
async function checkResumeState(runId, tenant) {
  const statePath = path.join(projectRoot, getTenantPath(tenant, `graph/${runId}/state.json`));
  try {
    await fs.access(statePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Collect artifact paths after job completion
 */
async function collectArtifactPaths(tenant, runId) {
  const artifacts = [];
  const basePath = getTenantPath(tenant, '');
  const runPath = path.join(projectRoot, basePath);

  try {
    // Find all artifact directories for this run
    const entries = await fs.readdir(runPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.includes(runId)) {
        const artifactDir = path.join(basePath, entry.name);
        artifacts.push(artifactDir);
      }
    }
  } catch (error) {
    console.warn(`Could not collect artifacts: ${error.message}`);
  }

  return artifacts;
}

/**
 * Execute graph runner as subprocess
 */
async function executeGraphRunner(job) {
  const { graph_file, tenant = 'default', run_id, resume, env = {}, concurrency = 3 } = job.data;

  // Generate or use provided run ID
  const runId = run_id || generateRunId();

  // Check if we should resume
  const stateExists = await checkResumeState(runId, tenant);
  const shouldResume = resume || stateExists;

  if (resume && !stateExists) {
    throw new Error(`Resume requested but no state found for ${runId} (exit code 406)`);
  }

  // Build command arguments
  const runnerPath = path.join(projectRoot, 'orchestration', 'graph', 'runner.mjs');
  const graphPath = path.join(projectRoot, graph_file);

  const args = [runnerPath, graphPath];

  if (shouldResume) {
    args.push('--resume', runId);
  }

  args.push('--concurrency', String(concurrency));

  // Set up environment
  const processEnv = {
    ...process.env,
    ...env,
    TENANT_ID: tenant,
    RUN_ID: runId,
    JOB_ID: String(job.id),
    QUEUE_MODE: 'true',
  };

  // Log job start
  await job.log(`Starting graph execution: ${graph_file} (tenant: ${tenant}, run: ${runId})`);
  await job.updateProgress(10);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: projectRoot,
      env: processEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      // Stream progress updates from runner output
      const progressMatch = data.toString().match(/Progress: (\d+)%/);
      if (progressMatch) {
        const progress = parseInt(progressMatch[1]);
        job.updateProgress(Math.min(progress, 95));
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      job.log(`Runner stderr: ${data.toString()}`);
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to spawn runner: ${error.message}`));
    });

    child.on('exit', async (code, signal) => {
      if (signal) {
        reject(new Error(`Runner killed by signal ${signal}`));
      } else if (code === 0) {
        await job.updateProgress(100);
        const artifacts = await collectArtifactPaths(tenant, runId);
        resolve({
          runId,
          exitCode: 0,
          artifacts,
          stdout: stdout.slice(-5000), // Last 5KB of output
          message: 'Graph execution completed successfully',
        });
      } else {
        reject(new Error(`Runner exited with code ${code}: ${stderr.slice(-1000)}`));
      }
    });
  });
}

/**
 * Process a single job
 */
async function processJob(job) {
  // Validate job data
  if (!validateJob(job.data)) {
    const errors = validateJob.errors
      .map((e) => `${e.instancePath || 'root'}: ${e.message}`)
      .join(', ');
    throw new Error(`Invalid job payload: ${errors}`);
  }

  const startTime = Date.now();

  try {
    // Log to observability
    const hookEvent = {
      event: 'EngineJobStart',
      timestamp: new Date().toISOString(),
      job_id: job.id,
      tenant: job.data.tenant || 'default',
      type: job.data.type,
      graph_file: job.data.graph_file,
      metadata: job.data.metadata,
    };

    await appendToHooks(hookEvent);

    // Execute based on job type
    let result;

    switch (job.data.type) {
      case 'run_graph':
        result = await executeGraphRunner(job);
        break;

      case 'compile_brief':
        // TODO: Implement brief compilation
        throw new Error('Brief compilation not yet implemented');

      case 'package_delivery':
        // TODO: Implement packaging
        throw new Error('Packaging not yet implemented');

      case 'backup':
        // TODO: Implement backup
        throw new Error('Backup not yet implemented');

      default:
        throw new Error(`Unknown job type: ${job.data.type}`);
    }

    // Log completion
    const completionEvent = {
      event: 'EngineJobComplete',
      timestamp: new Date().toISOString(),
      job_id: job.id,
      duration_ms: Date.now() - startTime,
      result: {
        runId: result.runId,
        artifacts: result.artifacts,
        message: result.message,
      },
    };

    await appendToHooks(completionEvent);

    return result;
  } catch (error) {
    // Log failure
    const failureEvent = {
      event: 'EngineJobFailed',
      timestamp: new Date().toISOString(),
      job_id: job.id,
      duration_ms: Date.now() - startTime,
      error: error.message,
    };

    await appendToHooks(failureEvent);

    throw error;
  }
}

/**
 * Append event to observability hooks
 */
async function appendToHooks(event) {
  const hooksPath = path.join(projectRoot, 'runs', 'observability', 'hooks.jsonl');

  try {
    await fs.mkdir(path.dirname(hooksPath), { recursive: true });
    await fs.appendFile(hooksPath, JSON.stringify(event) + '\n');
  } catch (error) {
    console.error(`Failed to write to hooks: ${error.message}`);
  }
}

/**
 * Start the worker
 */
export async function startWorker() {
  // Validate configuration
  validateConfig();

  // Load job schema
  await loadJobSchema();

  // Get Redis connection
  const connection = await getRedisConnection();

  // Create worker
  const worker = new Worker(getQueueName('graph'), processJob, {
    connection,
    concurrency: engineConfig.concurrency,
    maxStalledCount: 3,
    stalledInterval: 30000,
    lockDuration: 60000,
    settings: {
      backoffStrategy: (attemptsMade) => {
        return Math.min(attemptsMade * 2000, 30000);
      },
    },
  });

  // Worker event handlers
  worker.on('completed', (job, result) => {
    console.log(`✓ Job ${job.id} completed: ${result.message}`);
  });

  worker.on('failed', (job, error) => {
    console.error(`✗ Job ${job.id} failed: ${error.message}`);
  });

  worker.on('active', (job) => {
    console.log(`→ Job ${job.id} started (${job.data.type}: ${job.data.graph_file})`);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`⚠ Job ${jobId} stalled and will be retried`);
  });

  worker.on('error', (error) => {
    console.error(`Worker error: ${error.message}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down worker gracefully...');
    await worker.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Shutting down worker gracefully...');
    await worker.close();
    process.exit(0);
  });

  console.log(`Worker started with concurrency ${engineConfig.concurrency}`);
  console.log(`Listening on queue: ${getQueueName('graph')}`);

  return worker;
}

// Start worker if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startWorker().catch((error) => {
    console.error('Failed to start worker:', error);
    process.exit(401);
  });
}
