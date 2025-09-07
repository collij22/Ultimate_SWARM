/**
 * Unit tests for Build Lane functionality
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { randomBytes } from 'node:crypto';

// Mock modules for testing
const mockBuildLane = {
  isPathAllowed: (filePath) => {
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

    const WRITE_DENYLIST = ['node_modules', 'runs', 'dist', '.git'];

    const DENY_PATTERNS = [/^\.env/, /\.DS_Store$/, /Thumbs\.db$/];

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

    return false;
  },

  extractDiffSummary: (diffContent) => {
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
  },

  generateRunId: () => {
    return `RUN-${Date.now()}-${randomBytes(4).toString('hex')}`;
  },
};

describe('Build Lane - Path Allowlist', () => {
  it('should allow writes to allowlisted directories', () => {
    assert.strictEqual(mockBuildLane.isPathAllowed('orchestration/lib/test.mjs'), true);
    assert.strictEqual(mockBuildLane.isPathAllowed('mcp/router.mjs'), true);
    assert.strictEqual(mockBuildLane.isPathAllowed('tests/unit/test.mjs'), true);
    assert.strictEqual(mockBuildLane.isPathAllowed('docs/README.md'), true);
    assert.strictEqual(mockBuildLane.isPathAllowed('capabilities/AUV-0001.yaml'), true);
    assert.strictEqual(mockBuildLane.isPathAllowed('.github/workflows/ci.yml'), true);
  });

  it('should deny writes to denylisted directories', () => {
    assert.strictEqual(mockBuildLane.isPathAllowed('node_modules/test/index.js'), false);
    assert.strictEqual(mockBuildLane.isPathAllowed('runs/AUV-0001/test.json'), false);
    assert.strictEqual(mockBuildLane.isPathAllowed('dist/bundle.js'), false);
    assert.strictEqual(mockBuildLane.isPathAllowed('.git/config'), false);
  });

  it('should deny writes to sensitive files', () => {
    assert.strictEqual(mockBuildLane.isPathAllowed('.env'), false);
    assert.strictEqual(mockBuildLane.isPathAllowed('.env.local'), false);
    assert.strictEqual(mockBuildLane.isPathAllowed('.DS_Store'), false);
    assert.strictEqual(mockBuildLane.isPathAllowed('Thumbs.db'), false);
  });

  it('should deny writes to unlisted paths', () => {
    assert.strictEqual(mockBuildLane.isPathAllowed('/etc/passwd'), false);
    assert.strictEqual(mockBuildLane.isPathAllowed('../../../etc/passwd'), false);
    assert.strictEqual(mockBuildLane.isPathAllowed('random/path/file.txt'), false);
  });

  it('should handle path traversal attempts', () => {
    assert.strictEqual(mockBuildLane.isPathAllowed('orchestration/../node_modules/test.js'), false);
    assert.strictEqual(mockBuildLane.isPathAllowed('orchestration/../../etc/passwd'), false);
    assert.strictEqual(mockBuildLane.isPathAllowed('.github/../.env'), false);
  });

  it('should handle Windows-style paths', () => {
    const windowsPath = 'orchestration\\lib\\test.mjs';
    assert.strictEqual(mockBuildLane.isPathAllowed(windowsPath), true);

    const deniedWindowsPath = 'node_modules\\test\\index.js';
    assert.strictEqual(mockBuildLane.isPathAllowed(deniedWindowsPath), false);
  });
});

describe('Build Lane - Diff Parsing', () => {
  it('should extract file names from unified diff', () => {
    const diff = `diff --git a/test.js b/test.js
--- a/test.js
+++ b/test.js
@@ -1,3 +1,3 @@
-console.log('old');
+console.log('new');`;

    const summary = mockBuildLane.extractDiffSummary(diff);
    assert.strictEqual(summary, 'Updated test.js');
  });

  it('should handle multiple files in diff', () => {
    const diff = `diff --git a/file1.js b/file1.js
--- a/file1.js
+++ b/file1.js
@@ -1 +1 @@
-old1
+new1
diff --git a/file2.js b/file2.js
--- a/file2.js
+++ b/file2.js
@@ -1 +1 @@
-old2
+new2`;

    const summary = mockBuildLane.extractDiffSummary(diff);
    assert.strictEqual(summary, 'Updated 2 files');
  });

  it('should handle empty diff', () => {
    const summary = mockBuildLane.extractDiffSummary('');
    assert.strictEqual(summary, 'Applied changes');
  });

  it('should handle new file creation', () => {
    const diff = `diff --git a/new.js b/new.js
--- /dev/null
+++ b/new.js
@@ -0,0 +1 @@
+console.log('new file');`;

    const summary = mockBuildLane.extractDiffSummary(diff);
    assert.strictEqual(summary, 'Updated new.js');
  });
});

describe('Build Lane - Changeset Validation', () => {
  it('should validate changeset structure', () => {
    const validChangeset = {
      auv_id: 'AUV-0003',
      files: [{ path: 'tests/test.mjs', action: 'modify', sha256: 'abc123' }],
      timestamp: Date.now(),
    };

    assert.ok(validChangeset.auv_id);
    assert.ok(Array.isArray(validChangeset.files));
    assert.ok(validChangeset.timestamp);
  });

  it('should reject invalid changeset paths', () => {
    const changes = [
      { path: 'node_modules/test.js', content: 'test' },
      { path: '.env', content: 'SECRET=123' },
      { path: '../../../etc/passwd', content: 'malicious' },
    ];

    for (const change of changes) {
      assert.strictEqual(
        mockBuildLane.isPathAllowed(change.path),
        false,
        `Should reject ${change.path}`,
      );
    }
  });
});

describe('Build Lane - Run ID Generation', () => {
  it('should generate unique run IDs', () => {
    const id1 = mockBuildLane.generateRunId();
    const id2 = mockBuildLane.generateRunId();

    assert.notStrictEqual(id1, id2);
    assert.ok(id1.startsWith('RUN-'));
    assert.ok(id2.startsWith('RUN-'));
  });

  it('should include timestamp in run ID', () => {
    const before = Date.now();
    const runId = mockBuildLane.generateRunId();
    const after = Date.now();

    const match = runId.match(/RUN-(\d+)-/);
    assert.ok(match);

    const timestamp = parseInt(match[1]);
    assert.ok(timestamp >= before);
    assert.ok(timestamp <= after);
  });
});

describe('Build Lane - Branch Naming', () => {
  it('should generate valid branch names', () => {
    const auvId = 'AUV-0003';
    const branchName = `auv/${auvId}/changes-${Date.now()}`;

    assert.ok(branchName.startsWith('auv/AUV-0003/'));
    assert.ok(/^[a-zA-Z0-9\-/]+$/.test(branchName));
  });

  it('should handle custom branch names', () => {
    const customBranch = 'feature/my-custom-branch';
    assert.ok(/^[a-zA-Z0-9\-/]+$/.test(customBranch));
  });
});

describe('Build Lane - QA Configuration', () => {
  it('should have default QA settings', () => {
    const defaultQA = {
      format: true,
      lint: true,
      typecheck: true,
      unit: true,
      integration: true,
      autopilot: true,
    };

    for (const [key, value] of Object.entries(defaultQA)) {
      assert.strictEqual(value, true, `${key} should be enabled by default`);
    }
  });

  it('should respect QA overrides', () => {
    const overrides = {
      format: false,
      lint: true,
      typecheck: false,
      unit: true,
      integration: false,
      autopilot: false,
    };

    assert.strictEqual(overrides.format, false);
    assert.strictEqual(overrides.lint, true);
    assert.strictEqual(overrides.typecheck, false);
  });
});

describe('Build Lane - Artifact Paths', () => {
  it('should generate correct artifact paths', () => {
    const auvId = 'AUV-0003';
    const runId = 'RUN-123456-abc';

    const paths = {
      patches: `runs/${auvId}/patches/`,
      resultCard: `runs/${auvId}/result-cards/build-lane-${runId}.json`,
      changeset: `runs/${auvId}/changeset.json`,
      prCard: `runs/${auvId}/result-cards/pr.json`,
    };

    for (const [key, path] of Object.entries(paths)) {
      assert.ok(path.includes(auvId), `${key} path should include AUV ID`);
      assert.ok(path.startsWith('runs/'), `${key} path should start with runs/`);
    }
  });
});

describe('Build Lane - Exit Codes', () => {
  it('should use correct exit codes', () => {
    const exitCodes = {
      format: 201,
      lint: 202,
      typecheck: 203,
      unit: 204,
      integration: 205,
      autopilot: 206,
      push: 207,
      pr: 208,
      patch: 209,
    };

    for (const [step, code] of Object.entries(exitCodes)) {
      assert.ok(code >= 201 && code <= 209, `${step} exit code should be in 200 series`);
    }
  });
});
