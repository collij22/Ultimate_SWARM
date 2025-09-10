#!/usr/bin/env node
/**
 * Chart Validator for PNG validation
 *
 * Validates chart images are properly generated, decodable,
 * and meet dimension/quality requirements.
 */

import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const DEFAULT_MIN_WIDTH = 800;
const DEFAULT_MIN_HEIGHT = 600;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Extract PNG dimensions from IHDR chunk
 * @param {Buffer} buffer - PNG file buffer
 * @returns {Object|null} Width and height or null if invalid
 */
function extractPNGDimensions(buffer) {
  // Check PNG signature
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }

  // IHDR chunk starts at byte 8 and contains dimensions
  // Skip 8 bytes signature + 4 bytes chunk length + 4 bytes chunk type
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  return { width, height };
}

/**
 * Check if image has non-uniform pixels (not a blank image)
 * Simple heuristic: check if file size suggests compressed content
 * @param {Buffer} buffer - Image buffer
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {boolean} True if likely has content
 */
function hasVisualContent(buffer, width, height) {
  // A blank PNG of 800x600 with single color is typically < 10KB
  // Real charts with data are typically > 20KB
  const expectedMinSize = Math.min(20000, width * height * 0.01);
  return buffer.length > expectedMinSize;
}

/**
 * Validate a chart PNG file
 * @param {string} chartPath - Path to PNG file
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Validation result
 */
export async function validateChart(chartPath, options = {}) {
  const result = {
    valid: true,
    exists: false,
    isPNG: false,
    dimensionsValid: false,
    hasContent: false,
    errors: [],
    warnings: [],
    metadata: {},
  };

  // Check file exists
  if (!existsSync(chartPath)) {
    result.valid = false;
    result.errors.push(`File not found: ${chartPath}`);
    return result;
  }
  result.exists = true;

  try {
    // Read file and get stats
    const [buffer, stats] = await Promise.all([readFile(chartPath), stat(chartPath)]);

    result.metadata.size = stats.size;

    // Validate PNG format
    if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
      result.valid = false;
      result.errors.push('File is not a valid PNG image');
      return result;
    }
    result.isPNG = true;

    // Extract dimensions
    const dimensions = extractPNGDimensions(buffer);
    if (!dimensions) {
      result.valid = false;
      result.errors.push('Could not extract PNG dimensions');
      return result;
    }

    result.metadata.width = dimensions.width;
    result.metadata.height = dimensions.height;

    // Validate dimensions
    const minWidth = options.min_width ?? options.minWidth ?? DEFAULT_MIN_WIDTH;
    const minHeight = options.min_height ?? options.minHeight ?? DEFAULT_MIN_HEIGHT;
    const maxWidth = options.max_width ?? options.maxWidth ?? null; // no upper bound by default
    const maxHeight = options.max_height ?? options.maxHeight ?? null; // no upper bound by default

    if (dimensions.width < minWidth || dimensions.height < minHeight) {
      result.valid = false;
      result.dimensionsValid = false;
      result.errors.push(
        `Dimensions ${dimensions.width}x${dimensions.height} below minimum ${minWidth}x${minHeight}`,
      );
    } else if (
      (maxWidth !== null && dimensions.width > maxWidth) ||
      (maxHeight !== null && dimensions.height > maxHeight)
    ) {
      result.valid = false;
      result.dimensionsValid = false;
      result.errors.push(
        `Dimensions ${dimensions.width}x${dimensions.height} exceed maximum ${maxWidth ?? '∞'}x${maxHeight ?? '∞'}`,
      );
    } else {
      result.dimensionsValid = true;
    }

    // Check for visual content
    const hasContent = hasVisualContent(buffer, dimensions.width, dimensions.height);
    result.hasContent = hasContent;

    if (!hasContent) {
      result.warnings.push('Chart appears to be blank or have uniform pixels');
      if (options.requireContent !== false) {
        result.valid = false;
        result.errors.push('Chart has no visual content');
      }
    }

    // Calculate checksum
    const hash = createHash('sha256');
    hash.update(buffer);
    result.metadata.sha256 = hash.digest('hex');

    // Aspect ratio check
    const aspectRatio = dimensions.width / dimensions.height;
    result.metadata.aspectRatio = aspectRatio.toFixed(2);

    if (aspectRatio < 1.0 || aspectRatio > 2.0) {
      result.warnings.push(`Unusual aspect ratio: ${aspectRatio.toFixed(2)}`);
    }
  } catch (error) {
    result.valid = false;
    result.errors.push(`Error processing chart: ${error.message}`);
  }

  return result;
}

/**
 * Validate multiple chart files
 * @param {string[]} chartPaths - Array of PNG file paths
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Aggregated validation result
 */
export async function validateCharts(chartPaths, options = {}) {
  const results = {
    valid: true,
    total: chartPaths.length,
    passed: 0,
    failed: 0,
    charts: [],
    errors: [],
    warnings: [],
  };

  for (const chartPath of chartPaths) {
    const result = await validateChart(chartPath, options);

    results.charts.push({
      path: chartPath,
      valid: result.valid,
      metadata: result.metadata,
    });

    if (result.valid) {
      results.passed++;
    } else {
      results.failed++;
      results.valid = false;
      result.errors.forEach((err) => {
        results.errors.push(`${path.basename(chartPath)}: ${err}`);
      });
    }

    result.warnings.forEach((warn) => {
      results.warnings.push(`${path.basename(chartPath)}: ${warn}`);
    });
  }

  return results;
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Chart Validator for PNG files

Usage:
  node chart_validator.mjs <chart.png> [options]
  node chart_validator.mjs <chart1.png> <chart2.png> ... [options]

Options:
  --min-width <N>       Minimum width in pixels (default: ${DEFAULT_MIN_WIDTH})
  --min-height <N>      Minimum height in pixels (default: ${DEFAULT_MIN_HEIGHT})
  --no-content-check    Skip visual content validation

Examples:
  node chart_validator.mjs runs/AUV-0100/charts/revenue.png
  node chart_validator.mjs runs/AUV-0100/charts/*.png --min-width 1024

Exit codes:
  0 - Validation passed
  1 - Validation failed
  306 - Chart validation failure (reserved for CVF)
`);
    process.exit(0);
  }

  // Separate files from options
  const files = [];
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--min-width' && args[i + 1]) {
      options.minWidth = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--min-height' && args[i + 1]) {
      options.minHeight = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--no-content-check') {
      options.requireContent = false;
    } else if (!args[i].startsWith('--')) {
      files.push(args[i]);
    }
  }

  if (files.length === 0) {
    console.error('Error: No chart files specified');
    process.exit(1);
  }

  try {
    if (files.length === 1) {
      // Single file validation
      const result = await validateChart(files[0], options);

      console.log(`\nValidation: ${result.valid ? 'PASSED' : 'FAILED'}`);
      console.log(`  File: ${files[0]}`);
      console.log(`  PNG Format: ${result.isPNG ? '✓' : '✗'}`);
      console.log(`  Dimensions: ${result.dimensionsValid ? '✓' : '✗'}`);
      console.log(`  Has Content: ${result.hasContent ? '✓' : '✗'}`);

      if (result.metadata.width) {
        console.log('\nMetadata:');
        console.log(`  Dimensions: ${result.metadata.width}x${result.metadata.height}`);
        console.log(`  Size: ${(result.metadata.size / 1024).toFixed(1)} KB`);
        console.log(`  Aspect Ratio: ${result.metadata.aspectRatio}`);
        console.log(`  SHA-256: ${result.metadata.sha256.substring(0, 16)}...`);
      }

      if (result.errors.length > 0) {
        console.log('\nErrors:');
        result.errors.forEach((err) => console.log(`  ${err}`));
      }

      if (result.warnings.length > 0) {
        console.log('\nWarnings:');
        result.warnings.forEach((warn) => console.log(`  ${warn}`));
      }

      process.exit(result.valid ? 0 : 306);
    } else {
      // Multiple files validation
      const results = await validateCharts(files, options);

      console.log(`\nValidation Summary: ${results.valid ? 'PASSED' : 'FAILED'}`);
      console.log(`  Total: ${results.total}`);
      console.log(`  Passed: ${results.passed}`);
      console.log(`  Failed: ${results.failed}`);

      console.log('\nChart Results:');
      results.charts.forEach((chart) => {
        const status = chart.valid ? '✓' : '✗';
        const dims = chart.metadata.width
          ? ` (${chart.metadata.width}x${chart.metadata.height})`
          : '';
        console.log(`  ${status} ${path.basename(chart.path)}${dims}`);
      });

      if (results.errors.length > 0) {
        console.log('\nErrors:');
        results.errors.forEach((err) => console.log(`  ${err}`));
      }

      if (results.warnings.length > 0) {
        console.log('\nWarnings:');
        results.warnings.forEach((warn) => console.log(`  ${warn}`));
      }

      process.exit(results.valid ? 0 : 306);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
