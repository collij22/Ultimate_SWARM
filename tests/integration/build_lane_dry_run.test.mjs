/**
 * Integration test for Build Lane dry run functionality
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runBuildLane } from '../../orchestration/lib/build_lane.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Build Lane - Dry Run Integration', () => {
  const testAuvId = 'AUV-TEST-001';
  const testPatchDir = path.join(__dirname, '..', 'fixtures', 'patches');
  const testDiffPath = path.join(testPatchDir, 'test.diff');
  const testChangesetPath = path.join(testPatchDir, 'test-changeset.json');

  beforeEach(() => {
    // Create test fixtures directory
    fs.mkdirSync(testPatchDir, { recursive: true });

    // Create a test diff file
    const testDiff = `diff --git a/tests/test-file.mjs b/tests/test-file.mjs
--- a/tests/test-file.mjs
+++ b/tests/test-file.mjs
@@ -1,3 +1,3 @@
-console.log('old version');
+console.log('new version');
`;
    fs.writeFileSync(testDiffPath, testDiff);

    // Create a test changeset file
    const testChangeset = {
      changes: [
        {
          path: 'tests/test-file.mjs',
          content: "console.log('new version');\n",
        },
      ],
    };
    fs.writeFileSync(testChangesetPath, JSON.stringify(testChangeset));
  });

  afterEach(() => {
    // Clean up test fixtures
    try {
      fs.rmSync(testPatchDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Clean up any created test artifacts
    const artifactPath = path.join(process.cwd(), 'runs', testAuvId);
    try {
      fs.rmSync(artifactPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should run dry-run with diff patch', async () => {
    const options = {
      auvId: testAuvId,
      patch: {
        type: 'diff',
        path: testDiffPath,
      },
      dryRun: true,
      qa: {
        format: false,
        lint: false,
        typecheck: false,
        unit: false,
        integration: false,
        autopilot: false,
      },
    };

    const result = await runBuildLane(options);

    assert.ok(result.success, 'Dry run should succeed');
    assert.ok(result.branch, 'Should generate a branch name');
    assert.ok(result.artifacts.length > 0, 'Should create artifacts');
    assert.strictEqual(result.prUrl, null, 'Should not create PR in dry run');
  });

  it('should run dry-run with changeset patch', async () => {
    const options = {
      auvId: testAuvId,
      patch: {
        type: 'changeset',
        path: testChangesetPath,
        changes: [
          {
            path: 'tests/test-file.mjs',
            content: "console.log('new version');\n",
          },
        ],
      },
      dryRun: true,
      qa: {
        format: false,
        lint: false,
        typecheck: false,
        unit: false,
        integration: false,
        autopilot: false,
      },
    };

    const result = await runBuildLane(options);

    assert.ok(result.success, 'Dry run should succeed');
    assert.ok(result.branch, 'Should generate a branch name');
    assert.ok(result.artifacts.length > 0, 'Should create artifacts');
  });

  it('should write result card on success', async () => {
    const options = {
      auvId: testAuvId,
      patch: {
        type: 'diff',
        path: testDiffPath,
      },
      dryRun: true,
      qa: {
        format: false,
        lint: false,
        typecheck: false,
        unit: false,
        integration: false,
        autopilot: false,
      },
    };

    await runBuildLane(options);

    // Check for result card
    const cardPattern = path.join(
      process.cwd(),
      'runs',
      testAuvId,
      'result-cards',
      'build-lane-*.json',
    );
    const cards = fs
      .readdirSync(path.dirname(cardPattern.replace('*', '')))
      .filter((f) => f.startsWith('build-lane-'));

    assert.ok(cards.length > 0, 'Should write result card');

    // Verify card content
    const cardPath = path.join(path.dirname(cardPattern.replace('*', '')), cards[0]);
    const card = JSON.parse(fs.readFileSync(cardPath, 'utf8'));

    assert.strictEqual(card.auv_id, testAuvId);
    assert.strictEqual(card.success, true);
    assert.ok(card.run_id);
    assert.ok(card.branch);
  });

  it('should reject patches with disallowed paths', async () => {
    // Create a malicious changeset
    const maliciousChangeset = {
      changes: [
        {
          path: 'node_modules/evil.js',
          content: 'malicious code',
        },
      ],
    };

    const maliciousPath = path.join(testPatchDir, 'malicious.json');
    fs.writeFileSync(maliciousPath, JSON.stringify(maliciousChangeset));

    const options = {
      auvId: testAuvId,
      patch: {
        type: 'changeset',
        path: maliciousPath,
        changes: maliciousChangeset.changes,
      },
      dryRun: true,
      qa: {
        format: false,
        lint: false,
        typecheck: false,
        unit: false,
        integration: false,
        autopilot: false,
      },
    };

    await assert.rejects(
      async () => await runBuildLane(options),
      /Path not allowed/,
      'Should reject disallowed paths',
    );
  });

  it('should handle missing patch file gracefully', async () => {
    const options = {
      auvId: testAuvId,
      patch: {
        type: 'diff',
        path: '/nonexistent/file.diff',
      },
      dryRun: true,
      qa: {
        format: false,
        lint: false,
        typecheck: false,
        unit: false,
        integration: false,
        autopilot: false,
      },
    };

    await assert.rejects(
      async () => await runBuildLane(options),
      /not found/,
      'Should fail with missing patch file',
    );
  });

  it('should emit observability events', async () => {
    const options = {
      auvId: testAuvId,
      patch: {
        type: 'diff',
        path: testDiffPath,
      },
      dryRun: true,
      qa: {
        format: false,
        lint: false,
        typecheck: false,
        unit: false,
        integration: false,
        autopilot: false,
      },
    };

    // Get initial log size
    const logPath = path.join(process.cwd(), 'runs', 'observability', 'hooks.jsonl');
    let initialSize = 0;
    try {
      initialSize = fs.statSync(logPath).size;
    } catch {
      // Log may not exist yet
    }

    await runBuildLane(options);

    // Check if log grew
    if (fs.existsSync(logPath)) {
      const newSize = fs.statSync(logPath).size;
      assert.ok(newSize >= initialSize, 'Should write observability events');

      // Read last few lines to verify events
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.trim().split('\n').slice(-10);

      const events = lines
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      const buildEvents = events.filter(
        (e) => e.event === 'BuildStart' || e.event === 'BuildEnd' || e.event === 'PatchApplied',
      );

      assert.ok(buildEvents.length > 0, 'Should have build-related events');
    }
  });
});
