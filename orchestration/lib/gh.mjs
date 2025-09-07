#!/usr/bin/env node
/**
 * Swarm1 — GitHub Integration
 *
 * Handles PR creation with gh CLI (preferred) or REST API fallback.
 * Extracts repo info from git remote and formats PR bodies with artifacts.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

/**
 * Check if gh CLI is available and authenticated
 */
export async function detectGhCli() {
  try {
    const result = await execCommand('gh', ['auth', 'status']);
    return result.code === 0;
  } catch {
    return false;
  }
}

/**
 * Parse GitHub repo info from git remote
 */
export async function parseRemote() {
  try {
    const result = await execCommand('git', ['remote', 'get-url', 'origin']);
    const url = result.stdout.trim();

    // Parse different URL formats
    let owner, repo;

    if (url.startsWith('git@github.com:')) {
      // SSH format: git@github.com:owner/repo.git
      const match = url.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
      if (match) {
        owner = match[1];
        repo = match[2];
      }
    } else if (url.startsWith('https://github.com/')) {
      // HTTPS format: https://github.com/owner/repo.git
      const match = url.match(/https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
      if (match) {
        owner = match[1];
        repo = match[2];
      }
    }

    if (!owner || !repo) {
      throw new Error(`Could not parse GitHub repo from remote URL: ${url}`);
    }

    return { owner, repo, url };
  } catch (error) {
    throw new Error(`Failed to get remote info: ${error.message}`);
  }
}

/**
 * Create a pull request
 *
 * @param {Object} options - PR options
 * @param {string} options.base - Base branch (default: main)
 * @param {string} options.head - Head branch
 * @param {string} options.title - PR title
 * @param {string} options.body - PR body (markdown)
 * @param {boolean} [options.draft] - Create as draft PR
 * @param {string[]} [options.labels] - Labels to add
 * @param {string} [options.auvId] - AUV ID for artifact tracking
 */
export async function createPullRequest(options) {
  const { base = 'main', head, title, body, draft = false, labels = [], auvId } = options;

  // Check if gh CLI is available
  const hasGhCli = await detectGhCli();

  if (hasGhCli) {
    return await createPullRequestWithGh(options);
  } else {
    return await createPullRequestWithRest(options);
  }
}

/**
 * Create PR using gh CLI
 */
async function createPullRequestWithGh(options) {
  const { base = 'main', head, title, body, draft = false, labels = [], auvId } = options;

  const args = ['pr', 'create', '--base', base, '--head', head, '--title', title, '--body', body];

  if (draft) {
    args.push('--draft');
  }

  if (labels.length > 0) {
    args.push('--label', labels.join(','));
  }

  try {
    const result = await execCommand('gh', args);
    const prUrl = result.stdout.trim();

    // Extract PR number from URL
    const prNumber = parseInt(prUrl.match(/\/pull\/(\d+)/)?.[1] || '0');

    // Get the head SHA
    const shaResult = await execCommand('git', ['rev-parse', head]);
    const headSha = shaResult.stdout.trim();

    const prResult = {
      url: prUrl,
      number: prNumber,
      sha: headSha,
      headRef: head,
      created_at: new Date().toISOString(),
    };

    // Write PR result card if AUV ID provided
    if (auvId) {
      await writePRCard(auvId, prResult);
    }

    return prResult;
  } catch (error) {
    throw new Error(`Failed to create PR with gh CLI: ${error.message}`);
  }
}

/**
 * Create PR using GitHub REST API
 */
async function createPullRequestWithRest(options) {
  const { base = 'main', head, title, body, draft = false, labels = [], auvId } = options;

  // Check for GitHub token
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    throw new Error('GitHub token not found. Set GITHUB_TOKEN or GH_TOKEN environment variable.');
  }

  // Get repo info
  const { owner, repo } = await parseRemote();

  // Prepare request
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls`;
  const payload = {
    title,
    body,
    head,
    base,
    draft,
    maintainer_can_modify: true,
  };

  try {
    // Use fetch if available (Node 18+), otherwise fall back to https module
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Swarm1-BuildLane',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
    }

    const prData = await response.json();

    // Add labels if provided
    if (labels.length > 0 && prData.number) {
      await addLabelsToIssue(owner, repo, prData.number, labels, token);
    }

    const prResult = {
      url: prData.html_url,
      number: prData.number,
      sha: prData.head.sha,
      headRef: prData.head.ref,
      created_at: prData.created_at,
    };

    // Write PR result card if AUV ID provided
    if (auvId) {
      await writePRCard(auvId, prResult);
    }

    return prResult;
  } catch (error) {
    // If fetch is not available, provide guidance
    if (error.message.includes('fetch is not defined')) {
      throw new Error('REST API fallback requires Node.js 18+ or gh CLI to be installed');
    }
    throw new Error(`Failed to create PR with REST API: ${error.message}`);
  }
}

/**
 * Add labels to an issue/PR
 */
async function addLabelsToIssue(owner, repo, issueNumber, labels, token) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels`;

  try {
    await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Swarm1-BuildLane',
      },
      body: JSON.stringify({ labels }),
    });
  } catch {
    // Silent fail for labels
  }
}

/**
 * Write PR result card
 */
async function writePRCard(auvId, prResult) {
  const cardPath = path.join('runs', auvId, 'result-cards', 'pr.json');
  const dir = path.dirname(cardPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const card = {
    version: '1.0',
    auv_id: auvId,
    pr_url: prResult.url,
    pr_number: prResult.number,
    head_sha: prResult.sha,
    head_ref: prResult.headRef,
    created_at: prResult.created_at,
    timestamp: Date.now(),
  };

  fs.writeFileSync(cardPath, JSON.stringify(card, null, 2));
  return cardPath;
}

/**
 * Format PR body with standard template
 */
export function formatPRBody(auvId, changes = [], qaResults = {}, artifacts = []) {
  const qaSection = Object.entries(qaResults)
    .map(([check, result]) => {
      const icon = result.success ? '✅' : '❌';
      const time = result.duration_ms ? ` (${result.duration_ms}ms)` : '';
      return `- ${icon} ${check}${time}`;
    })
    .join('\n');

  const changesSection =
    changes.length > 0 ? changes.map((f) => `- \`${f}\``).join('\n') : '- See diff for changes';

  const artifactsSection =
    artifacts.length > 0 ? artifacts.map((a) => `- \`${a}\``).join('\n') : '- No artifacts';

  return `## Summary
Automated changes for **${auvId}**

## Changes
${changesSection}

## Quality Gates
${qaSection || '- No QA checks run'}

## Artifacts
${artifactsSection}

## Test Plan
- [ ] All tests pass
- [ ] ${auvId} capability remains functional
- [ ] No regressions in related AUVs

## Checklist
- [ ] Code follows project conventions
- [ ] Tests updated if needed
- [ ] Documentation updated if needed
- [ ] No sensitive data exposed

---
🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>`;
}

/**
 * Execute a command and return output
 */
function execCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      ...options,
      shell: false,
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

    proc.on('error', (error) => {
      reject(error);
    });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, code });
    });
  });
}

/**
 * Get current branch
 */
export async function getCurrentBranch() {
  try {
    const result = await execCommand('git', ['branch', '--show-current']);
    return result.stdout.trim();
  } catch {
    return 'main';
  }
}

/**
 * Check if a branch exists
 */
export async function branchExists(branchName) {
  try {
    await execCommand('git', ['rev-parse', '--verify', branchName]);
    return true;
  } catch {
    return false;
  }
}
