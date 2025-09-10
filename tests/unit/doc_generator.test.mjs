#!/usr/bin/env node
/**
 * Unit tests for doc generator (Phase 13)
 * Verifies payment_receipt and media_report templates
 */

import { strict as assert } from 'assert';
import { test, describe, beforeEach } from 'node:test';
import { executeDocGenerate } from '../../orchestration/lib/deterministic/doc_generate_executor.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Doc Generator Templates', () => {
  const tenant = 'test-tenant';
  const runId = 'test-run-456';

  beforeEach(() => {
    // Clean up test artifacts
    // const reportsDir = path.join(__dirname, '../../reports');
    const tenantDir = path.join(__dirname, '../../runs/tenants', tenant);

    // Create test data files
    const paymentsDir = path.join(tenantDir, 'payments_demo');
    fs.mkdirSync(paymentsDir, { recursive: true });

    const paymentIntent = {
      id: 'pi_test_123',
      amount: 2999,
      currency: 'usd',
      status: 'succeeded',
      created: Math.floor(Date.now() / 1000),
    };
    fs.writeFileSync(
      path.join(paymentsDir, 'payment_intent.json'),
      JSON.stringify(paymentIntent, null, 2),
    );

    const charge = {
      id: 'ch_test_456',
      amount: 2999,
      currency: 'usd',
      paid: true,
      payment_intent: 'pi_test_123',
    };
    fs.writeFileSync(path.join(paymentsDir, 'charge.json'), JSON.stringify(charge, null, 2));

    // Create media test data
    const mediaDir = path.join(__dirname, '../../media');
    fs.mkdirSync(mediaDir, { recursive: true });

    const composeMetadata = {
      duration_seconds: 20,
      resolution: '1920x1080',
      fps: 30,
      audio_track: true,
      slides: [
        { image: 'slide1.png', duration: 5 },
        { image: 'slide2.png', duration: 8 },
        { image: 'slide3.png', duration: 7 },
      ],
    };
    fs.writeFileSync(
      path.join(mediaDir, 'compose-metadata.json'),
      JSON.stringify(composeMetadata, null, 2),
    );

    fs.writeFileSync(path.join(mediaDir, 'script.txt'), 'This is a test narration script.');
  });

  test('should generate payment receipt in both formats', async () => {
    const result = await executeDocGenerate({
      template: 'payment_receipt',
      format: 'both',
      tenant,
      runId,
      dataPath: path.join(
        __dirname,
        '../../runs/tenants',
        tenant,
        'payments_demo/payment_intent.json',
      ),
    });

    assert.ok(result.success, 'Should generate successfully');
    assert.ok(result.artifacts, 'Should return artifacts');
    assert.ok(result.artifacts.html, 'Should generate HTML');
    assert.ok(result.artifacts.markdown, 'Should generate Markdown');

    // Verify HTML content
    assert.ok(fs.existsSync(result.artifacts.html), 'HTML file should exist');
    const htmlContent = fs.readFileSync(result.artifacts.html, 'utf8');
    assert.ok(htmlContent.includes('Payment Receipt'), 'HTML should contain title');
    assert.ok(htmlContent.includes('pi_test_123'), 'HTML should contain payment ID');
    assert.ok(htmlContent.includes('$29.99'), 'HTML should contain formatted amount');
    assert.ok(htmlContent.includes('succeeded'), 'HTML should contain status');

    // Verify Markdown content
    assert.ok(fs.existsSync(result.artifacts.markdown), 'Markdown file should exist');
    const mdContent = fs.readFileSync(result.artifacts.markdown, 'utf8');
    assert.ok(mdContent.includes('# Payment Receipt'), 'Markdown should contain title');
    assert.ok(mdContent.includes('pi_test_123'), 'Markdown should contain payment ID');
    assert.ok(mdContent.includes('$29.99'), 'Markdown should contain formatted amount');
  });

  test('should generate media report in both formats', async () => {
    const result = await executeDocGenerate({
      template: 'media_report',
      format: 'both',
      tenant,
      runId,
      composePath: path.join(__dirname, '../../media/compose-metadata.json'),
      scriptPath: path.join(__dirname, '../../media/script.txt'),
    });

    assert.ok(result.success, 'Should generate successfully');
    assert.ok(result.artifacts, 'Should return artifacts');
    assert.ok(result.artifacts.html, 'Should generate HTML');
    assert.ok(result.artifacts.markdown, 'Should generate Markdown');

    // Verify HTML content
    assert.ok(fs.existsSync(result.artifacts.html), 'HTML file should exist');
    const htmlContent = fs.readFileSync(result.artifacts.html, 'utf8');
    assert.ok(htmlContent.includes('Media Production Report'), 'HTML should contain title');
    assert.ok(htmlContent.includes('20 seconds'), 'HTML should contain duration');
    assert.ok(htmlContent.includes('1920x1080'), 'HTML should contain resolution');
    assert.ok(htmlContent.includes('30 fps'), 'HTML should contain FPS');
    assert.ok(htmlContent.includes('3 slides'), 'HTML should contain slide count');

    // Verify Markdown content
    assert.ok(fs.existsSync(result.artifacts.markdown), 'Markdown file should exist');
    const mdContent = fs.readFileSync(result.artifacts.markdown, 'utf8');
    assert.ok(mdContent.includes('# Media Production Report'), 'Markdown should contain title');
    assert.ok(mdContent.includes('20 seconds'), 'Markdown should contain duration');
    assert.ok(mdContent.includes('Script Preview'), 'Markdown should contain script section');
  });

  test('should generate SEO report (default template)', async () => {
    // Create SEO test data
    const seoData = {
      url: 'http://example.com',
      crawled_pages: 150,
      issues: {
        missing_title: 5,
        missing_description: 12,
        broken_links: 3,
        slow_pages: 8,
      },
      performance: {
        avg_load_time_ms: 2500,
        largest_contentful_paint_ms: 2200,
      },
    };

    const seoDir = path.join(__dirname, '../../reports/seo');
    fs.mkdirSync(seoDir, { recursive: true });
    fs.writeFileSync(path.join(seoDir, 'audit.json'), JSON.stringify(seoData, null, 2));

    const result = await executeDocGenerate({
      template: 'seo_report', // Default template
      format: 'both',
      tenant,
      runId,
    });

    assert.ok(result.success, 'Should generate successfully');
    assert.ok(result.artifacts, 'Should return artifacts');
    assert.ok(result.artifacts.html, 'Should generate HTML');
    assert.ok(result.artifacts.markdown, 'Should generate Markdown');

    // Verify content includes SEO data
    const htmlContent = fs.readFileSync(result.artifacts.html, 'utf8');
    assert.ok(htmlContent.includes('SEO Audit Report'), 'HTML should contain title');
    assert.ok(htmlContent.includes('150 pages'), 'HTML should contain page count');
  });

  test('should handle missing data files gracefully', async () => {
    const result = await executeDocGenerate({
      template: 'payment_receipt',
      format: 'both',
      tenant,
      runId,
      dataPath: '/non/existent/path.json',
    });

    assert.ok(result.success, 'Should still succeed with fallback');
    assert.ok(result.artifacts, 'Should return artifacts');
    // Should use fallback path and still generate something
  });
});
