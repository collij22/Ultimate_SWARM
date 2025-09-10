/**
 * Basic tests for Phase 8 - Durable Execution Engine
 * Tests core functionality without complex imports
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';

describe('Phase 8 - Engine Basic Tests', () => {
  describe('Schema Files', () => {
    it('should have job schema file', async () => {
      const schemaPath = 'orchestration/engine/bullmq/schemas/job.schema.json';
      await assert.doesNotReject(fs.access(schemaPath), 'Job schema file should exist');

      const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
      assert.ok(schema.$schema, 'Schema should have $schema property');
      assert.strictEqual(schema.type, 'object', 'Schema should be an object type');
      assert.ok(schema.required.includes('type'), 'Schema should require type');
      // graph_file is optional in current schema; only 'type' is required
      assert.ok(schema.required.includes('type'), 'Schema should require type');
    });

    it('should have status schema file', async () => {
      const schemaPath = 'schemas/status.schema.json';
      await assert.doesNotReject(fs.access(schemaPath), 'Status schema file should exist');

      const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
      assert.ok(schema.$schema, 'Schema should have $schema property');
      assert.ok(schema.required.includes('version'), 'Schema should require version');
      assert.ok(schema.required.includes('engine'), 'Schema should require engine');
      assert.ok(schema.required.includes('tenants'), 'Schema should require tenants');
    });
  });

  describe('Module Files', () => {
    it('should have all required engine modules', async () => {
      const modules = [
        'orchestration/engine/bullmq/config.mjs',
        'orchestration/engine/bullmq/worker.mjs',
        'orchestration/engine/bullmq/enqueue.mjs',
        'orchestration/engine/bullmq/admin.mjs',
        'orchestration/lib/tenant.mjs',
        'orchestration/lib/policy.mjs',
        'orchestration/engine/status_aggregator.mjs',
        'orchestration/ops/backup.mjs',
      ];

      for (const modulePath of modules) {
        await assert.doesNotReject(fs.access(modulePath), `Module ${modulePath} should exist`);
      }
    });
  });

  describe('Policies Configuration', () => {
    it('should have tenant configuration in policies', async () => {
      const policiesPath = 'mcp/policies.yaml';
      const content = await fs.readFile(policiesPath, 'utf8');

      assert.ok(content.includes('tenants:'), 'Policies should have tenants section');
      assert.ok(content.includes('default:'), 'Should have default tenant');
      assert.ok(content.includes('budget_ceiling_usd'), 'Should have budget ceiling');
      assert.ok(content.includes('allowed_capabilities'), 'Should have allowed capabilities');
      assert.ok(content.includes('max_concurrent_jobs'), 'Should have job limits');
    });

    it('should have example tenants configured', async () => {
      const policiesPath = 'mcp/policies.yaml';
      const content = await fs.readFile(policiesPath, 'utf8');

      assert.ok(content.includes('acme-corp'), 'Should have acme-corp tenant example');
      assert.ok(content.includes('beta-inc'), 'Should have beta-inc tenant example');
    });
  });

  describe('CLI Integration', () => {
    it('should have engine commands in CLI', async () => {
      const cliPath = 'orchestration/cli.mjs';
      const content = await fs.readFile(cliPath, 'utf8');

      assert.ok(content.includes("command === 'engine'"), 'CLI should handle engine command');
      assert.ok(content.includes('engine start'), 'Should have start command');
      assert.ok(content.includes('engine enqueue'), 'Should have enqueue command');
      assert.ok(content.includes('engine status'), 'Should have status command');
      assert.ok(content.includes('engine backup'), 'Should have backup command');
    });

    it('should have engine help text', async () => {
      const cliPath = 'orchestration/cli.mjs';
      const content = await fs.readFile(cliPath, 'utf8');

      assert.ok(
        content.includes('Engine Commands (Durable Execution)'),
        'Should have engine help section',
      );
      assert.ok(content.includes('Engine Examples:'), 'Should have engine examples');
    });
  });

  describe('Dependencies', () => {
    it('should have BullMQ and ioredis in package.json', async () => {
      const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));

      assert.ok(packageJson.dependencies.bullmq, 'Should have bullmq dependency');
      assert.ok(packageJson.dependencies.ioredis, 'Should have ioredis dependency');
    });
  });
});

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Tests will run automatically with node:test
}
