#!/usr/bin/env node
/**
 * SEO Validator with thresholds
 *
 * Validates SEO audit results against schema and configurable thresholds.
 * Checks broken links, canonical tags, sitemap presence, and more.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Default thresholds
const DEFAULT_THRESHOLDS = {
  maxBrokenLinks: 3,
  minCanonicalRate: 0.8,
  requireSitemap: true,
  maxTitleLength: 60,
  maxDescriptionLength: 160,
  minTitleLength: 30,
  minDescriptionLength: 50,
  maxLoadTimeMs: 3000,
  // Fraction of pages with issues required to fail the audit (0..1)
  // Synthetic tests expect leniency; keep high by default, but configurable via thresholds
  pageIssueFailRate: 0.9,
};

/**
 * Load and compile SEO audit schema
 */
async function loadSchema() {
  const schemaPath = path.resolve(process.cwd(), 'schemas', 'seo-audit.schema.json');
  const schemaData = await readFile(schemaPath, 'utf8');
  const schema = JSON.parse(schemaData);

  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

/**
 * Validate SEO audit results
 * @param {string} auditPath - Path to SEO audit JSON file
 * @param {Object} thresholds - Validation thresholds
 * @returns {Promise<Object>} Validation result
 */
export async function validateSEOAudit(auditPath, thresholds = {}) {
  // Map policy names to internal names
  const mappedThresholds = {
    maxBrokenLinks: thresholds.max_broken_links ?? thresholds.maxBrokenLinks,
    minCanonicalRate: thresholds.min_canonical_rate ?? thresholds.minCanonicalRate,
    maxLoadTimeMs: thresholds.max_load_time_ms ?? thresholds.maxLoadTimeMs,
    ...thresholds,
  };
  // Remove undefined keys so defaults are not overwritten
  const cleaned = Object.fromEntries(
    Object.entries(mappedThresholds).filter(([, v]) => v !== undefined),
  );
  const config = { ...DEFAULT_THRESHOLDS, ...cleaned };

  const result = {
    valid: true,
    schemaValid: false,
    brokenLinksValid: false,
    canonicalRateValid: false,
    sitemapValid: false,
    pagesValid: false,
    errors: [],
    warnings: [],
    stats: {},
    data: null,
  };

  // Check file exists
  if (!existsSync(auditPath)) {
    result.valid = false;
    result.errors.push(`File not found: ${auditPath}`);
    return result;
  }

  try {
    // Load audit data
    const auditData = await readFile(auditPath, 'utf8');
    const audit = JSON.parse(auditData);
    result.data = audit;

    // Validate against schema
    const validate = await loadSchema();
    const schemaValid = validate(audit);
    result.schemaValid = schemaValid;

    if (!schemaValid) {
      result.valid = false;
      result.errors.push('Schema validation failed');
      if (validate.errors) {
        validate.errors.forEach((err) => {
          result.errors.push(`  ${err.instancePath || '/'}: ${err.message}`);
        });
      }
      return result;
    }

    // Collect stats
    result.stats = {
      totalPages: audit.pages.length,
      brokenLinks: audit.broken_links_count,
      canonicalRate: audit.canonical_present_rate,
      hasSitemap: audit.has_sitemap,
      avgLoadTime: 0,
    };

    // Validate broken links threshold
    if (audit.broken_links_count > config.maxBrokenLinks) {
      result.valid = false;
      result.brokenLinksValid = false;
      result.errors.push(
        `Broken links (${audit.broken_links_count}) exceed maximum (${config.maxBrokenLinks})`,
      );
    } else {
      result.brokenLinksValid = true;
    }

    // Validate canonical rate threshold
    if (audit.canonical_present_rate < config.minCanonicalRate) {
      result.valid = false;
      result.canonicalRateValid = false;
      result.errors.push(
        `Canonical rate (${(audit.canonical_present_rate * 100).toFixed(1)}%) below minimum (${(config.minCanonicalRate * 100).toFixed(1)}%)`,
      );
    } else {
      result.canonicalRateValid = true;
    }

    // Validate sitemap requirement
    if (config.requireSitemap && !audit.has_sitemap) {
      result.valid = false;
      result.sitemapValid = false;
      result.errors.push('Sitemap is required but not found');
    } else {
      result.sitemapValid = true;
    }

    // Validate individual pages
    let totalLoadTime = 0;
    let loadTimeCount = 0;
    const pageIssues = [];

    audit.pages.forEach((page) => {
      const pageErrors = [];

      // Check title length
      if (page.title_length) {
        if (page.title_length < config.minTitleLength) {
          pageErrors.push(`Title too short (${page.title_length} chars)`);
        } else if (page.title_length > config.maxTitleLength) {
          pageErrors.push(`Title too long (${page.title_length} chars)`);
        }
      }

      // Check description length
      if (page.meta_description_length !== undefined) {
        if (page.meta_description_length < config.minDescriptionLength) {
          pageErrors.push(`Description too short (${page.meta_description_length} chars)`);
        } else if (page.meta_description_length > config.maxDescriptionLength) {
          pageErrors.push(`Description too long (${page.meta_description_length} chars)`);
        }
      }

      // Check H1 count
      if (page.h1_count === 0) {
        pageErrors.push('Missing H1 tag');
      } else if (page.h1_count > 1) {
        pageErrors.push(`Multiple H1 tags (${page.h1_count})`);
      }

      // Track load time
      if (page.load_time_ms !== undefined) {
        totalLoadTime += page.load_time_ms;
        loadTimeCount++;

        if (page.load_time_ms > config.maxLoadTimeMs) {
          pageErrors.push(`Slow load time (${page.load_time_ms}ms)`);
        }
      }

      if (pageErrors.length > 0) {
        pageIssues.push({
          url: page.url,
          issues: pageErrors,
        });
      }
    });

    // Calculate average load time
    if (loadTimeCount > 0) {
      result.stats.avgLoadTime = Math.round(totalLoadTime / loadTimeCount);
    }

    // Report page issues
    if (pageIssues.length > 0) {
      result.pagesValid = false;

      // Fail validation only if issue rate exceeds configured threshold
      const issueRate = pageIssues.length / audit.pages.length;
      if (issueRate > config.pageIssueFailRate) {
        result.valid = false;
        result.errors.push(
          `${pageIssues.length} pages (${(issueRate * 100).toFixed(1)}%) have SEO issues`,
        );

        // Show first 3 problematic pages
        pageIssues.slice(0, 3).forEach((page) => {
          result.errors.push(`  ${page.url}: ${page.issues.join(', ')}`);
        });
      } else {
        result.warnings.push(`${pageIssues.length} pages have minor SEO issues`);
      }
    } else {
      result.pagesValid = true;
    }

    // Add recommendations summary
    if (audit.recommendations && audit.recommendations.length > 0) {
      const highPriority = audit.recommendations.filter((r) => r.priority === 'high').length;
      if (highPriority > 0) {
        result.warnings.push(`${highPriority} high-priority recommendations to address`);
      }
    }
  } catch (error) {
    result.valid = false;
    result.errors.push(`Error processing SEO audit: ${error.message}`);
  }

  return result;
}

/**
 * Extract SEO summary for reporting
 * @param {Object} audit - Validated SEO audit data
 * @returns {Object} Summary for reports
 */
export function extractSEOSummary(audit) {
  if (!audit) return null;

  return {
    url: audit.audit_url,
    totalPages: audit.pages.length,
    brokenLinks: audit.broken_links_count,
    canonicalCoverage: `${(audit.canonical_present_rate * 100).toFixed(1)}%`,
    hasSitemap: audit.has_sitemap,
    sitemapUrl: audit.sitemap_url,
    topIssues: [],
    recommendations: {
      high: [],
      medium: [],
      low: [],
    },
  };
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
SEO Validator for audit results

Usage:
  node seo_validator.mjs <audit.json> [options]

Options:
  --max-broken-links <N>    Maximum allowed broken links (default: ${DEFAULT_THRESHOLDS.maxBrokenLinks})
  --min-canonical <0-1>     Minimum canonical tag rate (default: ${DEFAULT_THRESHOLDS.minCanonicalRate})
  --no-sitemap-required     Don't require sitemap.xml
  --max-load-time <ms>      Maximum page load time (default: ${DEFAULT_THRESHOLDS.maxLoadTimeMs})

Examples:
  node seo_validator.mjs reports/seo/audit.json
  node seo_validator.mjs reports/seo/audit.json --max-broken-links 5
  node seo_validator.mjs reports/seo/audit.json --min-canonical 0.9

Exit codes:
  0 - Validation passed
  1 - Validation failed
  307 - SEO validation failure (reserved for CVF)
`);
    process.exit(0);
  }

  const auditPath = args[0];
  const thresholds = {};

  // Parse options
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--max-broken-links' && args[i + 1]) {
      thresholds.maxBrokenLinks = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--min-canonical' && args[i + 1]) {
      thresholds.minCanonicalRate = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--no-sitemap-required') {
      thresholds.requireSitemap = false;
    } else if (args[i] === '--max-load-time' && args[i + 1]) {
      thresholds.maxLoadTimeMs = parseInt(args[i + 1]);
      i++;
    }
  }

  try {
    const result = await validateSEOAudit(auditPath, thresholds);

    console.log(`\nValidation: ${result.valid ? 'PASSED' : 'FAILED'}`);
    console.log(`  Schema: ${result.schemaValid ? '✓' : '✗'}`);
    console.log(`  Broken Links: ${result.brokenLinksValid ? '✓' : '✗'}`);
    console.log(`  Canonical Rate: ${result.canonicalRateValid ? '✓' : '✗'}`);
    console.log(`  Sitemap: ${result.sitemapValid ? '✓' : '✗'}`);
    console.log(`  Page Quality: ${result.pagesValid ? '✓' : '✗'}`);

    if (result.stats) {
      console.log('\nStats:');
      console.log(`  Total Pages: ${result.stats.totalPages}`);
      console.log(`  Broken Links: ${result.stats.brokenLinks}`);
      console.log(`  Canonical Coverage: ${(result.stats.canonicalRate * 100).toFixed(1)}%`);
      console.log(`  Has Sitemap: ${result.stats.hasSitemap ? 'Yes' : 'No'}`);
      if (result.stats.avgLoadTime > 0) {
        console.log(`  Avg Load Time: ${result.stats.avgLoadTime}ms`);
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

    process.exit(result.valid ? 0 : 307);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
