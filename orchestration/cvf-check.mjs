#!/usr/bin/env node
/**
 * Swarm1 — CVF Gate: Artifact Presence & Basic Validation
 *
 * Usage:
 *   node orchestration/cvf-check.mjs AUV-0002
 *   node orchestration/cvf-check.mjs AUV-0002 --strict   # same for now; reserved for future checks
 *   node orchestration/cvf-check.mjs AUV-0003
 * 
 * Behavior:
 * - Looks up the expected artifact list for the provided AUV-ID.
 * - Fails if any path is missing.
 * - For *.json artifacts, ensures they can be parsed as JSON.
 * - Prints a friendly PASS/FAIL summary and returns exit code 0/1.
 */

import fs from 'fs';
import path from 'path';

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

function expectedArtifacts(auvId) {
  // Add a case per AUV. Keep paths stable so CI & agents can rely on them.
  if (auvId === "AUV-0002") {
    return [
      "runs/AUV-0002/api/get_products_200.json",
      "runs/AUV-0002/ui/products_grid.png",
      "runs/AUV-0002/ui/product_detail.png",
      "runs/AUV-0002/perf/lighthouse.json"
    ];
  }
  if (auvId === "AUV-0003") {
    return [
      "runs/AUV-0003/ui/products_search.png",
      "runs/AUV-0003/perf/lighthouse.json"
    ];
  }
  if (auvId === "AUV-0004") {
    return [
      "runs/AUV-0004/ui/cart_summary.png",
      "runs/AUV-0004/perf/lighthouse.json"
    ];
  }
  if (auvId === "AUV-0005") {
    return [ "runs/AUV-0005/ui/checkout_success.png" ];
  }    
  return null; // unknown AUV
}

function validateSpecial(file) {
  // Minimal sanity checks for certain artifact types
  const base = path.basename(file).toLowerCase();
  if (base === 'lighthouse.json') {
    const j = readJsonSafe(file);
    if (!j) return 'invalid JSON';
    const perf = j?.categories?.performance?.score;
    if (typeof perf !== 'number') return 'missing performance score';
    // (Optional) enforce budgets here if you want:
    // const lcp = j?.audits?.['largest-contentful-paint']?.numericValue;
    // if (typeof lcp === 'number' && lcp > 2500) return `LCP too high: ${lcp}ms`;
  }
  return null;
}

function main() {
  const auvId = process.argv[2];
  if (!auvId) {
    console.error('Usage: node orchestration/cvf-check.mjs <AUV-ID>');
    process.exit(2);
  }

  const required = expectedArtifacts(auvId);
  if (!required) {
    console.error(`[CVF] FAIL — no artifact definition for '${auvId}'. Update expectedArtifacts().`);
    process.exit(1);
  }

  const missing = [];
  const invalid = [];

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

  console.log('[CVF] PASS — required artifacts found and valid:');
  for (const f of required) console.log(' -', f);
}

main();
