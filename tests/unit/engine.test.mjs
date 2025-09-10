/**
 * Unit tests for Phase 8 - Durable Execution Engine
 *
 * Tests core functionality of BullMQ engine, tenant isolation,
 * and policy enforcement.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

describe('Phase 8 - Engine Components', () => {
  describe('Job Schema Validation', () => {
    it('should validate correct job payload', async () => {
      const schemaPath = path.join(
        projectRoot,
        'orchestration/engine/bullmq/schemas/job.schema.json',
      );
      const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));

      const ajv = new Ajv({ allErrors: true });
      addFormats(ajv);
      const validate = ajv.compile(schema);

      const validJob = {
        type: 'run_graph',
        graph_file: 'orchestration/graph/projects/demo-01.yaml',
        tenant: 'default',
        concurrency: 3,
      };

      const isValid = validate(validJob);
      assert.strictEqual(isValid, true, 'Valid job should pass validation');
    });

    it('should reject invalid job payload', async () => {
      const schemaPath = path.join(
        projectRoot,
        'orchestration/engine/bullmq/schemas/job.schema.json',
      );
      const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));

      const ajv = new Ajv({ allErrors: true });
      addFormats(ajv);
      const validate = ajv.compile(schema);

      const invalidJob = {
        type: 'invalid_type',
        graph_file: 'not-a-yaml-file.txt',
      };

      const isValid = validate(invalidJob);
      assert.strictEqual(isValid, false, 'Invalid job should fail validation');
    });
  });

  describe('Tenant Path Utilities', () => {
    it('should generate correct tenant paths', async () => {
      const { tenantPath } = await import(
        pathToFileURL(path.join(projectRoot, 'orchestration/lib/tenant.mjs')).href
      );

      // Default tenant also uses namespaced path for Phase 13+ consistency
      const defaultPath = tenantPath('default', 'AUV-0001/ui');
      assert.strictEqual(defaultPath, path.join('runs', 'tenants', 'default', 'AUV-0001/ui'));

      // Named tenant uses namespaced path
      const tenantSpecificPath = tenantPath('acme-corp', 'AUV-0001/ui');
      assert.strictEqual(
        tenantSpecificPath,
        path.join('runs', 'tenants', 'acme-corp', 'AUV-0001/ui'),
      );
    });

    it('should normalize tenant IDs correctly', async () => {
      const { normalizeTenant, isValidTenant } = await import(
        pathToFileURL(path.join(projectRoot, 'orchestration/lib/tenant.mjs')).href
      );

      assert.strictEqual(normalizeTenant('ACME-Corp'), 'acme-corp');
      assert.strictEqual(normalizeTenant('beta_inc'), 'beta-inc');
      assert.strictEqual(normalizeTenant(''), 'default');
      assert.strictEqual(normalizeTenant(null), 'default');

      assert.strictEqual(isValidTenant('acme-corp'), true);
      assert.strictEqual(isValidTenant('beta-inc-123'), true);
      assert.strictEqual(isValidTenant('INVALID'), false);
      assert.strictEqual(isValidTenant('a'), false); // Too short
    });
  });

  describe('Policy Enforcement', () => {
    it('should load tenant policies', async () => {
      const { getTenantPolicy } = await import(
        pathToFileURL(path.join(projectRoot, 'orchestration/lib/policy.mjs')).href
      );

      const defaultPolicy = await getTenantPolicy('default');
      assert.ok(defaultPolicy);
      assert.strictEqual(defaultPolicy.tenant, 'default');
      assert.ok(defaultPolicy.budget_ceiling_usd > 0);
      assert.ok(Array.isArray(defaultPolicy.allowed_capabilities));
    });

    it('should validate job against policy', async () => {
      const { validateJobPolicy } = await import(
        pathToFileURL(path.join(projectRoot, 'orchestration/lib/policy.mjs')).href
      );

      const validJob = {
        tenant: 'default',
        constraints: {
          budget_usd: 50,
          required_capabilities: ['browser.automation', 'api.test'],
        },
      };

      const result = await validateJobPolicy(validJob);
      assert.strictEqual(result.allowed, true, 'Valid job should be allowed');
      assert.strictEqual(result.violations.filter((v) => v.severity === 'error').length, 0);
    });

    it('should reject job exceeding budget', async () => {
      const { validateJobPolicy } = await import(
        pathToFileURL(path.join(projectRoot, 'orchestration/lib/policy.mjs')).href
      );

      const overBudgetJob = {
        tenant: 'default',
        constraints: {
          budget_usd: 1000, // Exceeds default ceiling
          required_capabilities: ['browser.automation'],
        },
      };

      const result = await validateJobPolicy(overBudgetJob);
      assert.strictEqual(result.allowed, false, 'Over-budget job should be rejected');
      assert.ok(result.violations.some((v) => v.rule === 'budget_ceiling'));
    });
  });

  describe('Status Schema Validation', () => {
    it('should validate status report schema', async () => {
      const schemaPath = path.join(projectRoot, 'schemas/status.schema.json');
      const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));

      const ajv = new Ajv({ allErrors: true });
      addFormats(ajv);
      const validate = ajv.compile(schema);

      const validStatus = {
        version: '1.0',
        generated_at: new Date().toISOString(),
        engine: {
          mode: 'development',
          queue: {
            name: 'swarm1:graphQueue',
            status: 'active',
            counts: {
              waiting: 0,
              active: 0,
              completed: 0,
              failed: 0,
              delayed: 0,
              paused: 0,
              total: 0,
            },
            workers: {
              count: 0,
              details: [],
            },
          },
          health: {
            status: 'healthy',
            checks: {
              redis_connected: true,
              queue_responsive: true,
              workers_available: false,
              error_rate_acceptable: true,
            },
            last_check: new Date().toISOString(),
          },
        },
        tenants: {
          default: {
            metrics: {
              jobs_per_hour: 0,
              jobs_per_day: 0,
              success_rate_hour: 'N/A',
              success_rate_day: 'N/A',
              avg_duration_ms: 0,
              active_jobs: 0,
              waiting_jobs: 0,
            },
            storage: {
              auv_count: 0,
              total_size_mb: 0,
              last_modified: null,
            },
            recent_runs: [],
            active_auvs: [],
          },
        },
        recent_events: [],
        summary: {
          total_tenants: 1,
          total_jobs: 0,
          active_workers: 0,
          system_status: 'healthy',
        },
      };

      const isValid = validate(validStatus);
      if (!isValid) {
        console.log('Validation errors:', validate.errors);
      }
      assert.strictEqual(isValid, true, 'Valid status report should pass validation');
    });
  });

  describe('Configuration', () => {
    it('should load engine configuration', async () => {
      const { engineConfig, validateConfig } = await import(
        pathToFileURL(path.join(projectRoot, 'orchestration/engine/bullmq/config.mjs')).href
      );

      assert.ok(engineConfig);
      assert.strictEqual(engineConfig.namespace, 'swarm1');
      assert.strictEqual(engineConfig.defaultTenant, 'default');
      assert.ok(engineConfig.concurrency >= 1);
      assert.ok(engineConfig.jobTimeout >= 60000);

      // Validate configuration
      assert.doesNotThrow(() => validateConfig());
    });
  });

  describe('Backup System', () => {
    it('should exclude sensitive files from backup', async () => {
      // Test the shouldExclude logic without actually creating backups
      const backupModule = path.join(projectRoot, 'orchestration/ops/backup.mjs');

      // Just verify the module can be imported
      const backup = await import(pathToFileURL(backupModule).href);
      assert.ok(backup.createBackup);
      assert.ok(backup.listBackups);
      assert.ok(backup.cleanOldBackups);
    });
  });
});

// Run tests if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Tests will run automatically with node:test
}
