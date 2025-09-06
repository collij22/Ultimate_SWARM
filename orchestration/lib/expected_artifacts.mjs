#!/usr/bin/env node
/**
 * Shared module for expected artifact definitions
 * Used by runbook, CVF check, and artifact consistency check
 * This avoids circular dependencies and unnecessary imports
 */

/**
 * Get expected artifacts for a given AUV
 * @param {string} auvId - The AUV identifier (e.g., 'AUV-0002')
 * @returns {string[]} Array of expected artifact paths
 */
export function expectedArtifacts(auvId) {
  switch (auvId) {
    case 'AUV-0002':
      return [
        'runs/AUV-0002/api/get_products_200.json',
        'runs/AUV-0002/ui/products_grid.png',
        'runs/AUV-0002/ui/product_detail.png',
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
    default:
      return [];
  }
}

/**
 * Get all AUVs that have expected artifacts defined
 * @returns {string[]} Array of AUV identifiers
 */
export function getAuvsWithArtifacts() {
  return ['AUV-0002', 'AUV-0003', 'AUV-0004', 'AUV-0005'];
}