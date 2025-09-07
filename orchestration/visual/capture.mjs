#!/usr/bin/env node
/**
 * Swarm1 — Visual Regression Capture Module
 *
 * Captures deterministic screenshots using Playwright for visual regression testing.
 *
 * Usage:
 *   node orchestration/visual/capture.mjs --auv <AUV-ID> [--update-baseline]
 */

import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import yaml from 'js-yaml';

class VisualCapture {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.config = {
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      hasTouch: false,
      animations: 'disabled',
      locale: 'en-US',
      timezoneId: 'UTC',
    };
    this.baseUrl = process.env.STAGING_URL || 'http://127.0.0.1:3000';
  }

  async initialize() {
    // Launch browser with deterministic settings
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-animations',
        '--force-color-profile=srgb',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    // Create context with fixed viewport and settings
    this.context = await this.browser.newContext({
      ...this.config,
      // Disable all animations and transitions
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    // Inject CSS to disable animations globally
    await this.context.addInitScript(() => {
      /* eslint-disable no-undef */
      const style = document.createElement('style');
      style.innerHTML = `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `;
      document.head.appendChild(style);
      /* eslint-enable no-undef */
    });

    this.page = await this.context.newPage();

    // Set default timeout
    this.page.setDefaultTimeout(30000);

    console.log('[visual-capture] Browser initialized with deterministic settings');
  }

  async loadAuvConfig(auvId) {
    const configPath = path.join(process.cwd(), 'capabilities', `${auvId}.yaml`);

    if (!fs.existsSync(configPath)) {
      throw new Error(`AUV config not found: ${configPath}`);
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    const config = yaml.load(content);

    if (!config.visual || !config.visual.routes) {
      console.log(`[visual-capture] No visual routes defined for ${auvId}`);
      return [];
    }

    return config.visual.routes;
  }

  async captureScreenshot(route, outputPath) {
    const url = `${this.baseUrl}${route.page}`;

    console.log(`[visual-capture] Navigating to ${url}`);

    // Navigate and wait for network idle
    await this.page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });

    // Additional wait for any lazy-loaded content
    await this.page.waitForTimeout(1000);

    // Hide any dynamic elements (timestamps, etc.)
    if (route.hideSelectors) {
      for (const selector of route.hideSelectors) {
        await this.page.evaluate((sel) => {
          /* eslint-disable no-undef */
          const elements = document.querySelectorAll(sel);
          elements.forEach((el) => (el.style.visibility = 'hidden'));
          /* eslint-enable no-undef */
        }, selector);
      }
    }

    // Scroll to top for consistent positioning
    await this.page.evaluate(() => {
      /* eslint-disable no-undef */
      window.scrollTo(0, 0);
      /* eslint-enable no-undef */
    });

    // Wait for fonts to load
    await this.page.evaluate(() => {
      /* eslint-disable no-undef */
      return document.fonts.ready;
      /* eslint-enable no-undef */
    });

    // Capture screenshot
    await this.page.screenshot({
      path: outputPath,
      fullPage: route.fullPage !== false,
      type: 'png',
      animations: 'disabled',
    });

    console.log(`[visual-capture] Screenshot saved: ${outputPath}`);
  }

  async captureRoutes(auvId, routes, updateBaseline = false) {
    const results = [];

    for (const route of routes) {
      const routeId = route.id || path.basename(route.page, '.html');

      // Determine paths
      const baselinePath = path.join(
        process.cwd(),
        'tests/robot/visual/baselines',
        `${auvId}-${routeId}.png`,
      );

      const actualPath = path.join(process.cwd(), 'runs/visual', auvId, `${routeId}-actual.png`);

      // Ensure directories exist
      const actualDir = path.dirname(actualPath);
      if (!fs.existsSync(actualDir)) {
        fs.mkdirSync(actualDir, { recursive: true });
      }

      try {
        // Capture current screenshot
        await this.captureScreenshot(route, actualPath);

        // Update baseline if requested
        if (updateBaseline) {
          const baselineDir = path.dirname(baselinePath);
          if (!fs.existsSync(baselineDir)) {
            fs.mkdirSync(baselineDir, { recursive: true });
          }

          fs.copyFileSync(actualPath, baselinePath);
          console.log(`[visual-capture] Baseline updated: ${baselinePath}`);
        }

        results.push({
          route: routeId,
          status: 'captured',
          actualPath,
          baselinePath,
        });
      } catch (error) {
        console.error(`[visual-capture] Error capturing ${routeId}:`, error.message);
        results.push({
          route: routeId,
          status: 'failed',
          error: error.message,
        });
      }
    }

    return results;
  }

  async cleanup() {
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    console.log('[visual-capture] Browser closed');
  }
}

// Main execution
async function main() {
  console.log('[visual-capture] Starting with args:', process.argv.slice(2));
  const args = process.argv.slice(2);
  let auvId = null;
  let updateBaseline = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--auv' && args[i + 1]) {
      auvId = args[i + 1];
      i++;
    } else if (args[i] === '--update-baseline') {
      updateBaseline = true;
    }
  }

  if (!auvId) {
    console.error(
      'Usage: node orchestration/visual/capture.mjs --auv <AUV-ID> [--update-baseline]',
    );
    process.exit(2);
  }

  const capture = new VisualCapture();

  try {
    // Initialize browser
    await capture.initialize();

    // Load AUV visual configuration
    const routes = await capture.loadAuvConfig(auvId);

    if (routes.length === 0) {
      console.log(`[visual-capture] No visual routes to capture for ${auvId}`);
      process.exit(0);
    }

    // Capture screenshots
    const results = await capture.captureRoutes(auvId, routes, updateBaseline);

    // Write results summary
    const summaryPath = path.join(process.cwd(), 'runs/visual', auvId, 'capture-summary.json');
    const summary = {
      auv_id: auvId,
      timestamp: new Date().toISOString(),
      baseline_updated: updateBaseline,
      results,
    };

    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`[visual-capture] Summary written: ${summaryPath}`);

    // Check if any captures failed
    const failed = results.filter((r) => r.status === 'failed');
    if (failed.length > 0) {
      console.error(`[visual-capture] ${failed.length} captures failed`);
      process.exit(1);
    }

    console.log('[visual-capture] All captures completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('[visual-capture] Error:', error.message);
    process.exit(1);
  } finally {
    await capture.cleanup();
  }
}

// Execute if run directly
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch(console.error);
}

export { VisualCapture };
