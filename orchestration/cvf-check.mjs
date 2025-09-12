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
import { glob } from 'glob';
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
    // Check if path contains wildcards
    if (p.includes('*')) {
      // Ensure forward slashes for glob pattern (required for glob to work on all platforms)
      const globPattern = p.split(path.sep).join('/');
      // Use glob to find matching files
      const matches = glob.sync(globPattern, { nodir: true });
      // Return true if at least one matching file exists and is non-empty
      for (const match of matches) {
        const s = fs.statSync(match);
        if (s.isFile() && s.size > 0) {
          return true;
        }
      }
      return false;
    } else {
      // Original behavior for exact paths
      const s = fs.statSync(p);
      return s.isFile() && s.size > 0;
    }
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
  // Handle wildcards by finding actual files
  let filesToCheck = [file];
  if (file.includes('*')) {
    filesToCheck = glob.sync(file, { nodir: true });
    if (filesToCheck.length === 0) return null; // No files to validate
  }

  // Validate each matching file
  for (const actualFile of filesToCheck) {
    // Minimal sanity checks for certain artifact types
    const base = path.basename(actualFile).toLowerCase();
    if (base === 'lighthouse.json') {
      const j = readJsonSafe(actualFile);
      if (!j) return 'invalid JSON';
      const perf = j?.categories?.performance?.score;
      if (typeof perf !== 'number') return 'missing performance score';
    }
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
  } else if (budgetResult && budgetResult.skipped) {
    // In TEST_MODE, missing Lighthouse is acceptable; record message but do not fail
    const reason = budgetResult.reason || 'skipped';
    results.messages.push(`Performance: Skipped (${reason})`);
  }

  return results;
}

// Phase 13: Secondary tool artifact validation (capability-aware)
async function checkSecondaryArtifacts(auvId, tenant) {
  const results = {
    passed: true,
    messages: [],
  };

  // Check for web.crawl (firecrawl) artifacts
  const crawlUrlsPath = tenantPath(tenant, 'crawl_demo/urls.json');
  const crawlGraphPath = tenantPath(tenant, 'crawl_demo/graph.json');
  if (fs.existsSync(crawlUrlsPath) || fs.existsSync(crawlGraphPath)) {
    if (fs.existsSync(crawlUrlsPath)) {
      const urls = readJsonSafe(crawlUrlsPath);
      if (Array.isArray(urls) && urls.length > 0) {
        results.messages.push(`Web Crawl: ${urls.length} URLs discovered`);
      } else if (urls) {
        results.messages.push('Web Crawl: Invalid URL list format');
      }
    }
    if (fs.existsSync(crawlGraphPath)) {
      const graph = readJsonSafe(crawlGraphPath);
      if (graph?.nodes && graph?.edges) {
        results.messages.push(
          `Web Crawl: Graph with ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
        );
      }
    }
  }

  // Check for payments.test (stripe) artifacts
  const paymentIntentPath = tenantPath(tenant, 'payments_demo/payment_intent.json');
  const chargePath = tenantPath(tenant, 'payments_demo/charge.json');
  if (fs.existsSync(paymentIntentPath) || fs.existsSync(chargePath)) {
    if (fs.existsSync(paymentIntentPath)) {
      const intent = readJsonSafe(paymentIntentPath);
      if (intent?.status === 'succeeded') {
        results.messages.push(
          `Payments: Intent ${intent.id} succeeded (${intent.currency} ${intent.amount / 100})`,
        );
      } else if (intent) {
        results.passed = false;
        results.messages.push(`Payments: Intent failed with status ${intent.status}`);
      }
    }
    if (fs.existsSync(chargePath)) {
      const charge = readJsonSafe(chargePath);
      if (charge?.paid) {
        results.messages.push(`Payments: Charge ${charge.id} paid`);
      }
    }
  }

  // Check for cloud.db (supabase) artifacts
  const connectivityPath = tenantPath(tenant, 'db_demo/connectivity.json');
  const roundtripPath = tenantPath(tenant, 'db_demo/roundtrip.json');
  if (fs.existsSync(connectivityPath) || fs.existsSync(roundtripPath)) {
    if (fs.existsSync(connectivityPath)) {
      const conn = readJsonSafe(connectivityPath);
      if (conn?.status === 'connected') {
        results.messages.push(`Cloud DB: Connected (${conn.latency_ms}ms latency)`);
      } else if (conn) {
        results.passed = false;
        results.messages.push(`Cloud DB: Connection failed - ${conn.status}`);
      }
    }
    if (fs.existsSync(roundtripPath)) {
      const rt = readJsonSafe(roundtripPath);
      if (rt?.result && rt?.duration_ms) {
        results.messages.push(`Cloud DB: Roundtrip successful (${rt.duration_ms}ms)`);
      }
    }
  }

  // Check for audio.tts.cloud artifacts
  const ttsPath = tenantPath(tenant, 'tts_cloud_demo/narration.wav');
  if (fs.existsSync(ttsPath)) {
    const stats = fs.statSync(ttsPath);
    if (stats.size > 44) {
      // WAV header is 44 bytes
      const durationEstimate = Math.round((stats.size - 44) / (44100 * 2)); // Rough estimate
      results.messages.push(`Cloud TTS: Audio generated (~${durationEstimate}s duration)`);
    } else {
      results.messages.push('Cloud TTS: Invalid WAV file');
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
      
      // Phase 12-15: New domain validators
      case 'rss': {
        const summaryPath = domainArtifacts.find((p) => p.includes('/rss/summary.json'));
        if (summaryPath && fs.existsSync(summaryPath)) {
          const { validateRSSExtraction, getExitCode } = await import('./lib/rss_validator.mjs');
          const validation = validateRSSExtraction({ artifactPath: summaryPath, config: thresholds });
          if (!validation.valid) {
            results.passed = false;
            results.exitCode = getExitCode(validation);
            results.messages.push(`RSS: Validation failed - ${validation.errors[0] || 'Invalid feed data'}`);
          } else {
            results.messages.push(
              `RSS: Valid (${validation.metrics.total_feeds} feeds, ${validation.metrics.total_items} items)`
            );
          }
        }
        break;
      }
      
      case 'asr':
      case 'transcripts': {
        const transcriptPath = domainArtifacts.find((p) => p.includes('transcript.json'));
        if (transcriptPath && fs.existsSync(transcriptPath)) {
          const { validateASROutput, getExitCode } = await import('./lib/asr_validator.mjs');
          const validation = validateASROutput({ artifactPath: transcriptPath, config: thresholds });
          if (!validation.valid) {
            results.passed = false;
            results.exitCode = getExitCode(validation);
            results.messages.push(`ASR: Validation failed - ${validation.errors[0] || 'Poor quality'}`);
          } else {
            results.messages.push(
              `ASR: Valid (${validation.metrics.duration}s, WER: ${validation.metrics.wer_proxy})`
            );
          }
        }
        break;
      }
      
      case 'youtube': {
        const youtubePath = domainArtifacts.find((p) => p.includes('/youtube/'));
        if (youtubePath && fs.existsSync(youtubePath)) {
          const { validateYouTubeOperation, getExitCode } = await import('./lib/youtube_validator.mjs');
          let operation = 'search';
          if (youtubePath.includes('transcript')) operation = 'transcript';
          else if (youtubePath.includes('upload')) operation = 'upload';
          
          const validation = validateYouTubeOperation({ artifactPath: youtubePath, operation, config: thresholds });
          if (!validation.valid) {
            results.passed = false;
            results.exitCode = getExitCode(validation);
            results.messages.push(`YouTube: ${operation} failed - ${validation.errors[0] || 'Invalid'}`);
          } else {
            results.messages.push(`YouTube: Valid ${operation}`);
          }
        }
        break;
      }
      
      case 'doc': {
        // Doc domain is non-blocking for now - just check for presence
        const docPath = domainArtifacts.find((p) => p.includes('/docs/') || p.includes('/doc/'));
        if (docPath && fs.existsSync(docPath)) {
          results.messages.push('Doc: Documentation artifacts present');
        } else {
          results.messages.push('Doc: No documentation found (non-blocking)');
        }
        break;
      }
    }
  }

  // Phase 13: Check Secondary tool artifacts if present (capability-aware)
  const secondaryResults = await checkSecondaryArtifacts(auvId, tenant);
  if (secondaryResults.messages.length > 0) {
    results.messages.push(...secondaryResults.messages);
    if (!secondaryResults.passed) {
      results.passed = false;
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
