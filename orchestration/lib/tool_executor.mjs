#!/usr/bin/env node
/**
 * Tool Executor (Phase 10b-3)
 *
 * Executes selected tool plans for subagent tool_requests with:
 * - Per-RUN_ID + checksum caching of results
 * - Minimal capability coverage (web.search/web.fetch via web_search_fetch)
 * - Artifact linking and normalized outputs
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { tenantPath } from './tenant.mjs';

/**
 * Compute a stable SHA-256 hash for a JS value.
 * @param {unknown} value
 */
function hashValue(value) {
  const json = JSON.stringify(value, Object.keys(value || {}).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
}

/**
 * Return cache file path for a capability and key under runs/cache
 * @param {string} tenant
 * @param {string} capability
 * @param {string} keyHash
 */
function getCachePath(tenant, capability, keyHash) {
  const rel = `cache/${capability}/${keyHash}.json`;
  return tenantPath(tenant, rel);
}

/**
 * Try to read cache entry and verify artifacts exist.
 */
function readCache(cachePath) {
  try {
    if (!fs.existsSync(cachePath)) return null;
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (Array.isArray(data.artifacts) && data.artifacts.every((p) => fs.existsSync(p))) {
      return data;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeCache(cachePath, payload) {
  const dir = path.dirname(cachePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2));
}

/**
 * Execute a tool_request using selected tools (first plan item) with basic capability coverage.
 * @param {{
 *   tenant: string,
 *   runId: string,
 *   toolRequest: {
 *     capability: string,
 *     input_spec?: any,
 *     expected_artifacts?: string[],
 *   },
 *   selectedTools: Array<{ tool_id: string, capabilities: string[] }>,
 * }} params
 */
export async function executeToolRequest(params) {
  const { tenant, toolRequest, selectedTools } = params;
  const capability = toolRequest.capability;

  // Cache key covers capability, input_spec, and chosen tool id list
  const keyHash = hashValue({ capability, input: toolRequest.input_spec, tools: selectedTools });
  const cachePath = getCachePath(tenant, capability, keyHash);
  const cached = readCache(cachePath);
  if (cached) {
    return { ...cached, cached: true };
  }

  // Dispatch per capability
  if (capability === 'web.search' || capability === 'web.fetch') {
    // Use combined demo executor that performs search + fetch-first-result
    const query = toolRequest.input_spec?.query || 'swarm1 demo query';
    const outDir = toolRequest.input_spec?.outDir || 'websearch_demo';

    const { runWebSearchFetch } = await import('./web_search_fetch.mjs');
    const result = await runWebSearchFetch({ query, tenant, outDir });
    const summaryPath = path.resolve('runs', outDir, 'summary.json');
    const firstHtml = path.resolve('runs', outDir, 'first_result.html');

    const artifacts = [summaryPath, firstHtml].filter((p) => fs.existsSync(p));
    const payload = {
      capability,
      cached: false,
      artifacts,
      outputs: { title: result.title, url: result.url },
    };
    writeCache(cachePath, payload);
    return payload;
  }

  // Default: no-op executor with placeholder artifact if specified
  const artifacts = [];
  for (const p of toolRequest.expected_artifacts || []) {
    if (typeof p === 'string') {
      const abs = path.resolve(p);
      const dir = path.dirname(abs);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(abs)) fs.writeFileSync(abs, JSON.stringify({ placeholder: true }));
      artifacts.push(abs);
    }
  }
  const fallback = { capability, cached: false, artifacts, outputs: {} };
  writeCache(cachePath, fallback);
  return fallback;
}
