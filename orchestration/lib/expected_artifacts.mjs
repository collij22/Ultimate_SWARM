#!/usr/bin/env node
/**
 * Shared module for expected artifact definitions
 * Used by runbook, CVF check, and artifact consistency check
 * This avoids circular dependencies and unnecessary imports
 */

import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

function lookupFromCapabilityYaml(auvId) {
  try {
    const p = path.resolve(process.cwd(), 'capabilities', `${auvId}.yaml`);
    if (!fs.existsSync(p)) return null;
    const cap = YAML.parse(fs.readFileSync(p, 'utf8'));
    const req = cap?.artifacts?.required;
    return Array.isArray(req) && req.length ? req : null;
  } catch { return null; }
}

/**
 * Get expected artifacts for a given AUV
 * @param {string} auvId - The AUV identifier (e.g., 'AUV-0002')
 * @returns {string[]} Array of expected artifact paths
 */
export function expectedArtifacts(auvId) {
  switch (auvId) {
    case 'AUV-0002':
      return [
        'runs/AUV-0002/ui/products_search.png',
        'runs/AUV-0002/perf/lighthouse.json'
      ];
    case 'AUV-0003':
      return [
        'runs/AUV-0003/ui/products_search.png',
        'runs/AUV-0003/perf/lighthouse.json'
      ];
    case 'AUV-0004':
      return [
        'runs/AUV-0004/ui/cart_summary.png',
        'runs/AUV-0004/perf/lighthouse.json'
      ];
    case 'AUV-0005':
      return [
        'runs/AUV-0005/ui/checkout_success.png',
        'runs/AUV-0005/perf/lighthouse.json'
      ];
    default: {
      // Dynamic fallback for generated AUVs
      const dyn = lookupFromCapabilityYaml(auvId);
      return Array.isArray(dyn) ? dyn : [];
    }
  }
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
    const files = fs.readdirSync(dir).filter(f => /^AUV-\d+\.yaml$/.test(f));
    for (const f of files) {
      const id = f.replace(/\.yaml$/, '');
      const dyn = lookupFromCapabilityYaml(id);
      if (Array.isArray(dyn) && dyn.length && !base.includes(id)) base.push(id);
    }
  } catch {}
  return base;
}