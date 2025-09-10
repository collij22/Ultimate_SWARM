/**
 * Unit test for demo_runbook module
 * Ensures runbook generation only happens for demo AUVs in demo/test mode
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateDemoRunbook } from '../../orchestration/lib/demo_runbook.mjs';

describe('Demo Runbook Unit Tests', () => {
  const originalEnv = {};

  beforeEach(() => {
    // Save original environment variables
    originalEnv.DEMO_MODE = process.env.DEMO_MODE;
    originalEnv.TEST_MODE = process.env.TEST_MODE;
  });

  afterEach(() => {
    // Restore original environment variables
    process.env.DEMO_MODE = originalEnv.DEMO_MODE;
    process.env.TEST_MODE = originalEnv.TEST_MODE;

    // Clean up any generated files
    const runbookPath = path.resolve('runs/AUV-1201/result-cards/runbook-summary.json');
    if (fs.existsSync(runbookPath)) {
      fs.unlinkSync(runbookPath);
    }
  });

  it('should do nothing when DEMO_MODE and TEST_MODE are both false', async () => {
    delete process.env.DEMO_MODE;
    delete process.env.TEST_MODE;

    const result = await generateDemoRunbook({
      auvId: 'AUV-1201',
      tenant: 'default',
      runId: 'test-run',
      steps: ['data.ingest', 'data.insights'],
    });

    assert.equal(result.status, 'skipped');
    assert.ok(result.message.includes('Not a demo AUV or not in demo mode'));

    // Verify no file was created
    const runbookPath = path.resolve('runs/AUV-1201/result-cards/runbook-summary.json');
    assert.ok(!fs.existsSync(runbookPath), 'Should not create runbook file');
  });

  it('should do nothing for non-demo AUVs even in DEMO_MODE', async () => {
    process.env.DEMO_MODE = 'true';

    const result = await generateDemoRunbook({
      auvId: 'AUV-0001', // Not a demo AUV
      tenant: 'default',
      runId: 'test-run',
      steps: ['some.task'],
    });

    assert.equal(result.status, 'skipped');
    assert.ok(result.message.includes('Not a demo AUV or not in demo mode'));
  });

  it('should generate runbook for AUV-1201 in DEMO_MODE', async () => {
    process.env.DEMO_MODE = 'true';

    const result = await generateDemoRunbook({
      auvId: 'AUV-1201',
      tenant: 'default',
      runId: 'test-run',
      steps: ['data.ingest', 'data.insights', 'chart.render'],
    });

    assert.equal(result.status, 'success');
    assert.ok(result.message.includes('Demo runbook generated'));
    assert.ok(result.artifacts.length > 0);

    // Verify file was created
    const runbookPath = result.artifacts[0];
    assert.ok(fs.existsSync(runbookPath), 'Should create runbook file');

    // Verify content
    const runbook = JSON.parse(fs.readFileSync(runbookPath, 'utf-8'));
    assert.equal(runbook.auv_id, 'AUV-1201');
    assert.equal(runbook.steps.length, 3);
    assert.ok(runbook.description.includes('Data-to-Video Analytics Pipeline'));
  });

  it('should generate runbook for AUV-1202 in TEST_MODE', async () => {
    delete process.env.DEMO_MODE;
    process.env.TEST_MODE = 'true';

    const result = await generateDemoRunbook({
      auvId: 'AUV-1202',
      tenant: 'default',
      runId: 'test-run',
      steps: ['web.search', 'seo.audit', 'doc.generate'],
    });

    assert.equal(result.status, 'success');
    assert.ok(result.message.includes('Demo runbook generated'));

    // Verify file was created with correct content
    const runbookPath = result.artifacts[0];
    const runbook = JSON.parse(fs.readFileSync(runbookPath, 'utf-8'));
    assert.equal(runbook.auv_id, 'AUV-1202');
    assert.ok(runbook.description.includes('SEO Audit and Reporting Pipeline'));
  });

  it('should only process AUV-1201 and AUV-1202', async () => {
    process.env.DEMO_MODE = 'true';

    const demoAuvs = ['AUV-1201', 'AUV-1202'];
    const nonDemoAuvs = ['AUV-0001', 'AUV-0002', 'AUV-0003', 'AUV-1203', 'AUV-9999'];

    // Test all demo AUVs succeed
    for (const auvId of demoAuvs) {
      const result = await generateDemoRunbook({
        auvId,
        tenant: 'default',
        runId: 'test-run',
        steps: ['test.step'],
      });
      assert.equal(result.status, 'success', `${auvId} should generate runbook`);
    }

    // Test all non-demo AUVs are skipped
    for (const auvId of nonDemoAuvs) {
      const result = await generateDemoRunbook({
        auvId,
        tenant: 'default',
        runId: 'test-run',
        steps: ['test.step'],
      });
      assert.equal(result.status, 'skipped', `${auvId} should be skipped`);
    }
  });

  it('should handle missing steps gracefully', async () => {
    process.env.TEST_MODE = 'true';

    const result = await generateDemoRunbook({
      auvId: 'AUV-1201',
      tenant: 'default',
      runId: 'test-run',
      // No steps provided - should use defaults
    });

    assert.equal(result.status, 'success');
    const runbookPath = result.artifacts[0];
    const runbook = JSON.parse(fs.readFileSync(runbookPath, 'utf-8'));
    // When no steps provided, should use default steps for AUV-1201
    assert.equal(runbook.steps.length, 5, 'Should use default steps when none provided');
    assert.equal(runbook.steps[0].name, 'data.ingest');
    assert.equal(runbook.steps[4].name, 'video.compose');
  });
});
