#!/usr/bin/env node
/**
 * Data Validator for insights.json
 *
 * Validates data insights output against schema and thresholds.
 * Ensures row counts, metrics presence, and checksum integrity.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { validateManifest } from './checksum_manifest.mjs';

const DEFAULT_MIN_ROWS = 10;

/**
 * Load and compile insights schema
 */
async function loadSchema() {
  const schemaPath = path.resolve(process.cwd(), 'schemas', 'insights.schema.json');
  const schemaData = await readFile(schemaPath, 'utf8');
  const schema = JSON.parse(schemaData);

  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

/**
 * Validate insights.json file
 * @param {string} insightsPath - Path to insights.json
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Validation result
 */
export async function validateInsights(insightsPath, options = {}) {
  const result = {
    valid: true,
    schemaValid: false,
    rowCountValid: false,
    metricsValid: false,
    checksumValid: false,
    errors: [],
    warnings: [],
    data: null,
  };

  // Check file exists
  if (!existsSync(insightsPath)) {
    result.valid = false;
    result.errors.push(`File not found: ${insightsPath}`);
    return result;
  }

  try {
    // Load insights data
    const insightsData = await readFile(insightsPath, 'utf8');
    const insights = JSON.parse(insightsData);
    result.data = insights;

    // Validate against schema
    const validate = await loadSchema();
    const schemaValid = validate(insights);
    result.schemaValid = schemaValid;

    if (!schemaValid) {
      result.valid = false;
      result.errors.push('Schema validation failed');
      if (validate.errors) {
        validate.errors.forEach((err) => {
          result.errors.push(`  ${err.instancePath || '/'}: ${err.message}`);
        });
      }
      // Do not return early; continue with best-effort validations to surface actionable errors
    }

    // Validate row count threshold
    const minRows = options.min_rows || options.minRows || DEFAULT_MIN_ROWS;
    if (insights.data_row_count < minRows) {
      result.valid = false;
      result.rowCountValid = false;
      result.errors.push(`Row count ${insights.data_row_count} below minimum ${minRows}`);
    } else {
      result.rowCountValid = true;
    }

    // Validate metrics presence and minimum count
    const minMetrics = options.min_metrics || 1;
    if (!Array.isArray(insights.metrics) || insights.metrics.length === 0) {
      result.valid = false;
      result.metricsValid = false;
      result.errors.push('No metrics found');
    } else if (insights.metrics.length < minMetrics) {
      result.valid = false;
      result.metricsValid = false;
      result.errors.push(`Metrics count ${insights.metrics.length} below minimum ${minMetrics}`);
    } else {
      result.metricsValid = true;

      // Check for required metric IDs if specified
      if (options.requiredMetrics) {
        const metricIds = new Set(insights.metrics.map((m) => m.id));
        const missing = options.requiredMetrics.filter((id) => !metricIds.has(id));
        if (missing.length > 0) {
          result.valid = false;
          result.errors.push(`Missing required metrics: ${missing.join(', ')}`);
        }
      }
    }

    // Validate source manifest checksums if present
    if (insights.source_manifest && insights.source_manifest.length > 0) {
      const manifestResult = await validateManifest(
        insights.source_manifest,
        options.basePath || process.cwd(),
      );
      result.checksumValid = manifestResult.valid;
      const checksumAsWarning = options.checksum_as_warning === true;
      if (!manifestResult.valid) {
        if (checksumAsWarning) {
          result.warnings.push('Source file checksum validation failed');
          manifestResult.errors.forEach((err) => {
            result.warnings.push(`${err.path}: ${err.error}`);
          });
        } else {
          result.valid = false;
          result.errors.push('Source file checksum validation failed');
          manifestResult.errors.forEach((err) => {
            result.errors.push(`  ${err.path}: ${err.error}`);
          });
        }
      }
    } else {
      result.checksumValid = true;
      result.warnings.push('No source manifest to validate');
    }

    // Check for data quality warnings
    if (insights.data_row_count > 0) {
      // Warn if no aggregations present
      if (!insights.aggregations || Object.keys(insights.aggregations).length === 0) {
        result.warnings.push('No aggregations found in insights');
      }

      // Warn if no findings present
      if (!insights.findings || insights.findings.length === 0) {
        result.warnings.push('No findings documented in insights');
      }
    }
  } catch (error) {
    result.valid = false;
    result.errors.push(`Error processing insights: ${error.message}`);
  }

  return result;
}

/**
 * Extract key metrics from insights for reporting
 * @param {Object} insights - Validated insights data
 * @returns {Object} Summary metrics
 */
export function extractMetricsSummary(insights) {
  if (!insights || !insights.metrics) {
    return null;
  }

  const summary = {
    rowCount: insights.data_row_count,
    metricCount: insights.metrics.length,
    categories: {},
    topMetrics: [],
  };

  // Group metrics by category
  insights.metrics.forEach((metric) => {
    const category = metric.category || 'uncategorized';
    if (!summary.categories[category]) {
      summary.categories[category] = [];
    }
    summary.categories[category].push({
      id: metric.id,
      label: metric.label || metric.id,
      value: metric.value,
      unit: metric.unit,
    });
  });

  // Get top 5 metrics
  summary.topMetrics = insights.metrics.slice(0, 5).map((m) => ({
    label: m.label || m.id,
    value: m.value,
    unit: m.unit,
  }));

  return summary;
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Data Validator for insights.json

Usage:
  node data_validator.mjs <insights.json> [options]

Options:
  --min-rows <N>        Minimum row count (default: ${DEFAULT_MIN_ROWS})
  --required <ID,ID>    Comma-separated list of required metric IDs
  --base-path <path>    Base path for resolving manifest files

Examples:
  node data_validator.mjs runs/AUV-0100/insights.json
  node data_validator.mjs runs/AUV-0100/insights.json --min-rows 150
  node data_validator.mjs runs/AUV-0100/insights.json --required revenue,conversion_rate

Exit codes:
  0 - Validation passed
  1 - Validation failed
  305 - Data validation failure (reserved for CVF)
`);
    process.exit(0);
  }

  const insightsPath = args[0];
  const options = {};

  // Parse options
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--min-rows' && args[i + 1]) {
      options.minRows = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--required' && args[i + 1]) {
      options.requiredMetrics = args[i + 1].split(',').map((s) => s.trim());
      i++;
    } else if (args[i] === '--base-path' && args[i + 1]) {
      options.basePath = args[i + 1];
      i++;
    }
  }

  try {
    const result = await validateInsights(insightsPath, options);

    console.log(`\nValidation: ${result.valid ? 'PASSED' : 'FAILED'}`);
    console.log(`  Schema: ${result.schemaValid ? '✓' : '✗'}`);
    console.log(`  Row Count: ${result.rowCountValid ? '✓' : '✗'}`);
    console.log(`  Metrics: ${result.metricsValid ? '✓' : '✗'}`);
    console.log(`  Checksums: ${result.checksumValid ? '✓' : '✗'}`);

    if (result.data) {
      console.log('\nData Summary:');
      console.log(`  Rows: ${result.data.data_row_count}`);
      console.log(`  Metrics: ${result.data.metrics?.length || 0}`);
      console.log(`  Dimensions: ${result.data.dimensions?.length || 0}`);

      const summary = extractMetricsSummary(result.data);
      if (summary && summary.topMetrics.length > 0) {
        console.log('\nTop Metrics:');
        summary.topMetrics.forEach((m) => {
          const value = m.unit ? `${m.value} ${m.unit}` : m.value;
          console.log(`  ${m.label}: ${value}`);
        });
      }
    }

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach((err) => console.log(`  ${err}`));
    }

    if (result.warnings.length > 0) {
      console.log('\nWarnings:');
      result.warnings.forEach((warn) => console.log(`  ${warn}`));
    }

    process.exit(result.valid ? 0 : 305);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
