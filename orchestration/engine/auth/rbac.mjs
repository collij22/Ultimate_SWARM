/**
 * Minimal RBAC utilities
 * Roles: admin, developer, viewer
 */

const DEFAULT_PERMS = {
  admin: {
    queue_admin: true,
    enqueue_jobs: true,
    view_status: true,
  },
  developer: {
    queue_admin: false,
    enqueue_jobs: true,
    view_status: true,
  },
  viewer: {
    queue_admin: false,
    enqueue_jobs: false,
    view_status: true,
  },
};

export function hasRole(claims, role) {
  const roles = claims?.roles || [];
  return roles.includes(role);
}

export function hasPermission(claims, perm) {
  const roles = claims?.roles || [];
  for (const role of roles) {
    const allow = DEFAULT_PERMS[role]?.[perm];
    if (allow) return true;
  }
  return false;
}

export function isTenantAuthorized(claims, requestedTenant) {
  // Admins can access any tenant
  if (hasRole(claims, 'admin')) return true;

  // Otherwise must match token tenant if provided
  const tokenTenant = claims?.tenant;
  if (!requestedTenant) return false;
  if (!tokenTenant) return false;
  return tokenTenant === requestedTenant;
}
