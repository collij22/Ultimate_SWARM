/**
 * Data Insights Executor - Deterministic insights generation
 * Analyzes normalized data and produces insights.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { tenantPath } from '../tenant.mjs';

/**
 * Calculate insights from normalized data
 */
function generateInsights(data) {
  // Category analysis
  const categoryStats = {};
  const regionStats = {};
  const paymentMethodStats = {};
  let totalRevenue = 0;
  let totalQuantity = 0;

  data.forEach((row) => {
    // Category aggregation
    const category = row.category || 'Unknown';
    if (!categoryStats[category]) {
      categoryStats[category] = {
        count: 0,
        revenue: 0,
        quantity: 0,
      };
    }
    categoryStats[category].count++;
    categoryStats[category].revenue += row.total_amount || 0;
    categoryStats[category].quantity += row.quantity || 0;

    // Region aggregation
    const region = row.region || 'Unknown';
    if (!regionStats[region]) {
      regionStats[region] = {
        count: 0,
        revenue: 0,
      };
    }
    regionStats[region].count++;
    regionStats[region].revenue += row.total_amount || 0;

    // Payment method aggregation
    const payment = row.payment_method || 'Unknown';
    if (!paymentMethodStats[payment]) {
      paymentMethodStats[payment] = {
        count: 0,
        revenue: 0,
      };
    }
    paymentMethodStats[payment].count++;
    paymentMethodStats[payment].revenue += row.total_amount || 0;

    // Totals
    totalRevenue += row.total_amount || 0;
    totalQuantity += row.quantity || 0;
  });

  // Sort categories by revenue (deterministic)
  const topCategories = Object.entries(categoryStats)
    .map(([name, stats]) => ({
      name,
      revenue: stats.revenue,
      count: stats.count,
      quantity: stats.quantity,
      avg_order_value: stats.revenue / stats.count,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  // Calculate metrics
  const metrics = [
    {
      name: 'total_revenue',
      value: totalRevenue,
      unit: 'USD',
      description: 'Total revenue across all orders',
    },
    {
      name: 'average_order_value',
      value: totalRevenue / data.length,
      unit: 'USD',
      description: 'Average revenue per order',
    },
    {
      name: 'total_orders',
      value: data.length,
      unit: 'count',
      description: 'Total number of orders',
    },
    {
      name: 'total_items_sold',
      value: totalQuantity,
      unit: 'count',
      description: 'Total quantity of items sold',
    },
    {
      name: 'top_category_revenue',
      value: topCategories[0]?.revenue || 0,
      unit: 'USD',
      description: `Revenue from top category: ${topCategories[0]?.name || 'N/A'}`,
    },
  ];

  return {
    version: '1.0',
    generated_at: new Date().toISOString(),
    summary: {
      row_count: data.length,
      total_revenue: totalRevenue,
      average_order_value: totalRevenue / data.length,
      unique_categories: Object.keys(categoryStats).length,
      unique_regions: Object.keys(regionStats).length,
    },
    top_categories: topCategories,
    metrics: metrics,
    breakdowns: {
      by_category: categoryStats,
      by_region: regionStats,
      by_payment_method: paymentMethodStats,
    },
  };
}

/**
 * Execute insights generation
 * @param {Object} params - Execution parameters
 * @param {string} params.tenant - Tenant ID (default: 'default')
 * @param {string} params.runId - Run ID for this execution
 * @returns {Object} Result with status and artifacts
 */
export async function executeDataInsights(params) {
  const { tenant = 'default', runId } = params;

  // Find normalized data from previous step
  const dataDir = tenantPath(tenant, runId ? `${runId}/data` : 'data');
  const normalizedPath = path.join(dataDir, 'processed', 'normalized.json');

  if (!fs.existsSync(normalizedPath)) {
    throw new Error(`Normalized data not found at: ${normalizedPath}. Run data.ingest first.`);
  }

  console.log(`[data.insights] Reading normalized data from: ${normalizedPath}`);

  // Load normalized data
  const normalizedContent = JSON.parse(fs.readFileSync(normalizedPath, 'utf-8'));
  const { data, metadata } = normalizedContent;

  console.log(`[data.insights] Analyzing ${data.length} rows`);

  // Generate insights
  const insights = generateInsights(data);

  // Add source metadata
  insights.source = {
    file: 'processed/normalized.json',
    row_count: metadata.row_count,
    ingested_at: metadata.ingested_at,
  };

  // Write insights
  const insightsPath = path.join(dataDir, 'insights.json');
  fs.writeFileSync(insightsPath, JSON.stringify(insights, null, 2));

  console.log(`[data.insights] Generated ${insights.metrics.length} metrics`);
  console.log(
    `[data.insights] Top categories: ${insights.top_categories.map((c) => c.name).join(', ')}`,
  );
  console.log(`[data.insights] Insights written to: ${insightsPath}`);

  return {
    status: 'success',
    message: `Generated insights for ${data.length} rows`,
    artifacts: [insightsPath],
    metadata: {
      metric_count: insights.metrics.length,
      top_category: insights.top_categories[0]?.name,
      total_revenue: insights.summary.total_revenue,
    },
  };
}
