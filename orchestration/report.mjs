#!/usr/bin/env node

import { readFile, writeFile, mkdir, copyFile, stat as fsStat } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { normalizeTenant } from './lib/tenant.mjs';

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
    this.tenant = normalizeTenant(options.tenant || process.env.TENANT_ID || 'default');
    this.outputPath = options.outputPath || this.getDistPath('report.html');
    this.manifestPath = options.manifestPath || this.getDistPath('manifest.json');
    this.startTime = Date.now();
    // Phase 14 options with safe defaults
    this.options = {
      theme: 'light',
      includeReferences: false,
      intentCompare: false,
      embedSmallAssetsKb: 100,
      spendSource: 'auto',
      ...options,
    };
    // Asset copy cache to avoid redundant copies
    this.assetCopyCache = new Map();
    // Advisory report summaries for metadata
    this._intentSummary = null;
    this._spendSummaryTotals = null;
  }

  /**
   * Get distribution path for tenant
   */
  getDistPath(filename) {
    if (this.tenant === 'default') {
      return join(PROJECT_ROOT, 'dist', this.auvId, filename);
    }
    return join(PROJECT_ROOT, 'dist', 'tenants', this.tenant, this.auvId, filename);
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

      // Step 6: Write advisory report metadata (non-destructive)
      await this.writeReportMetadata();

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
      built_at: manifest.provenance?.built_at
        ? new Date(manifest.provenance.built_at * 1000).toISOString()
        : new Date().toISOString(),
      built_by: manifest.provenance?.built_by || 'unknown',
      duration_total: this.formatDuration(manifest.timings_ms?.total || 0),
      duration_runbook: this.formatDuration(manifest.timings_ms?.runbook || 0),
      duration_packaging: this.formatDuration(manifest.timings_ms?.packaging || 0),

      // Git info
      commit_sha: manifest.commit?.sha?.substring(0, 7) || 'unknown',
      commit_branch: manifest.commit?.branch || 'unknown',
      commit_message: this.escapeHtml(manifest.commit?.message || ''),

      // Environment
      node_version: manifest.environment?.node || process.version,
      os_platform: manifest.environment?.os || process.platform,
      ci_environment: manifest.environment?.ci ? 'CI' : 'Local',

      // CVF Status
      cvf_status: manifest.cvf?.passed ? '✅ PASSED' : '❌ FAILED',
      cvf_status_class: manifest.cvf?.passed ? 'status-pass' : 'status-fail',
      perf_score: Math.round((manifest.cvf?.perf_score || 0) * 100),
      perf_score_class: this.getPerfScoreClass(manifest.cvf?.perf_score || 0),

      // Artifacts count
      artifacts_count: manifest.artifacts?.length || 0,
      missing_count: manifest.cvf?.missing_artifacts?.length || 0,

      // Security (if present)
      security_status: this.getSecurityStatus(manifest.security),
      security_details: this.formatSecurityDetails(manifest.security),

      // Visual (if present)
      visual_status: this.getVisualStatus(manifest.visual),
      visual_details: this.formatVisualDetails(manifest.visual),

      // Performance budgets
      budget_status: manifest.cvf?.budgets?.status || 'unknown',
      budget_violations: this.formatBudgetViolations(manifest.cvf?.budgets),

      // Screenshots
      screenshots: await this.prepareScreenshots(manifest),

      // Artifacts table
      artifacts_table: this.generateArtifactsTable(manifest.artifacts),

      // Tool versions
      tool_versions: this.formatToolVersions(manifest.tool_versions),

      // Phase 11 Domain Sections
      insights_summary: await this.buildInsightsSummary(manifest),
      charts_gallery: await this.buildChartsGallery(manifest),
      seo_summary: await this.buildSEOSummary(manifest),
      media_section: await this.buildMediaSection(manifest),
      db_migration_summary: await this.buildDBMigrationSummary(manifest),

      // Manifest link
      manifest_json: this.escapeHtml(JSON.stringify(manifest, null, 2)),

      // Bundle info
      bundle_size: this.formatBytes(manifest.bundle?.bytes || 0),
      bundle_sha: manifest.bundle?.sha256?.substring(0, 12) || 'unknown',

      // CI link
      ci_link: manifest.provenance?.ci_run_url || '#',
      ci_run_id: manifest.provenance?.ci_run_id || 'N/A',

      // Subagent narrative (Phase 10b-5)
      subagent_narrative: await this.buildSubagentNarrative(),

      // Phase 14 Sections are injected as full HTML blocks
      references_section: await this.buildReferencesSection(manifest),
      intent_compare_section: await this.buildIntentCompareSection(manifest),
      spend_summary_section: await this.buildSpendSummary(manifest),

      // Report metadata
      report_theme: this.options.theme || 'light',
      report_offline_ready: true,
      report_generated_at: new Date().toISOString(),
      embed_threshold_kb: this.options.embedSmallAssetsKb || 100,
    };

    return data;
  }

  /**
   * Build a concise subagent narrative by reading gateway and tool_result files.
   */
  async buildSubagentNarrative() {
    try {
      const runsDir = join(PROJECT_ROOT, 'runs');
      const agentsDirDefault = join(runsDir, 'agents');
      // For simplicity, scan a small set of agent result files under runs/agents/**/result-gateway.json
      const entries = [];
      const walk = (dir) => {
        try {
          const names = readdirSync(dir, { withFileTypes: true });
          for (const d of names) {
            const p = join(dir, d.name);
            if (d.isDirectory()) walk(p);
            else if (d.isFile() && d.name === 'result-gateway.json') entries.push(p);
          }
        } catch {
          /* ignore */
        }
      };
      if (existsSync(agentsDirDefault)) walk(agentsDirDefault);

      const blocks = [];
      for (const p of entries.slice(0, 8)) {
        try {
          const raw = await readFile(p, 'utf8');
          const gw = JSON.parse(raw);
          const toolPath = p.replace('result-gateway.json', 'tool_results.json');
          let tool = null;
          if (existsSync(toolPath)) {
            try {
              tool = JSON.parse(await readFile(toolPath, 'utf8'));
            } catch {
              /* ignore */
            }
          }
          blocks.push({ path: p, gateway: gw, tools: tool });
        } catch {
          /* ignore */
        }
      }

      if (blocks.length === 0) return '<p>No subagent activity recorded.</p>';

      const lines = blocks.map((b) => {
        const stepCount = b.gateway?.steps ?? 0;
        const trCount = b.gateway?.result?.response?.tool_requests?.length ?? 0;
        const ok = b.gateway?.ok ? 'OK' : 'ERR';
        const toolsOk = Array.isArray(b.tools?.tool_results)
          ? b.tools.tool_results.filter((t) => t.ok).length
          : 0;
        const toolsTotal = Array.isArray(b.tools?.tool_results) ? b.tools.tool_results.length : 0;
        return `- ${b.path}: gateway=${ok} steps=${stepCount} tool_requests=${trCount} tool_results_ok=${toolsOk}/${toolsTotal}`;
      });

      return `<pre>${lines.join('\n')}</pre>`;
    } catch (e) {
      return `<p>Subagent narrative unavailable: ${this.escapeHtml(e.message)}</p>`;
    }
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
    const assetsDir = join(dirname(this.outputPath), 'assets');

    // Create assets directory lazily if any image exceeds embed threshold
    const embedThreshold = (this.options.embedSmallAssetsKb || 100) * 1024;
    let needsAssetsDir = false;
    for (const artifact of manifest.artifacts || []) {
      if (
        artifact.type === 'screenshot' &&
        artifact.path.endsWith('.png') &&
        artifact.bytes >= embedThreshold
      ) {
        needsAssetsDir = true;
        break;
      }
    }

    if (needsAssetsDir) {
      await mkdir(assetsDir, { recursive: true });
    }

    for (const artifact of manifest.artifacts || []) {
      if (artifact.type === 'screenshot' && artifact.path.endsWith('.png')) {
        const imagePath = join(PROJECT_ROOT, artifact.path);
        const imageName = basename(artifact.path);

        if (existsSync(imagePath)) {
          // For large files, copy to assets and use relative link; for small ones, embed as base64
          if (artifact.bytes < embedThreshold) {
            // Embed threshold
            const imageData = await readFile(imagePath);
            const base64 = imageData.toString('base64');
            screenshots.push({
              name: imageName,
              src: `data:image/png;base64,${base64}`,
              embedded: true,
            });
          } else {
            // Copy to assets directory preserving path structure to avoid collisions
            const assetRelativePath = artifact.path.replace(/\\/g, '/');
            const assetPath = join(assetsDir, assetRelativePath);
            await mkdir(dirname(assetPath), { recursive: true });
            await copyFile(imagePath, assetPath);
            screenshots.push({
              name: imageName,
              src: `./assets/${assetRelativePath}`,
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
   * Build Insights Summary section for data domain
   */
  async buildInsightsSummary(manifest) {
    try {
      // Look for insights.json artifact in various locations
      const insightsPath = this.findArtifactPath(manifest, ['insights.json', 'data/insights.json']);
      if (!insightsPath) return '';

      const fullPath = join(PROJECT_ROOT, insightsPath);
      if (!existsSync(fullPath)) return '';

      const insights = JSON.parse(await readFile(fullPath, 'utf8'));

      const rows = insights.data_row_count || 0;
      const metricCount = insights.metrics?.length || 0;
      const topMetrics = (insights.metrics || [])
        .slice(0, 3)
        .map(
          (m) =>
            `<li>${this.escapeHtml(m.label ?? m.id)}: ${this.escapeHtml(String(m.value))}</li>`,
        )
        .join('');

      return `
        <section class="insights">
          <h2>Data Insights</h2>
          <div class="insights-content">
            <p><strong>Total Rows:</strong> ${rows}</p>
            <p><strong>Metrics Generated:</strong> ${metricCount}</p>
            ${topMetrics ? `<h3>Top Metrics</h3><ul>${topMetrics}</ul>` : ''}
          </div>
        </section>
      `;
    } catch (e) {
      console.warn('Could not build insights summary:', e.message);
      return '';
    }
  }

  /**
   * Build Charts Gallery section
   */
  async buildChartsGallery(manifest) {
    try {
      // Look for chart PNG artifacts
      const chartArtifacts = (manifest.artifacts || []).filter(
        (a) => a.path.includes('charts/') && a.path.endsWith('.png'),
      );

      if (chartArtifacts.length === 0) return '';

      const assetsDir = join(dirname(this.outputPath), 'assets');
      const chartImages = [];

      for (const artifact of chartArtifacts) {
        const imagePath = join(PROJECT_ROOT, artifact.path);
        const imageName = basename(artifact.path);

        if (existsSync(imagePath)) {
          // Copy to assets directory
          const assetRelativePath = artifact.path.replace(/\\/g, '/');
          const assetPath = join(assetsDir, assetRelativePath);
          await mkdir(dirname(assetPath), { recursive: true });
          await copyFile(imagePath, assetPath);

          chartImages.push({
            name: imageName,
            src: `./assets/${assetRelativePath}`,
          });
        }
      }

      if (chartImages.length === 0) return '';

      const gallery = chartImages
        .map(
          (img) => `
        <div class="chart-item">
          <img src="${img.src}" alt="${img.name}" />
          <div class="chart-caption">${img.name}</div>
        </div>
      `,
        )
        .join('');

      return `
        <section class="charts">
          <h2>Charts Gallery</h2>
          <div class="charts-gallery">
            ${gallery}
          </div>
        </section>
      `;
    } catch (e) {
      console.warn('Could not build charts gallery:', e.message);
      return '';
    }
  }

  /**
   * Build SEO Summary section
   */
  async buildSEOSummary(manifest) {
    try {
      // Look for SEO audit artifact
      const seoPath = this.findArtifactPath(manifest, ['reports/seo/audit.json', 'seo/audit.json']);
      if (!seoPath) return '';

      const fullPath = join(PROJECT_ROOT, seoPath);
      if (!existsSync(fullPath)) return '';

      const audit = JSON.parse(await readFile(fullPath, 'utf8'));

      const brokenLinks = audit.broken_links_count || 0;
      const canonicalRate = Math.round((audit.canonical_present_rate || 0) * 100);
      const hasSitemap = audit.has_sitemap ? 'Yes' : 'No';
      const pageCount = audit.pages?.length || 0;

      return `
        <section class="seo">
          <h2>SEO Audit Summary</h2>
          <div class="seo-content">
            <p><strong>Pages Audited:</strong> ${pageCount}</p>
            <p><strong>Broken Links:</strong> ${brokenLinks}</p>
            <p><strong>Canonical Coverage:</strong> ${canonicalRate}%</p>
            <p><strong>Sitemap Present:</strong> ${hasSitemap}</p>
            ${audit.summary ? `<p class="seo-summary">${this.escapeHtml(audit.summary)}</p>` : ''}
          </div>
        </section>
      `;
    } catch (e) {
      console.warn('Could not build SEO summary:', e.message);
      return '';
    }
  }

  /**
   * Build Media Section
   */
  async buildMediaSection(manifest) {
    try {
      // Look for media compose metadata
      const mediaPath = this.findArtifactPath(manifest, [
        'media/compose-metadata.json',
        'compose-metadata.json',
      ]);
      if (!mediaPath) return '';

      const fullPath = join(PROJECT_ROOT, mediaPath);
      if (!existsSync(fullPath)) return '';

      const compose = JSON.parse(await readFile(fullPath, 'utf8'));

      const duration = compose.actual_duration_s || 0;
      const expectedDuration = compose.expected_duration_s || 0;
      const variance = compose.duration_variance_pct || 0;
      const hasAudio = compose.has_audio_track ? 'Yes' : 'No';
      const resolution = `${compose.video_width}x${compose.video_height}`;

      // Copy media assets and create links (tenant-aware)
      const assetsDir = join(dirname(this.outputPath), 'assets');
      const runsRoot =
        this.tenant === 'default'
          ? join(PROJECT_ROOT, 'runs')
          : join(PROJECT_ROOT, 'runs', 'tenants', this.tenant);

      // Helper to resolve a source path for a relative artifact path.
      // Prefers tenant-aware runs path; falls back to manifest artifact entries.
      const resolveSourcePath = (relPath) => {
        if (!relPath) return null;
        const candidate = join(runsRoot, this.auvId, relPath);
        if (existsSync(candidate)) return candidate;
        // Fallback: look up by suffix in manifest artifacts
        const match = (manifest.artifacts || []).find((a) => a.path.endsWith(relPath));
        if (match) {
          const abs = join(PROJECT_ROOT, match.path);
          if (existsSync(abs)) return abs;
        }
        return null;
      };

      // Generic copy-and-link creator
      const copyToAssets = async (relPath, label, defaultText) => {
        if (!relPath) return '';
        const src = resolveSourcePath(relPath);
        if (src) {
          const dst = join(assetsDir, relPath);
          await mkdir(dirname(dst), { recursive: true });
          await copyFile(src, dst);
          return `<p><a href="./assets/${relPath}" target="_blank">${label}</a></p>`;
        }
        // Fallback to original relative path
        return `<p><a href="${relPath}" target="_blank">${defaultText}</a></p>`;
      };

      const videoLink = await copyToAssets(compose.video_path, 'View Video', 'View Video');
      const audioLink = await copyToAssets(
        compose.audio_path,
        'Listen to Audio',
        'Listen to Audio',
      );
      const scriptLink = await copyToAssets(compose.script_path, 'View Script', 'View Script');

      return `
        <section class="media">
          <h2>Media Composition</h2>
          <div class="media-content">
            <p><strong>Duration:</strong> ${duration}s (expected: ${expectedDuration}s, variance: ${variance.toFixed(1)}%)</p>
            <p><strong>Resolution:</strong> ${resolution}</p>
            <p><strong>Audio Track:</strong> ${hasAudio}</p>
            ${videoLink}
            ${audioLink}
            ${scriptLink}
          </div>
        </section>
      `;
    } catch (e) {
      console.warn('Could not build media section:', e.message);
      return '';
    }
  }

  /**
   * Build DB Migration Summary section
   */
  async buildDBMigrationSummary(manifest) {
    try {
      // Look for migration result artifact
      const migrationPath = this.findArtifactPath(manifest, [
        'db/migration-result.json',
        'migration-result.json',
      ]);
      if (!migrationPath) return '';

      const fullPath = join(PROJECT_ROOT, migrationPath);
      if (!existsSync(fullPath)) return '';

      const migration = JSON.parse(await readFile(fullPath, 'utf8'));

      const engine = migration.engine || 'unknown';
      const applied = migration.applied ? 'Success' : 'Failed';
      const migrationCount = migration.migrations?.length || 0;
      const validationOk = migration.validation_ok ? 'Passed' : 'Failed';

      const migrationList = (migration.migrations || [])
        .slice(0, 5)
        .map((m) => `<li>${this.escapeHtml(m.id)}: ${m.status}</li>`)
        .join('');

      return `
        <section class="database">
          <h2>Database Migration</h2>
          <div class="db-content">
            <p><strong>Engine:</strong> ${engine}</p>
            <p><strong>Status:</strong> ${applied}</p>
            <p><strong>Migrations:</strong> ${migrationCount}</p>
            <p><strong>Validation:</strong> ${validationOk}</p>
            ${migrationList ? `<h3>Recent Migrations</h3><ul>${migrationList}</ul>` : ''}
          </div>
        </section>
      `;
    } catch (e) {
      console.warn('Could not build DB migration summary:', e.message);
      return '';
    }
  }

  /**
   * Helper: Find artifact path by possible names
   */
  findArtifactPath(manifest, possibleNames) {
    for (const artifact of manifest.artifacts || []) {
      for (const name of possibleNames) {
        if (artifact.path.endsWith(name)) {
          return artifact.path;
        }
      }
    }
    return null;
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

    {{insights_summary}}
    {{charts_gallery}}
    {{seo_summary}}
    {{media_section}}
    {{db_migration_summary}}

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

    <section class="subagents">
      <h2>Subagent Narrative</h2>
      {{subagent_narrative}}
    </section>

    {{references_section}}
    {{intent_compare_section}}
    {{spend_summary_section}}

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
   * Get embedded styles (fallback) - Phase 14 enhanced
   */
  getEmbeddedStyles() {
    const theme = this.options.theme || 'light';
    const isDark = theme === 'dark';

    return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    :root {
      --bg-primary: ${isDark ? '#1a1a1a' : '#ffffff'};
      --bg-secondary: ${isDark ? '#2a2a2a' : '#f5f5f5'};
      --text-primary: ${isDark ? '#e0e0e0' : '#333333'};
      --text-secondary: ${isDark ? '#a0a0a0' : '#666666'};
      --border-color: ${isDark ? '#444444' : '#dddddd'};
      --accent-color: ${isDark ? '#4a9eff' : '#007acc'};
      --success-color: #4caf50;
      --warning-color: #ff9800;
      --error-color: #f44336;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: var(--text-primary);
      background: var(--bg-secondary);
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: var(--bg-primary);
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

    .subagents pre {
      background: #f8f9fa;
      padding: 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 12px;
      overflow-x: auto;
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

    /* Phase 14: References Browser */
    .references-browser {
      margin: 20px 0;
    }

    .references-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 20px;
      margin-top: 15px;
    }

    .reference-item {
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 15px;
      background: var(--bg-secondary);
    }

    .reference-item img,
    .reference-item video {
      width: 100%;
      height: auto;
      border-radius: 4px;
      margin: 10px 0;
    }

    .reference-label {
      font-weight: bold;
      color: var(--accent-color);
      margin-bottom: 10px;
    }

    .reference-notes {
      font-size: 0.9em;
      color: var(--text-secondary);
      margin-top: 10px;
    }

    /* Phase 14: Intent Compare */
    .intent-compare {
      margin: 20px 0;
    }

    .intent-summary {
      display: flex;
      gap: 30px;
      padding: 15px;
      background: var(--bg-secondary);
      border-radius: 8px;
      margin-bottom: 20px;
    }

    .intent-summary span {
      font-weight: 500;
    }

    .intent-comparison {
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .intent-pass {
      border-left: 4px solid var(--success-color);
    }

    .intent-advisory {
      border-left: 4px solid var(--warning-color);
    }

    .intent-slider-container {
      position: relative;
      margin: 20px 0;
    }

    .intent-slider input[type="range"] {
      width: 100%;
      margin: 10px 0;
    }

    .slider-images {
      position: relative;
      width: 100%;
      height: auto;
      overflow: hidden;
    }

    .slider-images img {
      width: 100%;
      height: auto;
      display: block;
    }

    .slider-images .actual-img {
      position: absolute;
      top: 0;
      left: 0;
      clip-path: inset(0 50% 0 0);
    }

    .intent-metrics {
      display: flex;
      justify-content: space-between;
      margin-top: 10px;
      font-size: 0.9em;
    }

    /* Phase 14: Spend Summary */
    .spend-summary {
      margin: 20px 0;
    }

    .spend-totals {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }

    .spend-item {
      padding: 15px;
      border-radius: 8px;
      background: var(--bg-secondary);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .spend-item.primary {
      border-left: 4px solid var(--accent-color);
    }

    .spend-item.secondary {
      border-left: 4px solid var(--warning-color);
    }

    .spend-item.total {
      border-left: 4px solid var(--success-color);
      font-weight: bold;
    }

    .spend-amount {
      font-family: 'Courier New', monospace;
      font-weight: 600;
    }

    .spend-by-capability {
      margin-top: 20px;
      padding: 15px;
      background: var(--bg-secondary);
      border-radius: 8px;
    }

    .spend-by-capability ul {
      list-style: none;
      margin-top: 10px;
    }

    .spend-by-capability li {
      padding: 5px 0;
      border-bottom: 1px solid var(--border-color);
    }

    .spend-by-capability li:last-child {
      border-bottom: none;
    }

    /* Responsive design */
    @media (max-width: 768px) {
      .references-grid {
        grid-template-columns: 1fr;
      }

      .intent-summary {
        flex-direction: column;
        gap: 10px;
      }

      .spend-totals {
        grid-template-columns: 1fr;
      }
    }

    /* Print styles */
    @media print {
      body {
        background: white;
        color: black;
      }

      .container {
        max-width: 100%;
        padding: 0;
      }

      .intent-slider input[type="range"] {
        display: none;
      }

      a {
        color: black;
        text-decoration: underline;
      }
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

  /**
   * Phase 14: Build References Section (includes copying/embedding assets)
   */
  async buildReferencesSection(manifest) {
    try {
      // Load items from manifest if present; otherwise fall back to runs index
      let items = (manifest.references && manifest.references.items) || [];

      if (items.length === 0) {
        const runsRoot =
          this.tenant === 'default'
            ? join(PROJECT_ROOT, 'runs')
            : join(PROJECT_ROOT, 'runs', 'tenants', this.tenant);
        const idxPath = join(runsRoot, this.auvId, 'references', 'references_index.json');
        if (existsSync(idxPath)) {
          try {
            const idx = JSON.parse(await readFile(idxPath, 'utf8'));
            items = Array.isArray(idx.items) ? idx.items : [];
          } catch {}
        }
      }

      if (items.length === 0) return '';

      const assetsDir = join(dirname(this.outputPath), 'assets');
      await mkdir(assetsDir, { recursive: true });
      const thresholdBytes = (this.options.embedSmallAssetsKb || 100) * 1024;

      const grid = [];
      for (const item of items) {
        // Basic schema validation per item
        const type = item?.type;
        if (!['image', 'video', 'url'].includes(type)) {
          continue;
        }
        const label = this.escapeHtml(item.label || '');
        const notes = item.notes
          ? `<div class="reference-notes">${this.escapeHtml(item.notes)}</div>`
          : '';

        if (item.type === 'url') {
          const url = this.escapeHtml(item.source || '#');
          grid.push(`
            <div class="reference-item">
              <div class="reference-label">${label}</div>
              <a href="${url}" target="_blank" rel="noopener noreferrer">External URL</a>
              ${notes}
            </div>`);
          continue;
        }

        const relPath = (item.path || '').replace(/\\/g, '/');
        if (!relPath) {
          console.warn('[report] Skipping reference without path:', item);
          continue;
        }
        const absPath = join(PROJECT_ROOT, relPath);
        let src = '';

        try {
          const st = await fsStat(absPath);
          if (item.type === 'image' && st.size <= thresholdBytes) {
            src = await this.embedImageAsDataUri(absPath);
          } else {
            const relFromRoot = relPath;
            const dest = join(assetsDir, relFromRoot);
            await mkdir(dirname(dest), { recursive: true });
            await copyFile(absPath, dest);
            src = `./assets/${relFromRoot}`;
          }
        } catch {
          continue;
        }

        const media =
          item.type === 'image'
            ? `<img src="${src}" alt="${label}" loading="lazy" />`
            : `<video controls src="${src}"></video>`;

        grid.push(`
          <div class="reference-item">
            <div class="reference-label">${label}</div>
            ${media}
            ${notes}
          </div>`);
      }

      return `
      <section class="references">
        <h2>Reference Visuals</h2>
        <div class="references-browser">
          <div class="references-grid">
            ${grid.join('\n')}
          </div>
        </div>
      </section>`;
    } catch (error) {
      console.warn('[report] Failed to build references browser:', error.message);
      return '';
    }
  }

  /**
   * Phase 14: Build Intent Compare section
   */
  async buildIntentCompareSection(_manifest) {
    try {
      const intentComparePath = join(PROJECT_ROOT, 'reports/visual/intent_compare.json');
      if (!existsSync(intentComparePath)) {
        return '';
      }

      const intentData = JSON.parse(await readFile(intentComparePath, 'utf8'));
      if (!intentData.comparisons || intentData.comparisons.length === 0) {
        return '';
      }

      let html = `<section class="intent">
        <h2>Intent Comparison</h2>
        <div class="intent-compare">
          <h3>Intent Comparison (Advisory)</h3>
          <div class="intent-summary">
            <span>Method: ${intentData.method}</span>
            <span>Threshold: ${(intentData.threshold * 100).toFixed(0)}%</span>
            <span>Average Diff: ${(intentData.avg_diff_pct * 100).toFixed(2)}%</span>
          </div>
          <div class="intent-comparisons">`;

      for (const comp of intentData.comparisons) {
        if (comp.status === 'skipped' || comp.status === 'error') continue;

        const statusClass = comp.status === 'pass' ? 'intent-pass' : 'intent-advisory';
        const safeId =
          `${(comp.label || 'ref').replace(/[^a-zA-Z0-9_-]/g, '_')}_${(comp.route || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(
            0,
            80,
          );

        // Process assets to dist or embed
        const refSrc = await this.processAssetToDistOrEmbed(
          (comp.reference || '').replace(/\\/g, '/'),
          true,
        );
        const actSrc = await this.processAssetToDistOrEmbed(
          (comp.actual || '').replace(/\\/g, '/'),
          true,
        );
        const diffLink = comp.diff_path
          ? await this.processAssetToDistOrEmbed((comp.diff_path || '').replace(/\\/g, '/'), false)
          : null;

        const labelText = this.escapeHtml(comp.label || '');
        const routeText = this.escapeHtml(comp.route || '');
        const ariaLabel = this.escapeHtml(
          `Compare reference and actual for ${comp.label || ''} ${comp.route || ''}`,
        );
        html += `
          <div class="intent-comparison ${statusClass}">
            <h4>${labelText} @ ${routeText}</h4>
            <div class="intent-slider-container">
              <div class="intent-slider">
                <input type="range" min="0" max="100" value="50" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" aria-label="${ariaLabel}"
                  oninput="updateSlider(this, '${safeId}')" />
                <div class="slider-images" id="${safeId}">
                  <img class="reference-img" src="${refSrc}" alt="Reference ${labelText} ${routeText}" />
                  <img class="actual-img" src="${actSrc}" alt="Actual ${labelText} ${routeText}" />
                </div>
              </div>
              <div class="intent-metrics">
                <span>Difference: ${(comp.diff_pct * 100).toFixed(2)}%</span>
                ${diffLink ? `<a href="${diffLink}" target="_blank">View Diff</a>` : ''}
              </div>
            </div>
          </div>`;
      }

      html += '</div></div></section>';

      // Add slider JavaScript (will be inlined)
      html += `
        <script>
          function updateSlider(slider, id) {
            const container = document.getElementById(id);
            if (container) {
              const actualImg = container.querySelector('.actual-img');
              if (actualImg) {
                actualImg.style.clipPath = 'inset(0 ' + (100 - slider.value) + '% 0 0)';
              }
            }
            try { slider.setAttribute('aria-valuenow', String(slider.value)); } catch (e) {}
          }
        </script>`;

      // Save summary for metadata
      this._intentSummary = {
        total:
          intentData.total || (intentData.comparisons ? intentData.comparisons.length : 0) || 0,
        avg_diff_pct: intentData.avg_diff_pct || 0,
        method: intentData.method || 'pixelmatch',
        threshold: intentData.threshold || 0,
      };

      return html;
    } catch (error) {
      console.warn('[report] Failed to build intent compare section:', error.message);
      return '';
    }
  }

  /**
   * Phase 14: Helper to embed small asset or copy to dist assets and return src/href.
   */
  async processAssetToDistOrEmbed(relPath, embedIfSmall = false) {
    try {
      if (!relPath) return '#';
      // Normalize and validate path to prevent traversal
      const sanitizedRel = relPath.replace(/^\/+/, '').replace(/\\/g, '/');
      const normalizedRel = sanitizedRel
        .split('/')
        .reduce((acc, seg) => {
          if (!seg || seg === '.') return acc;
          if (seg === '..') return acc; // drop traversals
          acc.push(seg);
          return acc;
        }, [])
        .join('/');
      const abs = join(PROJECT_ROOT, normalizedRel);
      if (!abs.startsWith(PROJECT_ROOT)) {
        console.warn(`[report] Blocked unsafe asset path (outside project root): ${relPath}`);
        return '#';
      }
      if (!existsSync(abs)) {
        console.warn(`[report] Asset not found: ${normalizedRel}`);
        return normalizedRel;
      }

      const thresholdBytes = (this.options.embedSmallAssetsKb || 100) * 1024;
      if (embedIfSmall) {
        const st = await fsStat(abs);
        if (st.size <= thresholdBytes) {
          return await this.embedImageAsDataUri(abs);
        }
      }
      const assetsDir = join(dirname(this.outputPath), 'assets');
      await mkdir(assetsDir, { recursive: true });
      const dest = join(assetsDir, normalizedRel);
      if (!dest.startsWith(assetsDir)) {
        console.warn(`[report] Blocked unsafe destination path (outside assets): ${normalizedRel}`);
        return '#';
      }
      await mkdir(dirname(dest), { recursive: true });
      if (!this.assetCopyCache.has(abs)) {
        await copyFile(abs, dest);
        this.assetCopyCache.set(abs, normalizedRel);
      }
      return `./assets/${normalizedRel}`;
    } catch (e) {
      console.warn(`[report] Failed to process asset '${relPath}': ${e?.message || e}`);
      return relPath;
    }
  }

  /**
   * Phase 14: Build Spend Summary section
   */
  async buildSpendSummary(manifest) {
    try {
      // Prefer aggregated spend report if present
      const spendAggPath = join(PROJECT_ROOT, 'reports/observability/spend.json');
      let primarySpend = 0;
      let secondarySpend = 0;
      const spendByCapability = {};

      // Aggregator
      if (existsSync(spendAggPath)) {
        try {
          const agg = JSON.parse(await readFile(spendAggPath, 'utf8'));
          // Try per-auv bucket first
          const byAuv = agg.byAuv || agg.by_auv || {};
          const auvEntry = byAuv[this.auvId];
          if (auvEntry && typeof auvEntry === 'object') {
            primarySpend = Number(auvEntry.primary_usd || auvEntry.primary || 0);
            secondarySpend = Number(auvEntry.secondary_usd || auvEntry.secondary || 0);
            Object.entries(auvEntry.by_capability || {}).forEach(([cap, amt]) => {
              spendByCapability[cap] = (spendByCapability[cap] || 0) + Number(amt || 0);
            });
          } else if (agg.totals) {
            primarySpend = Number(agg.totals.primary_usd || 0);
            secondarySpend = Number(agg.totals.secondary_usd || 0);
          }
        } catch {}
      }

      // Fallback to scanning ledgers
      if (primarySpend === 0 && secondarySpend === 0) {
        const ledgersDir = join(PROJECT_ROOT, 'runs/observability/ledgers');
        try {
          const files = existsSync(ledgersDir) ? readdirSync(ledgersDir) : [];
          for (const f of files) {
            if (!f.endsWith('.jsonl')) continue;
            const lines = (await readFile(join(ledgersDir, f), 'utf8')).split('\n').filter(Boolean);
            for (const line of lines) {
              try {
                const entry = JSON.parse(line);
                if (entry.auv_id === this.auvId || entry.run_id === this.runId) {
                  const amount = Number(entry.amount_usd || 0);
                  if (entry.tier === 'primary') primarySpend += amount;
                  else if (entry.tier === 'secondary') secondarySpend += amount;
                  if (entry.capability) {
                    spendByCapability[entry.capability] =
                      (spendByCapability[entry.capability] || 0) + amount;
                  }
                }
              } catch {}
            }
          }
        } catch {}
      }

      // Also check manifest.report.sections.spend_summary if present (v1.2+)
      if (manifest.report?.sections?.spend_summary) {
        primarySpend = manifest.report.sections.spend_summary.primary_usd || primarySpend;
        secondarySpend = manifest.report.sections.spend_summary.secondary_usd || secondarySpend;
      }

      const totalSpend = primarySpend + secondarySpend;

      if (totalSpend === 0) {
        return '';
      }

      let html = `<div class="spend-summary">
        <h3>MCP Tool Spend Summary</h3>
        <div class="spend-totals">
          <div class="spend-item primary">
            <span class="spend-label">Primary Tools:</span>
            <span class="spend-amount">$${primarySpend.toFixed(4)}</span>
          </div>
          <div class="spend-item secondary">
            <span class="spend-label">Secondary Tools:</span>
            <span class="spend-amount">$${secondarySpend.toFixed(4)}</span>
          </div>
          <div class="spend-item total">
            <span class="spend-label">Total:</span>
            <span class="spend-amount">$${totalSpend.toFixed(4)}</span>
          </div>
        </div>`;

      if (Object.keys(spendByCapability).length > 0) {
        html += `<div class="spend-by-capability">
          <h4>Spend by Capability</h4>
          <ul>`;

        for (const [cap, amount] of Object.entries(spendByCapability).sort((a, b) => b[1] - a[1])) {
          html += `<li>${this.escapeHtml(cap)}: $${amount.toFixed(4)}</li>`;
        }

        html += '</ul></div>';
      }

      html += '</div>';
      // Persist totals for metadata file
      this._spendSummaryTotals = {
        primary_usd: primarySpend,
        secondary_usd: secondarySpend,
        total_usd: totalSpend,
      };
      return html;
    } catch (error) {
      console.warn('[report] Failed to build spend summary:', error.message);
      return '';
    }
  }

  /**
   * Write companion metadata file with advisory report summaries.
   */
  async writeReportMetadata() {
    try {
      const metaSections = {};
      if (this._intentSummary) {
        metaSections.intent_compare = this._intentSummary;
      }
      if (this._spendSummaryTotals) {
        metaSections.spend_summary = this._spendSummaryTotals;
      }
      if (Object.keys(metaSections).length === 0) return;
      const outPath = join(dirname(this.outputPath), 'report-metadata.json');
      await writeFile(outPath, JSON.stringify({ report: { sections: metaSections } }, null, 2));
    } catch {}
  }

  /**
   * Helper: Embed small image as data URI
   */
  async embedImageAsDataUri(imagePath) {
    try {
      if (!existsSync(imagePath)) {
        return '#';
      }

      const imageBuffer = await readFile(imagePath);
      const extension = imagePath.split('.').pop().toLowerCase();
      const mimeType =
        extension === 'png'
          ? 'image/png'
          : extension === 'jpg' || extension === 'jpeg'
            ? 'image/jpeg'
            : extension === 'webp'
              ? 'image/webp'
              : 'image/png';

      return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
    } catch (error) {
      console.warn('[report] Failed to embed image:', error.message);
      return '#';
    }
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
    console.error('  --run-id <RUN>                  Use specific run ID');
    console.error('  -o <path>                       Output file path');
    console.error('  --manifest <path>               Path to manifest.json');
    console.error('  --include-references            Include reference visuals (Phase 14)');
    console.error('  --intent-compare                Run intent comparison (Phase 14)');
    console.error('  --theme <light|dark>            Report theme (default: light)');
    console.error(
      '  --embed-small-assets-kb <N>     Embed assets smaller than N KB (default: 100)',
    );
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
      case '--include-references':
        options.includeReferences = true;
        break;
      case '--intent-compare':
        options.intentCompare = true;
        break;
      case '--theme':
        options.theme = args[++i];
        break;
      case '--embed-small-assets-kb':
        options.embedSmallAssetsKb = parseInt(args[++i]);
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
