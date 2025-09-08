#!/usr/bin/env node
/**
 * Unit tests for ReportGenerator
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Mock AUV and manifest for testing
const TEST_AUV = 'TEST-0002';
const TEST_DIST_DIR = path.join(PROJECT_ROOT, 'dist', TEST_AUV);
const TEST_RUN_DIR = path.join(PROJECT_ROOT, 'runs', TEST_AUV);

describe('ReportGenerator', () => {
  beforeEach(() => {
    // Create test directories
    fs.mkdirSync(TEST_DIST_DIR, { recursive: true });
    fs.mkdirSync(path.join(TEST_RUN_DIR, 'screenshots'), { recursive: true });
    fs.mkdirSync(path.join(TEST_RUN_DIR, 'lighthouse'), { recursive: true });

    // Create a mock manifest
    const mockManifest = {
      version: '1.1',
      auv_id: TEST_AUV,
      build_id: 'TEST-BUILD-123',
      timestamp: new Date().toISOString(),
      run_id: 'ABCD1234',
      provenance: {
        git_commit: 'abc123def456',
        git_branch: 'test-branch',
        git_message: 'Test commit message',
        ci_run: 'https://github.com/test/repo/runs/123',
        built_by: 'test-user',
        node_version: 'v20.0.0',
        os: 'linux',
      },
      signatures: {
        manifest: 'signature-placeholder',
      },
      artifacts: [
        {
          path: 'result-cards/runbook-summary.json',
          type: 'result-card',
          size_bytes: 1024,
          sha256: 'a'.repeat(64),
        },
        {
          path: 'playwright/video.webm',
          type: 'video',
          size_bytes: 2048576,
          sha256: 'b'.repeat(64),
        },
        {
          path: 'lighthouse/report.html',
          type: 'report',
          size_bytes: 51200,
          sha256: 'c'.repeat(64),
        },
      ],
      bundle: {
        path: `dist/${TEST_AUV}/${TEST_AUV}_bundle.zip`,
        size_bytes: 3145728,
        sha256: 'd'.repeat(64),
      },
      sbom: {
        bomFormat: 'SPDX',
        specVersion: '2.3',
        packages: [
          { name: 'playwright', version: '1.55.0' },
          { name: 'lighthouse', version: '12.8.2' },
        ],
      },
      deliverable: {
        level: 3,
        version: '0.0.1',
        capabilities: ['browser.automation', 'web.perf_audit'],
      },
    };

    fs.writeFileSync(
      path.join(TEST_DIST_DIR, 'manifest.json'),
      JSON.stringify(mockManifest, null, 2),
    );

    // Create mock screenshots
    fs.writeFileSync(path.join(TEST_RUN_DIR, 'screenshots', 'home.png'), 'mock-screenshot-data');
    fs.writeFileSync(path.join(TEST_RUN_DIR, 'screenshots', 'cart.png'), 'mock-screenshot-data');

    // Create mock Lighthouse report
    const mockLighthouseReport = {
      lhr: {
        categories: {
          performance: { score: 0.95 },
          accessibility: { score: 0.98 },
          'best-practices': { score: 0.92 },
          seo: { score: 0.89 },
        },
        audits: {
          'first-contentful-paint': { displayValue: '1.2 s' },
          'largest-contentful-paint': { displayValue: '2.1 s' },
          'cumulative-layout-shift': { displayValue: '0.05' },
        },
      },
    };
    fs.writeFileSync(
      path.join(TEST_RUN_DIR, 'lighthouse', 'report.json'),
      JSON.stringify(mockLighthouseReport),
    );
  });

  afterEach(() => {
    // Clean up test directories
    if (fs.existsSync(TEST_DIST_DIR)) {
      fs.rmSync(TEST_DIST_DIR, { recursive: true, force: true });
    }
    if (fs.existsSync(TEST_RUN_DIR)) {
      fs.rmSync(TEST_RUN_DIR, { recursive: true, force: true });
    }
  });

  it('should load manifest successfully', async () => {
    const { ReportGenerator } = await import(
      path.join(PROJECT_ROOT, 'orchestration', 'report.mjs')
    );

    const generator = new ReportGenerator(TEST_AUV);
    const manifest = generator.loadManifest();

    assert.ok(manifest, 'Manifest should be loaded');
    assert.equal(manifest.auv_id, TEST_AUV, 'Should have correct AUV ID');
    assert.equal(manifest.version, '1.1', 'Should have correct version');
  });

  it('should prepare screenshots for report', async () => {
    const { ReportGenerator } = await import(
      path.join(PROJECT_ROOT, 'orchestration', 'report.mjs')
    );

    const generator = new ReportGenerator(TEST_AUV);
    const screenshots = generator.prepareScreenshots();

    assert.ok(screenshots, 'Screenshots HTML should be generated');
    assert.ok(screenshots.includes('screenshot'), 'Should contain screenshot elements');
    assert.ok(screenshots.includes('home.png'), 'Should include home screenshot');
    assert.ok(screenshots.includes('cart.png'), 'Should include cart screenshot');
  });

  it('should prepare performance metrics', async () => {
    const { ReportGenerator } = await import(
      path.join(PROJECT_ROOT, 'orchestration', 'report.mjs')
    );

    const generator = new ReportGenerator(TEST_AUV);
    const metrics = generator.preparePerformanceMetrics();

    assert.ok(metrics, 'Performance metrics should be prepared');
    assert.ok(metrics.perf_score, 'Should have performance score');
    assert.equal(metrics.perf_score, '95', 'Should have correct score');
    assert.ok(metrics.perf_score_class, 'Should have score class');
    assert.equal(metrics.perf_score_class, 'score-good', 'Should have good score class');
  });

  it('should prepare artifacts table', async () => {
    const { ReportGenerator } = await import(
      path.join(PROJECT_ROOT, 'orchestration', 'report.mjs')
    );

    const generator = new ReportGenerator(TEST_AUV);
    const manifest = generator.loadManifest();
    const table = generator.prepareArtifactsTable(manifest.artifacts);

    assert.ok(table, 'Artifacts table should be generated');
    assert.ok(table.includes('<tr>'), 'Should contain table rows');
    assert.ok(table.includes('result-cards/runbook-summary.json'), 'Should include result card');
    assert.ok(table.includes('1.00 KB'), 'Should format file sizes');
    assert.ok(table.includes('aaaa...'), 'Should truncate checksums');
  });

  it('should generate complete HTML report', async () => {
    const { ReportGenerator } = await import(
      path.join(PROJECT_ROOT, 'orchestration', 'report.mjs')
    );

    const generator = new ReportGenerator(TEST_AUV);
    const reportPath = await generator.generate();

    assert.ok(reportPath, 'Report path should be returned');
    assert.ok(fs.existsSync(reportPath), 'Report file should exist');

    const reportContent = fs.readFileSync(reportPath, 'utf8');
    assert.ok(reportContent.includes(TEST_AUV), 'Should include AUV ID');
    assert.ok(reportContent.includes('Delivery Report'), 'Should have title');
    assert.ok(reportContent.includes('Executive Summary'), 'Should have summary section');
    assert.ok(reportContent.includes('Performance Metrics'), 'Should have performance section');
    assert.ok(reportContent.includes('Artifacts Inventory'), 'Should have artifacts section');
  });

  it('should handle missing manifest gracefully', async () => {
    const { ReportGenerator } = await import(
      path.join(PROJECT_ROOT, 'orchestration', 'report.mjs')
    );

    // Remove manifest file
    fs.unlinkSync(path.join(TEST_DIST_DIR, 'manifest.json'));

    const generator = new ReportGenerator(TEST_AUV);

    await assert.rejects(
      async () => await generator.generate(),
      /Manifest not found/i,
      'Should throw error when manifest is missing',
    );
  });

  it('should handle missing screenshots directory', async () => {
    const { ReportGenerator } = await import(
      path.join(PROJECT_ROOT, 'orchestration', 'report.mjs')
    );

    // Remove screenshots directory
    fs.rmSync(path.join(TEST_RUN_DIR, 'screenshots'), { recursive: true });

    const generator = new ReportGenerator(TEST_AUV);
    const screenshots = generator.prepareScreenshots();

    assert.ok(screenshots !== undefined, 'Should handle missing screenshots');
    assert.ok(
      screenshots.includes('No screenshots') || screenshots === '',
      'Should show no screenshots message or empty',
    );
  });

  it('should handle missing Lighthouse report', async () => {
    const { ReportGenerator } = await import(
      path.join(PROJECT_ROOT, 'orchestration', 'report.mjs')
    );

    // Remove Lighthouse report
    fs.unlinkSync(path.join(TEST_RUN_DIR, 'lighthouse', 'report.json'));

    const generator = new ReportGenerator(TEST_AUV);
    const metrics = generator.preparePerformanceMetrics();

    assert.ok(metrics, 'Should handle missing Lighthouse report');
    assert.equal(metrics.perf_score, 'N/A', 'Should show N/A for missing score');
  });

  it('should format dates correctly', async () => {
    const { ReportGenerator } = await import(
      path.join(PROJECT_ROOT, 'orchestration', 'report.mjs')
    );

    const generator = new ReportGenerator(TEST_AUV);
    const manifest = generator.loadManifest();
    const data = generator.prepareTemplateData(manifest);

    assert.ok(data.built_at, 'Should have formatted date');
    assert.ok(
      data.built_at.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/),
      'Date should be in expected format',
    );
  });

  it('should include embedded templates as fallback', async () => {
    const { ReportGenerator } = await import(
      path.join(PROJECT_ROOT, 'orchestration', 'report.mjs')
    );

    // Remove template files
    const templateDir = path.join(PROJECT_ROOT, 'orchestration', 'report-templates');
    if (fs.existsSync(templateDir)) {
      fs.rmSync(templateDir, { recursive: true, force: true });
    }

    const generator = new ReportGenerator(TEST_AUV);
    const reportPath = await generator.generate();

    assert.ok(reportPath, 'Report should be generated with embedded templates');
    assert.ok(fs.existsSync(reportPath), 'Report file should exist');

    const reportContent = fs.readFileSync(reportPath, 'utf8');
    assert.ok(reportContent.includes('<!DOCTYPE html>'), 'Should have valid HTML');
    assert.ok(reportContent.includes('<style>'), 'Should have embedded styles');
  });

  it('should escape HTML in manifest data', async () => {
    const { ReportGenerator } = await import(
      path.join(PROJECT_ROOT, 'orchestration', 'report.mjs')
    );

    // Update manifest with potentially dangerous content
    const manifest = JSON.parse(fs.readFileSync(path.join(TEST_DIST_DIR, 'manifest.json'), 'utf8'));
    manifest.provenance.git_message = '<script>alert("XSS")</script>';
    fs.writeFileSync(path.join(TEST_DIST_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const generator = new ReportGenerator(TEST_AUV);
    const reportPath = await generator.generate();
    const reportContent = fs.readFileSync(reportPath, 'utf8');

    assert.ok(!reportContent.includes('<script>alert'), 'Should escape script tags');
    assert.ok(
      reportContent.includes('&lt;script&gt;') || !reportContent.includes('alert("XSS")'),
      'Should properly escape HTML',
    );
  });
});
