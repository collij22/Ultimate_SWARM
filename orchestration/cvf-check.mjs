#!/usr/bin/env node
/**
 * Swarm1 — CVF Gate: Artifact Presence & Quality Validation
 *
 * Usage:
 *   node orchestration/cvf-check.mjs AUV-0002
 *   node orchestration/cvf-check.mjs AUV-0002 --strict   # enforce security/visual/budgets
 *   node orchestration/cvf-check.mjs AUV-0003 --domains data,charts  # check specific domains
 *
 * Behavior:
 * - Looks up the expected artifact list for the provided AUV-ID.
 * - Fails if any path is missing.
 * - For *.json artifacts, ensures they can be parsed as JSON.
 * - Evaluates performance budgets if defined (Phase 6).
 * - Checks security results if required (Phase 6).
 * - Validates visual regression if configured (Phase 6).
 * - Validates domain-specific artifacts (Phase 11).
 * - Prints a friendly PASS/FAIL summary and returns exit code 0/1.
 */

import fs from 'fs';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import {
  expectedArtifacts,
  expectedArtifactsByDomain,
  detectDomainsWithArtifacts,
} from './lib/expected_artifacts.mjs';
import { evaluateBudget } from './lib/budget_evaluator.mjs';
import { tenantPath } from './lib/tenant.mjs';
import { validateInsights } from './lib/data_validator.mjs';
import { validateCharts } from './lib/chart_validator.mjs';
import { validateSEOAudit } from './lib/seo_validator.mjs';
import { validateMediaCompose } from './lib/media_validator.mjs';
import { validateMigrationResult } from './lib/db_migration_validator.mjs';
import { loadThresholds } from './lib/threshold_loader.mjs';

function statNonEmpty(p) {
  try {
    const s = fs.statSync(p);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// Re-export for backward compatibility if other files import from here
export { expectedArtifacts };

function validateSpecial(file) {
  // Minimal sanity checks for certain artifact types
  const base = path.basename(file).toLowerCase();
  if (base === 'lighthouse.json') {
    const j = readJsonSafe(file);
    if (!j) return 'invalid JSON';
    const perf = j?.categories?.performance?.score;
    if (typeof perf !== 'number') return 'missing performance score';
  }
  return null;
}

async function checkSecurityGates(auvId, strict) {
  const results = {
    passed: true,
    messages: [],
  };

  const tenant = process.env.TENANT_ID || 'default';

  // Check Semgrep results if they exist
  const semgrepPath = path.join(process.cwd(), tenantPath(tenant, 'security/semgrep.json'));
  if (fs.existsSync(semgrepPath)) {
    const semgrep = readJsonSafe(semgrepPath);
    if (semgrep?.blocked > 0) {
      results.passed = false;
      results.messages.push(`Security: ${semgrep.blocked} high/critical finding(s) detected`);
    } else if (semgrep) {
      results.messages.push(
        `Security: Semgrep passed (${semgrep.totals.high} high, ${semgrep.totals.medium} medium)`,
      );
    }
  } else if (strict) {
    results.messages.push('Security: Semgrep scan not run');
  }

  // Check Gitleaks results if they exist
  const gitleaksPath = path.join(process.cwd(), tenantPath(tenant, 'security/gitleaks.json'));
  if (fs.existsSync(gitleaksPath)) {
    const gitleaks = readJsonSafe(gitleaksPath);
    if (gitleaks?.blocked > 0) {
      results.passed = false;
      results.messages.push(`Security: ${gitleaks.blocked} secret(s) detected`);
    } else if (gitleaks) {
      results.messages.push('Security: Gitleaks passed (no secrets found)');
    }
  } else if (strict) {
    results.messages.push('Security: Gitleaks scan not run');
  }

  return results;
}

async function checkVisualRegression(auvId, strict) {
  const results = {
    passed: true,
    messages: [],
  };

  const tenant = process.env.TENANT_ID || 'default';
  const visualPath = path.join(process.cwd(), tenantPath(tenant, `visual/${auvId}/visual.json`));
  if (fs.existsSync(visualPath)) {
    const visual = readJsonSafe(visualPath);
    if (visual?.failed > 0) {
      results.passed = false;
      results.messages.push(`Visual: ${visual.failed} route(s) exceeded threshold`);
    } else if (visual) {
      results.messages.push(`Visual: All ${visual.total_routes} route(s) within threshold`);
    }
  } else if (strict) {
    // Check if visual tests are configured for this AUV
    const configPath = path.join(process.cwd(), 'capabilities', `${auvId}.yaml`);
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = parseYaml(content);
      if (config?.visual?.routes?.length > 0) {
        results.messages.push('Visual: Regression tests not run (but configured)');
      }
    }
  }

  return results;
}

async function checkPerformanceBudgets(auvId) {
  const results = {
    passed: true,
    messages: [],
  };

  // Try to evaluate budgets
  const budgetResult = await evaluateBudget(auvId);
  if (budgetResult && !budgetResult.skipped) {
    if (!budgetResult.passed) {
      results.passed = false;
      results.messages.push(
        `Performance: ${budgetResult.violations?.length || 0} budget violation(s)`,
      );
      budgetResult.violations?.forEach((v) => {
        results.messages.push(`  - ${v.metric}: +${v.percentOver}% over budget`);
      });
    } else {
      results.messages.push('Performance: All budgets met');
    }
  }

  return results;
}

// Phase 11: Domain-specific validation
async function checkDomainArtifacts(auvId, domains, tenant) {
  const results = {
    passed: true,
    messages: [],
    exitCode: 0,
  };

  for (const domain of domains) {
    const domainArtifacts = expectedArtifactsByDomain(auvId, domain, tenant);
    const thresholds = loadThresholds(auvId, domain);

    switch (domain) {
      case 'data': {
        // Find and validate insights.json
        const insightsPath = domainArtifacts.find((p) => p.endsWith('insights.json'));
        if (insightsPath && fs.existsSync(insightsPath)) {
          const validation = await validateInsights(insightsPath, thresholds);
          if (!validation.valid) {
            results.passed = false;
            results.exitCode = 305;
            results.messages.push(`Data: Validation failed - ${validation.errors[0]}`);
          } else {
            results.messages.push(`Data: Valid (${validation.data?.data_row_count || 0} rows)`);
          }
        }
        break;
      }

      case 'charts': {
        // Find and validate all chart PNGs
        const chartPaths = domainArtifacts.filter((p) => p.endsWith('.png'));
        if (chartPaths.length > 0) {
          const existing = chartPaths.filter((p) => fs.existsSync(p));
          if (existing.length > 0) {
            const validation = await validateCharts(existing, thresholds);
            if (!validation.valid) {
              results.passed = false;
              results.exitCode = 306;
              results.messages.push(
                `Charts: ${validation.failed}/${validation.total} failed validation`,
              );
            } else {
              results.messages.push(`Charts: All ${validation.total} charts valid`);
            }
          }
        }
        break;
      }

      case 'seo': {
        // Find and validate SEO audit
        const auditPath = domainArtifacts.find((p) => p.includes('audit.json'));
        if (auditPath && fs.existsSync(auditPath)) {
          const validation = await validateSEOAudit(auditPath, thresholds);
          if (!validation.valid) {
            results.passed = false;
            results.exitCode = 307;
            results.messages.push(`SEO: Validation failed - ${validation.errors[0]}`);
          } else {
            const stats = validation.stats;
            results.messages.push(
              `SEO: Valid (${stats.totalPages} pages, ${stats.brokenLinks} broken links)`,
            );
          }
        }
        break;
      }

      case 'media': {
        // Find and validate media composition metadata
        const metadataPath = domainArtifacts.find((p) => p.includes('compose-metadata.json'));
        if (metadataPath && fs.existsSync(metadataPath)) {
          const validation = await validateMediaCompose(metadataPath, thresholds);
          if (!validation.valid) {
            results.passed = false;
            results.exitCode = 308;
            results.messages.push(`Media: Validation failed - ${validation.errors[0]}`);
          } else {
            const variance = (validation.metadata.durationVariance * 100).toFixed(1);
            results.messages.push(`Media: Valid (duration variance ${variance}%)`);
          }
        }
        break;
      }

      case 'db': {
        // Find and validate migration result
        const migrationPath = domainArtifacts.find((p) => p.includes('migration-result.json'));
        if (migrationPath && fs.existsSync(migrationPath)) {
          const validation = await validateMigrationResult(migrationPath, thresholds);
          if (!validation.valid) {
            results.passed = false;
            results.exitCode = 309;
            results.messages.push(`DB: Migration failed - ${validation.errors[0]}`);
          } else {
            const stats = validation.stats;
            results.messages.push(`DB: Valid (${stats.applied} applied, ${stats.failed} failed)`);
          }
        }
        break;
      }
    }
  }

  return results;
}

async function main() {
  const auvId = process.argv[2];
  if (!auvId) {
    console.error('Usage: node orchestration/cvf-check.mjs <AUV-ID> [--strict] [--domains <list>]');
    process.exit(2);
  }

  const strict = process.argv.includes('--strict');
  const tenant = process.env.TENANT_ID || 'default';

  // Parse domain list if provided
  let domains = [];
  const domainsIndex = process.argv.indexOf('--domains');
  if (domainsIndex > -1 && process.argv[domainsIndex + 1]) {
    domains = process.argv[domainsIndex + 1].split(',').map((d) => d.trim());
  } else if (strict) {
    // Auto-detect domains when --strict is passed without --domains
    domains = detectDomainsWithArtifacts(auvId, tenant);
    if (domains.length > 0) {
      console.log(`[CVF] Auto-detected domains for validation: ${domains.join(', ')}`);
    }
  }

  const required = expectedArtifacts(auvId, tenant);
  if (!required) {
    console.error(
      `[CVF] FAIL — no artifact definition for '${auvId}'. Update expectedArtifacts().`,
    );
    process.exit(1);
  }

  const missing = [];
  const invalid = [];
  let allPassed = true;
  const messages = [];

  // Check required artifacts
  for (const f of required) {
    if (!statNonEmpty(f)) {
      missing.push(f);
      continue;
    }
    const reason = validateSpecial(f);
    if (reason) invalid.push(`${f} (${reason})`);
  }

  if (missing.length || invalid.length) {
    console.error('[CVF] FAIL — artifacts check');
    if (missing.length) {
      console.error('Missing:');
      for (const m of missing) console.error(' -', m);
    }
    if (invalid.length) {
      console.error('Invalid:');
      for (const v of invalid) console.error(' -', v);
    }
    process.exit(1);
  }

  // Phase 6: Extended quality checks

  // Check security gates
  const securityResults = await checkSecurityGates(auvId, strict);
  if (!securityResults.passed) allPassed = false;
  messages.push(...securityResults.messages);

  // Check visual regression
  const visualResults = await checkVisualRegression(auvId, strict);
  if (!visualResults.passed) allPassed = false;
  messages.push(...visualResults.messages);

  // Check performance budgets
  const budgetResults = await checkPerformanceBudgets(auvId);
  if (!budgetResults.passed) allPassed = false;
  messages.push(...budgetResults.messages);

  // Phase 11: Check domain-specific artifacts if requested
  let domainExitCode = 0;
  if (domains.length > 0) {
    const domainResults = await checkDomainArtifacts(auvId, domains, tenant);
    if (!domainResults.passed) {
      allPassed = false;
      domainExitCode = domainResults.exitCode;
    }
    messages.push(...domainResults.messages);
  }

  // Print results
  if (allPassed) {
    console.log('[CVF] PASS — all quality gates passed:');
    for (const f of required) console.log(' -', f);
    if (messages.length > 0) {
      console.log('\nQuality checks:');
      messages.forEach((m) => console.log(`  ${m}`));
    }
  } else {
    console.error('[CVF] FAIL — quality gate violations:');
    messages.forEach((m) => {
      if (m.includes('detected') || m.includes('exceeded') || m.includes('violation')) {
        console.error(`  ✗ ${m}`);
      } else {
        console.log(`  ✓ ${m}`);
      }
    });
    process.exit(domainExitCode || 1);
  }
}

// Only run main if this script is executed directly
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch(console.error);
}
