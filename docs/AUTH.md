### Authentication & RBAC (Phase 8)

This document explains how to enable and use authentication and role-based access control (RBAC) for Phase 8 durable execution (BullMQ/Redis). Auth is OFF by default for backward compatibility and can be enabled via environment variables.

## Overview

- Modes:
  - JWKS (asymmetric) with an IdP JWKS endpoint
  - HMAC (symmetric) with a shared secret for local/dev
- Toggle: `AUTH_REQUIRED=true` to enforce auth
- Scope:
  - Enqueue (job submission) requires a valid token and permissions
  - Admin operations (pause/resume/cancel/clean/drain) require admin privileges
  - Tenant authorization: non-admin tokens must match the requested tenant

## Environment Variables

- `AUTH_REQUIRED` (default: unset/false)
  - When `true`, all protected endpoints require valid tokens
- JWKS mode (recommended for staging/prod):
  - `AUTH_JWKS_URL` (e.g., `https://idp.example.com/.well-known/jwks.json`)
  - `AUTH_ISSUER` (optional but recommended)
  - `AUTH_AUDIENCE` (optional but recommended)
- HMAC mode (simple for local/dev):
  - `AUTH_JWT_SECRET` (strong shared secret)
  - `AUTH_ISSUER` (optional)
  - `AUTH_AUDIENCE` (optional)
- For admin CLI helpers (see below):
  - `AUTH_TOKEN` (set to `Bearer <JWT>` for admin operations)

Notes:

- If both JWKS and HMAC are configured, JWKS is used.
- Tokens must be presented as `Bearer <JWT>`.

## Roles and Permissions

Built-in roles and permissions (extensible in code):

- `admin`:
  - `queue_admin`: true
  - `enqueue_jobs`: true
  - `view_status`: true
- `developer`:
  - `queue_admin`: false
  - `enqueue_jobs`: true
  - `view_status`: true
- `viewer`:
  - `queue_admin`: false
  - `enqueue_jobs`: false
  - `view_status`: true

A token’s roles are read from `roles` array (or `realm_access.roles` if present). Tenant is read from `tenant` (or `org`).

## Tenant Authorization

- Admins may operate on any tenant
- Non-admin tokens must specify a `tenant` that matches the requested tenant (e.g., `--tenant acme-corp`)

## Usage

### Start the worker

POSIX:

```bash
node orchestration/cli.mjs engine start --tenant acme-corp
```

Windows (cmd):

```bat
node orchestration\cli.mjs engine start --tenant acme-corp
```

### Enqueue a job (with auth)

POSIX:

```bash
export AUTH_REQUIRED=true
node orchestration/cli.mjs engine enqueue orchestration/graph/projects/demo-01.yaml \
  --tenant acme-corp \
  --auth-token "Bearer <JWT>"
```

Windows (cmd):

```bat
set AUTH_REQUIRED=true
node orchestration\cli.mjs engine enqueue orchestration\graph\projects\demo-01.yaml --tenant acme-corp --auth-token "Bearer <JWT>"
```

Behavior when `AUTH_REQUIRED=true`:

- Token is validated (JWKS or HMAC)
- `enqueue_jobs` permission is required
- Tenant in token must match requested tenant unless role is `admin`
- Job metadata is enriched with `auth_sub` and `auth_issuer`

### Admin operations (require admin)

Set a valid admin token in `AUTH_TOKEN`:

POSIX:

```bash
export AUTH_REQUIRED=true
export AUTH_TOKEN="Bearer <ADMIN_JWT>"
node orchestration/engine/bullmq/admin.mjs status | cat
node orchestration/engine/bullmq/admin.mjs pause | cat
node orchestration/engine/bullmq/admin.mjs resume | cat
```

Windows (cmd):

```bat
set AUTH_REQUIRED=true
set AUTH_TOKEN=Bearer <ADMIN_JWT>
node orchestration\engine\bullmq\admin.mjs status | cat
node orchestration\engine\bullmq\admin.mjs pause | cat
node orchestration\engine\bullmq\admin.mjs resume | cat
```

### Status report

Status generation/monitoring is unaffected by auth; it reads queue and hooks:

```bash
node orchestration/engine/status_aggregator.mjs write
# Output: reports/status.json (validated by schemas/status.schema.json)
```

## Local Development (HMAC quickstart)

POSIX:

```bash
export AUTH_REQUIRED=true
export AUTH_JWT_SECRET="dev-secret-please-change"
# Optionally set expected claims
export AUTH_ISSUER="local-issuer"
export AUTH_AUDIENCE="local-aud"
```

Windows (cmd):

```bat
set AUTH_REQUIRED=true
set AUTH_JWT_SECRET=dev-secret-please-change
set AUTH_ISSUER=local-issuer
set AUTH_AUDIENCE=local-aud
```

Use a dev JWT signed with HS256 and claims similar to:

```json
{
  "sub": "user-123",
  "roles": ["developer"],
  "tenant": "acme-corp",
  "iss": "local-issuer",
  "aud": "local-aud"
}
```

## Failure Modes

- Missing/invalid token or insufficient permissions → exit code 405 in CLI
- Tenant mismatch (non-admin) → exit code 405 in CLI
- JWKS fetch/verify errors: check `AUTH_JWKS_URL` reachability and token validity
- HMAC errors: verify `AUTH_JWT_SECRET` and that token is HS256-signed with matching issuer/audience if enforced

## Security Notes

- Never commit tokens or secrets. Use environment variables or a secret manager.
- Prefer JWKS for staging/production; reserve HMAC for local/dev.
- Rotate secrets regularly and enforce TLS for any remote endpoints.

## Backward Compatibility

If `AUTH_REQUIRED` is not set to `true`, the system behaves as before (no auth enforced) and existing workflows continue to work.

## References

- Code: `orchestration/engine/auth/oidc.mjs`, `orchestration/engine/auth/rbac.mjs`, `orchestration/engine/bullmq/enqueue.mjs`, `orchestration/engine/bullmq/admin.mjs`, `orchestration/cli.mjs`
- See also: `docs/ORCHESTRATION.md` (Authentication & RBAC section)
