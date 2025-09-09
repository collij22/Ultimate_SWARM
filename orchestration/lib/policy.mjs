/**
 * Tenant Policy Enforcement Module
 *
 * Validates job requests against tenant-specific policies including
 * budget limits, capability restrictions, and resource quotas.
 *
 * Exit codes:
 * - 405: Permission denied (policy violation)
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { normalizeTenant } from './tenant.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

// Cache for loaded policies
let policiesCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Load policies from YAML file
 */
async function loadPolicies(force = false) {
  const now = Date.now();

  // Return cached if still valid
  if (!force && policiesCache && now - cacheTimestamp < CACHE_TTL) {
    return policiesCache;
  }

  const policiesPath = path.join(projectRoot, 'mcp', 'policies.yaml');

  try {
    const content = await fs.readFile(policiesPath, 'utf8');
    policiesCache = YAML.parse(content);
    cacheTimestamp = now;

    // Ensure tenant section exists
    if (!policiesCache.tenants) {
      policiesCache.tenants = {};
    }

    return policiesCache;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // No policies file, return minimal structure
      policiesCache = {
        tenants: {},
        router: {
          defaults: {
            budget_ceiling_usd: 100,
            preferred_tier: 'primary',
          },
        },
      };
      cacheTimestamp = now;
      return policiesCache;
    }
    throw error;
  }
}

/**
 * Get policy for a specific tenant
 */
export async function getTenantPolicy(tenant) {
  const normalizedTenant = normalizeTenant(tenant);
  const policies = await loadPolicies();

  // Check for tenant-specific policy
  if (policies.tenants && policies.tenants[normalizedTenant]) {
    return {
      ...getDefaultPolicy(),
      ...policies.tenants[normalizedTenant],
      tenant: normalizedTenant,
    };
  }

  // Return default policy
  return {
    ...getDefaultPolicy(),
    tenant: normalizedTenant,
  };
}

/**
 * Get default policy
 */
function getDefaultPolicy() {
  return {
    budget_ceiling_usd: 100,
    allowed_capabilities: [
      'browser.automation',
      'api.test',
      'data.validation',
      'docs.search',
      'code.analysis',
    ],
    max_concurrent_jobs: 3,
    max_job_runtime_ms: 300000, // 5 minutes
    allow_secondary_tools: false,
    resource_limits: {
      max_artifacts_size_mb: 100,
      max_auv_count: 50,
      max_graph_nodes: 100,
    },
  };
}

/**
 * Validate job against tenant policy
 */
export async function validateJobPolicy(jobData) {
  const tenant = normalizeTenant(jobData.tenant || 'default');
  const policy = await getTenantPolicy(tenant);

  const violations = [];

  // Check budget
  if (jobData.constraints?.budget_usd) {
    if (jobData.constraints.budget_usd > policy.budget_ceiling_usd) {
      violations.push({
        rule: 'budget_ceiling',
        message: `Budget ${jobData.constraints.budget_usd} exceeds ceiling ${policy.budget_ceiling_usd}`,
        severity: 'error',
      });
    }
  }

  // Check capabilities
  if (jobData.constraints?.required_capabilities) {
    const disallowed = jobData.constraints.required_capabilities.filter(
      (cap) => !policy.allowed_capabilities.includes(cap),
    );

    if (disallowed.length > 0) {
      violations.push({
        rule: 'allowed_capabilities',
        message: `Capabilities not allowed: ${disallowed.join(', ')}`,
        severity: 'error',
      });
    }
  }

  // Check runtime limit
  if (jobData.constraints?.max_runtime_ms) {
    if (jobData.constraints.max_runtime_ms > policy.max_job_runtime_ms) {
      violations.push({
        rule: 'max_runtime',
        message: `Runtime ${jobData.constraints.max_runtime_ms}ms exceeds limit ${policy.max_job_runtime_ms}ms`,
        severity: 'warning',
      });
    }
  }

  // Check graph complexity
  if (jobData.metadata?.graph_nodes) {
    if (jobData.metadata.graph_nodes > policy.resource_limits.max_graph_nodes) {
      violations.push({
        rule: 'graph_complexity',
        message: `Graph has ${jobData.metadata.graph_nodes} nodes, exceeds limit ${policy.resource_limits.max_graph_nodes}`,
        severity: 'warning',
      });
    }
  }

  return {
    tenant,
    policy,
    violations,
    allowed: violations.filter((v) => v.severity === 'error').length === 0,
  };
}

/**
 * Check tenant quota
 */
export async function checkTenantQuota(tenant, quotaType = 'jobs') {
  const normalizedTenant = normalizeTenant(tenant);
  const policy = await getTenantPolicy(normalizedTenant);

  // Get current usage
  const usage = await getTenantUsage(normalizedTenant);

  const quotaChecks = {
    jobs: {
      current: usage.activeJobs,
      limit: policy.max_concurrent_jobs,
      available: policy.max_concurrent_jobs - usage.activeJobs,
    },
    auvs: {
      current: usage.auvCount,
      limit: policy.resource_limits.max_auv_count,
      available: policy.resource_limits.max_auv_count - usage.auvCount,
    },
    storage: {
      current: usage.storageMb,
      limit: policy.resource_limits.max_artifacts_size_mb,
      available: policy.resource_limits.max_artifacts_size_mb - usage.storageMb,
    },
  };

  if (quotaType && quotaChecks[quotaType]) {
    return quotaChecks[quotaType];
  }

  return quotaChecks;
}

/**
 * Get tenant usage statistics
 */
async function getTenantUsage(tenant) {
  const normalizedTenant = normalizeTenant(tenant);

  // This would normally query the queue and filesystem
  // For now, return mock data
  return {
    tenant: normalizedTenant,
    activeJobs: 0,
    auvCount: 0,
    storageMb: 0,
    lastActivity: new Date().toISOString(),
  };
}

/**
 * Validate capability request
 */
export async function validateCapability(tenant, capability) {
  const policy = await getTenantPolicy(tenant);

  // Check if capability is allowed
  const isAllowed = policy.allowed_capabilities.includes(capability);

  // Check if it requires secondary tools
  const requiresSecondary = isSecondaryCapability(capability);

  if (requiresSecondary && !policy.allow_secondary_tools) {
    return {
      allowed: false,
      reason: 'Secondary tools not allowed for tenant',
      capability,
      requiresSecondary,
    };
  }

  return {
    allowed: isAllowed,
    reason: isAllowed ? null : 'Capability not in allowed list',
    capability,
    requiresSecondary,
  };
}

/**
 * Check if capability requires secondary tools
 */
function isSecondaryCapability(capability) {
  const secondaryCapabilities = [
    'deploy.production',
    'deploy.preview',
    'database.production',
    'payment.processing',
    'email.sending',
    'sms.sending',
    'cloud.storage',
  ];

  return secondaryCapabilities.includes(capability);
}

/**
 * Calculate job cost estimate
 */
export async function estimateJobCost(jobData) {
  const policy = await getTenantPolicy(jobData.tenant || 'default');

  // Base cost factors
  const baseCost = 0.01; // $0.01 per job
  const nodeCost = 0.001; // $0.001 per graph node
  const timeCost = 0.0001; // $0.0001 per second

  let estimate = baseCost;

  // Add node cost
  if (jobData.metadata?.graph_nodes) {
    estimate += jobData.metadata.graph_nodes * nodeCost;
  }

  // Add time cost
  const runtimeMs = jobData.constraints?.max_runtime_ms || 60000;
  estimate += (runtimeMs / 1000) * timeCost;

  // Add capability costs
  if (jobData.constraints?.required_capabilities) {
    for (const cap of jobData.constraints.required_capabilities) {
      if (isSecondaryCapability(cap)) {
        estimate += 0.1; // Secondary capabilities cost more
      }
    }
  }

  return {
    estimate,
    breakdown: {
      base: baseCost,
      nodes: jobData.metadata?.graph_nodes ? jobData.metadata.graph_nodes * nodeCost : 0,
      time: (runtimeMs / 1000) * timeCost,
      capabilities:
        estimate -
        baseCost -
        (jobData.metadata?.graph_nodes || 0) * nodeCost -
        (runtimeMs / 1000) * timeCost,
    },
    currency: 'USD',
    within_budget: estimate <= policy.budget_ceiling_usd,
  };
}

/**
 * Apply router overrides for tenant
 */
export async function getTenantRouterConfig(tenant) {
  const policy = await getTenantPolicy(tenant);

  return {
    prefer_tier: policy.router_overrides?.prefer_tier || 'primary',
    budget_override: policy.router_overrides?.budget_override,
    tool_allowlist: policy.router_overrides?.tool_allowlist,
    tool_blocklist: policy.router_overrides?.tool_blocklist,
    custom_mappings: policy.router_overrides?.custom_mappings || {},
  };
}

/**
 * Log policy decision
 */
export async function logPolicyDecision(decision) {
  const logEntry = {
    event: 'PolicyDecision',
    timestamp: new Date().toISOString(),
    tenant: decision.tenant,
    action: decision.action,
    resource: decision.resource,
    allowed: decision.allowed,
    reason: decision.reason,
    violations: decision.violations,
  };

  // Append to hooks log
  const hooksPath = path.join(projectRoot, 'runs', 'observability', 'hooks.jsonl');

  try {
    await fs.mkdir(path.dirname(hooksPath), { recursive: true });
    await fs.appendFile(hooksPath, JSON.stringify(logEntry) + '\n');
  } catch (error) {
    console.error(`Failed to log policy decision: ${error.message}`);
  }

  return logEntry;
}

/**
 * Update tenant policy
 */
export async function updateTenantPolicy(tenant, updates) {
  const normalizedTenant = normalizeTenant(tenant);
  const policies = await loadPolicies(true); // Force reload

  if (!policies.tenants) {
    policies.tenants = {};
  }

  // Merge updates with existing policy
  policies.tenants[normalizedTenant] = {
    ...policies.tenants[normalizedTenant],
    ...updates,
    updated_at: new Date().toISOString(),
  };

  // Save back to file
  const policiesPath = path.join(projectRoot, 'mcp', 'policies.yaml');
  const yamlContent = YAML.stringify(policies, { indent: 2 });
  await fs.writeFile(policiesPath, yamlContent, 'utf8');

  // Clear cache
  policiesCache = null;

  return policies.tenants[normalizedTenant];
}

/**
 * CLI interface for policy management
 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  const tenant = process.argv[3] || 'default';

  const commands = {
    async get() {
      const policy = await getTenantPolicy(tenant);
      console.log(`Policy for tenant '${tenant}':`, JSON.stringify(policy, null, 2));
    },

    async validate() {
      const sampleJob = {
        tenant,
        constraints: {
          budget_usd: 50,
          required_capabilities: ['browser.automation', 'api.test'],
        },
      };

      const result = await validateJobPolicy(sampleJob);
      console.log('Validation result:', JSON.stringify(result, null, 2));
    },

    async quota() {
      const quotas = await checkTenantQuota(tenant);
      console.log(`Quotas for tenant '${tenant}':`, JSON.stringify(quotas, null, 2));
    },

    async estimate() {
      const sampleJob = {
        tenant,
        metadata: { graph_nodes: 10 },
        constraints: { max_runtime_ms: 60000 },
      };

      const cost = await estimateJobCost(sampleJob);
      console.log('Cost estimate:', JSON.stringify(cost, null, 2));
    },
  };

  if (!command || !commands[command]) {
    console.log('Available commands:');
    console.log('  get <tenant>      - Get tenant policy');
    console.log('  validate <tenant> - Validate sample job');
    console.log('  quota <tenant>    - Check tenant quotas');
    console.log('  estimate <tenant> - Estimate job cost');
    process.exit(0);
  }

  commands[command]()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    });
}
