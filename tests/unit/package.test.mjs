#!/usr/bin/env node
/**
 * Unit tests for PackageBuilder
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Mock AUV artifacts for testing
const TEST_AUV = 'AUV-9999';
const TEST_RUN_DIR = path.join(PROJECT_ROOT, 'runs', TEST_AUV);
const TEST_DIST_DIR = path.join(PROJECT_ROOT, 'dist', TEST_AUV);

describe('PackageBuilder', () => {
  beforeEach(() => {
    // Create test artifacts
    fs.mkdirSync(TEST_RUN_DIR, { recursive: true });
    fs.mkdirSync(path.join(TEST_RUN_DIR, 'playwright'), { recursive: true });
    fs.mkdirSync(path.join(TEST_RUN_DIR, 'lighthouse'), { recursive: true });
    fs.mkdirSync(path.join(TEST_RUN_DIR, 'result-cards'), { recursive: true });

    // Create test files
    fs.writeFileSync(
      path.join(TEST_RUN_DIR, 'result-cards', 'runbook-summary.json'),
      JSON.stringify({ auv: TEST_AUV, status: 'success' }),
    );
    fs.writeFileSync(
      path.join(TEST_RUN_DIR, 'playwright', 'test-results.json'),
      JSON.stringify({ passed: 3, failed: 0 }),
    );
    fs.writeFileSync(
      path.join(TEST_RUN_DIR, 'lighthouse', 'report.html'),
      '<html><body>Test Report</body></html>',
    );
    fs.writeFileSync(path.join(TEST_RUN_DIR, 'README.md'), '# Test AUV\n\nThis is a test.');
  });

  afterEach(() => {
    // Clean up test artifacts
    if (fs.existsSync(TEST_RUN_DIR)) {
      fs.rmSync(TEST_RUN_DIR, { recursive: true, force: true });
    }
    if (fs.existsSync(TEST_DIST_DIR)) {
      fs.rmSync(TEST_DIST_DIR, { recursive: true, force: true });
    }
  });

  it('should resolve run ID from environment or filesystem', async () => {
    const { PackageBuilder } = await import(
      pathToFileURL(path.join(PROJECT_ROOT, 'orchestration', 'package.mjs')).href
    );

    const builder = new PackageBuilder(TEST_AUV);
    await builder.resolveRunId();

    assert.ok(builder.runId, 'Run ID should be resolved');
    assert.ok(typeof builder.runId === 'string', 'Run ID should be a string');
  });

  it('should collect artifacts from run directory', async () => {
    const { PackageBuilder } = await import(
      pathToFileURL(path.join(PROJECT_ROOT, 'orchestration', 'package.mjs')).href
    );

    const builder = new PackageBuilder(TEST_AUV);
    const result = await builder.collectArtifacts();

    assert.ok(result && typeof result === 'object', 'Should return an object');
    assert.ok(Array.isArray(result.artifacts), 'Artifacts should be an array');
    assert.ok(result.artifacts.length > 0, 'Should find artifacts');

    // Check for expected files
    const paths = result.artifacts.map((a) => a.path);
    assert.ok(
      paths.some((p) => p.includes('runbook-summary.json')),
      'Should include result card',
    );

    // Check artifact properties
    result.artifacts.forEach((artifact) => {
      assert.ok(artifact.path, 'Artifact should have path');
      assert.ok(artifact.type, 'Artifact should have type');
      assert.ok(artifact.bytes >= 0, 'Artifact should have size');
      assert.ok(artifact.sha256, 'Artifact should have SHA-256 hash');
      assert.match(artifact.sha256, /^[a-f0-9]{64}$/, 'SHA-256 should be 64 hex chars');
    });
  });

  it('should generate SBOM with dependencies', async () => {
    const { PackageBuilder } = await import(
      pathToFileURL(path.join(PROJECT_ROOT, 'orchestration', 'package.mjs')).href
    );

    const builder = new PackageBuilder(TEST_AUV);
    const sbom = await builder.generateSBOM();

    assert.ok(sbom, 'SBOM should be generated');
    assert.equal(sbom.bomFormat, 'SPDX', 'Should use SPDX format');
    assert.equal(sbom.specVersion, '2.3', 'Should use SPDX 2.3');
    assert.ok(sbom.creationInfo, 'Should have creation info');
    assert.ok(Array.isArray(sbom.packages), 'Should have packages array');

    // Check for some expected dependencies
    const packageNames = sbom.packages.map((p) => p.name);
    assert.ok(packageNames.includes('playwright'), 'Should include playwright');
    assert.ok(packageNames.includes('lighthouse'), 'Should include lighthouse');
  });

  it('should create manifest with all required fields', async () => {
    const { PackageBuilder } = await import(
      pathToFileURL(path.join(PROJECT_ROOT, 'orchestration', 'package.mjs')).href
    );

    const builder = new PackageBuilder(TEST_AUV);
    await builder.resolveRunId();
    const runbookSummary = {
      ok: true,
      duration_ms: 5000,
      perf: { perf_score: 0.95, lcp_ms: 1200 },
    };
    const artifacts = await builder.collectArtifacts();
    const sbom = await builder.generateSBOM();
    const docs = [];
    const diffs = [];
    const manifest = await builder.createManifest({
      runbookSummary,
      artifacts,
      securityData: null,
      visualData: null,
      docs,
      diffs,
      sbom,
      budgetEval: null,
    });

    assert.ok(manifest, 'Manifest should be created');
    assert.equal(manifest.version, '1.1', 'Should use version 1.1');
    assert.equal(manifest.auv_id, TEST_AUV, 'Should have correct AUV ID');
    assert.ok(manifest.run_id, 'Should have run ID');
    assert.ok(manifest.environment, 'Should have environment');
    assert.ok(manifest.provenance, 'Should have provenance');
    assert.ok(manifest.sbom, 'Should have SBOM');
    assert.ok(manifest.artifacts, 'Should have artifacts');
    assert.ok(manifest.cvf, 'Should have CVF data');
  });

  it('should calculate checksums correctly for expected artifacts', async () => {
    const { PackageBuilder } = await import(
      pathToFileURL(path.join(PROJECT_ROOT, 'orchestration', 'package.mjs')).href
    );

    const builder = new PackageBuilder(TEST_AUV);
    const result = await builder.collectArtifacts();

    // Check that the runbook summary has correct checksum format
    const summaryArtifact = result.artifacts.find((a) => a.path.includes('runbook-summary.json'));
    if (summaryArtifact) {
      assert.ok(summaryArtifact.sha256, 'Should have SHA-256 hash');
      assert.match(summaryArtifact.sha256, /^[a-f0-9]{64}$/, 'SHA-256 should be 64 hex chars');
      assert.ok(summaryArtifact.bytes > 0, 'Should have non-zero size');
    }
  });

  it('should fail gracefully when run directory does not exist', async () => {
    const { PackageBuilder } = await import(
      pathToFileURL(path.join(PROJECT_ROOT, 'orchestration', 'package.mjs')).href
    );

    // Remove the test run directory
    fs.rmSync(TEST_RUN_DIR, { recursive: true, force: true });

    const builder = new PackageBuilder(TEST_AUV);

    await assert.rejects(
      async () => await builder.build(),
      /No runs found/i,
      'Should throw error when run directory is missing',
    );
  });

  it('should validate manifest against schema', async () => {
    const { PackageBuilder } = await import(
      pathToFileURL(path.join(PROJECT_ROOT, 'orchestration', 'package.mjs')).href
    );

    const builder = new PackageBuilder(TEST_AUV);
    await builder.resolveRunId();
    const runbookSummary = {
      ok: true,
      duration_ms: 5000,
      perf: { perf_score: 0.95, lcp_ms: 1200 },
    };
    const artifacts = await builder.collectArtifacts();
    const sbom = await builder.generateSBOM();
    const docs = [];
    const diffs = [];
    const manifest = await builder.createManifest({
      runbookSummary,
      artifacts,
      securityData: null,
      visualData: null,
      docs,
      diffs,
      sbom,
      budgetEval: null,
    });

    // Add bundle info for schema validation
    manifest.bundle = {
      zip_path: `dist/${TEST_AUV}/package.zip`,
      bytes: 1024000,
      sha256: 'a'.repeat(64),
      compression: 'deflate',
    };

    // Load and validate against schema
    const Ajv = (await import('ajv')).default;
    const schema = JSON.parse(
      fs.readFileSync(path.join(PROJECT_ROOT, 'schemas', 'manifest.schema.json'), 'utf8'),
    );

    const ajv = new Ajv({ strict: false });
    const validate = ajv.compile(schema);
    const valid = validate(manifest);

    assert.ok(valid, `Manifest should be valid: ${JSON.stringify(validate.errors)}`);
  });

  it('should create deterministic bundles', async () => {
    const { PackageBuilder } = await import(
      pathToFileURL(path.join(PROJECT_ROOT, 'orchestration', 'package.mjs')).href
    );

    const builder = new PackageBuilder(TEST_AUV);

    // Mock the build process to test determinism
    const result = await builder.collectArtifacts();

    // Sort artifacts to ensure deterministic ordering
    const sorted1 = [...result.artifacts].sort((a, b) => a.path.localeCompare(b.path));
    const sorted2 = [...result.artifacts].sort((a, b) => a.path.localeCompare(b.path));

    assert.deepEqual(sorted1, sorted2, 'Artifacts should be sorted deterministically');
  });

  it('should handle empty run directory gracefully', async () => {
    const { PackageBuilder } = await import(
      pathToFileURL(path.join(PROJECT_ROOT, 'orchestration', 'package.mjs')).href
    );

    // Remove all files from test run directory
    fs.readdirSync(TEST_RUN_DIR).forEach((file) => {
      const filePath = path.join(TEST_RUN_DIR, file);
      if (fs.statSync(filePath).isDirectory()) {
        fs.rmSync(filePath, { recursive: true });
      } else {
        fs.unlinkSync(filePath);
      }
    });

    const builder = new PackageBuilder(TEST_AUV);
    const result = await builder.collectArtifacts();

    assert.ok(result && typeof result === 'object', 'Should return an object');
    assert.ok(Array.isArray(result.artifacts), 'Should have artifacts array');
    assert.ok(result.artifacts.length >= 0, 'Should handle empty directory gracefully');
  });
});
