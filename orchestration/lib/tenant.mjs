/**
 * Tenant Path Utilities
 *
 * Provides path scoping and resolution for multi-tenant artifact isolation.
 * Ensures that tenant artifacts are properly namespaced and prevents
 * cross-tenant access.
 */

import path from 'path';
import { promises as fs } from 'fs';

/**
 * Check if a tenant ID is valid
 */
export function isValidTenant(tenant) {
  if (!tenant || typeof tenant !== 'string') {
    return false;
  }

  // Must be lowercase alphanumeric with hyphens
  // Min 3 chars, max 50 chars
  const pattern = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
  return pattern.test(tenant);
}

/**
 * Normalize tenant ID
 */
export function normalizeTenant(tenant) {
  if (!tenant || tenant === 'default') {
    return 'default';
  }

  // Convert to lowercase and replace invalid chars
  const normalized = tenant
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'default';
}

/**
 * Get tenant-scoped path
 *
 * @param {string} tenant - Tenant identifier
 * @param {string} relativePath - Path relative to tenant root
 * @param {string} baseDir - Base directory (default: 'runs')
 * @returns {string} Tenant-scoped path
 */
export function tenantPath(tenant, relativePath, baseDir = 'runs') {
  const normalizedTenant = normalizeTenant(tenant);

  // Always use tenant-namespaced paths for Phase 13+ consistency
  // Even default tenant gets its own namespace
  return path.join(baseDir, 'tenants', normalizedTenant, relativePath);
}

/**
 * Resolve run root directory for a tenant and AUV
 *
 * @param {string} tenant - Tenant identifier
 * @param {string} auvId - AUV identifier
 * @param {string} baseDir - Base directory (default: 'runs')
 * @returns {string} Full path to run directory
 */
export function resolveRunRoot(tenant, auvId, baseDir = 'runs') {
  return tenantPath(tenant, auvId, baseDir);
}

/**
 * Resolve artifact path for a tenant
 *
 * @param {string} tenant - Tenant identifier
 * @param {string} auvId - AUV identifier
 * @param {string} artifactType - Type of artifact (ui, perf, security, etc.)
 * @param {string} baseDir - Base directory (default: 'runs')
 * @returns {string} Full path to artifact directory
 */
export function resolveArtifactPath(tenant, auvId, artifactType, baseDir = 'runs') {
  const runRoot = resolveRunRoot(tenant, auvId, baseDir);
  return path.join(runRoot, artifactType);
}

/**
 * Resolve distribution path for a tenant
 *
 * @param {string} tenant - Tenant identifier
 * @param {string} auvId - AUV identifier
 * @returns {string} Full path to distribution directory
 */
export function resolveDistPath(tenant, auvId) {
  const normalizedTenant = normalizeTenant(tenant);

  if (normalizedTenant === 'default') {
    return path.join('dist', auvId);
  }

  return path.join('dist', 'tenants', normalizedTenant, auvId);
}

/**
 * Extract tenant from a path
 *
 * @param {string} artifactPath - Path to analyze
 * @returns {string|null} Tenant ID or null if not tenant-scoped
 */
export function extractTenantFromPath(artifactPath) {
  const normalized = path.normalize(artifactPath);
  const parts = normalized.split(path.sep);

  // Check if path contains tenant namespace
  const tenantIndex = parts.indexOf('tenants');

  if (tenantIndex >= 0 && tenantIndex < parts.length - 1) {
    return parts[tenantIndex + 1];
  }

  // No tenant namespace means default tenant
  if (parts.includes('runs') || parts.includes('dist')) {
    return 'default';
  }

  return null;
}

/**
 * Ensure tenant directory exists
 *
 * @param {string} tenant - Tenant identifier
 * @param {string} baseDir - Base directory
 * @returns {Promise<string>} Created directory path
 */
export async function ensureTenantDirectory(tenant, baseDir = 'runs') {
  const normalizedTenant = normalizeTenant(tenant);

  let tenantDir;
  if (normalizedTenant === 'default') {
    tenantDir = baseDir;
  } else {
    tenantDir = path.join(baseDir, 'tenants', normalizedTenant);
  }

  await fs.mkdir(tenantDir, { recursive: true });
  return tenantDir;
}

/**
 * List all tenants
 *
 * @param {string} baseDir - Base directory to search
 * @returns {Promise<string[]>} List of tenant IDs
 */
export async function listTenants(baseDir = 'runs') {
  const tenants = ['default']; // Always include default

  const tenantsDir = path.join(baseDir, 'tenants');

  try {
    const entries = await fs.readdir(tenantsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && isValidTenant(entry.name)) {
        tenants.push(entry.name);
      }
    }
  } catch (error) {
    // Tenants directory doesn't exist yet
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  return tenants;
}

/**
 * Get tenant statistics
 *
 * @param {string} tenant - Tenant identifier
 * @param {string} baseDir - Base directory
 * @returns {Promise<object>} Tenant statistics
 */
export async function getTenantStats(tenant, baseDir = 'runs') {
  const normalizedTenant = normalizeTenant(tenant);
  const tenantDir = tenantPath(normalizedTenant, '', baseDir);

  const stats = {
    tenant: normalizedTenant,
    path: tenantDir,
    exists: false,
    auvCount: 0,
    totalSize: 0,
    lastModified: null,
  };

  try {
    const dirStats = await fs.stat(tenantDir);
    stats.exists = true;
    stats.lastModified = dirStats.mtime.toISOString();

    // Count AUVs
    const entries = await fs.readdir(tenantDir, { withFileTypes: true });
    const auvPattern = /^AUV-\d{4}$/;

    for (const entry of entries) {
      if (entry.isDirectory() && auvPattern.test(entry.name)) {
        stats.auvCount++;
      }
    }

    // Calculate total size (simplified - just counts files)
    stats.totalSize = await calculateDirectorySize(tenantDir);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  return stats;
}

/**
 * Calculate directory size recursively
 *
 * @param {string} dirPath - Directory path
 * @returns {Promise<number>} Total size in bytes
 */
async function calculateDirectorySize(dirPath) {
  let totalSize = 0;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        totalSize += await calculateDirectorySize(fullPath);
      } else if (entry.isFile()) {
        const stats = await fs.stat(fullPath);
        totalSize += stats.size;
      }
    }
  } catch (error) {
    console.warn(`Could not calculate size for ${dirPath}: ${error.message}`);
  }

  return totalSize;
}

/**
 * Validate tenant access
 *
 * @param {string} requestedTenant - Tenant being accessed
 * @param {string} authorizedTenant - Tenant with authorization
 * @returns {boolean} Whether access is allowed
 */
export function validateTenantAccess(requestedTenant, authorizedTenant) {
  const requested = normalizeTenant(requestedTenant);
  const authorized = normalizeTenant(authorizedTenant);

  // Exact match
  if (requested === authorized) {
    return true;
  }

  // Admin tenant can access all (if configured)
  if (authorized === 'admin' && process.env.ADMIN_CROSS_TENANT === 'true') {
    return true;
  }

  return false;
}

/**
 * Create tenant context for a job
 *
 * @param {string} tenant - Tenant identifier
 * @returns {object} Tenant context with helper methods
 */
export function createTenantContext(tenant) {
  const normalizedTenant = normalizeTenant(tenant);

  return {
    tenant: normalizedTenant,

    // Path helpers bound to this tenant
    runPath: (auvId) => resolveRunRoot(normalizedTenant, auvId),
    artifactPath: (auvId, type) => resolveArtifactPath(normalizedTenant, auvId, type),
    distPath: (auvId) => resolveDistPath(normalizedTenant, auvId),

    // Ensure directories exist
    ensureRunDirectory: async (auvId) => {
      const dir = resolveRunRoot(normalizedTenant, auvId);
      await fs.mkdir(dir, { recursive: true });
      return dir;
    },

    ensureArtifactDirectory: async (auvId, type) => {
      const dir = resolveArtifactPath(normalizedTenant, auvId, type);
      await fs.mkdir(dir, { recursive: true });
      return dir;
    },

    // Validation
    validateAccess: (requestedTenant) => {
      return validateTenantAccess(requestedTenant, normalizedTenant);
    },
  };
}

/**
 * Clean old tenant artifacts
 *
 * @param {string} tenant - Tenant identifier
 * @param {number} maxAgeMs - Maximum age in milliseconds
 * @param {string} baseDir - Base directory
 * @returns {Promise<object>} Cleanup results
 */
export async function cleanTenantArtifacts(tenant, maxAgeMs, baseDir = 'runs') {
  const normalizedTenant = normalizeTenant(tenant);
  const tenantDir = tenantPath(normalizedTenant, '', baseDir);

  const results = {
    tenant: normalizedTenant,
    removed: [],
    failed: [],
    totalFreed: 0,
  };

  const cutoffTime = Date.now() - maxAgeMs;

  try {
    const entries = await fs.readdir(tenantDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const fullPath = path.join(tenantDir, entry.name);
      const stats = await fs.stat(fullPath);

      if (stats.mtime.getTime() < cutoffTime) {
        try {
          const size = await calculateDirectorySize(fullPath);
          await fs.rm(fullPath, { recursive: true, force: true });
          results.removed.push(entry.name);
          results.totalFreed += size;
        } catch (error) {
          results.failed.push({
            path: entry.name,
            error: error.message,
          });
        }
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  return results;
}
