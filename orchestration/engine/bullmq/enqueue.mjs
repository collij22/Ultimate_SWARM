/**
 * BullMQ Job Enqueue Module
 *
 * Handles job submission to the queue with validation, policy checks,
 * and tenant isolation.
 *
 * Exit codes:
 * - 401: Redis unavailable
 * - 405: Permission denied (tenant policy violation)
 * - 409: Invalid job payload
 */

import { Queue } from 'bullmq';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { getRedisConnection, getQueueName, defaultJobOptions } from './config.mjs';
import { randomBytes } from 'crypto';
import { verifyToken, isAuthRequired } from '../auth/oidc.mjs';
import { isTenantAuthorized, hasPermission } from '../auth/rbac.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');

// Job schema validator
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
let validateJob;
let queue;

/**
 * Initialize queue and schema
 */
async function initialize() {
  if (queue) return queue;

  // Load job schema
  const schemaPath = path.join(__dirname, 'schemas', 'job.schema.json');
  const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
  validateJob = ajv.compile(schema);

  // Create queue
  const connection = await getRedisConnection();
  queue = new Queue(getQueueName('graph'), {
    connection,
    defaultJobOptions,
  });

  return queue;
}

/**
 * Generate job ID
 */
function generateJobId(type, tenant) {
  const timestamp = Date.now();
  const random = randomBytes(3).toString('hex');
  return `${type}-${tenant}-${timestamp}-${random}`;
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
 * Validate job against tenant policies
 */
async function validateTenantPolicy(jobData) {
  const { tenant = 'default', constraints = {} } = jobData;

  // Load policies if they exist
  const policiesPath = path.join(projectRoot, 'mcp', 'policies.yaml');

  try {
    const { default: YAML } = await import('yaml');
    const policiesContent = await fs.readFile(policiesPath, 'utf8');
    const policies = YAML.parse(policiesContent);

    // Check if tenant has specific policies
    if (policies.tenants && policies.tenants[tenant]) {
      const tenantPolicy = policies.tenants[tenant];

      // Check budget ceiling
      if (tenantPolicy.budget_ceiling_usd && constraints.budget_usd) {
        if (constraints.budget_usd > tenantPolicy.budget_ceiling_usd) {
          throw new Error(
            `Budget ${constraints.budget_usd} exceeds tenant ceiling ${tenantPolicy.budget_ceiling_usd}`,
          );
        }
      }

      // Check allowed capabilities
      if (tenantPolicy.allowed_capabilities && constraints.required_capabilities) {
        const disallowed = constraints.required_capabilities.filter(
          (cap) => !tenantPolicy.allowed_capabilities.includes(cap),
        );

        if (disallowed.length > 0) {
          throw new Error(`Tenant ${tenant} not allowed capabilities: ${disallowed.join(', ')}`);
        }
      }

      console.log(`✓ Tenant policy validated for ${tenant}`);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No policies file found, skipping tenant validation');
    } else {
      throw error;
    }
  }

  return true;
}

/**
 * Check if graph file exists
 */
async function validateGraphFile(graphFile) {
  const fullPath = path.join(projectRoot, graphFile);

  try {
    await fs.access(fullPath);
    return true;
  } catch {
    throw new Error(`Graph file not found: ${graphFile}`);
  }
}

/**
 * Enqueue a job
 */
export async function enqueueJob(jobData, options = {}) {
  // Initialize if needed
  await initialize();

  // Authorization (optional but recommended)
  if (isAuthRequired()) {
    const authHeader = options.authToken || process.env.AUTH_TOKEN;
    if (!authHeader) {
      console.error('Missing auth token');
      process.exit(405);
    }

    let claims;
    try {
      const token = authHeader.replace(/^(Bearer\s+)/i, '');
      claims = await verifyToken(token);
    } catch (err) {
      console.error(err.message);
      process.exit(405);
    }

    // Require permission to enqueue
    if (!hasPermission(claims, 'enqueue_jobs')) {
      console.error('Not authorized to enqueue jobs');
      process.exit(405);
    }

    // Enforce tenant authorization
    const requestedTenant = jobData.tenant || 'default';
    if (!isTenantAuthorized(claims, requestedTenant)) {
      console.error(`Not authorized for tenant: ${requestedTenant}`);
      process.exit(405);
    }

    // Attach identity to job metadata
    jobData.metadata = {
      ...(jobData.metadata || {}),
      auth_sub: claims.subject,
      auth_issuer: claims.issuer,
    };
  }

  // Validate job schema
  if (!validateJob(jobData)) {
    const errors = validateJob.errors
      .map((e) => `${e.instancePath || 'root'}: ${e.message}`)
      .join(', ');
    console.error(`Invalid job payload: ${errors}`);
    process.exit(409);
  }

  // Validate graph file exists
  if (jobData.type === 'run_graph') {
    await validateGraphFile(jobData.graph_file);
  }

  // Validate tenant policies
  try {
    await validateTenantPolicy(jobData);
  } catch (error) {
    console.error(`Policy violation: ${error.message}`);
    process.exit(405); // Permission denied
  }

  // Generate IDs if not provided
  const tenant = jobData.tenant || 'default';
  const jobId = options.jobId || generateJobId(jobData.type, tenant);
  const runId = jobData.run_id || generateRunId();

  // Prepare job data with defaults
  const finalJobData = {
    ...jobData,
    tenant,
    run_id: runId,
  };

  // Job options
  const jobOptions = {
    jobId,
    priority: jobData.priority || 50,
    delay: options.delay || 0,
    ...defaultJobOptions,
  };

  // Add to queue
  const job = await queue.add(jobData.type, finalJobData, jobOptions);

  // Log to observability
  const hookEvent = {
    event: 'EngineJobEnqueued',
    timestamp: new Date().toISOString(),
    job_id: job.id,
    tenant,
    type: jobData.type,
    graph_file: jobData.graph_file,
    run_id: runId,
    priority: jobOptions.priority,
    metadata: jobData.metadata,
  };

  await appendToHooks(hookEvent);

  console.log(`✓ Job enqueued: ${job.id}`);
  console.log(`  Type: ${jobData.type}`);
  console.log(`  Tenant: ${tenant}`);
  console.log(`  Run ID: ${runId}`);
  console.log(`  Priority: ${jobOptions.priority}`);

  return {
    jobId: job.id,
    runId,
    tenant,
    status: 'queued',
    position: await job.getState(),
  };
}

/**
 * Enqueue multiple jobs
 */
export async function enqueueBulk(jobs) {
  const results = [];

  for (const jobData of jobs) {
    try {
      const result = await enqueueJob(jobData);
      results.push({ success: true, ...result });
    } catch (error) {
      results.push({
        success: false,
        error: error.message,
        jobData,
      });
    }
  }

  return results;
}

/**
 * Get job status
 */
export async function getJobStatus(jobId) {
  await initialize();

  const job = await queue.getJob(jobId);

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const state = await job.getState();
  const progress = job.progress;
  const logs = await queue.getJobLogs(jobId);

  return {
    id: job.id,
    state,
    progress,
    data: job.data,
    result: job.returnvalue,
    failedReason: job.failedReason,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    logs: logs.logs,
    attemptsMade: job.attemptsMade,
  };
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId) {
  await initialize();

  const job = await queue.getJob(jobId);

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  // Check if job can be cancelled
  const state = await job.getState();

  if (state === 'completed' || state === 'failed') {
    throw new Error(`Cannot cancel job in state: ${state}`);
  }

  // Remove from queue
  await job.remove();

  // Log cancellation
  const hookEvent = {
    event: 'EngineJobCancelled',
    timestamp: new Date().toISOString(),
    job_id: jobId,
    state_at_cancel: state,
  };

  await appendToHooks(hookEvent);

  console.log(`✓ Job cancelled: ${jobId}`);

  return {
    jobId,
    cancelled: true,
    previousState: state,
  };
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
 * CLI interface for direct enqueue
 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node enqueue.mjs <graph-file> [--tenant <name>] [--priority <n>]');
    process.exit(1);
  }

  const graphFile = args[0];
  const tenant = args.includes('--tenant') ? args[args.indexOf('--tenant') + 1] : 'default';
  const priority = args.includes('--priority')
    ? parseInt(args[args.indexOf('--priority') + 1])
    : 50;

  const jobData = {
    type: 'run_graph',
    graph_file: graphFile,
    tenant,
    priority,
  };

  enqueueJob(jobData)
    .then((result) => {
      console.log('Job enqueued successfully:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to enqueue job:', error.message);
      process.exit(1);
    });
}
