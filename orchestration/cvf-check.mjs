#!/usr/bin/env node
/**
 * Swarm1 — CVF Gate: Artifact Presence & Basic Validation
 *
 * Usage:
 *   node orchestration/cvf-check.mjs AUV-0002
 *   node orchestration/cvf-check.mjs AUV-0002 --strict   # same for now; reserved for future checks
 *
 * Behavior:
 * - Looks up the expected artifact list for the provided AUV-ID.
 * - Fails if any path is missing.
 * - For *.json artifacts, ensures they can be parsed as JSON.
 * - Prints a friendly PASS/FAIL summary and returns exit code 0/1.
 */

import fs from "fs";
import path from "path";

function exists(p) {
  try { fs.accessSync(p, fs.constants.F_OK); return true; }
  catch { return false; }
}

function readJSON(p) {
  try { return { ok: true, data: JSON.parse(fs.readFileSync(p, "utf-8")) }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

/**
 * Expected artifacts per AUV. Keep IDs stable and make paths deterministic.
 * Tip: if you change where tests save artifacts, update this list accordingly.
 */
function expectedArtifacts(auvId) {
  // AUV-0002 — Product Listing & Detail
  if (auvId === "AUV-0002") {
    return [
      "runs/AUV-0002/api/get_products_200.json",
      "runs/AUV-0002/ui/products_grid.png",
      "runs/AUV-0002/ui/product_detail.png",
      "runs/AUV-0002/perf/lighthouse.json",
    ];
  }

  // AUV-0001 — Cart demo (UI + API proofs)
  if (auvId === "AUV-0001") {
    return [
      "runs/AUV-0001/api/post_cart_200.json",
      // UI screenshot is saved under a project-named folder; default we used:
      "runs/AUV-0001/AUV-0001 UI/cart_after.png",
    ];
  }

  // Default: empty list (no opinion)
  return [];
}

function main() {
  const auvId = process.argv[2];
  if (!auvId) {
    console.error("Usage: node orchestration/cvf-check.mjs <AUV-ID> [--strict]");
    process.exit(2);
  }

  const artifacts = expectedArtifacts(auvId);
  if (!artifacts.length) {
    console.error(`[CVF] FAIL — no artifact definition for '${auvId}'. Update expectedArtifacts().`);
    process.exit(1);
  }

  const missing = [];
  const invalid = [];

  for (const rel of artifacts) {
    const p = path.resolve(process.cwd(), rel);
    if (!exists(p)) {
      missing.push(rel);
      continue;
    }
    if (rel.toLowerCase().endsWith(".json")) {
      const { ok, error } = readJSON(p);
      if (!ok) invalid.push({ path: rel, reason: `Invalid JSON: ${error}` });
    }
  }

  if (missing.length || invalid.length) {
    console.error("[CVF] FAIL — artifacts check");
    if (missing.length) {
      console.error("Missing:");
      for (const m of missing) console.error(" - " + m);
    }
    if (invalid.length) {
      console.error("Invalid JSON:");
      for (const iv of invalid) console.error(` - ${iv.path} (${iv.reason})`);
    }
    process.exit(1);
  }

  console.log("[CVF] PASS — required artifacts found and valid:");
  for (const a of artifacts) console.log(" - " + a);
  process.exit(0);
}

try { main(); } catch (e) {
  console.error("[CVF] ERROR — unexpected:", e?.message || e);
  process.exit(1);
}
