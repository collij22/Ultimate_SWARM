#!/usr/bin/env node
/**
 * Shared module for expected artifact definitions
 * Used by runbook, CVF check, and artifact consistency check
 * This avoids circular dependencies and unnecessary imports
 */

import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { tenantPath } from './tenant.mjs';

function lookupFromCapabilityYaml(auvId) {
  try {
    const p = path.resolve(process.cwd(), 'capabilities', `${auvId}.yaml`);
    if (!fs.existsSync(p)) return null;
    const cap = YAML.parse(fs.readFileSync(p, 'utf8'));
    const req = cap?.artifacts?.required;
    return Array.isArray(req) && req.length ? req : null;
  } catch {
    return null;
  }
}

/**
 * Get expected artifacts for a given AUV
 * @param {string} auvId - The AUV identifier (e.g., 'AUV-0002')
 * @param {string} [tenant] - Optional tenant ID (defaults to process.env.TENANT_ID or 'default')
 * @returns {string[]} Array of expected artifact paths
 */
export function expectedArtifacts(auvId, tenant = process.env.TENANT_ID || 'default') {
  // Prefer dynamic artifacts defined in the capability YAML if present
  const dyn = lookupFromCapabilityYaml(auvId);
  if (Array.isArray(dyn) && dyn.length) {
    // Normalize dynamic artifacts to a glob that accepts legacy and tenant-scoped paths
    // Example: runs/AUV-0003/perf/lighthouse.json -> runs/**/AUV-0003/perf/lighthouse.json
    return dyn.map((artifact) => {
      if (artifact.startsWith('runs/')) {
        const relativePath = artifact.substring(5); // Remove 'runs/' prefix
        const globPath = ['runs', '**', relativePath].join('/');
        return globPath;
      }
      return artifact;
    });
  }

  // Fallback to static mappings for legacy AUVs
  switch (auvId) {
    case 'AUV-0002':
      // Accept both legacy (non-tenant) and tenant-scoped paths
      return [
        'runs/**/AUV-0002/ui/products_grid.png',
        'runs/**/AUV-0002/ui/product_detail.png',
        'runs/**/AUV-0002/perf/lighthouse.json',
      ];
    case 'AUV-0003':
      return [
        'runs/**/AUV-0003/ui/products_search.png',
        'runs/**/AUV-0003/perf/lighthouse.json',
      ];
    case 'AUV-0004':
      return [
        'runs/**/AUV-0004/ui/cart_summary.png',
        'runs/**/AUV-0004/perf/lighthouse.json',
      ];
    case 'AUV-0005':
      return [
        'runs/**/AUV-0005/ui/checkout_success.png',
        'runs/**/AUV-0005/perf/lighthouse.json',
      ];
    case 'AUV-9999':
      // Test AUV - minimal artifacts for unit tests
      return [tenantPath(tenant, 'AUV-9999/result-cards/runbook-summary.json')];
    case 'AUV-9998':
      // Test AUV - minimal artifacts for unit tests
      return [tenantPath(tenant, 'AUV-9998/result-cards/runbook-summary.json')];

    // Phase 11 demo AUVs with comprehensive artifacts
    case 'AUV-DATA-001':
      // Data pipeline demo
      return [
        tenantPath(tenant, 'AUV-DATA-001/data/raw/input.csv'),
        tenantPath(tenant, 'AUV-DATA-001/data/processed/cleaned.csv'),
        tenantPath(tenant, 'AUV-DATA-001/insights.json'),
        tenantPath(tenant, 'AUV-DATA-001/charts/revenue.png'),
        tenantPath(tenant, 'AUV-DATA-001/charts/trends.png'),
        tenantPath(tenant, 'AUV-DATA-001/charts/categories.png'),
      ];

    case 'AUV-SEO-001':
      // SEO audit demo
      return [
        tenantPath(tenant, 'AUV-SEO-001/reports/seo/audit.json'),
        tenantPath(tenant, 'AUV-SEO-001/reports/seo/sitemap-check.json'),
        tenantPath(tenant, 'AUV-SEO-001/reports/seo/summary.md'),
        tenantPath(tenant, 'AUV-SEO-001/reports/seo/report.html'),
      ];

    case 'AUV-MEDIA-001':
      // Media composition demo
      return [
        tenantPath(tenant, 'AUV-MEDIA-001/media/script.txt'),
        tenantPath(tenant, 'AUV-MEDIA-001/media/narration.wav'),
        tenantPath(tenant, 'AUV-MEDIA-001/media/final.mp4'),
        tenantPath(tenant, 'AUV-MEDIA-001/media/compose-metadata.json'),
      ];

    case 'AUV-DB-001':
      // Database migration demo
      return [
        tenantPath(tenant, 'AUV-DB-001/db/schema.sql'),
        tenantPath(tenant, 'AUV-DB-001/db/migration-result.json'),
        tenantPath(tenant, 'AUV-DB-001/db/validation-queries.sql'),
      ];

    // Phase 11 demo AUVs
    case 'AUV-1201':
      // Data insights demo - ingestion and analysis
      // Note: These artifacts are created under runs/<runId>/ by the executors
      // The runId is dynamic, so we return wildcard patterns that CVF will resolve
      return [
        'runs/*/data/checksum_manifest.json', // Created by data_ingest_executor
        'runs/*/data/insights.json', // Created by data_insights_executor
        'runs/*/charts/bar.png', // Created by chart_render_executor
      ];

    case 'AUV-1202':
      // SEO audit demo
      return ['reports/seo/audit.json'];

    default: {
      // No dynamic definition available
      return [];
    }
  }
}

/**
 * Get expected artifacts for specific domains
 * @param {string} auvId - The AUV identifier
 * @param {string} domain - Domain type (data, charts, seo, media, db)
 * @param {string} [tenant] - Optional tenant ID
 * @returns {string[]} Array of expected artifact paths for the domain
 */
export function expectedArtifactsByDomain(
  auvId,
  domain,
  tenant = process.env.TENANT_ID || 'default',
) {
  // Special handling for Phase 11 demo AUVs that use wildcard paths
  if (auvId === 'AUV-1201') {
    switch (domain) {
      case 'data':
        return ['runs/*/data/checksum_manifest.json', 'runs/*/data/insights.json'];
      case 'charts':
        return ['runs/*/charts/bar.png'];
      case 'media':
        return ['media/narration.wav', 'media/final.mp4', 'media/compose-metadata.json'];
      default:
        return [];
    }
  }

  if (auvId === 'AUV-1202') {
    switch (domain) {
      case 'seo':
        return ['reports/seo/audit.json'];
      default:
        return [];
    }
  }

  const allArtifacts = expectedArtifacts(auvId, tenant);

  // Filter artifacts by domain patterns
  const domainPatterns = {
    data: [/\/data\//, /insights\.json$/],
    charts: [/\/charts\/.*\.png$/],
    seo: [/\/reports\/seo\//, /seo.*\.(json|md|html)$/],
    media: [/\/media\//, /\.(wav|mp3|mp4)$/, /compose-metadata\.json$/],
    db: [/\/db\//, /migration-result\.json$/, /\.sql$/],
    rss: [/\/rss\//, /feed.*\.json$/, /rss-content\.json$/],
    asr: [/\/transcripts\//, /transcript.*\.(json|txt|vtt)$/],
    youtube: [/\/youtube\//, /youtube.*\.json$/, /upload-result\.json$/],
    nlp: [/\/nlp\//, /summary\.json$/, /extract\.json$/, /entities\.json$/],
    ocr: [/\/ocr\//, /extracted-text\.txt$/, /ocr-result\.json$/],
    doc: [/\/docs\//, /\.md$/, /report\.(html|pdf)$/],
  };

  const patterns = domainPatterns[domain];
  if (!patterns) return [];

  return allArtifacts.filter((artifact) => patterns.some((pattern) => pattern.test(artifact)));
}

/**
 * Get all AUVs that have expected artifacts defined
 * @returns {string[]} Array of AUV identifiers
 */
export function getAuvsWithArtifacts() {
  // Static known + any generated with artifacts.required present
  const base = ['AUV-0002', 'AUV-0003', 'AUV-0004', 'AUV-0005'];
  try {
    const dir = path.resolve(process.cwd(), 'capabilities');
    if (!fs.existsSync(dir)) return base;
    const files = fs.readdirSync(dir).filter((f) => /^AUV-\d{1,4}\.yaml$/.test(f));
    for (const f of files) {
      const id = f.replace(/\.yaml$/, '');
      const dyn = lookupFromCapabilityYaml(id);
      if (Array.isArray(dyn) && dyn.length && !base.includes(id)) base.push(id);
    }
  } catch {}
  return base;
}

/**
 * Auto-detect which domains have artifacts for this AUV
 * @param {string} auvId - The AUV identifier
 * @param {string} [tenant] - Optional tenant ID
 * @returns {string[]} Array of domain names that have artifacts
 */
export function detectDomainsWithArtifacts(auvId, tenant = process.env.TENANT_ID || 'default') {
  const allArtifacts = expectedArtifacts(auvId, tenant);
  if (!allArtifacts || allArtifacts.length === 0) return [];

  const domains = ['data', 'charts', 'seo', 'media', 'db', 'rss', 'asr', 'youtube', 'nlp', 'ocr', 'doc'];
  const detectedDomains = [];

  for (const domain of domains) {
    const domainArtifacts = expectedArtifactsByDomain(auvId, domain, tenant);
    if (domainArtifacts.length > 0) {
      detectedDomains.push(domain);
    }
  }

  return detectedDomains;
}
