/**
 * Status Aggregator Module
 *
 * Collects and aggregates status information from the queue, workers,
 * and job history to provide comprehensive system visibility.
 * Generates reports/status.json for monitoring and dashboards.
 */

import { Queue } from 'bullmq';
import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRedisConnection, getQueueName, engineConfig } from './bullmq/config.mjs';
import { listTenants, getTenantStats } from '../lib/tenant.mjs';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');

let queue;

/**
 * Initialize queue connection
 */
async function initialize() {
  if (queue) return queue;

  const connection = await getRedisConnection();
  queue = new Queue(getQueueName('graph'), { connection });

  return queue;
}

/**
 * Get queue statistics
 */
async function getQueueStats() {
  await initialize();

  const counts = await queue.getJobCounts();
  const isPaused = await queue.isPaused();
  const workers = await queue.getWorkers();

  return {
    name: getQueueName('graph'),
    status: isPaused ? 'paused' : 'active',
    counts: {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      paused: counts.paused || 0,
      total: Object.values(counts).reduce((sum, count) => sum + (count || 0), 0),
    },
    workers: {
      count: workers.length,
      details: workers.map((w) => ({
        id: w.id,
        name: w.name,
        addr: w.addr,
        started: w.time ? new Date(parseInt(w.time)).toISOString() : null,
      })),
    },
  };
}

/**
 * Get recent jobs for a tenant
 */
async function getTenantRecentJobs(tenant, limit = 10) {
  await initialize();

  const recentJobs = [];
  const states = ['completed', 'failed', 'active', 'waiting'];

  for (const state of states) {
    const jobs = await queue.getJobs([state], 0, 100); // Get last 100 of each state

    for (const job of jobs) {
      if (job.data.tenant === tenant || (!job.data.tenant && tenant === 'default')) {
        recentJobs.push({
          job_id: job.id,
          type: job.name,
          state: await job.getState(),
          run_id: job.data.run_id,
          graph_file: job.data.graph_file,
          priority: job.opts.priority,
          progress: job.progress,
          created_at: new Date(job.timestamp).toISOString(),
          started_at: job.processedOn ? new Date(job.processedOn).toISOString() : null,
          finished_at: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
          duration_ms: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null,
          result: job.returnvalue,
          error: job.failedReason,
          attempts: job.attemptsMade,
        });
      }
    }
  }

  // Sort by creation time (newest first)
  recentJobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return recentJobs.slice(0, limit);
}

/**
 * Calculate tenant metrics
 */
async function calculateTenantMetrics(tenant, jobs) {
  const now = Date.now();
  const hourAgo = now - 3600000;
  const dayAgo = now - 86400000;

  // Filter jobs by time windows
  const lastHour = jobs.filter((j) => new Date(j.created_at).getTime() > hourAgo);
  const lastDay = jobs.filter((j) => new Date(j.created_at).getTime() > dayAgo);

  // Calculate success rates
  const completedHour = lastHour.filter((j) => j.state === 'completed').length;
  const failedHour = lastHour.filter((j) => j.state === 'failed').length;
  const totalHour = completedHour + failedHour;

  const completedDay = lastDay.filter((j) => j.state === 'completed').length;
  const failedDay = lastDay.filter((j) => j.state === 'failed').length;
  const totalDay = completedDay + failedDay;

  // Calculate average duration
  const durations = jobs.filter((j) => j.duration_ms).map((j) => j.duration_ms);

  const avgDuration =
    durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;

  return {
    jobs_per_hour: lastHour.length,
    jobs_per_day: lastDay.length,
    success_rate_hour: totalHour > 0 ? ((completedHour / totalHour) * 100).toFixed(2) + '%' : 'N/A',
    success_rate_day: totalDay > 0 ? ((completedDay / totalDay) * 100).toFixed(2) + '%' : 'N/A',
    avg_duration_ms: Math.round(avgDuration),
    active_jobs: jobs.filter((j) => j.state === 'active').length,
    waiting_jobs: jobs.filter((j) => j.state === 'waiting').length,
  };
}

/**
 * Parse hooks.jsonl for additional events
 */
async function parseHooksEvents(since = null) {
  const hooksPath = path.join(projectRoot, 'runs', 'observability', 'hooks.jsonl');
  const events = [];

  try {
    const fileStream = createReadStream(hooksPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const event = JSON.parse(line);

          // Filter by time if specified
          if (since && new Date(event.timestamp) < new Date(since)) {
            continue;
          }

          // Only include engine-related events
          if (event.event && event.event.startsWith('Engine')) {
            events.push(event);
          }
        } catch (err) {
          // Skip malformed lines
        }
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Failed to parse hooks: ${error.message}`);
    }
  }

  return events;
}

/**
 * Generate comprehensive status report
 */
export async function generateStatusReport() {
  await initialize();

  const timestamp = new Date().toISOString();
  const queueStats = await getQueueStats();
  const tenants = await listTenants();

  // Build tenant summaries
  const tenantSummaries = {};

  for (const tenant of tenants) {
    const jobs = await getTenantRecentJobs(tenant, 20);
    const stats = await getTenantStats(tenant);
    const metrics = await calculateTenantMetrics(tenant, jobs);

    // Extract AUV IDs from jobs
    const auvIds = new Set();
    for (const job of jobs) {
      if (job.result?.artifacts) {
        for (const artifact of job.result.artifacts) {
          const auvMatch = artifact.match(/AUV-\d{4}/);
          if (auvMatch) {
            auvIds.add(auvMatch[0]);
          }
        }
      }
    }

    tenantSummaries[tenant] = {
      metrics,
      storage: {
        auv_count: stats.auvCount,
        total_size_mb: Math.round((stats.totalSize / 1024 / 1024) * 100) / 100,
        last_modified: stats.lastModified,
      },
      recent_runs: jobs.slice(0, 5).map((j) => ({
        job_id: j.job_id,
        run_id: j.run_id,
        graph_file: j.graph_file,
        state: j.state,
        started_at: j.started_at,
        finished_at: j.finished_at,
        duration_ms: j.duration_ms,
        ok: j.state === 'completed',
      })),
      active_auvs: Array.from(auvIds),
    };
  }

  // Get recent events
  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  const recentEvents = await parseHooksEvents(hourAgo);

  // Calculate system health
  const health = {
    status: 'healthy',
    checks: {
      redis_connected: true,
      queue_responsive: queueStats.status === 'active',
      workers_available: queueStats.workers.count > 0,
      error_rate_acceptable: true, // Would check error rates
    },
    last_check: timestamp,
  };

  // Check for issues
  if (!health.checks.workers_available) {
    health.status = 'degraded';
  }

  if (!health.checks.redis_connected || !health.checks.queue_responsive) {
    health.status = 'critical';
  }

  // Build final status document
  const status = {
    version: '1.0',
    generated_at: timestamp,
    environment: {
      node_version: process.version,
      platform: process.platform,
      namespace: engineConfig.namespace,
      redis_url: process.env.REDIS_URL?.replace(/:[^:@]+@/, ':***@') || 'redis://127.0.0.1:6379',
    },
    engine: {
      mode: process.env.NODE_ENV || 'development',
      config: {
        concurrency: engineConfig.concurrency,
        job_timeout_ms: engineConfig.jobTimeout,
        max_retries: engineConfig.safety.maxRetries,
      },
      queue: queueStats,
      health,
    },
    tenants: tenantSummaries,
    recent_events: recentEvents.slice(-50), // Last 50 events
    summary: {
      total_tenants: tenants.length,
      total_jobs: queueStats.counts.total,
      active_workers: queueStats.workers.count,
      system_status: health.status,
    },
  };

  return status;
}

/**
 * Write status report to file
 */
export async function writeStatusReport(status = null) {
  if (!status) {
    status = await generateStatusReport();
  }

  const statusPath = path.join(projectRoot, 'reports', 'status.json');

  // Ensure directory exists
  await fs.mkdir(path.dirname(statusPath), { recursive: true });

  // Write atomically
  const tempPath = statusPath + '.tmp';
  await fs.writeFile(tempPath, JSON.stringify(status, null, 2), 'utf8');
  await fs.rename(tempPath, statusPath);

  console.log(`✓ Status report written to ${statusPath}`);

  return statusPath;
}

/**
 * Monitor and continuously update status
 */
export async function monitorStatus(intervalMs = 30000) {
  console.log(`Starting status monitor (updating every ${intervalMs}ms)`);

  // Initial report
  await writeStatusReport();

  // Set up interval
  const interval = setInterval(async () => {
    try {
      await writeStatusReport();
    } catch (error) {
      console.error(`Failed to update status: ${error.message}`);
    }
  }, intervalMs);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    clearInterval(interval);
    console.log('Status monitor stopped');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('Status monitor stopped');
    process.exit(0);
  });
}

/**
 * CLI interface
 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];

  const commands = {
    async generate() {
      const status = await generateStatusReport();
      console.log(JSON.stringify(status, null, 2));
    },

    async write() {
      await writeStatusReport();
    },

    async monitor() {
      const interval = process.argv[3] ? parseInt(process.argv[3]) : 30000;
      await monitorStatus(interval);
    },

    async summary() {
      const status = await generateStatusReport();
      console.log('System Status Summary:');
      console.log(`  Status: ${status.summary.system_status}`);
      console.log(`  Tenants: ${status.summary.total_tenants}`);
      console.log(`  Total Jobs: ${status.summary.total_jobs}`);
      console.log(`  Active Workers: ${status.summary.active_workers}`);
      console.log(`  Queue: ${status.engine.queue.status}`);
      console.log(`  Jobs Waiting: ${status.engine.queue.counts.waiting}`);
      console.log(`  Jobs Active: ${status.engine.queue.counts.active}`);
    },
  };

  if (!command || !commands[command]) {
    console.log('Available commands:');
    console.log('  generate         - Generate and print status');
    console.log('  write           - Write status to reports/status.json');
    console.log('  monitor [ms]    - Continuously update status');
    console.log('  summary         - Print brief summary');
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
