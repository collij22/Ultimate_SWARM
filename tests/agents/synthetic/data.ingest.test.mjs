import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { validateInsights } from '../../../orchestration/lib/data_validator.mjs';

const TEST_DIR = 'test-synthetic-data';

test('data.ingest fast-tier: emits row_count.json', async (t) => {
  // Setup
  await t.before(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
    await mkdir(TEST_DIR, { recursive: true });
    await mkdir(path.join(TEST_DIR, 'data', 'raw'), { recursive: true });
  });

  // Cleanup
  await t.after(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  await t.test('simulates data ingestion and insights generation', async () => {
    // 1. Create synthetic input data
    const csvData = `id,product,category,amount,date
1,Widget A,Electronics,99.99,2024-01-01
2,Gadget B,Electronics,149.99,2024-01-02
3,Tool C,Hardware,49.99,2024-01-03
4,Widget D,Electronics,79.99,2024-01-04
5,Gadget E,Electronics,199.99,2024-01-05`;

    const inputPath = path.join(TEST_DIR, 'data', 'raw', 'sales.csv');
    await writeFile(inputPath, csvData);

    // 2. Simulate data processing (normally done by DuckDB)
    const rows = csvData.split('\n').slice(1); // Skip header
    const data = rows.map((row) => {
      const [id, product, category, amount, date] = row.split(',');
      return { id, product, category, amount: parseFloat(amount), date };
    });

    // 3. Compute metrics
    const totalRevenue = data.reduce((sum, row) => sum + row.amount, 0);
    const avgOrderValue = totalRevenue / data.length;
    const categories = [...new Set(data.map((r) => r.category))];

    // 4. Generate insights.json with real checksum
    const hash = createHash('sha256');
    hash.update(csvData);
    const realChecksum = hash.digest('hex');

    const insights = {
      version: '1.0',
      generated_at: new Date().toISOString(),
      data_row_count: data.length,
      source_manifest: [
        {
          path: 'data/raw/sales.csv',
          sha256: realChecksum,
          size: csvData.length,
        },
      ],
      metrics: [
        {
          id: 'total_revenue',
          label: 'Total Revenue',
          value: totalRevenue,
          unit: 'USD',
          category: 'financial',
        },
        {
          id: 'avg_order_value',
          label: 'Average Order Value',
          value: avgOrderValue,
          unit: 'USD',
          category: 'financial',
        },
        {
          id: 'unique_categories',
          label: 'Product Categories',
          value: categories.length,
          category: 'inventory',
        },
      ],
      dimensions: ['product', 'category', 'date'],
      findings: [
        `Processed ${data.length} sales records`,
        `Electronics category dominates with ${data.filter((r) => r.category === 'Electronics').length} items`,
        `Average order value is $${avgOrderValue.toFixed(2)}`,
      ],
      aggregations: {
        by_category: {
          Electronics: {
            count: data.filter((r) => r.category === 'Electronics').length,
            sum: data
              .filter((r) => r.category === 'Electronics')
              .reduce((sum, r) => sum + r.amount, 0),
          },
          Hardware: {
            count: data.filter((r) => r.category === 'Hardware').length,
            sum: data
              .filter((r) => r.category === 'Hardware')
              .reduce((sum, r) => sum + r.amount, 0),
          },
        },
      },
    };

    const insightsPath = path.join(TEST_DIR, 'insights.json');
    await writeFile(insightsPath, JSON.stringify(insights, null, 2));

    // 5. Validate the generated insights
    const validation = await validateInsights(insightsPath, {
      minRows: 5,
      basePath: TEST_DIR,
    });

    assert.equal(validation.valid, true, 'Insights should be valid');
    assert.equal(validation.schemaValid, true, 'Schema should be valid');
    assert.equal(validation.rowCountValid, true, 'Row count should meet threshold');
    assert.equal(validation.metricsValid, true, 'Metrics should be present');
    assert.equal(insights.data_row_count, 5, 'Should have 5 data rows');
    assert.equal(insights.metrics.length, 3, 'Should have 3 metrics');
    assert.ok(insights.metrics[0].value > 0, 'Total revenue should be positive');
  });

  await t.test('validates required metrics enforcement', async () => {
    const insights = {
      version: '1.0',
      generated_at: new Date().toISOString(),
      data_row_count: 100,
      metrics: [{ id: 'metric_a', value: 100 }],
    };

    const insightsPath = path.join(TEST_DIR, 'minimal.json');
    await writeFile(insightsPath, JSON.stringify(insights));

    const validation = await validateInsights(insightsPath, {
      requiredMetrics: ['metric_a', 'metric_b'],
    });

    assert.equal(validation.valid, false, 'Should fail with missing required metric');
    assert.ok(
      validation.errors.some((e) => e.includes('Missing required metrics')),
      'Should report missing metrics',
    );
  });
});
