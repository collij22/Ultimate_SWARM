#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import {
  validateInsights,
  extractMetricsSummary,
} from '../../orchestration/lib/data_validator.mjs';

const TEST_DIR = 'test-temp-data-validator';

test('data_validator', async (t) => {
  // Setup test directory
  await t.before(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
    await mkdir(TEST_DIR, { recursive: true });
  });

  // Cleanup
  await t.after(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  await t.test('validates valid insights.json', async () => {
    const validInsights = {
      version: '1.0',
      generated_at: new Date().toISOString(),
      data_row_count: 150,
      metrics: [
        { id: 'revenue', value: 50000, unit: 'USD', label: 'Total Revenue' },
        { id: 'conversion', value: 3.5, unit: '%', label: 'Conversion Rate' },
      ],
      dimensions: ['product', 'region'],
      findings: ['Revenue increased by 20%'],
      aggregations: {
        products: { count: 50, sum: 50000 },
      },
    };

    const insightsPath = path.join(TEST_DIR, 'insights.json');
    await writeFile(insightsPath, JSON.stringify(validInsights, null, 2));

    const result = await validateInsights(insightsPath);

    assert.equal(result.valid, true);
    assert.equal(result.schemaValid, true);
    assert.equal(result.rowCountValid, true);
    assert.equal(result.metricsValid, true);
    assert.equal(result.data.data_row_count, 150);
  });

  await t.test('fails on missing file', async () => {
    const result = await validateInsights('non-existent.json');

    assert.equal(result.valid, false);
    assert.equal(result.errors.length > 0, true);
    assert.equal(result.errors[0].includes('not found'), true);
  });

  await t.test('fails on invalid schema', async () => {
    const invalidInsights = {
      version: '2.0', // Wrong version
      data_row_count: 'not-a-number', // Wrong type
    };

    const insightsPath = path.join(TEST_DIR, 'invalid.json');
    await writeFile(insightsPath, JSON.stringify(invalidInsights));

    const result = await validateInsights(insightsPath);

    assert.equal(result.valid, false);
    assert.equal(result.schemaValid, false);
    assert.equal(
      result.errors.some((e) => e.includes('Schema validation failed')),
      true,
    );
  });

  await t.test('fails on row count below threshold', async () => {
    const lowRowInsights = {
      version: '1.0',
      generated_at: new Date().toISOString(),
      data_row_count: 50, // Below default minimum of 100
      metrics: [{ id: 'test', value: 1 }],
    };

    const insightsPath = path.join(TEST_DIR, 'low-rows.json');
    await writeFile(insightsPath, JSON.stringify(lowRowInsights, null, 2));

    const result = await validateInsights(insightsPath, { minRows: 100 });

    assert.equal(result.valid, false);
    assert.equal(result.rowCountValid, false);
    assert.equal(
      result.errors.some((e) => e.includes('below minimum')),
      true,
    );
  });

  await t.test('validates required metrics', async () => {
    const insights = {
      version: '1.0',
      generated_at: new Date().toISOString(),
      data_row_count: 150,
      metrics: [
        { id: 'revenue', value: 50000 },
        { id: 'users', value: 1000 },
      ],
    };

    const insightsPath = path.join(TEST_DIR, 'metrics.json');
    await writeFile(insightsPath, JSON.stringify(insights, null, 2));

    // Should pass with correct required metrics
    const result1 = await validateInsights(insightsPath, {
      requiredMetrics: ['revenue', 'users'],
    });
    assert.equal(result1.valid, true);

    // Should fail with missing required metric
    const result2 = await validateInsights(insightsPath, {
      requiredMetrics: ['revenue', 'conversion'],
    });
    assert.equal(result2.valid, false);
    assert.equal(
      result2.errors.some((e) => e.includes('Missing required metrics')),
      true,
    );
  });

  await t.test('validates source manifest checksums', async () => {
    // Create a test file for checksum validation
    const testFile = path.join(TEST_DIR, 'data.csv');
    await writeFile(testFile, 'id,value\n1,100\n2,200');

    const insights = {
      version: '1.0',
      generated_at: new Date().toISOString(),
      data_row_count: 2,
      metrics: [{ id: 'sum', value: 300 }],
      source_manifest: [
        {
          path: 'data.csv',
          sha256: 'invalid-checksum', // Wrong checksum
          size: 100,
        },
      ],
    };

    const insightsPath = path.join(TEST_DIR, 'manifest.json');
    await writeFile(insightsPath, JSON.stringify(insights, null, 2));

    const result = await validateInsights(insightsPath, { basePath: TEST_DIR });

    assert.equal(result.valid, false);
    assert.equal(result.checksumValid, false);
    assert.equal(
      result.errors.some((e) => e.includes('checksum validation failed')),
      true,
    );
  });

  await t.test('extracts metrics summary correctly', async () => {
    const insights = {
      data_row_count: 1000,
      metrics: [
        { id: 'revenue', label: 'Revenue', value: 50000, unit: 'USD', category: 'financial' },
        { id: 'users', label: 'Active Users', value: 1500, category: 'engagement' },
        { id: 'conversion', value: 3.5, unit: '%', category: 'financial' },
      ],
    };

    const summary = extractMetricsSummary(insights);

    assert.equal(summary.rowCount, 1000);
    assert.equal(summary.metricCount, 3);
    assert.equal(summary.categories.financial.length, 2);
    assert.equal(summary.categories.engagement.length, 1);
    assert.equal(summary.topMetrics.length, 3);
    assert.equal(summary.topMetrics[0].label, 'Revenue');
  });

  await t.test('handles empty metrics gracefully', async () => {
    const insights = {
      version: '1.0',
      generated_at: new Date().toISOString(),
      data_row_count: 100,
      metrics: [],
    };

    const insightsPath = path.join(TEST_DIR, 'empty-metrics.json');
    await writeFile(insightsPath, JSON.stringify(insights, null, 2));

    const result = await validateInsights(insightsPath);

    assert.equal(result.valid, false);
    assert.equal(result.metricsValid, false);
    assert.equal(
      result.errors.some((e) => e.includes('No metrics found')),
      true,
    );
  });

  await t.test('adds warnings for missing aggregations', async () => {
    const insights = {
      version: '1.0',
      generated_at: new Date().toISOString(),
      data_row_count: 150,
      metrics: [{ id: 'test', value: 1 }],
      // No aggregations or findings
    };

    const insightsPath = path.join(TEST_DIR, 'no-aggregations.json');
    await writeFile(insightsPath, JSON.stringify(insights, null, 2));

    const result = await validateInsights(insightsPath);

    assert.equal(result.valid, true);
    assert.equal(result.warnings.length > 0, true);
    assert.equal(
      result.warnings.some((w) => w.includes('No aggregations')),
      true,
    );
    assert.equal(
      result.warnings.some((w) => w.includes('No findings')),
      true,
    );
  });
});
