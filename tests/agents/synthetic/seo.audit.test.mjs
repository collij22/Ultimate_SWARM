/**
 * Synthetic test for SEO audit capability
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { validateSEOAudit } from '../../../orchestration/lib/seo_validator.mjs';

test('seo.audit fast-tier: outputs audit.json structure', async () => {
  const testDir = 'runs/test-seo-audit';
  const reportsDir = path.join(testDir, 'reports', 'seo');

  try {
    // Setup test directory
    await mkdir(reportsDir, { recursive: true });

    // Create a mock SEO audit result
    const mockAudit = {
      generated_at: new Date().toISOString(),
      audit_url: 'https://example.com',
      summary:
        'SEO audit completed successfully. Found minor issues with meta descriptions and canonical tags.',
      has_sitemap: true,
      sitemap_url: 'https://example.com/sitemap.xml',
      broken_links_count: 2,
      canonical_present_rate: 0.85,
      pages: [
        {
          url: 'https://example.com/',
          title: 'Example - Home Page',
          title_length: 20,
          meta_description: 'Welcome to Example, your source for examples',
          meta_description_length: 45,
          h1_count: 1,
          canonical_ok: true,
          canonical_url: 'https://example.com/',
          status_code: 200,
          load_time_ms: 250,
          issues: [],
        },
        {
          url: 'https://example.com/about',
          title: 'About Us - Example',
          title_length: 18,
          meta_description: 'Learn more about Example and our mission',
          meta_description_length: 41,
          h1_count: 1,
          canonical_ok: true,
          canonical_url: 'https://example.com/about',
          status_code: 200,
          load_time_ms: 180,
          issues: [],
        },
        {
          url: 'https://example.com/products',
          title: 'Products',
          title_length: 8,
          meta_description: '',
          meta_description_length: 0,
          h1_count: 2,
          canonical_ok: false,
          status_code: 200,
          load_time_ms: 320,
          issues: [
            'Title too short',
            'Missing meta description',
            'Multiple H1 tags',
            'Missing canonical tag',
          ],
        },
      ],
      broken_links: [
        {
          source_url: 'https://example.com/products',
          target_url: 'https://example.com/old-product',
          status_code: 404,
          anchor_text: 'Legacy Product',
        },
        {
          source_url: 'https://example.com/about',
          target_url: 'https://example.com/team',
          status_code: 404,
          anchor_text: 'Our Team',
        },
      ],
      recommendations: [
        {
          priority: 'high',
          category: 'content',
          description: 'Add meta descriptions to all pages',
          affected_pages: 1,
        },
        {
          priority: 'high',
          category: 'technical',
          description: 'Fix broken internal links',
          affected_pages: 2,
        },
        {
          priority: 'medium',
          category: 'content',
          description: 'Ensure all pages have exactly one H1 tag',
          affected_pages: 1,
        },
        {
          priority: 'medium',
          category: 'technical',
          description: 'Add canonical tags to all pages',
          affected_pages: 1,
        },
        {
          priority: 'low',
          category: 'content',
          description: 'Optimize title lengths (30-60 characters)',
          affected_pages: 1,
        },
      ],
    };

    // Write audit file
    const auditPath = path.join(reportsDir, 'audit.json');
    await writeFile(auditPath, JSON.stringify(mockAudit, null, 2));

    // Create summary file
    const summaryContent = `# SEO Audit Summary

**Date:** ${mockAudit.generated_at}
**URL:** ${mockAudit.audit_url}

## Key Findings
- Pages Audited: ${mockAudit.pages.length}
- Broken Links: ${mockAudit.broken_links_count}
- Canonical Coverage: ${(mockAudit.canonical_present_rate * 100).toFixed(1)}%
- Sitemap: ${mockAudit.has_sitemap ? 'Present' : 'Missing'}

## Top Recommendations
${mockAudit.recommendations
  .slice(0, 3)
  .map((r) => `- **${r.priority}:** ${r.description}`)
  .join('\n')}

## Summary
${mockAudit.summary}
`;

    const summaryPath = path.join(reportsDir, 'summary.md');
    await writeFile(summaryPath, summaryContent);

    // Validate the audit using the validator
    const validation = await validateSEOAudit(auditPath, {
      max_broken_links: 5,
      min_canonical_rate: 0.8,
      pageIssueFailRate: 1.0,
    });

    // Assertions
    assert.ok(existsSync(auditPath), 'Audit file should exist');
    assert.ok(existsSync(summaryPath), 'Summary file should exist');
    assert.strictEqual(validation.valid, true, 'Audit should pass validation');
    assert.strictEqual(validation.schemaValid, true, 'Schema should be valid');
    assert.strictEqual(
      validation.brokenLinksValid,
      true,
      'Broken links should be within threshold',
    );
    assert.strictEqual(validation.canonicalRateValid, true, 'Canonical rate should meet threshold');
    assert.strictEqual(validation.stats.totalPages, 3, 'Should have correct page count');
    assert.strictEqual(validation.stats.brokenLinks, 2, 'Should have correct broken link count');

    // Test threshold violations
    const strictValidation = await validateSEOAudit(auditPath, {
      max_broken_links: 1, // Stricter threshold
      min_canonical_rate: 0.9, // Stricter threshold
    });

    assert.strictEqual(strictValidation.valid, false, 'Should fail with stricter thresholds');
    assert.strictEqual(strictValidation.brokenLinksValid, false, 'Should fail broken links check');
    assert.strictEqual(
      strictValidation.canonicalRateValid,
      false,
      'Should fail canonical rate check',
    );
  } finally {
    // Cleanup
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  }
});
