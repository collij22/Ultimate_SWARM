/**
 * Swarm1 — Performance Budget Evaluator
 *
 * Evaluates Lighthouse metrics against defined performance budgets.
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export class BudgetEvaluator {
  constructor() {
    this.violations = [];
    this.warnings = [];
  }

  /**
   * Load performance budgets from AUV capability config
   */
  async loadBudgets(auvId) {
    const configPath = path.join(process.cwd(), 'capabilities', `${auvId}.yaml`);

    if (!fs.existsSync(configPath)) {
      console.log(`[budget-evaluator] No config found for ${auvId}`);
      return null;
    }

    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = yaml.load(content);

      if (!config.perf_budgets) {
        console.log(`[budget-evaluator] No performance budgets defined for ${auvId}`);
        return null;
      }

      return config.perf_budgets;
    } catch (error) {
      console.error(`[budget-evaluator] Error loading config: ${error.message}`);
      return null;
    }
  }

  /**
   * Load Lighthouse results
   */
  async loadLighthouseResults(auvId) {
    const lighthousePath = path.join(process.cwd(), 'runs', auvId, 'perf', 'lighthouse.json');

    if (!fs.existsSync(lighthousePath)) {
      throw new Error(`Lighthouse results not found: ${lighthousePath}`);
    }

    try {
      const content = fs.readFileSync(lighthousePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse Lighthouse results: ${error.message}`);
    }
  }

  /**
   * Extract relevant metrics from Lighthouse report
   */
  extractMetrics(lighthouseData) {
    const audits = lighthouseData.audits || {};

    const metrics = {
      lcp_ms: audits['largest-contentful-paint']?.numericValue || 0,
      tti_ms: audits['interactive']?.numericValue || 0,
      cls: audits['cumulative-layout-shift']?.numericValue || 0,
      fcp_ms: audits['first-contentful-paint']?.numericValue || 0,
      tbt_ms: audits['total-blocking-time']?.numericValue || 0,
      si_ms: audits['speed-index']?.numericValue || 0,
    };

    // Calculate total size from network requests
    if (lighthouseData.audits['network-requests']) {
      const requests = lighthouseData.audits['network-requests'].details?.items || [];
      const totalBytes = requests.reduce((sum, req) => sum + (req.transferSize || 0), 0);
      metrics.size_kb = Math.round(totalBytes / 1024);
    }

    // Add performance score
    metrics.score = lighthouseData.categories?.performance?.score || 0;

    return metrics;
  }

  /**
   * Evaluate metrics against budgets
   */
  evaluate(metrics, budgets) {
    const results = {
      passed: true,
      violations: [],
      warnings: [],
      metrics: {},
      budgets: {},
    };

    // Check each budget constraint
    for (const [key, budget] of Object.entries(budgets)) {
      const actual = metrics[key];

      if (actual === undefined) {
        console.log(`[budget-evaluator] Metric '${key}' not found in Lighthouse results`);
        continue;
      }

      results.metrics[key] = actual;
      results.budgets[key] = budget;

      // Determine if budget is exceeded
      let exceeded = false;
      let percentOver = 0;

      if (key === 'cls' || key === 'score') {
        // For CLS and score, lower is better (except score where higher is better)
        if (key === 'score') {
          exceeded = actual < budget;
          percentOver = budget > 0 ? ((budget - actual) / budget) * 100 : 0;
        } else {
          exceeded = actual > budget;
          percentOver = budget > 0 ? ((actual - budget) / budget) * 100 : 0;
        }
      } else {
        // For time-based metrics and size, lower is better
        exceeded = actual > budget;
        percentOver = budget > 0 ? ((actual - budget) / budget) * 100 : 0;
      }

      if (exceeded) {
        const violation = {
          metric: key,
          actual,
          budget,
          percentOver: parseFloat(percentOver.toFixed(2)),
          severity: percentOver > 20 ? 'high' : 'medium',
        };

        if (violation.severity === 'high') {
          results.violations.push(violation);
          results.passed = false;
        } else {
          results.warnings.push(violation);
        }
      }
    }

    return results;
  }

  /**
   * Generate a human-readable summary
   */
  generateSummary(results, auvId) {
    const summary = {
      auv_id: auvId,
      timestamp: new Date().toISOString(),
      passed: results.passed,
      metrics: results.metrics,
      budgets: results.budgets,
      violations: results.violations,
      warnings: results.warnings,
      summary_text: [],
    };

    // Add summary text
    if (results.passed) {
      summary.summary_text.push('✓ All performance budgets met');
    } else {
      summary.summary_text.push(`✗ ${results.violations.length} budget violation(s)`);
    }

    // Detail violations
    for (const violation of results.violations) {
      const metricName = this.getMetricDisplayName(violation.metric);
      const formatted = this.formatMetricValue(violation.metric, violation.actual);
      const budget = this.formatMetricValue(violation.metric, violation.budget);
      summary.summary_text.push(
        `  - ${metricName}: ${formatted} (budget: ${budget}, +${violation.percentOver}%)`,
      );
    }

    // Detail warnings
    if (results.warnings.length > 0) {
      summary.summary_text.push(`⚠ ${results.warnings.length} warning(s)`);
      for (const warning of results.warnings) {
        const metricName = this.getMetricDisplayName(warning.metric);
        const formatted = this.formatMetricValue(warning.metric, warning.actual);
        const budget = this.formatMetricValue(warning.metric, warning.budget);
        summary.summary_text.push(
          `  - ${metricName}: ${formatted} (budget: ${budget}, +${warning.percentOver}%)`,
        );
      }
    }

    return summary;
  }

  /**
   * Get display name for metric
   */
  getMetricDisplayName(metric) {
    const names = {
      lcp_ms: 'Largest Contentful Paint',
      tti_ms: 'Time to Interactive',
      cls: 'Cumulative Layout Shift',
      fcp_ms: 'First Contentful Paint',
      tbt_ms: 'Total Blocking Time',
      si_ms: 'Speed Index',
      size_kb: 'Total Size',
      score: 'Performance Score',
    };
    return names[metric] || metric;
  }

  /**
   * Format metric value for display
   */
  formatMetricValue(metric, value) {
    if (metric.endsWith('_ms')) {
      // Convert milliseconds to seconds for readability
      return `${(value / 1000).toFixed(2)}s`;
    } else if (metric === 'size_kb') {
      return `${value}KB`;
    } else if (metric === 'cls') {
      return value.toFixed(3);
    } else if (metric === 'score') {
      return `${(value * 100).toFixed(0)}%`;
    }
    return value;
  }

  /**
   * Main evaluation function
   */
  async evaluateAuv(auvId) {
    try {
      // Load budgets
      const budgets = await this.loadBudgets(auvId);
      if (!budgets) {
        return {
          passed: true,
          message: 'No performance budgets defined',
          skipped: true,
        };
      }

      // Load Lighthouse results
      const lighthouseData = await this.loadLighthouseResults(auvId);

      // Extract metrics
      const metrics = this.extractMetrics(lighthouseData);

      // Evaluate against budgets
      const results = this.evaluate(metrics, budgets);

      // Generate summary
      const summary = this.generateSummary(results, auvId);

      // Save summary
      const summaryPath = path.join(process.cwd(), 'runs', auvId, 'perf', 'budget-evaluation.json');
      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

      // Log results
      console.log(`[budget-evaluator] ${auvId}:`);
      summary.summary_text.forEach((line) => console.log(`  ${line}`));

      return summary;
    } catch (error) {
      console.error(`[budget-evaluator] Error: ${error.message}`);
      return {
        passed: false,
        error: error.message,
      };
    }
  }
}

// Export for use in CVF
export async function evaluateBudget(auvId) {
  const evaluator = new BudgetEvaluator();
  return await evaluator.evaluateAuv(auvId);
}
