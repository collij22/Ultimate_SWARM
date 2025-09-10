#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { validateSEOAudit, extractSEOSummary } from '../../orchestration/lib/seo_validator.mjs';

const TEST_DIR = 'test-temp-seo-validator';

test('seo_validator', async (t) => {
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

  await t.test('validates valid SEO audit', async () => {
    const validAudit = {
      generated_at: new Date().toISOString(),
      audit_url: 'https://example.com',
      summary: 'SEO audit completed successfully',
      has_sitemap: true,
      sitemap_url: 'https://example.com/sitemap.xml',
      broken_links_count: 2,
      canonical_present_rate: 0.9,
      pages: [
        {
          url: 'https://example.com/',
          title: 'Example - Homepage with good SEO title',
          title_length: 40,
          meta_description: 'A comprehensive example website with excellent content and services',
          meta_description_length: 70,
          h1_count: 1,
          canonical_ok: true,
          canonical_url: 'https://example.com/',
          status_code: 200,
          load_time_ms: 1500,
        },
        {
          url: 'https://example.com/about',
          title: 'About Us - Example Company',
          title_length: 35,
          meta_description: 'Learn about our company history and values',
          meta_description_length: 55,
          h1_count: 1,
          canonical_ok: true,
          status_code: 200,
          load_time_ms: 1200,
        },
      ],
      broken_links: [
        {
          source_url: 'https://example.com/',
          target_url: 'https://example.com/old-page',
          status_code: 404,
          anchor_text: 'Old Page',
        },
      ],
      recommendations: [
        {
          priority: 'high',
          category: 'technical',
          description: 'Fix broken links',
          affected_pages: 1,
        },
      ],
    };

    const auditPath = path.join(TEST_DIR, 'audit.json');
    await writeFile(auditPath, JSON.stringify(validAudit, null, 2));

    const result = await validateSEOAudit(auditPath);

    assert.equal(result.valid, true);
    assert.equal(result.schemaValid, true);
    assert.equal(result.brokenLinksValid, true);
    assert.equal(result.canonicalRateValid, true);
    assert.equal(result.sitemapValid, true);
  });

  await t.test('fails on too many broken links', async () => {
    const audit = {
      generated_at: new Date().toISOString(),
      summary: 'Audit with many broken links',
      has_sitemap: true,
      broken_links_count: 10, // Exceeds default threshold of 3
      canonical_present_rate: 0.9,
      pages: [
        {
          url: 'https://example.com/',
          title: 'Test',
          meta_description: 'Test',
          h1_count: 1,
          canonical_ok: true,
        },
      ],
    };

    const auditPath = path.join(TEST_DIR, 'broken-links.json');
    await writeFile(auditPath, JSON.stringify(audit, null, 2));

    const result = await validateSEOAudit(auditPath, { maxBrokenLinks: 3 });

    assert.equal(result.valid, false);
    assert.equal(result.brokenLinksValid, false);
    assert.equal(
      result.errors.some((e) => e.includes('Broken links')),
      true,
    );
  });

  await t.test('fails on low canonical rate', async () => {
    const audit = {
      generated_at: new Date().toISOString(),
      summary: 'Audit with low canonical coverage',
      has_sitemap: true,
      broken_links_count: 0,
      canonical_present_rate: 0.5, // Below default threshold of 0.8
      pages: [
        {
          url: 'https://example.com/',
          title: 'Test',
          meta_description: 'Test',
          h1_count: 1,
          canonical_ok: false,
        },
      ],
    };

    const auditPath = path.join(TEST_DIR, 'low-canonical.json');
    await writeFile(auditPath, JSON.stringify(audit, null, 2));

    const result = await validateSEOAudit(auditPath);

    assert.equal(result.valid, false);
    assert.equal(result.canonicalRateValid, false);
    assert.equal(
      result.errors.some((e) => e.includes('Canonical rate')),
      true,
    );
  });

  await t.test('fails on missing sitemap when required', async () => {
    const audit = {
      generated_at: new Date().toISOString(),
      summary: 'Audit without sitemap',
      has_sitemap: false, // No sitemap
      broken_links_count: 0,
      canonical_present_rate: 0.9,
      pages: [
        {
          url: 'https://example.com/',
          title: 'Test',
          meta_description: 'Test',
          h1_count: 1,
          canonical_ok: true,
        },
      ],
    };

    const auditPath = path.join(TEST_DIR, 'no-sitemap.json');
    await writeFile(auditPath, JSON.stringify(audit, null, 2));

    const result = await validateSEOAudit(auditPath, { requireSitemap: true });

    assert.equal(result.valid, false);
    assert.equal(result.sitemapValid, false);
    assert.equal(
      result.errors.some((e) => e.includes('Sitemap is required')),
      true,
    );
  });

  await t.test('validates page-level SEO issues', async () => {
    const audit = {
      generated_at: new Date().toISOString(),
      summary: 'Audit with page issues',
      has_sitemap: true,
      broken_links_count: 0,
      canonical_present_rate: 0.9,
      pages: [
        {
          url: 'https://example.com/short',
          title: 'Too Short', // Too short
          title_length: 10,
          meta_description: 'Short', // Too short
          meta_description_length: 5,
          h1_count: 0, // Missing H1
          canonical_ok: true,
        },
        {
          url: 'https://example.com/long',
          title:
            'This is an extremely long title that exceeds the recommended character limit for SEO',
          title_length: 85, // Too long
          meta_description:
            'This meta description is way too long and will be truncated in search results which is not optimal for SEO performance and click-through rates from search engine result pages',
          meta_description_length: 180, // Too long
          h1_count: 3, // Multiple H1s
          canonical_ok: true,
          load_time_ms: 5000, // Slow
        },
      ],
    };

    const auditPath = path.join(TEST_DIR, 'page-issues.json');
    await writeFile(auditPath, JSON.stringify(audit, null, 2));

    const result = await validateSEOAudit(auditPath);

    // Should fail if more than 20% of pages have issues (2/2 = 100%)
    assert.equal(result.valid, false);
    assert.equal(result.pagesValid, false);
    assert.equal(
      result.errors.some((e) => e.includes('pages') && e.includes('SEO issues')),
      true,
    );
  });

  await t.test('handles page issues as warnings when below threshold', async () => {
    const audit = {
      generated_at: new Date().toISOString(),
      summary: 'Audit with minor issues',
      has_sitemap: true,
      broken_links_count: 0,
      canonical_present_rate: 0.9,
      pages: [
        // 1 page with issues out of 10 (10% - below 20% threshold)
        {
          url: 'https://example.com/bad',
          title: 'Short',
          title_length: 10,
          meta_description: 'OK description',
          h1_count: 0,
          canonical_ok: true,
        },
        ...Array(9)
          .fill(null)
          .map((_, i) => ({
            url: `https://example.com/page${i}`,
            title: `Good Page Title ${i}`,
            title_length: 35,
            meta_description: `Good meta description for page ${i}`,
            meta_description_length: 60,
            h1_count: 1,
            canonical_ok: true,
          })),
      ],
    };

    const auditPath = path.join(TEST_DIR, 'minor-issues.json');
    await writeFile(auditPath, JSON.stringify(audit, null, 2));

    const result = await validateSEOAudit(auditPath);

    assert.equal(result.valid, true);
    assert.equal(
      result.warnings.some((w) => w.includes('minor SEO issues')),
      true,
    );
  });

  await t.test('calculates average load time', async () => {
    const audit = {
      generated_at: new Date().toISOString(),
      summary: 'Performance test',
      has_sitemap: true,
      broken_links_count: 0,
      canonical_present_rate: 1.0,
      pages: [
        {
          url: 'https://example.com/fast',
          title: 'Fast Page',
          meta_description: 'Loads quickly',
          h1_count: 1,
          canonical_ok: true,
          load_time_ms: 500,
        },
        {
          url: 'https://example.com/slow',
          title: 'Slow Page',
          meta_description: 'Loads slowly',
          h1_count: 1,
          canonical_ok: true,
          load_time_ms: 4500, // Above 3000ms threshold
        },
      ],
    };

    const auditPath = path.join(TEST_DIR, 'performance.json');
    await writeFile(auditPath, JSON.stringify(audit, null, 2));

    const result = await validateSEOAudit(auditPath);

    assert.equal(result.valid, true); // Doesn't fail on single slow page
    assert.equal(result.stats.avgLoadTime, 2500);
  });

  await t.test('adds warnings for high-priority recommendations', async () => {
    const audit = {
      generated_at: new Date().toISOString(),
      summary: 'Audit with recommendations',
      has_sitemap: true,
      broken_links_count: 0,
      canonical_present_rate: 0.9,
      pages: [
        {
          url: 'https://example.com/',
          title: 'Test',
          meta_description: 'Test',
          h1_count: 1,
          canonical_ok: true,
        },
      ],
      recommendations: [
        {
          priority: 'high',
          category: 'technical',
          description: 'Implement structured data',
        },
        {
          priority: 'high',
          category: 'content',
          description: 'Improve meta descriptions',
        },
        {
          priority: 'low',
          category: 'performance',
          description: 'Optimize images',
        },
      ],
    };

    const auditPath = path.join(TEST_DIR, 'recommendations.json');
    await writeFile(auditPath, JSON.stringify(audit, null, 2));

    const result = await validateSEOAudit(auditPath);

    assert.equal(result.valid, true);
    assert.equal(
      result.warnings.some((w) => w.includes('2 high-priority')),
      true,
    );
  });

  await t.test('extracts SEO summary correctly', async () => {
    const audit = {
      audit_url: 'https://example.com',
      pages: [{ url: 'https://example.com/' }, { url: 'https://example.com/about' }],
      broken_links_count: 3,
      canonical_present_rate: 0.85,
      has_sitemap: true,
      sitemap_url: 'https://example.com/sitemap.xml',
    };

    const summary = extractSEOSummary(audit);

    assert.equal(summary.url, 'https://example.com');
    assert.equal(summary.totalPages, 2);
    assert.equal(summary.brokenLinks, 3);
    assert.equal(summary.canonicalCoverage, '85.0%');
    assert.equal(summary.hasSitemap, true);
    assert.equal(summary.sitemapUrl, 'https://example.com/sitemap.xml');
  });
});
