<!-- Ruthless Phase 5 audit: implementation is close but has 5 blockers (diff safety, staging/committing artifacts, dry-run mutation, reject discovery, CI gating/tests). Below are precise edits to make it bulletproof before moving to Phase 6. -->

### Phase 5 audit (pass/fail)

- Passed
  - build lane core (`orchestration/lib/build_lane.mjs`) with typed exit codes, QA runners, autopilot smoke, artifacts, observability.
  - GitHub integration (`orchestration/lib/gh.mjs`) with gh CLI + REST fallback; PR card under `runs/<AUV>/result-cards/pr.json`.
  - CLI integration (`orchestration/cli.mjs build-lane …`).
  - QA configs: `.prettierrc.json`, `.eslintrc.cjs`, `tsconfig.json`.
  - `package.json` scripts: `format`, `format:check`, `lint`, `typecheck`, `qa`, `build-lane`.

- Gaps/Blockers
  - [B1] Diff safety: `git apply` does not validate changed paths against the allowlist; diff can mutate disallowed paths.
  - [B2] Dry-run safety: `applyPatch()` still runs `git apply` during `--dry-run`, mutating the tree.
  - [B3] Artifact bleed: `recordDiff()` does `git add -A`, staging `runs/**` artifacts; `commitAndPush()` will commit them.
  - [B4] Rejects detection: only checks `.` for `.rej` files; misses nested rejects (e.g., under `tests/**`).
  - [B5] CI QA gates are non‑blocking and tests aren’t run in QA (only router + autopilot later). This violates “No green gates → no merge”.
  - [T1] Unit test uses `require()` in ESM; breaks on Node 20.

- Non-blocking nits
  - Changeset writer determines action after write (always “modify”); should check existence before write.
  - Minor duplication of PR body formatting between `build_lane.mjs` and `gh.mjs`.
    result.artifacts.push(diffPath);

        if (!dryRun) {
          const commitResult = await commitAndPush(auvId, targetBranch, patchResult.summary);
          result.commitSha = commitResult.sha;
          if (openPr) {
            const { createPullRequest } = await import('./gh.mjs');
            const prResult = await createPullRequest({
              base: 'main',
              head: targetBranch,
              title: `feat(${auvId}): ${patchResult.summary}`,
              body: formatPRBody(auvId, result),
              auvId,
            });
            result.prUrl = prResult.url;
            result.prNumber = prResult.number;
          }
        }

        result.success = true;
        await writeResultCard(auvId, runId, result);
        appendHookLine({ event: 'BuildEnd', auv_id: auvId, run_id: runId, success: true, duration_ms: Date.now() - startTime, pr_url: result.prUrl, timestamp: Date.now() });
        return result;

    } catch (error) {
    result.success = false;
    result.error = error.message;
    result.exitCode = error.exitCode || 1;
    await writeResultCard(auvId, runId, result);
    appendHookLine({ event: 'BuildEnd', auv_id: auvId, run_id: runId, success: false, error: error.message, exit_code: result.exitCode, duration_ms: Date.now() - startTime, timestamp: Date.now() });
    throw error;
    }
    }

(build_lane.mjs)
export async function runBuildLane(options) {
const {
auvId,
patch,
branch,
openPr = false,
dryRun = false,
qa = {}
} = options;
...
// Step 3: Apply patch
const patchResult = await applyPatch(auvId, patch, runId);
...iffPath = patch.path;
if (!fileExists(diffPath)) {
throw new Error(`Diff file not found: ${diffPath}`);
}

    const diffContent = fs.readFileSync(diffPath, 'utf8');
    const appliedPath = path.join('runs', auvId, 'patches', `${Date.now()}-applied.diff`);
    fs.writeFileSync(appliedPath, diffContent);
    artifacts.push(appliedPath);

    try {
      // Apply with 3-way merge and reject handling
      await execCommand('git', ['apply', '--3way', '--reject', diffPath]);
    } catch (error) {
      // Check for rejects
      const rejectFiles = fs.readdirSync('.').filter(f => f.endsWith('.rej'));
      for (const reject of rejectFiles) {
        const rejectPath = path.join('runs', auvId, 'patches', 'rejects', reject);
        ensureDir(path.dirname(rejectPath));
        fs.renameSync(reject, rejectPath);
        rejects.push(rejectPath);
      }
    }

    summary = extractDiffSummary(diffContent);

} else if (patch.type === 'changeset') {
// Apply JSON changeset
const changes = patch.changes || [];
const changeset = {
auv_id: auvId,
files: [],
timestamp: Date.now()
};

    for (const change of changes) {
      const filePath = change.path;

      // Validate against allowlist
      if (!isPathAllowed(filePath)) {
        throw new Error(`Path not allowed by write policy: ${filePath}`);
      }

      // Write file
      ensureDir(path.dirname(filePath));
      fs.writeFileSync(filePath, change.content, 'utf8');

      changeset.files.push({
        path: filePath,
        action: fileExists(filePath) ? 'modify' : 'add',
        sha256: crypto.createHash('sha256').update(change.content).digest('hex')
      });
    }

    // Write changeset record
    const changesetPath = path.join('runs', auvId, 'changeset.json');
    fs.writeFileSync(changesetPath, JSON.stringify(changeset, null, 2));
    artifacts.push(changesetPath);

    summary = `Modified ${changeset.files.length} file(s)`;

}

appendHookLine({
event: 'PatchApplied',
auv_id: auvId,
patch_type: patch.type,
files_changed: artifacts.length,
rejects: rejects.length,
timestamp: Date.now()
});

return { artifacts, rejects, summary };
}

---

// EDIT: pass dryRun to applyPatch and restrict staging/diff to allowlist
export async function runBuildLane(options) {
const {
auvId,
patch,
branch,
openPr = false,
dryRun = false,
qa = {},
} = options;

const qaConfig = {
format: qa.format !== false,
lint: qa.lint !== false,
typecheck: qa.typecheck !== false,
unit: qa.unit !== false,
integration: qa.integration !== false,
autopilot: qa.autopilot !== false,
};

const runId = generateRunId();
const startTime = Date.now();
const result = { auvId, runId, branch: null, artifacts: [], qaResults: {}, prUrl: null, success: false, exitCode: 0 };

try {
appendHookLine({ event: 'BuildStart', auv_id: auvId, run_id: runId, patch_type: patch.type, dry_run: dryRun, timestamp: Date.now() });

    if (!dryRun) {
      await assertRepoClean();
    }

    const targetBranch = await createOrSelectBranch(auvId, branch, dryRun);
    result.branch = targetBranch;

    const patchResult = await applyPatch(auvId, patch, runId, dryRun); // pass dryRun
    result.artifacts.push(...patchResult.artifacts);
    if (patchResult.rejects?.length > 0) throw new BuildLaneError('Patch application had rejects', 'patch', 209);

    // QA steps unchanged…

    // Record diff restricted to allowlist
    const diffPath = await recordDiff(auvId, runId);
    result.artifacts.push(diffPath);

    if (!dryRun) {
      const commitResult = await commitAndPush(auvId, targetBranch, patchResult.summary);
      result.commitSha = commitResult.sha;
      if (openPr) {
        const { createPullRequest } = await import('./gh.mjs');
        const prResult = await createPullRequest({
          base: 'main',
          head: targetBranch,
          title: `feat(${auvId}): ${patchResult.summary}`,
          body: formatPRBody(auvId, result),
          auvId,
        });
        result.prUrl = prResult.url;
        result.prNumber = prResult.number;
      }
    }

    result.success = true;
    await writeResultCard(auvId, runId, result);
    appendHookLine({ event: 'BuildEnd', auv_id: auvId, run_id: runId, success: true, duration_ms: Date.now() - startTime, pr_url: result.prUrl, timestamp: Date.now() });
    return result;

} catch (error) {
result.success = false;
result.error = error.message;
result.exitCode = error.exitCode || 1;
await writeResultCard(auvId, runId, result);
appendHookLine({ event: 'BuildEnd', auv_id: auvId, run_id: runId, success: false, error: error.message, exit_code: result.exitCode, duration_ms: Date.now() - startTime, timestamp: Date.now() });
throw error;
}
}ts.length, timestamp: Date.now() });
return { artifacts, rejects, summary };
}

function extractFilesFromDiff(diffContent) {
const files = new Set();
for (const line of diffContent.split('\n')) {
if (line.startsWith('+++ ') || line.startsWith('--- ')) {
const p = line.slice(4).trim();
if (p === '/dev/null') continue;
const clean = p.replace(/^a\//, '').replace(/^b\//, '');
files.add(clean);
}
}
return Array.from(files);
}

function collectRejectsRecursive(rootDir, auvId) {
const out = [];
const rejectsDir = path.join('runs', auvId, 'patches', 'rejects');
ensureDir(rejectsDir);
(function walk(dir) {
for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
const full = path.join(dir, entry.name);
if (entry.isDirectory()) walk(full);
else if (entry.isFile() && entry.name.endsWith('.rej')) {
const dest = path.join(rejectsDir, path.basename(full));
try { fs.renameSync(full, dest); } catch { /_ ignore _/ }
out.push(dest);
}
}
})(rootDir);
return out;
}

function getAllowedGitPathspecs() {
return [
'orchestration/**',
'mcp/**',
'tests/**',
'docs/**',
'capabilities/**',
'scripts/**',
'.github/**',
'mock/**',
'public/**',
];
}

(build_lane.mjs)
async function applyPatch(auvId, patch, runId) {
const artifacts = [];
const rejects = [];
let summary = 'Applied changes';

ensureDir(path.join('runs', auvId, 'patches'));

if (patch.type === 'diff') {
// Apply unified diff
const diffPath = patch.path;
if (!fileExists(diffPath)) {
throw new Error(`Diff file not found: ${diffPath}`);
}

    const diffContent = fs.readFileSync(diffPath, 'utf8');
    const appliedPath = path.join('runs', auvId, 'patches', `${Date.now()}-applied.diff`);
    fs.writeFileSync(appliedPath, diffContent);
    artifacts.push(appliedPath);

    try {
      // Apply with 3-way merge and reject handling
      await execCommand('git', ['apply', '--3way', '--reject', diffPath]);
    } catch (error) {
      // Check for rejects
      const rejectFiles = fs.readdirSync('.').filter(f => f.endsWith('.rej'));
      for (const reject of rejectFiles) {
        const rejectPath = path.join('runs', auvId, 'patches', 'rejects', reject);
        ensureDir(path.dirname(rejectPath));
        fs.renameSync(reject, rejectPath);
        rejects.push(rejectPath);
      }
    }

    summary = extractDiffSummary(diffContent);

} else if (patch.type === 'changeset') {
// Apply JSON changeset
const changes = patch.changes || [];
const changeset = {
auv_id: auvId,
files: [],
timestamp: Date.now()
};

    for (const change of changes) {
      const filePath = change.path;

      // Validate against allowlist
      if (!isPathAllowed(filePath)) {
        throw new Error(`Path not allowed by write policy: ${filePath}`);
      }

      // Write file
      ensureDir(path.dirname(filePath));
      fs.writeFileSync(filePath, change.content, 'utf8');

      changeset.files.push({
        path: filePath,
        action: fileExists(filePath) ? 'modify' : 'add',
        sha256: crypto.createHash('sha256').update(change.content).digest('hex')
      });
    }

    // Write changeset record
    const changesetPath = path.join('runs', auvId, 'changeset.json');
    fs.writeFileSync(changesetPath, JSON.stringify(changeset, null, 2));
    artifacts.push(changesetPath);

    summary = `Modified ${changeset.files.length} file(s)`;

}

appendHookLine({
event: 'PatchApplied',
auv_id: auvId,
patch_type: patch.type,
files_changed: artifacts.length,
rejects: rejects.length,
timestamp: Date.now()
});

return { artifacts, rejects, summary };
}

---

// EDIT: hardened applyPatch with allowlist validation, dry-run behavior, and recursive reject collection
async function applyPatch(auvId, patch, runId, dryRun = false) {
const artifacts = [];
const rejects = [];
let summary = 'Applied changes';

ensureDir(path.join('runs', auvId, 'patches'));

if (patch.type === 'diff') {
const diffPath = patch.path;
if (!fileExists(diffPath)) throw new Error(`Diff file not found: ${diffPath}`);

    const diffContent = fs.readFileSync(diffPath, 'utf8');
    const appliedPath = path.join('runs', auvId, 'patches', `${Date.now()}-applied.diff`);
    fs.writeFileSync(appliedPath, diffContent);
    artifacts.push(appliedPath);

    // Validate all paths referenced by the diff against allowlist
    const changedFiles = extractFilesFromDiff(diffContent);
    for (const fp of changedFiles) {
      if (!isPathAllowed(fp)) {
        throw new Error(`Diff touches disallowed path: ${fp}`);
      }
    }

    if (!dryRun) {
      // Pre-check then apply; restrict to allowlisted pathspecs
      const includes = ['--'].concat(getAllowedGitPathspecs());
      await execCommand('git', ['apply', '--check', diffPath]);
      try {
        await execCommand('git', ['apply', '--3way', '--reject', '--whitespace=fix', ...includes, diffPath]);
      } catch {
        rejects.push(...collectRejectsRecursive(process.cwd(), auvId));
      }
    } else {
      // Dry-run: do not mutate workspace; only record artifacts/summary
    }

    summary = extractDiffSummary(diffContent);

} else if (patch.type === 'changeset') {
const changes = patch.changes || [];
const changeset = { auv_id: auvId, files: [], timestamp: Date.now() };

    for (const change of changes) {
      const filePath = change.path;
      if (!isPathAllowed(filePath)) throw new Error(`Path not allowed by write policy: ${filePath}`);
      const existedBefore = fileExists(filePath);
      if (!dryRun) {
        ensureDir(path.dirname(filePath));
        fs.writeFileSync(filePath, change.content, 'utf8');
      }
      changeset.files.push({
        path: filePath,
        action: existedBefore ? 'modify' : 'add',
        sha256: crypto.createHash('sha256').update(change.content).digest('hex'),
      });
    }

    const changesetPath = path.join('runs', auvId, 'changeset.json');
    fs.writeFileSync(changesetPath, JSON.stringify(changeset, null, 2));
    artifacts.push(changesetPath);

    summary = `Modified ${changeset.files.length} file(s)`;

}

appendHookLine({ event: 'PatchApplied', auv_id: auvId, patch_type: patch.type, files_changed: artifacts.length, rejects: rejects.length, timestamp: Date.now() });
return { artifacts, rejects, summary };
}

function extractFilesFromDiff(diffContent) {
const files = new Set();
for (const line of diffContent.split('\n')) {
if (line.startsWith('+++ ') || line.startsWith('--- ')) {
const p = line.slice(4).trim();
if (p === '/dev/null') continue;
const clean = p.replace(/^a\//, '').replace(/^b\//, '');
files.add(clean);
}
}
return Array.from(files);
}

function collectRejectsRecursive(rootDir, auvId) {
const out = [];
const rejectsDir = path.join('runs', auvId, 'patches', 'rejects');
ensureDir(rejectsDir);
(function walk(dir) {
for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
const full = path.join(dir, entry.name);
if (entry.isDirectory()) walk(full);
else if (entry.isFile() && entry.name.endsWith('.rej')) {
const dest = path.join(rejectsDir, path.basename(full));
try { fs.renameSync(full, dest); } catch { /_ ignore _/ }
out.push(dest);
}
}
})(rootDir);
return out;
}

function getAllowedGitPathspecs() {
return [
'orchestration/**',
'mcp/**',
'tests/**',
'docs/**',
'capabilities/**',
'scripts/**',
'.github/**',
'mock/**',
'public/**',
];
}

(build_lane.mjs)
async function recordDiff(auvId, runId) {
await execCommand('git', ['add', '-A']);

const diffResult = await execCommand('git', ['diff', '--staged']);
const diffPath = path.join('runs', auvId, 'patches', `${Date.now()}-staged.diff`);

ensureDir(path.dirname(diffPath));
fs.writeFileSync(diffPath, diffResult.stdout);

return diffPath;
}

---

// EDIT: stage and diff only allowlisted paths; avoid committing runs/\*\*
async function recordDiff(auvId, runId) {
const specs = getAllowedGitPathspecs();
await execCommand('git', ['add', '--', ...specs]);
const diffResult = await execCommand('git', ['diff', '--staged', '--', ...specs]);
const diffPath = path.join('runs', auvId, 'patches', `${Date.now()}-staged.diff`);
ensureDir(path.dirname(diffPath));
fs.writeFileSync(diffPath, diffResult.stdout);
return diffPath;
}

(build_lane.mjs)
changeset.files.push({
path: filePath,
action: fileExists(filePath) ? 'modify' : 'add',
sha256: crypto.createHash('sha256').update(change.content).digest('hex')
});t check
shell: bash
run: npx eslint . --max-warnings=0 || true # Non-blocking for now

      - name: Typecheck
        shell: bash
        run: npx tsc --noEmit || true  # Non-blocking for now

---

// EDIT: determine action before write
const existedBefore = fileExists(filePath);
if (!dryRun) {
ensureDir(path.dirname(filePath));
fs.writeFileSync(filePath, change.content, 'utf8');
}
changeset.files.push({
path: filePath,
action: existedBefore ? 'modify' : 'add',
sha256: crypto.createHash('sha256').update(change.content).digest('hex'),
}); - name: Unit tests
shell: bash
run: npm run test:unit

      - name: Integration tests
        shell: bash
        run: npm run test:integration

(ci.yml) # ---- QA Gates (Phase 5) ---- - name: Format check
shell: bash
run: npx prettier --check . || true # Non-blocking for now

      - name: Lint check
        shell: bash
        run: npx eslint . --max-warnings=0 || true  # Non-blocking for now

      - name: Typecheck
        shell: bash
        run: npx tsc --noEmit || true  # Non-blocking for now

---

# EDIT: make QA gates blocking and add tests before autopilot lanes

      # ---- QA Gates (Phase 5) ----
      - name: Format check
        shell: bash
        run: npx prettier --check .

      - name: Lint check
        shell: bash
        run: npx eslint . --max-warnings=0

      - name: Typecheck
        shell: bash
        run: npx tsc --noEmit

      - name: Unit tests
        shell: bash
        run: npm run test:unit

      - name: Integration tests
        shell: bash
        run: npm run test:integration

(build_lane.test.mjs)
generateRunId: () => {
const crypto = require('crypto');
return `RUN-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}Dry-run build lane (no mutations): `node orchestration/cli.mjs build-lane AUV-0003 --patch runs/demo/demo-patch.diff --dry-run --no-autopilot` - Changeset validation (dry): `node orchestration/cli.mjs build-lane AUV-0003 --patch changes.json --dry-run --no-autopilot` - Full run with PR (on a demo branch): `node orchestration/cli.mjs build-lane AUV-0003 --patch changes.diff --branch auv/AUV-0003/demo --open-pr`

- CI must fail on any QA violation and must run unit+integration before autopilot.
- Confirm no `runs/**` files are staged/committed; PR diff only touches allowlisted paths.
- Ensure `runs/observability/hooks.jsonl` contains BuildStart/PatchApplied/BuildEnd events for build-lane runs.

Blocking issues resolved → proceed to Phase 6.

---

// EDIT: ESM-safe random bytes
import { randomBytes } from 'node:crypto';
...
generateRunId: () => {
return `RUN-${Date.now()}-${randomBytes(4).toString('hex')}`;
}

### Verification checklist to exit Phase 5

- After applying edits:
  - Run locally:
    - Format/lint/typecheck/tests: `npm run qa`
    - Dry-run build lane (no mutations): `node orchestration/cli.mjs build-lane AUV-0003 --patch runs/demo/demo-patch.diff --dry-run --no-autopilot`
    - Changeset validation (dry): `node orchestration/cli.mjs build-lane AUV-0003 --patch changes.json --dry-run --no-autopilot`
    - Full run with PR (on a demo branch): `node orchestration/cli.mjs build-lane AUV-0003 --patch changes.diff --branch auv/AUV-0003/demo --open-pr`
  - CI must fail on any QA violation and must run unit+integration before autopilot.
  - Confirm no `runs/**` files are staged/committed; PR diff only touches allowlisted paths.
  - Ensure `runs/observability/hooks.jsonl` contains BuildStart/PatchApplied/BuildEnd events for build-lane runs.
