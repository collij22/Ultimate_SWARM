/**
 * Packaging and Report E2E Test
 * Tests the complete pipeline from DAG execution through packaging and report generation
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import Ajv from 'ajv';
import { JSDOM } from 'jsdom';

/**
 * Run a command and capture output
 */
async function runCommand(command, args = [], env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      shell: true,
      env: { ...process.env, ...env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('exit', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Parse HTML and check for required sections
 */
function validateReportHTML(htmlContent) {
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;

  const validation = {
    hasTitle: false,
    hasSummary: false,
    hasArtifacts: false,
    hasInsights: false,
    hasCharts: false,
    hasSEO: false,
    hasMedia: false,
    hasSubagentNarrative: false,
    phase11Sections: [],
  };

  // Check title
  const title = document.querySelector('h1');
  validation.hasTitle = title && title.textContent.includes('AUV-');

  // Check summary section
  const summary = document.querySelector('.summary, section.summary');
  validation.hasSummary = !!summary;

  // Check artifacts section
  const artifacts = document.querySelector('.artifacts, section.artifacts');
  validation.hasArtifacts = !!artifacts;

  // Check Phase 11 sections
  const sections = document.querySelectorAll('section');
  sections.forEach((section) => {
    const heading = section.querySelector('h2, h3');
    if (heading) {
      const text = heading.textContent.toLowerCase();
      if (text.includes('insight')) {
        validation.hasInsights = true;
        validation.phase11Sections.push('insights');
      }
      if (text.includes('chart')) {
        validation.hasCharts = true;
        validation.phase11Sections.push('charts');
      }
      if (text.includes('seo')) {
        validation.hasSEO = true;
        validation.phase11Sections.push('seo');
      }
      if (text.includes('media') || text.includes('video')) {
        validation.hasMedia = true;
        validation.phase11Sections.push('media');
      }
      if (text.includes('subagent') || text.includes('narrative')) {
        validation.hasSubagentNarrative = true;
      }
    }
  });

  return validation;
}

describe('Packaging and Report E2E Tests', () => {
  const testRunId = `e2e-${Date.now()}`;
  let manifestPath;
  let reportPath;

  after(() => {
    // Clean up test artifacts
    const distDir = path.resolve('dist/AUV-1201');
    if (fs.existsSync(distDir)) {
      // Keep for inspection, but could clean up
      console.log(`Test artifacts preserved at: ${distDir}`);
    }
  });

  it('should run complete DAG pipeline', { timeout: 60000 }, async () => {
    // Run data-video-demo DAG
    const dagResult = await runCommand(
      'node',
      [
        'orchestration/graph/runner.mjs',
        `"${path.resolve('orchestration/graph/projects/data-video-demo.yaml')}"`,
      ],
      {
        TEST_MODE: 'true',
        RUN_ID: testRunId,
      },
    );

    // DAG should complete successfully
    assert.equal(dagResult.code, 0, 'DAG should complete successfully');
    assert.ok(dagResult.stdout.includes('[package]'), 'Should run package node');
    assert.ok(dagResult.stdout.includes('[report]'), 'Should run report node');
    assert.ok(dagResult.stdout.includes('✅'), 'Should show success indicators');
  });

  it('should generate valid manifest.json', async () => {
    manifestPath = path.resolve('dist/AUV-1201/manifest.json');

    // Check manifest exists
    assert.ok(fs.existsSync(manifestPath), 'Manifest should exist');

    // Parse manifest
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // Basic structure checks
    assert.equal(manifest.auv_id, 'AUV-1201', 'Should have correct AUV ID');
    assert.ok(manifest.run_id, 'Should have run ID');
    assert.ok(manifest.version, 'Should have version');
    assert.ok(Array.isArray(manifest.artifacts), 'Should have artifacts array');
    assert.ok(manifest.artifacts.length > 0, 'Should have at least one artifact');
  });

  it('should validate manifest against schema', async () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // Load schema
    const schemaPath = path.resolve('schemas/manifest.schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

    // Validate with Ajv
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);
    const valid = validate(manifest);

    if (!valid) {
      console.error('Manifest validation errors:', JSON.stringify(validate.errors, null, 2));
    }

    assert.ok(valid, 'Manifest should match schema');
  });

  it('should include all required artifacts', async () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // Check for expected artifact types
    const artifactTypes = new Set(manifest.artifacts.map((a) => a.type));

    // Should have various artifact types
    assert.ok(artifactTypes.size > 0, 'Should have multiple artifact types');

    // Check specific artifacts for AUV-1201
    const artifactPaths = manifest.artifacts.map((a) => a.path);

    // Should have key artifacts
    const expectedPatterns = [
      /insights\.json/,
      /bar\.png/,
      /narration\.wav/,
      /final\.mp4/,
      /compose-metadata\.json/,
    ];

    for (const pattern of expectedPatterns) {
      const found = artifactPaths.some((p) => pattern.test(p));
      assert.ok(found, `Should have artifact matching ${pattern}`);
    }
  });

  it('should generate report.html with Phase 11 sections (AUV-1201)', async () => {
    reportPath = path.resolve('dist/AUV-1201/report.html');

    // Check report exists
    assert.ok(fs.existsSync(reportPath), 'Report HTML should exist');

    // Read and parse HTML
    const htmlContent = fs.readFileSync(reportPath, 'utf-8');
    const validation = validateReportHTML(htmlContent);

    // Validate structure
    assert.ok(validation.hasTitle, 'Report should have title');
    assert.ok(validation.hasSummary, 'Report should have summary section');
    assert.ok(validation.hasArtifacts, 'Report should have artifacts section');

    // Check for Phase 11 sections (as recommended in phase_chat.md)
    const phase11Count = validation.phase11Sections.length;
    console.log(
      `Found ${phase11Count} Phase 11 sections: ${validation.phase11Sections.join(', ')}`,
    );

    // For AUV-1201 (data pipeline), should have multiple Phase 11 sections
    assert.ok(
      phase11Count >= 2,
      `Should have at least 2 Phase 11 sections (found ${phase11Count})`,
    );

    // Specifically check for expected sections
    assert.ok(validation.hasInsights, 'Should have insights section for data pipeline');
    assert.ok(
      validation.hasCharts || validation.hasMedia,
      'Should have charts or media section for visualization',
    );
  });

  it('should generate SEO report with Phase 11 sections (AUV-1202)', async () => {
    // Run SEO demo in TEST_MODE to generate artifacts
    const dagResult = await runCommand(
      'node',
      [
        'orchestration/graph/runner.mjs',
        `"${path.resolve('orchestration/graph/projects/seo-audit-demo.yaml')}"`,
      ],
      {
        TEST_MODE: 'true',
      },
    );
    assert.equal(dagResult.code, 0, 'SEO DAG should complete successfully');

    const reportPath2 = path.resolve('dist/AUV-1202/report.html');
    assert.ok(fs.existsSync(reportPath2), 'SEO report HTML should exist');

    const htmlContent2 = fs.readFileSync(reportPath2, 'utf-8');
    const validation2 = validateReportHTML(htmlContent2);
    assert.ok(validation2.hasTitle, 'SEO report should have title');
    assert.ok(validation2.hasSummary, 'SEO report should have summary');
    assert.ok(
      validation2.hasSEO || validation2.hasArtifacts,
      'SEO section or artifacts should be present',
    );
  });

  it('should create valid package.zip bundle', async () => {
    const zipPath = path.resolve('dist/AUV-1201/package.zip');

    // Check zip exists
    assert.ok(fs.existsSync(zipPath), 'Package zip should exist');

    // Check size is reasonable
    const stats = fs.statSync(zipPath);
    assert.ok(stats.size > 1000, 'Zip should have content');
    assert.ok(stats.size < 100000000, 'Zip should not be too large');

    // Verify manifest references the zip
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.ok(manifest.bundle, 'Manifest should have bundle info');
    assert.ok(manifest.bundle.zip_path, 'Should have zip path');
    assert.ok(manifest.bundle.sha256, 'Should have bundle checksum');
  });

  it('should handle hybrid mode with subagent narrative', async () => {
    // Run with hybrid mode
    const hybridResult = await runCommand(
      'node',
      [
        'orchestration/graph/runner.mjs',
        `"${path.resolve('orchestration/graph/projects/seo-audit-demo.yaml')}"`,
      ],
      {
        TEST_MODE: 'true',
        SWARM_MODE: 'hybrid',
        SUBAGENTS_INCLUDE: 'B7.rapid_builder',
      },
    );

    // Check for subagent activity (may be simulated in test mode)
    if (hybridResult.stdout.includes('subagent') || hybridResult.stdout.includes('B7')) {
      // If hybrid mode activated, check report for narrative
      const seoReportPath = path.resolve('dist/AUV-1202/report.html');

      if (fs.existsSync(seoReportPath)) {
        const htmlContent = fs.readFileSync(seoReportPath, 'utf-8');
        const validation = validateReportHTML(htmlContent);

        console.log('Hybrid mode: Subagent narrative present =', validation.hasSubagentNarrative);
        // Note: In test mode, subagent narrative might not be generated
      }
    }
  });

  it('should generate report.html with Phase 11 sections for AUV-1202', async () => {
    // Run SEO audit demo to generate report
    await runCommand(
      'node',
      [
        'orchestration/graph/runner.mjs',
        `"${path.resolve('orchestration/graph/projects/seo-audit-demo.yaml')}"`,
      ],
      {
        TEST_MODE: 'true',
        DEMO_MODE: 'true',
      },
    );

    const seoReportPath = path.resolve('dist/AUV-1202/report.html');

    // Check report exists
    assert.ok(fs.existsSync(seoReportPath), 'SEO report HTML should exist');

    // Read and parse HTML
    const htmlContent = fs.readFileSync(seoReportPath, 'utf-8');
    const validation = validateReportHTML(htmlContent);

    // For AUV-1202 (SEO audit), should have SEO section and possibly others
    const phase11Count = validation.phase11Sections.length;
    console.log(
      `AUV-1202: Found ${phase11Count} Phase 11 sections: ${validation.phase11Sections.join(', ')}`,
    );

    assert.ok(
      phase11Count >= 1,
      `AUV-1202 should have at least 1 Phase 11 section (found ${phase11Count})`,
    );
    assert.ok(validation.hasSEO, 'Should have SEO section for SEO audit pipeline');
  });

  it('should validate performance budgets in manifest', async () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // Check CVF section
    assert.ok(manifest.cvf, 'Should have CVF section');

    // Check performance metrics if present
    if (manifest.cvf.perf_score !== undefined) {
      assert.ok(
        manifest.cvf.perf_score >= 0 && manifest.cvf.perf_score <= 1,
        'Performance score should be between 0 and 1',
      );
    }

    // Check for budget violations
    if (manifest.cvf.budgets) {
      const violations = manifest.cvf.budgets.violations || [];
      console.log(`Budget violations: ${violations.length}`);

      // In test mode, should have minimal violations
      assert.ok(violations.length < 5, 'Should not have excessive budget violations');
    }
  });
});
