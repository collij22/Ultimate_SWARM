/**
 * BullMQ Engine Configuration
 *
 * Manages Redis connection, environment variables, and engine settings
 * for the durable execution layer (Phase 8).
 *
 * Exit codes:
 * - 401: Redis unavailable
 */

import { Redis } from 'ioredis';

/**
 * Get Redis connection with health check
 * Fails fast with exit code 401 if Redis is unavailable
 */
export async function getRedisConnection() {
  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

  try {
    const connection = new Redis(url, {
      maxRetriesPerRequest: null, // Required by BullMQ
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      },
      enableReadyCheck: true,
      lazyConnect: false,
    });

    // Test connection
    await connection.ping();
    console.log(`✓ Redis connected: ${url}`);

    return connection;
  } catch (error) {
    console.error(`✗ Redis unavailable at ${url}: ${error.message}`);
    process.exit(401); // Redis unavailable
  }
}

/**
 * Engine configuration from environment
 */
export const engineConfig = {
  // Queue namespace to prevent conflicts
  namespace: process.env.ENGINE_NAMESPACE || 'swarm1',

  // Worker concurrency (parallel jobs)
  concurrency: parseInt(process.env.ENGINE_CONCURRENCY) || 3,

  // Queue name for graph jobs
  queueName: 'graphQueue',

  // Default tenant if not specified
  defaultTenant: process.env.DEFAULT_TENANT || 'default',

  // Job timeout (5 minutes default)
  jobTimeout: parseInt(process.env.JOB_TIMEOUT_MS) || 300000,

  // Status update interval (30 seconds)
  statusInterval: parseInt(process.env.STATUS_INTERVAL_MS) || 30000,

  // Backup settings
  backup: {
    s3Bucket: process.env.BACKUP_S3_BUCKET,
    retention: parseInt(process.env.BACKUP_RETENTION_DAYS) || 30,
  },

  // Safety settings
  safety: {
    allowProd: process.env.SAFETY_ALLOW_PROD === 'true',
    maxRetries: parseInt(process.env.MAX_JOB_RETRIES) || 3,
    backoffDelay: parseInt(process.env.BACKOFF_DELAY_MS) || 2000,
  },
};

/**
 * Validate engine configuration
 */
export function validateConfig() {
  const errors = [];

  if (engineConfig.concurrency < 1 || engineConfig.concurrency > 10) {
    errors.push('ENGINE_CONCURRENCY must be between 1 and 10');
  }

  if (engineConfig.jobTimeout < 60000) {
    errors.push('JOB_TIMEOUT_MS must be at least 60000 (1 minute)');
  }

  if (engineConfig.namespace.length < 3) {
    errors.push('ENGINE_NAMESPACE must be at least 3 characters');
  }

  if (errors.length > 0) {
    console.error('Configuration errors:', errors.join(', '));
    process.exit(409); // Invalid configuration
  }

  return true;
}

/**
 * Get full queue name with namespace
 */
export function getQueueName(queueType = 'graph') {
  return `${engineConfig.namespace}-${queueType}Queue`;
}

/**
 * Default retry options for jobs
 */
export const defaultJobOptions = {
  attempts: engineConfig.safety.maxRetries,
  backoff: {
    type: 'exponential',
    delay: engineConfig.safety.backoffDelay,
  },
  removeOnComplete: {
    age: 24 * 3600, // Keep completed jobs for 24 hours
    count: 100, // Keep last 100 completed jobs
  },
  removeOnFail: {
    age: 7 * 24 * 3600, // Keep failed jobs for 7 days
  },
};

/**
 * Print engine configuration (for debugging)
 */
export function printConfig() {
  console.log('Engine Configuration:');
  console.log(`  Namespace: ${engineConfig.namespace}`);
  console.log(`  Concurrency: ${engineConfig.concurrency}`);
  console.log(`  Job Timeout: ${engineConfig.jobTimeout}ms`);
  console.log(`  Default Tenant: ${engineConfig.defaultTenant}`);
  console.log(`  Safety - Allow Prod: ${engineConfig.safety.allowProd}`);
  console.log(`  Safety - Max Retries: ${engineConfig.safety.maxRetries}`);

  if (engineConfig.backup.s3Bucket) {
    console.log(`  Backup - S3 Bucket: ${engineConfig.backup.s3Bucket}`);
    console.log(`  Backup - Retention: ${engineConfig.backup.retention} days`);
  }
}
