#!/usr/bin/env node
/**
 * Unit tests for tool executor (Phase 13)
 * Verifies that all Secondary tools use tenant-scoped paths
 */

import { strict as assert } from 'assert';
import { test, describe, beforeEach } from 'node:test';
import { executeToolRequest } from '../../orchestration/lib/tool_executor.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Tool Executor Tenant Paths', () => {
  const tenant = 'test-tenant';
  const runId = 'test-run-123';

  beforeEach(() => {
    // Clean up test artifacts
    const tenantDir = path.join(__dirname, '../../runs/tenants', tenant);
    if (fs.existsSync(tenantDir)) {
      fs.rmSync(tenantDir, { recursive: true, force: true });
    }
  });

  test('should write web.crawl artifacts to tenant path', async () => {
    process.env.TEST_MODE = 'true';

    const result = await executeToolRequest({
      tenant,
      runId,
      toolRequest: {
        capability: 'web.crawl',
        input_spec: {
          url: 'http://example.com',
          max_pages: 10,
          depth: 2,
        },
      },
      selectedTools: [{ tool_id: 'firecrawl', capabilities: ['web.crawl'] }],
    });

    assert.ok(result.artifacts, 'Should return artifacts');
    assert.ok(result.artifacts.length > 0, 'Should have at least one artifact');

    // Verify all artifacts are in tenant path
    for (const artifact of result.artifacts) {
      assert.ok(
        artifact.includes(`runs/tenants/${tenant}/crawl_demo`),
        `Artifact ${artifact} should be in tenant path`,
      );
      assert.ok(fs.existsSync(artifact), `Artifact ${artifact} should exist`);
    }
  });

  test('should write payments.test artifacts to tenant path', async () => {
    process.env.TEST_MODE = 'true';

    const result = await executeToolRequest({
      tenant,
      runId,
      toolRequest: {
        capability: 'payments.test',
        input_spec: {
          amount: 2999,
          currency: 'usd',
        },
      },
      selectedTools: [{ tool_id: 'stripe', capabilities: ['payments.test'] }],
    });

    assert.ok(result.artifacts, 'Should return artifacts');
    assert.ok(result.artifacts.length > 0, 'Should have at least one artifact');

    // Verify all artifacts are in tenant path
    for (const artifact of result.artifacts) {
      assert.ok(
        artifact.includes(`runs/tenants/${tenant}/payments_demo`),
        `Artifact ${artifact} should be in tenant path`,
      );
      assert.ok(fs.existsSync(artifact), `Artifact ${artifact} should exist`);
    }

    // Verify payment_intent.json was created
    const paymentIntentPath = result.artifacts.find((a) => a.includes('payment_intent.json'));
    assert.ok(paymentIntentPath, 'Should create payment_intent.json');
    const paymentIntent = JSON.parse(fs.readFileSync(paymentIntentPath, 'utf8'));
    assert.equal(paymentIntent.amount, 2999, 'Should have correct amount');
    assert.equal(paymentIntent.status, 'succeeded', 'Should have succeeded status');
  });

  test('should write cloud.db artifacts to tenant path', async () => {
    process.env.TEST_MODE = 'true';

    const result = await executeToolRequest({
      tenant,
      runId,
      toolRequest: {
        capability: 'cloud.db',
        input_spec: {
          operation: 'create_schema',
          schema_name: 'test_schema',
          tables: [{ name: 'users', columns: ['id', 'name', 'email'] }],
        },
      },
      selectedTools: [{ tool_id: 'supabase', capabilities: ['cloud.db'] }],
    });

    assert.ok(result.artifacts, 'Should return artifacts');
    assert.ok(result.artifacts.length >= 3, 'Should have at least 3 artifacts');

    // Verify all artifacts are in tenant path
    for (const artifact of result.artifacts) {
      assert.ok(
        artifact.includes(`runs/tenants/${tenant}/db_demo`),
        `Artifact ${artifact} should be in tenant path`,
      );
      assert.ok(fs.existsSync(artifact), `Artifact ${artifact} should exist`);
    }

    // Verify schema.json was created for create_schema operation
    const schemaPath = result.artifacts.find((a) => a.includes('schema.json'));
    assert.ok(schemaPath, 'Should create schema.json for create_schema operation');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assert.equal(schema.name, 'test_schema', 'Should have correct schema name');
    assert.ok(Array.isArray(schema.tables), 'Should have tables array');
  });

  test('should write audio.tts.cloud artifacts to tenant path', async () => {
    process.env.TEST_MODE = 'true';

    const result = await executeToolRequest({
      tenant,
      runId,
      toolRequest: {
        capability: 'audio.tts.cloud',
        input_spec: {
          text: 'Hello world',
          voice: 'en-US-Standard-A',
        },
      },
      selectedTools: [{ tool_id: 'tts-cloud', capabilities: ['audio.tts.cloud'] }],
    });

    assert.ok(result.artifacts, 'Should return artifacts');
    assert.equal(result.artifacts.length, 1, 'Should have exactly one artifact');

    // Verify artifact is in tenant path
    const wavPath = result.artifacts[0];
    assert.ok(
      wavPath.includes(`runs/tenants/${tenant}/tts_cloud_demo`),
      `Artifact ${wavPath} should be in tenant path`,
    );
    assert.ok(fs.existsSync(wavPath), `Artifact ${wavPath} should exist`);

    // Verify it's a valid WAV file (starts with RIFF)
    const buffer = fs.readFileSync(wavPath);
    assert.equal(buffer.toString('utf8', 0, 4), 'RIFF', 'Should be a valid WAV file');
  });

  test('should cache results with same input', async () => {
    process.env.TEST_MODE = 'true';

    const params = {
      tenant,
      runId,
      toolRequest: {
        capability: 'web.crawl',
        input_spec: {
          url: 'http://example.com',
          max_pages: 5,
        },
      },
      selectedTools: [{ tool_id: 'firecrawl', capabilities: ['web.crawl'] }],
    };

    const result1 = await executeToolRequest(params);
    assert.ok(!result1.cached, 'First call should not be cached');

    const result2 = await executeToolRequest(params);
    assert.ok(result2.cached, 'Second call should be cached');
    assert.deepEqual(result2.artifacts, result1.artifacts, 'Cached results should match');
  });
});
