#!/usr/bin/env node
/**
 * Swarm1 — Visual Regression Compare Module
 *
 * Compares screenshots against baselines using pixel-based diff and SSIM.
 *
 * Usage:
 *   node orchestration/visual/compare.mjs --auv <AUV-ID> [--threshold <percent>]
 *
 * Exit codes:
 *   0   - All routes within threshold
 *   303 - Visual regression detected (exceeds threshold)
 */

import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import yaml from 'js-yaml';

class VisualCompare {
  constructor() {
    this.results = [];
    this.summary = {
      scan_id: this.generateScanId(),
      timestamp: new Date().toISOString(),
      auv_id: null,
      total_routes: 0,
      passed: 0,
      failed: 0,
      routes: [],
    };
  }

  generateScanId() {
    return `visual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async loadAuvConfig(auvId) {
    const configPath = path.join(process.cwd(), 'capabilities', `${auvId}.yaml`);

    if (!fs.existsSync(configPath)) {
      throw new Error(`AUV config not found: ${configPath}`);
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    const config = yaml.load(content);

    if (!config.visual || !config.visual.routes) {
      console.log(`[visual-compare] No visual routes defined for ${auvId}`);
      return [];
    }

    return config.visual.routes;
  }

  async compareImages(baselinePath, actualPath, diffPath, threshold) {
    // Check if files exist
    if (!fs.existsSync(baselinePath)) {
      throw new Error(`Baseline not found: ${baselinePath}`);
    }

    if (!fs.existsSync(actualPath)) {
      throw new Error(`Actual screenshot not found: ${actualPath}`);
    }

    // Load images
    const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
    const actual = PNG.sync.read(fs.readFileSync(actualPath));

    // Check dimensions
    if (baseline.width !== actual.width || baseline.height !== actual.height) {
      return {
        passed: false,
        error: 'Image dimensions do not match',
        baseline: { width: baseline.width, height: baseline.height },
        actual: { width: actual.width, height: actual.height },
      };
    }

    // Create diff image
    const diff = new PNG({ width: baseline.width, height: baseline.height });

    // Compare pixels
    const numDiffPixels = pixelmatch(
      baseline.data,
      actual.data,
      diff.data,
      baseline.width,
      baseline.height,
      {
        threshold: 0.1, // Pixel-level threshold for color difference
        includeAA: false, // Don't include anti-aliased pixels
        alpha: 0.1, // Blend diff with original image
      },
    );

    // Calculate diff percentage
    const totalPixels = baseline.width * baseline.height;
    const diffPercent = (numDiffPixels / totalPixels) * 100;

    // Save diff image if there are differences
    if (numDiffPixels > 0 && diffPath) {
      const diffDir = path.dirname(diffPath);
      if (!fs.existsSync(diffDir)) {
        fs.mkdirSync(diffDir, { recursive: true });
      }
      fs.writeFileSync(diffPath, PNG.sync.write(diff));
    }

    // Calculate additional metrics
    const ssim = this.calculateSSIM(baseline.data, actual.data, baseline.width, baseline.height);

    return {
      passed: diffPercent <= threshold,
      diffPixels: numDiffPixels,
      totalPixels,
      diffPercent: parseFloat(diffPercent.toFixed(4)),
      ssim: parseFloat(ssim.toFixed(4)),
      threshold,
    };
  }

  calculateSSIM(img1, img2, width, height) {
    // Simplified SSIM calculation (structural similarity)
    // Returns value between 0 (completely different) and 1 (identical)

    const k1 = 0.01;
    const k2 = 0.03;
    const L = 255; // Dynamic range
    const c1 = Math.pow(k1 * L, 2);
    const c2 = Math.pow(k2 * L, 2);

    let sum1 = 0,
      sum2 = 0,
      sum1Sq = 0,
      sum2Sq = 0,
      sum12 = 0;
    const n = width * height;

    for (let i = 0; i < n * 4; i += 4) {
      // Use luminance (grayscale) for comparison
      const lum1 = img1[i] * 0.299 + img1[i + 1] * 0.587 + img1[i + 2] * 0.114;
      const lum2 = img2[i] * 0.299 + img2[i + 1] * 0.587 + img2[i + 2] * 0.114;

      sum1 += lum1;
      sum2 += lum2;
      sum1Sq += lum1 * lum1;
      sum2Sq += lum2 * lum2;
      sum12 += lum1 * lum2;
    }

    const mu1 = sum1 / n;
    const mu2 = sum2 / n;
    const sigma1Sq = sum1Sq / n - mu1 * mu1;
    const sigma2Sq = sum2Sq / n - mu2 * mu2;
    const sigma12 = sum12 / n - mu1 * mu2;

    const numerator = (2 * mu1 * mu2 + c1) * (2 * sigma12 + c2);
    const denominator = (mu1 * mu1 + mu2 * mu2 + c1) * (sigma1Sq + sigma2Sq + c2);

    return numerator / denominator;
  }

  async compareRoute(auvId, route) {
    const routeId = route.id || path.basename(route.page, '.html');

    // Determine paths
    const baselinePath = path.join(
      process.cwd(),
      'tests/robot/visual/baselines',
      `${auvId}-${routeId}.png`,
    );

    const actualPath = path.join(process.cwd(), 'runs/visual', auvId, `${routeId}-actual.png`);

    const diffPath = path.join(process.cwd(), 'runs/visual', auvId, `${routeId}-diff.png`);

    // Get threshold from route config or use default
    const threshold = route.threshold?.pixel_pct || 0.1;

    try {
      const result = await this.compareImages(baselinePath, actualPath, diffPath, threshold);

      return {
        route: routeId,
        page: route.page,
        passed: result.passed,
        threshold,
        metrics: {
          diffPercent: result.diffPercent,
          diffPixels: result.diffPixels,
          totalPixels: result.totalPixels,
          ssim: result.ssim,
        },
        paths: {
          baseline: baselinePath,
          actual: actualPath,
          diff: result.diffPixels > 0 ? diffPath : null,
        },
        error: result.error || null,
      };
    } catch (error) {
      return {
        route: routeId,
        page: route.page,
        passed: false,
        error: error.message,
        paths: {
          baseline: baselinePath,
          actual: actualPath,
        },
      };
    }
  }

  async compareAuv(auvId, routes) {
    this.summary.auv_id = auvId;
    this.summary.total_routes = routes.length;

    for (const route of routes) {
      const result = await this.compareRoute(auvId, route);

      this.summary.routes.push(result);

      if (result.passed) {
        this.summary.passed++;
      } else {
        this.summary.failed++;
      }

      // Log result
      const status = result.passed ? 'PASS' : 'FAIL';
      const metric = result.metrics ? `${result.metrics.diffPercent}%` : 'ERROR';
      console.log(`[visual-compare] ${status}: ${result.route} (${metric})`);
    }
  }

  async generateReport(outputPath) {
    // Ensure reports directory exists
    const reportsDir = path.dirname(outputPath);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Write detailed report
    fs.writeFileSync(outputPath, JSON.stringify(this.summary, null, 2));

    // Also write to runs directory for CVF validation
    const runsPath = path.join(process.cwd(), 'runs/visual', this.summary.auv_id, 'visual.json');
    const runsDir = path.dirname(runsPath);
    if (!fs.existsSync(runsDir)) {
      fs.mkdirSync(runsDir, { recursive: true });
    }
    fs.writeFileSync(runsPath, JSON.stringify(this.summary, null, 2));

    console.log(`[visual-compare] Report generated: ${outputPath}`);
    console.log(
      `[visual-compare] Summary: Passed=${this.summary.passed}, Failed=${this.summary.failed}`,
    );
  }

  shouldBlock() {
    return this.summary.failed > 0;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  let auvId = null;
  let outputPath = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--auv' && args[i + 1]) {
      auvId = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[i + 1];
      i++;
    }
  }

  if (!auvId) {
    console.error('Usage: node orchestration/visual/compare.mjs --auv <AUV-ID>');
    process.exit(2);
  }

  if (!outputPath) {
    outputPath = path.join(process.cwd(), 'reports/visual', `${auvId}-visual.json`);
  }

  const compare = new VisualCompare();

  try {
    // Load AUV visual configuration
    const routes = await compare.loadAuvConfig(auvId);

    if (routes.length === 0) {
      console.log(`[visual-compare] No visual routes to compare for ${auvId}`);
      process.exit(0);
    }

    // Run comparison
    await compare.compareAuv(auvId, routes);

    // Generate report
    await compare.generateReport(outputPath);

    // Exit with appropriate code
    if (compare.shouldBlock()) {
      console.error('[visual-compare] BLOCKED: Visual regression detected');
      process.exit(303);
    }

    console.log('[visual-compare] PASSED: All routes within threshold');
    process.exit(0);
  } catch (error) {
    console.error('[visual-compare] Error:', error.message);
    process.exit(1);
  }
}

// Execute if run directly
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch(console.error);
}

export { VisualCompare };
