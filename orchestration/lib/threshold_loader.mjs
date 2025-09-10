/**
 * Load threshold configuration from policies and capabilities
 */
import fs from 'fs';
import path from 'path';
import { parse as parseYaml } from 'yaml';

const PROJECT_ROOT = path.resolve(process.cwd());

/**
 * Load thresholds from policies.yaml and capability YAML
 * @param {string} auvId - The AUV identifier
 * @param {string} [domain] - Optional domain type (data, charts, seo, media, db)
 * @returns {Object} Merged threshold configuration
 */
export function loadThresholds(auvId, domain) {
  // If no domain specified, return all thresholds for the AUV
  if (!domain) {
    const allThresholds = {};
    
    // Load AUV-specific thresholds
    try {
      const capabilityPath = path.join(PROJECT_ROOT, 'capabilities', `${auvId}.yaml`);
      if (fs.existsSync(capabilityPath)) {
        const capability = parseYaml(fs.readFileSync(capabilityPath, 'utf8'));
        if (capability?.cvf?.thresholds) {
          Object.assign(allThresholds, capability.cvf.thresholds);
        }
      }
    } catch (e) {
      // Silently skip if no AUV-specific config
    }
    
    // Merge with defaults for any missing domains
    const domains = ['data', 'charts', 'seo', 'media', 'db'];
    for (const d of domains) {
      if (!allThresholds[d]) {
        allThresholds[d] = getDefaultThresholds(d);
      }
    }
    
    return allThresholds;
  }
  
  // Original behavior for specific domain
  const thresholds = {};

  // 1. Load global defaults from policies.yaml
  try {
    const policiesPath = path.join(PROJECT_ROOT, 'mcp', 'policies.yaml');
    if (fs.existsSync(policiesPath)) {
      const policies = parseYaml(fs.readFileSync(policiesPath, 'utf8'));
      if (policies?.cvf?.thresholds?.[domain]) {
        Object.assign(thresholds, policies.cvf.thresholds[domain]);
      }
    }
  } catch (e) {
    console.warn(`Could not load policies.yaml: ${e.message}`);
  }

  // 2. Load AUV-specific overrides from capabilities/<AUV>.yaml
  try {
    const capabilityPath = path.join(PROJECT_ROOT, 'capabilities', `${auvId}.yaml`);
    if (fs.existsSync(capabilityPath)) {
      const capability = parseYaml(fs.readFileSync(capabilityPath, 'utf8'));
      if (capability?.cvf?.thresholds?.[domain]) {
        Object.assign(thresholds, capability.cvf.thresholds[domain]);
      }
    }
  } catch (e) {
    // Silently skip if no AUV-specific config
  }

  // 3. Return merged thresholds with hardcoded defaults as fallback
  return {
    ...getDefaultThresholds(domain),
    ...thresholds,
  };
}

/**
 * Get hardcoded default thresholds for a domain
 * @param {string} domain - Domain type
 * @returns {Object} Default thresholds
 */
function getDefaultThresholds(domain) {
  const defaults = {
    data: {
      min_rows: 10,
      min_metrics: 1,
    },
    charts: {
      min_width: 400,
      min_height: 300,
      max_width: 2000,
      max_height: 2000,
    },
    seo: {
      max_broken_links: 5,
      min_canonical_rate: 0.8,
      max_load_time_ms: 3000,
    },
    media: {
      duration_tolerance_pct: 10,
      min_width: 640,
      min_height: 480,
      required_audio_track: true,
    },
    db: {
      max_failed_migrations: 0,
      validation_required: true,
    },
  };

  return defaults[domain] || {};
}
