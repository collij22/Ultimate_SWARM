/**
 * Simple OIDC/JWT validation utilities using jose
 *
 * Supported modes (env-driven):
 * - JWKS (asymmetric): AUTH_JWKS_URL, AUTH_ISSUER, AUTH_AUDIENCE
 * - HMAC (symmetric): AUTH_JWT_SECRET, AUTH_ISSUER, AUTH_AUDIENCE
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';

function getTextEncoder() {
  // node:crypto TextEncoder is global in Node 20, but provide a fallback
  return new TextEncoder();
}

let jwks = null;

export async function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Missing auth token');
  }

  const issuer = process.env.AUTH_ISSUER;
  const audience = process.env.AUTH_AUDIENCE;
  const jwksUrl = process.env.AUTH_JWKS_URL;
  const hmacSecret = process.env.AUTH_JWT_SECRET;

  const expected = {};
  if (issuer) expected.issuer = issuer;
  if (audience) expected.audience = audience;

  try {
    let result;

    if (jwksUrl) {
      if (!jwks) {
        jwks = createRemoteJWKSet(new URL(jwksUrl));
      }
      result = await jwtVerify(token, jwks, expected);
    } else if (hmacSecret) {
      const key = getTextEncoder().encode(hmacSecret);
      result = await jwtVerify(token, key, expected);
    } else {
      throw new Error('No AUTH_JWKS_URL or AUTH_JWT_SECRET configured');
    }

    const payload = result?.payload || {};
    // @ts-ignore - JWT payload can have various shapes
    const realmAccess =
      typeof payload === 'object' && payload !== null ? payload.realm_access : undefined;
    // @ts-ignore - realm_access.roles access
    const realmRoles =
      typeof realmAccess === 'object' &&
      realmAccess !== null &&
      Array.isArray(/** @type {any} */ (realmAccess)?.roles)
        ? /** @type {any} */ (realmAccess).roles
        : [];
    return {
      subject: payload.sub || null,
      roles: Array.isArray(payload.roles) ? payload.roles : realmRoles,
      tenant: payload.tenant || payload.org || null,
      issuer: payload.iss || null,
      audience: payload.aud || null,
      raw: payload,
    };
  } catch (err) {
    throw new Error(`Invalid auth token: ${err.message}`);
  }
}

export function isAuthRequired() {
  return process.env.AUTH_REQUIRED === 'true';
}
