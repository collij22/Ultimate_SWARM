Here’s the shortest, safe path to make CI green. It fixes all three failures and keeps us on Node’s built-in test runner (no mocha needed).

1) Fix npm ci lockfile mismatch
Root cause: lockfile and package.json out of sync; CI can’t install dev tools (and then everything else breaks).
Do this locally then commit:


# Ensure no mocha is referenced (we use Node's test runner)
# If you do see mocha in devDependencies remotely, remove it:
npm pkg delete devDependencies.mocha || true

# Regenerate a clean lockfile strictly from package.json
rm -f package-lock.json
npm install --package-lock-only

# Sanity: clean install succeeds locally
rm -rf node_modules
npm ci

# Commit both files
git add package.json package-lock.json
git commit -m "fix(ci): sync lockfile with package.json and drop mocha"


2) 2) Make unit tests run without mocha
-Our tests currently use describe/it; import them from Node’s test runner so we don’t need mocha.
-Update both test files to import from node:test and node:assert/strict (if not already):

diff:
--- a/tests/unit/auv_compiler_hints.test.mjs
+++ b/tests/unit/auv_compiler_hints.test.mjs
-import assert from 'assert';
+import assert from 'node:assert/strict';
+import { describe, it, before } from 'node:test';

diff:
--- a/tests/unit/validate_brief.test.mjs
+++ b/tests/unit/validate_brief.test.mjs
-import assert from 'assert';
+import assert from 'node:assert/strict';
+import { describe, it } from 'node:test';

-Keep package.json test scripts on Node’s runner (already present):
"scripts": {
  "test:unit": "node --test tests/unit",
  "test:integration": "node --test tests/integration"
}

-Commit:
git add tests/unit/*.mjs package.json
git commit -m "test(unit): use node:test (drop mocha globals)"


3) Fix “Validate runbook cards” npx error
-Root cause: dev deps weren’t installed due to npm ci failure, so npx couldn’t resolve ajv.
-After step 1, this should resolve. If your CI ever installs with dev omitted, pin to local binary instead of relying on npx path resolution:

diff:
-"validate:cards": "npx ajv validate -s schemas/runbook-summary.schema.json -d \"runs/**/result-cards/runbook-summary.json\" --verbose"
+"validate:cards": "node ./node_modules/ajv-cli/dist/cli.js validate -s schemas/runbook-summary.schema.json -d \"runs/**/result-cards/runbook-summary.json\" --verbose"

-Commit:
git add package.json
git commit -m "chore(ci): call ajv-cli via local binary for reliability"

4) Fix “yaml module not found” in artifact check
Root cause: npm ci failed earlier, so dependencies (including yaml) weren’t installed. After step 1 it should be fine.
Ensure yaml is a dependency (it is) and that the job runs “npm ci” before “node orchestration/lib/artifact_consistency.mjs”.

5) Double-check CI job order and Node
Ensure CI installs dev dependencies and runs steps in this order; also pin Node 20:
(yaml)

- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'

- name: Install deps
  run: npm ci

- name: Run autopilot (produces runs/** artifacts)
  run: |
    export STAGING_URL=http://127.0.0.1:3000
    export API_BASE=http://127.0.0.1:3000/api
    node orchestration/cli.mjs AUV-0002
    node orchestration/cli.mjs AUV-0003

- name: Validate runbook cards
  run: npm run validate:cards

- name: Artifact consistency check
  run: node orchestration/lib/artifact_consistency.mjs

- name: Unit tests
  run: npm run test:unit

6) Optional hardening (only if your CI omits dev deps)
-If your pipeline uses “npm ci --omit=dev”, either:
  -Remove “--omit=dev”, or
  -Move ajv-cli to dependencies (not recommended), or
  -Call a remote npx (less deterministic): npx -y ajv-cli@5 validate ...

After these edits:
-Push the updated package.json, package-lock.json, test files, and CI yaml update.
-The three errors will resolve: npm ci will succeed, ajv will be found and run, and yaml will be installed for the artifact check