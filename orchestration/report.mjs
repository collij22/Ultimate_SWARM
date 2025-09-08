#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

/**
 * Phase 7 Report Module - Generates HTML reports from package manifests
 * Following phase_chat.md specifications for token-based template rendering
 */
class ReportGenerator {
  constructor(auvId, options = {}) {
    this.auvId = auvId;
    this.runId = options.runId || 'latest';
    this.outputPath = options.outputPath || join(PROJECT_ROOT, 'dist', auvId, 'report.html');
    this.manifestPath = options.manifestPath || join(PROJECT_ROOT, 'dist', auvId, 'manifest.json');
    this.startTime = Date.now();
  }

  /**
   * Main generate method - creates HTML report from manifest
   */
  async generate() {
    console.log(`📊 Generating report for ${this.auvId}`);

    try {
      await this.emitHooks('ReportStart', {});

      // Step 1: Load manifest
      const manifest = await this.loadManifest();

      // Step 2: Load template
      const template = await this.loadTemplate();
      const styles = await this.loadStyles();

      // Step 3: Prepare data for template
      const templateData = await this.prepareTemplateData(manifest);

      // Step 4: Render template with token replacement
      const html = this.renderTemplate(template, templateData, styles);

      // Step 5: Write report
      await this.writeReport(html);

      await this.emitHooks('ReportComplete', {
        ok: true,
        duration_ms: Date.now() - this.startTime,
      });

      console.log(`✅ Report generated at ${this.outputPath}`);
      return this.outputPath;
    } catch (error) {
      await this.emitHooks('ReportComplete', {
        ok: false,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Load manifest file
   */
  async loadManifest() {
    if (!existsSync(this.manifestPath)) {
      throw new Error(`Manifest not found at ${this.manifestPath}`);
    }

    const content = await readFile(this.manifestPath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * Load HTML template
   */
  async loadTemplate() {
    const templatePath = join(__dirname, 'report-templates', 'index.html');

    // Use embedded template if file doesn't exist
    if (!existsSync(templatePath)) {
      return this.getEmbeddedTemplate();
    }

    return await readFile(templatePath, 'utf8');
  }

  /**
   * Load CSS styles
   */
  async loadStyles() {
    const stylesPath = join(__dirname, 'report-templates', 'styles.css');

    // Use embedded styles if file doesn't exist
    if (!existsSync(stylesPath)) {
      return this.getEmbeddedStyles();
    }

    return await readFile(stylesPath, 'utf8');
  }

  /**
   * Prepare template data from manifest
   */
  async prepareTemplateData(manifest) {
    const data = {
      // Basic info
      auv_id: manifest.auv_id,
      run_id: manifest.run_id,
      version: manifest.version,

      // Timing
      built_at: new Date(manifest.provenance.built_at * 1000).toISOString(),
      built_by: manifest.provenance.built_by,
      duration_total: this.formatDuration(manifest.timings_ms.total),
      duration_runbook: this.formatDuration(manifest.timings_ms.runbook),
      duration_packaging: this.formatDuration(manifest.timings_ms.packaging),

      // Git info
      commit_sha: manifest.commit?.sha?.substring(0, 7) || 'unknown',
      commit_branch: manifest.commit?.branch || 'unknown',
      commit_message: this.escapeHtml(manifest.commit?.message || ''),

      // Environment
      node_version: manifest.environment.node,
      os_platform: manifest.environment.os,
      ci_environment: manifest.environment.ci ? 'CI' : 'Local',

      // CVF Status
      cvf_status: manifest.cvf.passed ? '✅ PASSED' : '❌ FAILED',
      cvf_status_class: manifest.cvf.passed ? 'status-pass' : 'status-fail',
      perf_score: Math.round((manifest.cvf.perf_score || 0) * 100),
      perf_score_class: this.getPerfScoreClass(manifest.cvf.perf_score),

      // Artifacts count
      artifacts_count: manifest.artifacts?.length || 0,
      missing_count: manifest.cvf.missing_artifacts?.length || 0,

      // Security (if present)
      security_status: this.getSecurityStatus(manifest.security),
      security_details: this.formatSecurityDetails(manifest.security),

      // Visual (if present)
      visual_status: this.getVisualStatus(manifest.visual),
      visual_details: this.formatVisualDetails(manifest.visual),

      // Performance budgets
      budget_status: manifest.cvf.budgets?.status || 'unknown',
      budget_violations: this.formatBudgetViolations(manifest.cvf.budgets),

      // Screenshots
      screenshots: await this.prepareScreenshots(manifest),

      // Artifacts table
      artifacts_table: this.generateArtifactsTable(manifest.artifacts),

      // Tool versions
      tool_versions: this.formatToolVersions(manifest.tool_versions),

      // Manifest link
      manifest_json: JSON.stringify(manifest, null, 2),

      // Bundle info
      bundle_size: this.formatBytes(manifest.bundle?.bytes || 0),
      bundle_sha: manifest.bundle?.sha256?.substring(0, 12) || 'unknown',

      // CI link
      ci_link: manifest.provenance.ci_run_url || '#',
      ci_run_id: manifest.provenance.ci_run_id || 'N/A',
    };

    return data;
  }

  /**
   * Render template with token replacement
   */
  renderTemplate(template, data, styles) {
    // Inject styles
    let html = template.replace('{{styles}}', `<style>${styles}</style>`);

    // Replace all tokens
    for (const [key, value] of Object.entries(data)) {
      const token = `{{${key}}}`;
      html = html.split(token).join(value);
    }

    return html;
  }

  /**
   * Write report to file
   */
  async writeReport(html) {
    await mkdir(dirname(this.outputPath), { recursive: true });
    await writeFile(this.outputPath, html);
  }

  /**
   * Prepare screenshots for embedding or linking
   */
  async prepareScreenshots(manifest) {
    const screenshots = [];

    for (const artifact of manifest.artifacts || []) {
      if (artifact.type === 'screenshot' && artifact.path.endsWith('.png')) {
        const imagePath = join(PROJECT_ROOT, artifact.path);

        if (existsSync(imagePath)) {
          // For large files, use relative link; for small ones, embed as base64
          if (artifact.bytes < 100000) {
            // 100KB threshold
            const imageData = await readFile(imagePath);
            const base64 = imageData.toString('base64');
            screenshots.push({
              name: artifact.path.split('/').pop(),
              src: `data:image/png;base64,${base64}`,
              embedded: true,
            });
          } else {
            screenshots.push({
              name: artifact.path.split('/').pop(),
              src: artifact.path,
              embedded: false,
            });
          }
        }
      }
    }

    // Generate HTML for screenshots gallery
    if (screenshots.length === 0) {
      return '<p>No screenshots available</p>';
    }

    return screenshots
      .map(
        (img) => `
      <div class="screenshot">
        <img src="${img.src}" alt="${img.name}" />
        <div class="screenshot-caption">${img.name}</div>
      </div>
    `,
      )
      .join('');
  }

  /**
   * Generate artifacts table HTML
   */
  generateArtifactsTable(artifacts) {
    if (!artifacts || artifacts.length === 0) {
      return '<tr><td colspan="4">No artifacts</td></tr>';
    }

    return artifacts
      .map(
        (artifact) => `
      <tr>
        <td>${artifact.path}</td>
        <td>${artifact.type || 'unknown'}</td>
        <td>${this.formatBytes(artifact.bytes)}</td>
        <td class="checksum">${artifact.sha256.substring(0, 12)}...</td>
      </tr>
    `,
      )
      .join('');
  }

  /**
   * Format security details
   */
  formatSecurityDetails(security) {
    if (!security) return 'No security scans performed';

    const parts = [];

    if (security.semgrep) {
      parts.push(
        `Semgrep: ${security.semgrep.high || 0} high, ${security.semgrep.medium || 0} medium`,
      );
    }

    if (security.gitleaks) {
      parts.push(`Gitleaks: ${security.gitleaks.findings || 0} findings`);
    }

    return parts.join(' | ') || 'No issues found';
  }

  /**
   * Format visual regression details
   */
  formatVisualDetails(visual) {
    if (!visual) return 'No visual tests performed';

    return `${visual.passed || 0} passed, ${visual.failed || 0} failed (threshold: ${(visual.threshold * 100).toFixed(2)}%)`;
  }

  /**
   * Format budget violations
   */
  formatBudgetViolations(budgets) {
    if (!budgets?.violations || budgets.violations.length === 0) {
      return '<li>No budget violations</li>';
    }

    return budgets.violations
      .map(
        (v) => `
      <li class="violation-${v.severity}">
        ${v.metric}: ${v.actual} (budget: ${v.budget})
      </li>
    `,
      )
      .join('');
  }

  /**
   * Format tool versions
   */
  formatToolVersions(versions) {
    if (!versions) return 'N/A';

    return Object.entries(versions)
      .map(([tool, version]) => `${tool}: ${version}`)
      .join(', ');
  }

  /**
   * Helper: Get security status
   */
  getSecurityStatus(security) {
    if (!security) return '⚪ Not Run';

    const hasIssues = security.semgrep?.high > 0 || security.gitleaks?.findings > 0;
    return hasIssues ? '⚠️ Issues Found' : '✅ Clean';
  }

  /**
   * Helper: Get visual status
   */
  getVisualStatus(visual) {
    if (!visual) return '⚪ Not Run';
    return visual.failed > 0 ? '❌ Failed' : '✅ Passed';
  }

  /**
   * Helper: Get performance score class
   */
  getPerfScoreClass(score) {
    if (score >= 0.9) return 'score-good';
    if (score >= 0.5) return 'score-medium';
    return 'score-poor';
  }

  /**
   * Helper: Format duration
   */
  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }

  /**
   * Helper: Format bytes
   */
  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Helper: Escape HTML
   */
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Get embedded template (fallback)
   */
  getEmbeddedTemplate() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{auv_id}} - Delivery Report</title>
  {{styles}}
</head>
<body>
  <div class="container">
    <header>
      <h1>{{auv_id}} Delivery Report</h1>
      <div class="header-info">
        <span>Run: {{run_id}}</span>
        <span>Built: {{built_at}}</span>
        <span>Environment: {{ci_environment}}</span>
      </div>
    </header>

    <section class="summary">
      <h2>Summary</h2>
      <div class="summary-grid">
        <div class="summary-item">
          <h3>CVF Status</h3>
          <div class="{{cvf_status_class}}">{{cvf_status}}</div>
        </div>
        <div class="summary-item">
          <h3>Performance</h3>
          <div class="perf-score {{perf_score_class}}">{{perf_score}}%</div>
        </div>
        <div class="summary-item">
          <h3>Security</h3>
          <div>{{security_status}}</div>
        </div>
        <div class="summary-item">
          <h3>Visual</h3>
          <div>{{visual_status}}</div>
        </div>
      </div>
    </section>

    <section class="details">
      <h2>Build Details</h2>
      <table>
        <tr>
          <th>Commit</th>
          <td>{{commit_sha}} ({{commit_branch}})</td>
        </tr>
        <tr>
          <th>Message</th>
          <td>{{commit_message}}</td>
        </tr>
        <tr>
          <th>Node Version</th>
          <td>{{node_version}}</td>
        </tr>
        <tr>
          <th>Platform</th>
          <td>{{os_platform}}</td>
        </tr>
        <tr>
          <th>Duration</th>
          <td>{{duration_total}} (runbook: {{duration_runbook}}, packaging: {{duration_packaging}})</td>
        </tr>
        <tr>
          <th>Bundle Size</th>
          <td>{{bundle_size}}</td>
        </tr>
        <tr>
          <th>CI Run</th>
          <td><a href="{{ci_link}}">{{ci_run_id}}</a></td>
        </tr>
      </table>
    </section>

    <section class="screenshots">
      <h2>Screenshots</h2>
      <div class="screenshots-gallery">
        {{screenshots}}
      </div>
    </section>

    <section class="performance">
      <h2>Performance</h2>
      <div class="perf-details">
        <p>Lighthouse Score: <span class="{{perf_score_class}}">{{perf_score}}%</span></p>
        <h3>Budget Violations</h3>
        <ul>
          {{budget_violations}}
        </ul>
      </div>
    </section>

    <section class="artifacts">
      <h2>Artifacts ({{artifacts_count}})</h2>
      <table>
        <thead>
          <tr>
            <th>Path</th>
            <th>Type</th>
            <th>Size</th>
            <th>SHA-256</th>
          </tr>
        </thead>
        <tbody>
          {{artifacts_table}}
        </tbody>
      </table>
    </section>

    <section class="provenance">
      <h2>Provenance</h2>
      <div class="provenance-details">
        <p>Built by: {{built_by}}</p>
        <p>Tool Versions: {{tool_versions}}</p>
        <p>Bundle SHA-256: {{bundle_sha}}...</p>
      </div>
    </section>

    <footer>
      <p>Generated by Swarm1 Packaging System v1.1</p>
      <p><a href="#" onclick="showManifest()">View Full Manifest</a></p>
    </footer>

    <div id="manifest-modal" style="display:none;">
      <pre>{{manifest_json}}</pre>
    </div>
  </div>

  <script>
    function showManifest() {
      const modal = document.getElementById('manifest-modal');
      modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
    }
  </script>
</body>
</html>`;
  }

  /**
   * Get embedded styles (fallback)
   */
  getEmbeddedStyles() {
    return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: white;
      min-height: 100vh;
    }

    header {
      border-bottom: 3px solid #007acc;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }

    h1 {
      color: #007acc;
      margin-bottom: 10px;
    }

    .header-info {
      color: #666;
      font-size: 14px;
    }

    .header-info span {
      margin-right: 20px;
    }

    section {
      margin-bottom: 40px;
    }

    h2 {
      color: #333;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid #e0e0e0;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }

    .summary-item {
      padding: 20px;
      background: #f8f9fa;
      border-radius: 8px;
      text-align: center;
    }

    .summary-item h3 {
      font-size: 14px;
      color: #666;
      margin-bottom: 10px;
      text-transform: uppercase;
    }

    .status-pass {
      color: #28a745;
      font-weight: bold;
      font-size: 18px;
    }

    .status-fail {
      color: #dc3545;
      font-weight: bold;
      font-size: 18px;
    }

    .perf-score {
      font-size: 24px;
      font-weight: bold;
    }

    .score-good {
      color: #28a745;
    }

    .score-medium {
      color: #ffc107;
    }

    .score-poor {
      color: #dc3545;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }

    th {
      text-align: left;
      padding: 12px;
      background: #f8f9fa;
      border-bottom: 2px solid #dee2e6;
      font-weight: 600;
    }

    td {
      padding: 12px;
      border-bottom: 1px solid #dee2e6;
    }

    .checksum {
      font-family: monospace;
      font-size: 12px;
      color: #666;
    }

    .screenshots-gallery {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }

    .screenshot {
      border: 1px solid #ddd;
      border-radius: 8px;
      overflow: hidden;
    }

    .screenshot img {
      width: 100%;
      height: auto;
      display: block;
    }

    .screenshot-caption {
      padding: 10px;
      background: #f8f9fa;
      font-size: 12px;
      color: #666;
      text-align: center;
    }

    .violation-high {
      color: #dc3545;
    }

    .violation-medium {
      color: #ffc107;
    }

    .violation-low {
      color: #28a745;
    }

    footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      text-align: center;
      color: #666;
      font-size: 14px;
    }

    footer a {
      color: #007acc;
      text-decoration: none;
    }

    footer a:hover {
      text-decoration: underline;
    }

    #manifest-modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 80%;
      max-height: 80vh;
      overflow: auto;
      background: white;
      padding: 20px;
      border: 2px solid #007acc;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      z-index: 1000;
    }

    #manifest-modal pre {
      font-size: 12px;
      overflow-x: auto;
    }
    `;
  }

  /**
   * Emit observability hooks
   */
  async emitHooks(event, data) {
    const hookData = {
      ts: Date.now() / 1000,
      event,
      module: 'report',
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
    console.error('Usage: node report.mjs <AUV-ID> [options]');
    console.error('Options:');
    console.error('  --run-id <RUN>     Use specific run ID');
    console.error('  -o <path>          Output file path');
    console.error('  --manifest <path>  Path to manifest.json');
    process.exit(1);
  }

  const auvId = args[0];
  const options = {};

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--run-id':
        options.runId = args[++i];
        break;
      case '-o':
      case '--output':
        options.outputPath = args[++i];
        break;
      case '--manifest':
        options.manifestPath = args[++i];
        break;
    }
  }

  try {
    const generator = new ReportGenerator(auvId, options);
    const reportPath = await generator.generate();
    console.log(`Report generated: ${reportPath}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Report generation failed:', error.message);
    process.exit(402); // Typed exit code for report failure
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { ReportGenerator };
