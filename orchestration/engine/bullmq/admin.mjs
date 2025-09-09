/**
 * BullMQ Admin Control Module
 *
 * Provides administrative functions for queue management including
 * pause, resume, cancel, status, and monitoring.
 *
 * Exit codes:
 * - 401: Redis unavailable
 * - 407: Cancelled by user
 */

import { Queue, QueueEvents } from 'bullmq';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRedisConnection, getQueueName } from './config.mjs';
import { verifyToken, isAuthRequired } from '../auth/oidc.mjs';
import { hasPermission } from '../auth/rbac.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');

let queue;
let queueEvents;

/**
 * Initialize queue and events
 */
async function initialize() {
  if (queue && queueEvents) return;

  const connection = await getRedisConnection();

  queue = new Queue(getQueueName('graph'), { connection });
  queueEvents = new QueueEvents(getQueueName('graph'), { connection });

  await queueEvents.waitUntilReady();
}

async function ensureAdmin() {
  if (!isAuthRequired()) return;
  const authHeader = process.env.AUTH_TOKEN;
  if (!authHeader) throw new Error('AUTH_TOKEN required');
  const token = authHeader.replace(/^(Bearer\s+)/i, '');
  const claims = await verifyToken(token);
  if (!hasPermission(claims, 'queue_admin')) throw new Error('Not authorized for admin operations');
}

/**
 * Pause the queue
 */
export async function pauseQueue() {
  await ensureAdmin();
  await initialize();
  await queue.pause();

  const event = {
    event: 'EngineQueuePaused',
    timestamp: new Date().toISOString(),
    queue: getQueueName('graph'),
  };

  await appendToHooks(event);

  console.log('✓ Queue paused');
  return { paused: true };
}

/**
 * Resume the queue
 */
export async function resumeQueue() {
  await ensureAdmin();
  await initialize();
  await queue.resume();

  const event = {
    event: 'EngineQueueResumed',
    timestamp: new Date().toISOString(),
    queue: getQueueName('graph'),
  };

  await appendToHooks(event);

  console.log('✓ Queue resumed');
  return { resumed: true };
}

/**
 * Get queue status
 */
export async function getQueueStatus() {
  await initialize();

  const isPaused = await queue.isPaused();
  const counts = await queue.getJobCounts();
  const workers = await queue.getWorkers();

  return {
    name: getQueueName('graph'),
    paused: isPaused,
    counts: {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      paused: counts.paused || 0,
    },
    workers: workers.map((w) => ({
      id: w.id,
      name: w.name,
      addr: w.addr,
    })),
  };
}

/**
 * List jobs by state
 */
export async function listJobs(
  states = ['waiting', 'active', 'completed', 'failed'],
  options = {},
) {
  await initialize();

  const { start = 0, end = 20, asc = false } = options;
  const jobs = [];

  for (const state of states) {
    const stateJobs = await queue.getJobs([state], start, end, asc);

    for (const job of stateJobs) {
      const jobState = await job.getState();

      jobs.push({
        id: job.id,
        type: job.name,
        state: jobState,
        data: {
          graph_file: job.data.graph_file,
          tenant: job.data.tenant,
          run_id: job.data.run_id,
          priority: job.opts.priority,
        },
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        createdAt: new Date(job.timestamp).toISOString(),
        processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
        finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        failedReason: job.failedReason,
      });
    }
  }

  // Sort by creation time
  jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return jobs.slice(0, end - start + 1);
}

/**
 * Get detailed job information
 */
export async function getJob(jobId) {
  await initialize();

  const job = await queue.getJob(jobId);

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const state = await job.getState();
  const logs = await queue.getJobLogs(jobId);

  return {
    id: job.id,
    name: job.name,
    state,
    data: job.data,
    opts: job.opts,
    progress: job.progress,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
    stacktrace: job.stacktrace,
    attemptsMade: job.attemptsMade,
    createdAt: new Date(job.timestamp).toISOString(),
    processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    logs: logs.logs,
  };
}

/**
 * Cancel a specific job
 */
export async function cancelJob(jobId) {
  await ensureAdmin();
  await initialize();

  const job = await queue.getJob(jobId);

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const state = await job.getState();

  if (state === 'completed' || state === 'failed') {
    throw new Error(`Cannot cancel job in state: ${state}`);
  }

  // If active, move to failed
  if (state === 'active') {
    await job.moveToFailed(new Error('Cancelled by user'), '0', false);
  } else {
    // Remove from queue
    await job.remove();
  }

  const event = {
    event: 'EngineJobCancelled',
    timestamp: new Date().toISOString(),
    job_id: jobId,
    previous_state: state,
  };

  await appendToHooks(event);

  console.log(`✓ Job ${jobId} cancelled`);

  return {
    jobId,
    cancelled: true,
    previousState: state,
  };
}

/**
 * Clean completed/failed jobs
 */
export async function cleanJobs(grace = 3600000, limit = 100, states = ['completed', 'failed']) {
  await ensureAdmin();
  await initialize();

  const results = {};

  for (const state of states) {
    const removed = await queue.clean(grace, limit, state);
    results[state] = removed.length;
  }

  const event = {
    event: 'EngineJobsCleaned',
    timestamp: new Date().toISOString(),
    results,
    grace_ms: grace,
    limit,
  };

  await appendToHooks(event);

  console.log('✓ Cleaned jobs:', results);

  return results;
}

/**
 * Drain the queue (remove all jobs)
 */
export async function drainQueue(delayed = false) {
  await ensureAdmin();
  await initialize();

  await queue.drain(delayed);

  const event = {
    event: 'EngineQueueDrained',
    timestamp: new Date().toISOString(),
    delayed_included: delayed,
  };

  await appendToHooks(event);

  console.log('✓ Queue drained');

  return { drained: true };
}

/**
 * Get queue metrics
 */
export async function getMetrics() {
  await initialize();

  const counts = await queue.getJobCounts();
  const isPaused = await queue.isPaused();
  const workers = await queue.getWorkers();

  // Calculate rates
  const completedRecent = await queue.getJobs(['completed'], 0, 100);
  const failedRecent = await queue.getJobs(['failed'], 0, 100);

  const now = Date.now();
  const hourAgo = now - 3600000;

  const completedLastHour = completedRecent.filter(
    (j) => j.finishedOn && j.finishedOn > hourAgo,
  ).length;

  const failedLastHour = failedRecent.filter((j) => j.finishedOn && j.finishedOn > hourAgo).length;

  const successRate =
    completedLastHour > 0 ? (completedLastHour / (completedLastHour + failedLastHour)) * 100 : 0;

  return {
    queue: getQueueName('graph'),
    status: isPaused ? 'paused' : 'active',
    counts,
    workers: workers.length,
    rates: {
      completed_per_hour: completedLastHour,
      failed_per_hour: failedLastHour,
      success_rate: successRate.toFixed(2) + '%',
    },
    health: {
      redis_connected: true,
      workers_active: workers.length > 0,
      queue_responsive: true,
    },
  };
}

/**
 * Monitor queue events
 */
export async function monitorQueue(callback) {
  await initialize();

  queueEvents.on('waiting', ({ jobId }) => {
    callback({ event: 'waiting', jobId, timestamp: new Date().toISOString() });
  });

  queueEvents.on('active', ({ jobId, prev }) => {
    callback({ event: 'active', jobId, prev, timestamp: new Date().toISOString() });
  });

  queueEvents.on('completed', ({ jobId, returnvalue }) => {
    callback({ event: 'completed', jobId, returnvalue, timestamp: new Date().toISOString() });
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    callback({ event: 'failed', jobId, failedReason, timestamp: new Date().toISOString() });
  });

  queueEvents.on('progress', ({ jobId, data }) => {
    callback({ event: 'progress', jobId, progress: data, timestamp: new Date().toISOString() });
  });

  console.log('✓ Monitoring queue events (press Ctrl+C to stop)');
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
 * CLI interface for admin commands
 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];

  const commands = {
    async status() {
      const status = await getQueueStatus();
      console.log('Queue Status:', JSON.stringify(status, null, 2));
    },

    async pause() {
      await pauseQueue();
    },

    async resume() {
      await resumeQueue();
    },

    async list() {
      const jobs = await listJobs();
      console.log('Jobs:', JSON.stringify(jobs, null, 2));
    },

    async get() {
      const jobId = process.argv[3];
      if (!jobId) {
        console.error('Usage: admin.mjs get <job-id>');
        process.exit(1);
      }
      const job = await getJob(jobId);
      console.log('Job Details:', JSON.stringify(job, null, 2));
    },

    async cancel() {
      const jobId = process.argv[3];
      if (!jobId) {
        console.error('Usage: admin.mjs cancel <job-id>');
        process.exit(1);
      }
      await cancelJob(jobId);
    },

    async clean() {
      const results = await cleanJobs();
      console.log('Cleaned:', results);
    },

    async drain() {
      await drainQueue();
    },

    async metrics() {
      const metrics = await getMetrics();
      console.log('Metrics:', JSON.stringify(metrics, null, 2));
    },

    async monitor() {
      await monitorQueue((event) => {
        console.log(`[${event.timestamp}] ${event.event}:`, event.jobId);
      });
      // Keep process alive
      await new Promise(() => {});
    },
  };

  if (!command || !commands[command]) {
    console.log('Available commands:');
    console.log('  status  - Show queue status');
    console.log('  pause   - Pause the queue');
    console.log('  resume  - Resume the queue');
    console.log('  list    - List jobs');
    console.log('  get     - Get job details');
    console.log('  cancel  - Cancel a job');
    console.log('  clean   - Clean old jobs');
    console.log('  drain   - Remove all jobs');
    console.log('  metrics - Show queue metrics');
    console.log('  monitor - Monitor queue events');
    process.exit(0);
  }

  commands[command]()
    .then(() => {
      if (command !== 'monitor') {
        process.exit(0);
      }
    })
    .catch((error) => {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    });
}
