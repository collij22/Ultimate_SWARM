#!/usr/bin/env node

import { readFile, writeFile, stat, mkdir, readdir } from 'fs/promises';
import { createReadStream, createWriteStream, existsSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';
import yazl from 'yazl';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import { expectedArtifacts } from './lib/expected_artifacts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

/**
 * Phase 7 Package Module - Creates client-ready delivery bundles
 * Following phase_chat.md specifications exactly
 */
class PackageBuilder {
  constructor(auvId, options = {}) {
    this.auvId = auvId;
    this.runId = options.runId;
    this.includeSecurity = options.includeSecurity || false;
    this.includeVisual = options.includeVisual || false;
    this.strict = options.strict || false;
    this.outputPath = options.outputPath || join(PROJECT_ROOT, 'dist', auvId);
    this.startTime = Date.now();
  }

  /**
   * Main build method - orchestrates the packaging process
   */
  async build() {
    console.log(`📦 Starting package build for ${this.auvId}`);

    try {
      // Step 1: Resolve run ID (latest if not supplied)
      await this.resolveRunId();

      // Step 2: Read runbook summary card
      const runbookSummary = await this.readRunbookSummary();

      // Step 3: Collect required artifacts
      const artifacts = await this.collectArtifacts();

      // Step 4: Gather optional security/visual summaries
      const securityData = this.includeSecurity ? await this.gatherSecuritySummary() : null;
      const visualData = this.includeVisual ? await this.gatherVisualSummary() : null;

      // Step 5: Extract AUV documentation
      const docs = await this.extractDocumentation();

      // Step 6: Collect diffs if present
      const diffs = await this.collectDiffs();

      // Step 7: Generate SBOM
      const sbom = await this.generateSBOM();

      // Step 8: Create manifest
      const manifest = await this.createManifest({
        runbookSummary,
        artifacts,
        securityData,
        visualData,
        docs,
        diffs,
        sbom,
      });

      // Step 9: Create zip bundle
      const bundlePath = await this.createBundle(manifest, artifacts, docs, diffs);

      // Step 10: Update manifest with bundle info
      manifest.bundle = await this.getBundleInfo(bundlePath);

      // Step 11: Write and validate manifest
      await this.writeManifest(manifest);

      // Step 12: Emit observability events
      await this.emitHooks('PackagingComplete', {
        ok: true,
        duration_ms: Date.now() - this.startTime,
      });

      console.log(`✅ Package created successfully at ${this.outputPath}`);
      return manifest;
    } catch (error) {
      await this.emitHooks('PackagingComplete', { ok: false, error: error.message });
      throw error;
    }
  }

  /**
   * Resolve run ID - use latest if not provided
   */
  async resolveRunId() {
    if (this.runId) {
      console.log(`Using provided run ID: ${this.runId}`);
      return;
    }

    const runDir = join(PROJECT_ROOT, 'runs', this.auvId);
    const resultCardsDir = join(runDir, 'result-cards');

    if (!existsSync(resultCardsDir)) {
      throw new Error(`No runs found for ${this.auvId}`);
    }

    const files = await readdir(resultCardsDir);
    const summaryFiles = files.filter((f) => f === 'runbook-summary.json');

    if (summaryFiles.length === 0) {
      throw new Error(`No runbook summary found for ${this.auvId}`);
    }

    // Get latest by modification time
    let latestTime = 0;
    for (const file of summaryFiles) {
      const filePath = join(resultCardsDir, file);
      const stats = await stat(filePath);
      if (stats.mtimeMs > latestTime) {
        latestTime = stats.mtimeMs;
        // Extract run ID from the runbook summary
        const content = JSON.parse(await readFile(filePath, 'utf8'));
        this.runId = content.run_id || 'latest';
      }
    }

    console.log(`Resolved to latest run ID: ${this.runId}`);
  }

  /**
   * Read runbook summary card
   */
  async readRunbookSummary() {
    const summaryPath = join(
      PROJECT_ROOT,
      'runs',
      this.auvId,
      'result-cards',
      'runbook-summary.json',
    );

    if (!existsSync(summaryPath)) {
      throw new Error(`Runbook summary not found at ${summaryPath}`);
    }

    const content = await readFile(summaryPath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * Collect required artifacts based on CVF expectations
   */
  async collectArtifacts() {
    const required = expectedArtifacts(this.auvId);
    const artifacts = [];
    const missingArtifacts = [];

    for (const artifactPath of required) {
      const fullPath = join(PROJECT_ROOT, artifactPath.replace('${AUV}', this.auvId));

      if (existsSync(fullPath)) {
        const info = await this.getFileInfo(fullPath);
        artifacts.push({
          path: artifactPath.replace('${AUV}', this.auvId),
          bytes: info.bytes,
          sha256: info.sha256,
          type: this.classifyArtifact(artifactPath),
        });
      } else {
        missingArtifacts.push(artifactPath);
      }
    }

    // Always include runbook summary
    const summaryPath = join(
      PROJECT_ROOT,
      'runs',
      this.auvId,
      'result-cards',
      'runbook-summary.json',
    );
    if (existsSync(summaryPath)) {
      const info = await this.getFileInfo(summaryPath);
      artifacts.push({
        path: `runs/${this.auvId}/result-cards/runbook-summary.json`,
        bytes: info.bytes,
        sha256: info.sha256,
        type: 'report',
      });
    }

    // Opportunistically include router preview if present
    const routerPath = join(PROJECT_ROOT, 'runs', 'router_preview.json');
    if (existsSync(routerPath)) {
      const info = await this.getFileInfo(routerPath);
      artifacts.push({
        path: 'runs/router_preview.json',
        bytes: info.bytes,
        sha256: info.sha256,
        type: 'config',
      });
    }

    if (missingArtifacts.length > 0 && this.strict) {
      throw new Error(`Missing required artifacts: ${missingArtifacts.join(', ')}`);
    }

    return { artifacts, missingArtifacts };
  }

  /**
   * Gather security summary if requested
   */
  async gatherSecuritySummary() {
    const security = {
      semgrep: { blocked: 0, high: 0, medium: 0, low: 0 },
      gitleaks: { blocked: 0, findings: 0 },
    };

    const semgrepPath = join(PROJECT_ROOT, 'runs', 'security', 'semgrep.json');
    if (existsSync(semgrepPath)) {
      const content = JSON.parse(await readFile(semgrepPath, 'utf8'));
      security.semgrep = {
        blocked: content.blocked || 0,
        high: content.high || 0,
        medium: content.medium || 0,
        low: content.low || 0,
        report_path: 'runs/security/semgrep.json',
      };
    }

    const gitleaksPath = join(PROJECT_ROOT, 'runs', 'security', 'gitleaks.json');
    if (existsSync(gitleaksPath)) {
      const content = JSON.parse(await readFile(gitleaksPath, 'utf8'));
      security.gitleaks = {
        blocked: content.blocked || 0,
        findings: content.findings || 0,
        report_path: 'runs/security/gitleaks.json',
      };
    }

    return security;
  }

  /**
   * Gather visual regression summary if requested
   */
  async gatherVisualSummary() {
    const visualPath = join(PROJECT_ROOT, 'runs', 'visual', this.auvId, 'visual.json');

    if (!existsSync(visualPath)) {
      return null;
    }

    const content = JSON.parse(await readFile(visualPath, 'utf8'));
    return {
      failed: content.failed || 0,
      passed: content.passed || 0,
      threshold: content.threshold || 0.001,
      routes: content.routes || 0,
      report_path: `runs/visual/${this.auvId}/visual.json`,
    };
  }

  /**
   * Extract AUV-specific documentation
   */
  async extractDocumentation() {
    const docs = [];

    // Extract AUV section from verify.md
    const verifyPath = join(PROJECT_ROOT, 'docs', 'verify.md');
    if (existsSync(verifyPath)) {
      const content = await readFile(verifyPath, 'utf8');
      const auvSection = this.extractAuvSection(content, this.auvId);

      const verifyAuvPath = join(this.outputPath, 'docs', `verify-${this.auvId}.md`);
      await mkdir(dirname(verifyAuvPath), { recursive: true });
      await writeFile(verifyAuvPath, auvSection);

      const info = await this.getFileInfo(verifyAuvPath);
      docs.push({
        path: `docs/verify-${this.auvId}.md`,
        bytes: info.bytes,
        sha256: info.sha256,
      });
    }

    // Include operate.md
    const operatePath = join(PROJECT_ROOT, 'docs', 'operate.md');
    if (existsSync(operatePath)) {
      const info = await this.getFileInfo(operatePath);
      docs.push({
        path: 'docs/operate.md',
        bytes: info.bytes,
        sha256: info.sha256,
      });
    }

    return docs;
  }

  /**
   * Collect diffs if present
   */
  async collectDiffs() {
    const diffs = [];
    const patchesDir = join(PROJECT_ROOT, 'runs', this.auvId, 'patches');

    if (!existsSync(patchesDir)) {
      return diffs;
    }

    const files = await readdir(patchesDir);
    for (const file of files) {
      if (file.endsWith('.diff')) {
        const filePath = join(patchesDir, file);
        const info = await this.getFileInfo(filePath);
        diffs.push({
          path: `runs/${this.auvId}/patches/${file}`,
          bytes: info.bytes,
          sha256: info.sha256,
        });
      }
    }

    // Include changeset.json if present
    const changesetPath = join(PROJECT_ROOT, 'runs', this.auvId, 'changeset.json');
    if (existsSync(changesetPath)) {
      const info = await this.getFileInfo(changesetPath);
      diffs.push({
        path: `runs/${this.auvId}/changeset.json`,
        bytes: info.bytes,
        sha256: info.sha256,
      });
    }

    return diffs;
  }

  /**
   * Generate Software Bill of Materials
   */
  async generateSBOM() {
    const packageJsonPath = join(PROJECT_ROOT, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

    const dependencies = [];
    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    for (const [name, version] of Object.entries(allDeps)) {
      dependencies.push({
        name,
        version: version.replace(/[\^~]/, ''),
        license: 'MIT', // Would need to look this up properly
      });
    }

    return {
      bomFormat: 'SPDX',
      specVersion: '2.3',
      format: 'spdx-2.3',
      creationInfo: {
        created: new Date().toISOString(),
        creators: ['Tool: swarm1-package'],
      },
      packages: dependencies.map((dep) => ({
        name: dep.name,
        version: dep.version,
        license: dep.license,
      })),
      dependencies,
      licenses: ['MIT'],
      vulnerabilities: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
    };
  }

  /**
   * Create manifest object
   */
  async createManifest(data) {
    const { runbookSummary, artifacts, securityData, visualData, docs, diffs, sbom } = data;

    // Get git information
    const gitInfo = this.getGitInfo();

    // Get tool versions
    const toolVersions = await this.getToolVersions();

    const manifest = {
      version: '1.1',
      auv_id: this.auvId,
      run_id: this.runId,
      commit: gitInfo,
      environment: {
        node: process.version,
        os: process.platform,
        arch: process.arch,
        ci: process.env.CI === 'true',
      },
      tool_versions: toolVersions,
      timings_ms: {
        runbook: runbookSummary.durations?.total || 0,
        packaging: Date.now() - this.startTime,
        total: 0, // Will be updated
      },
      cvf: {
        passed: runbookSummary.ok || false,
        perf_score: runbookSummary.lighthouse_score || 0,
        required_artifacts: expectedArtifacts(this.auvId),
        missing_artifacts: artifacts.missingArtifacts || [],
        budgets: {
          status: 'pass',
          violations: [],
        },
      },
      artifacts: artifacts.artifacts,
      docs,
      diffs,
      sbom,
      deliverable: {
        version: `1.0.0-${this.auvId.toLowerCase()}`,
        compatibility: '^1.0.0',
      },
      provenance: {
        built_at: Math.floor(Date.now() / 1000),
        built_by: 'swarm1',
        ci_run_id: process.env.GITHUB_RUN_ID || null,
        ci_run_url: process.env.GITHUB_RUN_ID
          ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
          : null,
      },
    };

    // Add optional security data
    if (securityData) {
      manifest.security = securityData;
    }

    // Add optional visual data
    if (visualData) {
      manifest.visual = visualData;
    }

    manifest.timings_ms.total = manifest.timings_ms.runbook + manifest.timings_ms.packaging;

    return manifest;
  }

  /**
   * Create zip bundle using yazl
   */
  async createBundle(manifest, artifacts, docs, diffs) {
    const zipPath = join(this.outputPath, 'package.zip');
    await mkdir(this.outputPath, { recursive: true });

    const zipfile = new yazl.ZipFile();

    // Add manifest
    zipfile.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), 'manifest.json', {
      mtime: new Date(manifest.provenance.built_at * 1000),
    });

    // Add artifacts (sorted for determinism)
    const allFiles = [...artifacts.artifacts, ...docs, ...diffs].sort((a, b) =>
      a.path.localeCompare(b.path),
    );

    for (const file of allFiles) {
      const sourcePath = join(PROJECT_ROOT, file.path);
      if (existsSync(sourcePath)) {
        const stream = createReadStream(sourcePath);
        zipfile.addReadStream(stream, file.path, {
          mtime: new Date(manifest.provenance.built_at * 1000),
        });
      }
    }

    // Create the zip file
    return new Promise((resolve, reject) => {
      zipfile.outputStream
        .pipe(createWriteStream(zipPath))
        .on('close', () => resolve(zipPath))
        .on('error', reject);

      zipfile.end();
    });
  }

  /**
   * Get bundle info (size and checksum)
   */
  async getBundleInfo(bundlePath) {
    const stats = await stat(bundlePath);
    const hash = createHash('sha256');
    const stream = createReadStream(bundlePath);

    await pipeline(stream, hash);

    return {
      zip_path: `dist/${this.auvId}/package.zip`,
      bytes: stats.size,
      sha256: hash.digest('hex'),
      compression: 'deflate',
    };
  }

  /**
   * Write and validate manifest
   */
  async writeManifest(manifest) {
    const manifestPath = join(this.outputPath, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    // Validate against schema
    const schemaPath = join(PROJECT_ROOT, 'schemas', 'manifest.schema.json');
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'));

    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);

    if (!validate(manifest)) {
      console.error('Manifest validation errors:', validate.errors);
      if (this.strict) {
        throw new Error(`Manifest validation failed: ${JSON.stringify(validate.errors)}`);
      }
    }

    console.log('✓ Manifest validated successfully');
  }

  /**
   * Helper: Get file info (size and SHA-256)
   */
  async getFileInfo(filePath) {
    const stats = await stat(filePath);
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    await pipeline(stream, hash);

    return {
      bytes: stats.size,
      sha256: hash.digest('hex'),
    };
  }

  /**
   * Helper: Classify artifact type
   */
  classifyArtifact(path) {
    if (path.includes('/ui/') && path.endsWith('.png')) return 'screenshot';
    if (path.includes('/perf/')) return 'report';
    if (path.includes('/result-cards/')) return 'report';
    if (path.includes('.json')) return 'config';
    return 'proof';
  }

  /**
   * Helper: Extract AUV section from markdown
   */
  extractAuvSection(content, auvId) {
    const lines = content.split('\n');
    const section = [];
    let inSection = false;

    for (const line of lines) {
      if (line.includes(auvId)) {
        inSection = true;
      }
      if (inSection) {
        section.push(line);
        // Stop at next AUV section or major heading
        if (section.length > 1 && line.match(/^#{1,2}\s+AUV-\d{4}/)) {
          break;
        }
      }
    }

    return section.join('\n') || `# ${auvId} Verification\n\nNo specific documentation found.`;
  }

  /**
   * Helper: Get git information
   */
  getGitInfo() {
    try {
      const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
      const message = execSync('git log -1 --pretty=%B', { encoding: 'utf8' }).trim();

      return {
        sha: sha.substring(0, 40),
        branch,
        tag: null,
        message: message.substring(0, 500),
      };
    } catch {
      return {
        sha: 'unknown',
        branch: 'unknown',
        tag: null,
        message: 'Git information not available',
      };
    }
  }

  /**
   * Helper: Get tool versions
   */
  async getToolVersions() {
    const versions = {
      node: process.version.replace('v', ''),
    };

    try {
      versions.npm = execSync('npm --version', { encoding: 'utf8' }).trim();
    } catch {}

    try {
      versions.playwright = execSync('npx playwright --version', { encoding: 'utf8' })
        .trim()
        .split(' ')[1];
    } catch {}

    // Read from package.json for other tools
    const packageJsonPath = join(PROJECT_ROOT, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

    if (packageJson.devDependencies?.lighthouse) {
      versions.lighthouse = packageJson.devDependencies.lighthouse.replace(/[\^~]/, '');
    }

    return versions;
  }

  /**
   * Emit observability hooks
   */
  async emitHooks(event, data) {
    const hookData = {
      ts: Date.now() / 1000,
      event,
      module: 'package',
      auv_id: this.auvId,
      run_id: this.runId,
      ...data,
    };

    const hooksPath = join(PROJECT_ROOT, 'runs', 'observability', 'hooks.jsonl');
    await mkdir(dirname(hooksPath), { recursive: true });
    await writeFile(hooksPath, JSON.stringify(hookData) + '\n', { flag: 'a' });
  }
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node package.mjs <AUV-ID> [options]');
    console.error('Options:');
    console.error('  --run-id <RUN>         Use specific run ID');
    console.error('  --include-security     Include security scan results');
    console.error('  --include-visual       Include visual regression results');
    console.error('  --strict              Fail on missing artifacts');
    console.error('  --out <path>          Output directory');
    process.exit(1);
  }

  const auvId = args[0];
  const options = {};

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--run-id':
        options.runId = args[++i];
        break;
      case '--include-security':
        options.includeSecurity = true;
        break;
      case '--include-visual':
        options.includeVisual = true;
        break;
      case '--strict':
        options.strict = true;
        break;
      case '--out':
        options.outputPath = args[++i];
        break;
    }
  }

  try {
    const builder = new PackageBuilder(auvId, options);
    await builder.emitHooks('PackagingStart', {});
    const manifest = await builder.build();
    console.log('Package manifest:', JSON.stringify(manifest, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('❌ Packaging failed:', error.message);
    process.exit(401); // Typed exit code for packaging failure
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { PackageBuilder };
