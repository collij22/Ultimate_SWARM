#!/usr/bin/env node
/**
 * Swarm1 — Autonomous Build Lane
 *
 * Enables agents to safely modify code, run QA gates, commit, push, and open PRs.
 * Maintains determinism, Windows safety, and comprehensive observability.
 *
 * Exit codes (200-series):
 *   201 - Format failed
 *   202 - Lint failed
 *   203 - Typecheck failed
 *   204 - Unit tests failed
 *   205 - Integration tests failed
 *   206 - Autopilot smoke failed
 *   207 - Git push failed
 *   208 - PR creation failed
 *   209 - Patch apply failed
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';
import { ensureDir, fileExists } from './fs-utils.mjs';
import { runAuv } from '../runbooks/auv_delivery.mjs';

// Write allowlist - directories where agents can make changes
const WRITE_ALLOWLIST = [
  'orchestration',
  'mcp',
  'tests',
  'docs',
  'capabilities',
  'scripts',
  '.github',
  'mock',
  'public',
];

// Write denylist - never allow writes to these
const WRITE_DENYLIST = ['node_modules', 'runs', 'dist', '.git'];

// Denylist file patterns
const DENY_PATTERNS = [/^\.env/, /\.DS_Store$/, /Thumbs\.db$/];

/**
 * BuildLaneOptions
 * @typedef {Object} BuildLaneOptions
 * @property {string} auvId - The AUV ID for this change
 * @property {Object} patch - Patch configuration
 * @property {string} patch.type - 'diff' or 'changeset'
 * @property {string} [patch.path] - Path to diff file (for type='diff')
 * @property {Array} [patch.changes] - Array of changes (for type='changeset')
 * @property {string} [branch] - Desired branch name (auto-generated if not provided)
 * @property {boolean} [openPr] - Whether to open a PR after push
 * @property {boolean} [dryRun] - Dry run mode (no git operations)
 * @property {Object} [qa] - QA gate configuration
 * @property {boolean} [qa.format] - Run formatter (default: true)
 * @property {boolean} [qa.lint] - Run linter (default: true)
 * @property {boolean} [qa.typecheck] - Run typecheck (default: true)
 * @property {boolean} [qa.unit] - Run unit tests (default: true)
 * @property {boolean} [qa.integration] - Run integration tests (default: true)
 * @property {boolean} [qa.autopilot] - Run autopilot smoke (default: true)
 */

/**
 * Main build lane runner
 */
export async function runBuildLane(options) {
  const { auvId, patch, branch, openPr = false, dryRun = false, qa = {} } = options;

  // Set defaults for QA gates
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

  // Initialize result tracking
  const result = {
    auvId,
    runId,
    branch: null,
    artifacts: [],
    qaResults: {},
    prUrl: null,
    success: false,
    exitCode: 0,
  };

  try {
    // Emit start event
    appendHookLine({
      event: 'BuildStart',
      auv_id: auvId,
      run_id: runId,
      patch_type: patch.type,
      dry_run: dryRun,
      timestamp: Date.now(),
    });

    // Step 1: Assert repo is clean
    if (!dryRun) {
      await assertRepoClean();
    }

    // Step 2: Create or select branch
    const targetBranch = await createOrSelectBranch(auvId, branch, dryRun);
    result.branch = targetBranch;

    // Step 3: Apply patch
    const patchResult = await applyPatch(auvId, patch, runId, dryRun);
    result.artifacts.push(...patchResult.artifacts);

    if (patchResult.rejects?.length > 0) {
      throw new BuildLaneError('Patch application had rejects', 'patch', 209);
    }

    // Step 4: Run QA gates
    if (qaConfig.format) {
      const formatResult = await runFormat(dryRun);
      result.qaResults.format = formatResult;
      if (!formatResult.success && !dryRun) {
        throw new BuildLaneError('Format check failed', 'format', 201);
      }
    }

    if (qaConfig.lint) {
      const lintResult = await runLint();
      result.qaResults.lint = lintResult;
      if (!lintResult.success) {
        throw new BuildLaneError('Lint check failed', 'lint', 202);
      }
    }

    if (qaConfig.typecheck) {
      const typecheckResult = await runTypecheck();
      result.qaResults.typecheck = typecheckResult;
      if (!typecheckResult.success) {
        throw new BuildLaneError('Typecheck failed', 'typecheck', 203);
      }
    }

    if (qaConfig.unit) {
      const unitResult = await runTests('unit');
      result.qaResults.unit = unitResult;
      if (!unitResult.success) {
        throw new BuildLaneError('Unit tests failed', 'unit', 204);
      }
    }

    if (qaConfig.integration) {
      const integrationResult = await runTests('integration');
      result.qaResults.integration = integrationResult;
      if (!integrationResult.success) {
        throw new BuildLaneError('Integration tests failed', 'integration', 205);
      }
    }

    // Step 5: Run autopilot smoke test
    if (qaConfig.autopilot) {
      const autopilotResult = await runAutopilotSmoke(auvId);
      result.qaResults.autopilot = autopilotResult;
      if (!autopilotResult.success) {
        throw new BuildLaneError('Autopilot smoke test failed', 'autopilot', 206);
      }
    }

    // Step 6: Record diff
    const diffPath = await recordDiff(auvId, runId, dryRun);
    result.artifacts.push(diffPath);

    // Step 7: Commit and push (if not dry run)
    if (!dryRun) {
      const commitResult = await commitAndPush(auvId, targetBranch, patchResult.summary);
      result.commitSha = commitResult.sha;

      // Step 8: Open PR if requested
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

    // Write final result card
    await writeResultCard(auvId, runId, result);

    // Emit success event
    appendHookLine({
      event: 'BuildEnd',
      auv_id: auvId,
      run_id: runId,
      success: true,
      duration_ms: Date.now() - startTime,
      pr_url: result.prUrl,
      timestamp: Date.now(),
    });

    return result;
  } catch (error) {
    result.success = false;
    result.error = error.message;
    result.exitCode = error.exitCode || 1;

    // Write failure result card
    await writeResultCard(auvId, runId, result);

    // Emit failure event
    appendHookLine({
      event: 'BuildEnd',
      auv_id: auvId,
      run_id: runId,
      success: false,
      error: error.message,
      exit_code: result.exitCode,
      duration_ms: Date.now() - startTime,
      timestamp: Date.now(),
    });

    throw error;
  }
}

/**
 * Check if repo has uncommitted changes
 */
async function assertRepoClean() {
  const result = await execCommand('git', ['status', '--porcelain']);
  if (result.stdout.trim()) {
    throw new Error('Repository has uncommitted changes. Please commit or stash them first.');
  }
}

/**
 * Create or select a branch for the changes
 */
async function createOrSelectBranch(auvId, desiredBranch, dryRun) {
  if (dryRun) {
    return desiredBranch || `auv/${auvId}/changes-${Date.now()}`;
  }

  // Generate branch name if not provided
  const targetBranch =
    desiredBranch || `auv/${auvId}/changes-${crypto.randomBytes(4).toString('hex')}`;

  // Check if branch exists
  try {
    await execCommand('git', ['rev-parse', '--verify', targetBranch]);
    // Branch exists, switch to it
    await execCommand('git', ['checkout', targetBranch]);
  } catch {
    // Branch doesn't exist, create it
    await execCommand('git', ['checkout', '-b', targetBranch]);
  }

  return targetBranch;
}

/**
 * Apply a patch (diff or changeset) with enhanced safety
 */
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
      try {
        await execCommand('git', ['apply', '--check', diffPath]);
        await execCommand('git', [
          'apply',
          '--3way',
          '--reject',
          '--whitespace=fix',
          ...includes,
          diffPath,
        ]);
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
      if (!isPathAllowed(filePath)) {
        throw new Error(`Path not allowed by write policy: ${filePath}`);
      }
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

  appendHookLine({
    event: 'PatchApplied',
    auv_id: auvId,
    patch_type: patch.type,
    files_changed: artifacts.length,
    rejects: rejects.length,
    timestamp: Date.now(),
  });
  return { artifacts, rejects, summary };
}

/**
 * Check if a path is allowed for writing
 */
function isPathAllowed(filePath) {
  const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');

  // Check deny patterns
  for (const pattern of DENY_PATTERNS) {
    if (pattern.test(normalizedPath)) {
      return false;
    }
  }

  // Check denylist directories
  for (const denied of WRITE_DENYLIST) {
    if (normalizedPath.startsWith(denied + '/') || normalizedPath === denied) {
      return false;
    }
  }

  // Check allowlist directories
  for (const allowed of WRITE_ALLOWLIST) {
    if (normalizedPath.startsWith(allowed + '/') || normalizedPath === allowed) {
      return true;
    }
  }

  // Default deny for safety
  return false;
}

/**
 * Run formatter
 */
async function runFormat(dryRun = false) {
  const startTime = Date.now();

  try {
    if (dryRun) {
      await execCommand('npx', ['prettier', '--check', '.']);
    } else {
      await execCommand('npx', ['prettier', '--write', '.']);
    }

    return {
      success: true,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      duration_ms: Date.now() - startTime,
    };
  }
}

/**
 * Run linter
 */
async function runLint() {
  const startTime = Date.now();

  try {
    await execCommand('npx', ['eslint', '.', '--max-warnings=0']);

    return {
      success: true,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      duration_ms: Date.now() - startTime,
    };
  }
}

/**
 * Run typecheck
 */
async function runTypecheck() {
  const startTime = Date.now();

  // Skip if no tsconfig
  if (!fileExists('tsconfig.json')) {
    return {
      success: true,
      skipped: true,
      duration_ms: 0,
    };
  }

  try {
    await execCommand('npx', ['tsc', '--noEmit']);

    return {
      success: true,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      duration_ms: Date.now() - startTime,
    };
  }
}

/**
 * Run tests
 */
async function runTests(type = 'unit') {
  const startTime = Date.now();

  try {
    const script = type === 'unit' ? 'test:unit' : 'test:integration';
    await execCommand('npm', ['run', script]);

    return {
      success: true,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      duration_ms: Date.now() - startTime,
    };
  }
}

/**
 * Run autopilot smoke test for the target AUV
 */
async function runAutopilotSmoke(auvId) {
  const startTime = Date.now();

  try {
    // Set AUV_ID to activate Swarm mode for hooks
    process.env.AUV_ID = auvId;

    // Run the autopilot
    await runAuv(auvId);

    return {
      success: true,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      exit_code: error.exitCode,
      duration_ms: Date.now() - startTime,
    };
  } finally {
    delete process.env.AUV_ID;
  }
}

/**
 * Record the staged diff (restricted to allowlist)
 */
async function recordDiff(auvId, runId, dryRun = false) {
  const diffPath = path.join('runs', auvId, 'patches', `${Date.now()}-staged.diff`);
  ensureDir(path.dirname(diffPath));

  if (dryRun) {
    // In dry-run mode, create a placeholder diff without git operations
    fs.writeFileSync(diffPath, '# Dry-run mode - no actual diff created\n');
  } else {
    const specs = getAllowedGitPathspecs();
    await execCommand('git', ['add', '--', ...specs]);
    const diffResult = await execCommand('git', ['diff', '--staged', '--', ...specs]);
    fs.writeFileSync(diffPath, diffResult.stdout);
  }

  return diffPath;
}

/**
 * Commit and push changes
 */
async function commitAndPush(auvId, branch, summary) {
  // Create commit message
  const message = `feat(${auvId}): ${summary}

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>`;

  // Commit
  await execCommand('git', ['commit', '-m', message]);

  // Get commit SHA
  const shaResult = await execCommand('git', ['rev-parse', 'HEAD']);
  const sha = shaResult.stdout.trim();

  // Push
  try {
    await execCommand('git', ['push', '-u', 'origin', branch]);
  } catch (error) {
    throw new BuildLaneError('Failed to push to remote', 'push', 207);
  }

  return { sha };
}

/**
 * Format PR body with artifacts and results
 */
function formatPRBody(auvId, result) {
  const qaChecks = Object.entries(result.qaResults)
    .map(([name, res]) => `- [${res.success ? 'x' : ' '}] ${name}`)
    .join('\n');

  return `## Summary
Automated changes for ${auvId}

## QA Checks
${qaChecks}

## Artifacts
- Branch: \`${result.branch}\`
- Run ID: \`${result.runId}\`
- Artifacts: ${result.artifacts.length} files

## Test Plan
Verify that all tests pass and the ${auvId} capability remains functional.

🤖 Generated with [Claude Code](https://claude.ai/code)`;
}

/**
 * Write result card
 */
async function writeResultCard(auvId, runId, result) {
  const cardPath = path.join('runs', auvId, 'result-cards', `build-lane-${runId}.json`);
  ensureDir(path.dirname(cardPath));

  const card = {
    version: '1.0',
    auv_id: auvId,
    run_id: runId,
    branch: result.branch,
    success: result.success,
    exit_code: result.exitCode,
    qa_results: result.qaResults,
    artifacts: result.artifacts,
    pr_url: result.prUrl,
    pr_number: result.prNumber,
    commit_sha: result.commitSha,
    error: result.error,
    timestamp: Date.now(),
  };

  fs.writeFileSync(cardPath, JSON.stringify(card, null, 2));
  return cardPath;
}

/**
 * Execute a command and return output
 */
function execCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      ...options,
      shell: false, // Windows safety
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    if (proc.stdout) {
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }

    if (proc.stderr) {
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    proc.on('error', reject);

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        const error = new Error(`Command failed: ${command} ${args.join(' ')}`);
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

/**
 * Generate a unique run ID
 */
function generateRunId() {
  return `RUN-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Extract summary from diff
 */
function extractDiffSummary(diffContent) {
  const lines = diffContent.split('\n');
  const files = new Set();

  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      const file = line.split(/\s+/)[1];
      if (file && file !== '/dev/null') {
        files.add(path.basename(file));
      }
    }
  }

  if (files.size === 0) return 'Applied changes';
  if (files.size === 1) return `Updated ${Array.from(files)[0]}`;
  return `Updated ${files.size} files`;
}

/**
 * Extract files from diff content for validation
 */
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

/**
 * Recursively collect reject files
 */
function collectRejectsRecursive(rootDir, auvId) {
  const out = [];
  const rejectsDir = path.join('runs', auvId, 'patches', 'rejects');
  ensureDir(rejectsDir);
  (function walk(dir) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          entry.name !== 'node_modules' &&
          entry.name !== 'runs'
        ) {
          walk(full);
        } else if (entry.isFile() && entry.name.endsWith('.rej')) {
          const dest = path.join(rejectsDir, path.basename(full));
          try {
            fs.renameSync(full, dest);
          } catch {
            /* ignore */
          }
          out.push(dest);
        }
      }
    } catch {
      /* ignore errors reading directories */
    }
  })(rootDir);
  return out;
}

/**
 * Get allowed Git pathspecs for staging/committing
 */
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

/**
 * Append to hooks observability log
 */
function appendHookLine(obj) {
  try {
    const logPath = path.resolve(process.cwd(), 'runs', 'observability', 'hooks.jsonl');
    ensureDir(path.dirname(logPath));
    fs.appendFileSync(logPath, JSON.stringify(obj) + '\n');
  } catch {
    // Silent fail for observability
  }
}

/**
 * Custom error class for build lane failures
 */
class BuildLaneError extends Error {
  constructor(message, step, exitCode) {
    super(message);
    this.name = 'BuildLaneError';
    this.step = step;
    this.exitCode = exitCode;
  }
}

export { BuildLaneError };
