/**
 * Document Generate Executor - Deterministic document generation
 * Creates markdown and HTML reports from audit data, payment receipts, and media reports
 */

import fs from 'node:fs';
import path from 'node:path';
import { tenantPath } from '../tenant.mjs';

/**
 * Generate markdown summary from SEO audit
 */
function generateMarkdownSummary(audit) {
  // Handle different audit structures
  const url = audit.url || audit.audit_url || 'Unknown';
  const timestamp = audit.timestamp || audit.generated_at || new Date().toISOString();
  const source = audit.source || 'automated';
  const score =
    audit.score ||
    (audit.pages &&
      audit.pages[0] &&
      Math.round((1 - (audit.pages[0].issues || []).length / 10) * 100)) ||
    0;

  let md = '# SEO Audit Report\n\n';
  md += `**URL:** ${url}\n`;
  md += `**Date:** ${new Date(timestamp).toLocaleString()}\n`;
  md += `**Source:** ${source}\n\n`;

  // Score section
  md += `## Overall Score: ${score}%\n\n`;

  // Score badge
  let badge = '🔴'; // Red for poor
  if (score >= 80) {
    badge = '🟢';
  } // Green for good
  else if (score >= 60) badge = '🟡'; // Yellow for moderate

  md += `${badge} **${score >= 80 ? 'Good' : score >= 60 ? 'Needs Improvement' : 'Poor'}** SEO Health\n\n`;

  // Summary stats - handle both structures
  md += '### Summary\n\n';
  if (audit.summary) {
    md += `- ✅ **Passed:** ${audit.summary.passed_count || 0} checks\n`;
    md += `- ⚠️ **Warnings:** ${audit.summary.warning_count || 0} items\n`;
    md += `- ❌ **Issues:** ${audit.summary.issue_count || 0} problems\n`;
    md += `- **Total Checks:** ${audit.summary.total_checks || 0}\n\n`;
  } else if (audit.pages && audit.pages[0]) {
    const page = audit.pages[0];
    const issueCount = (page.issues || []).length;
    const warningCount = page.warnings || 0;
    md += `- ❌ **Issues:** ${issueCount} problems\n`;
    md += `- ⚠️ **Warnings:** ${warningCount} items\n\n`;
  }

  // Page information
  md += '### Page Information\n\n';
  md += `**Title:** ${audit.data?.title || 'Not found'}\n\n`;
  md += `**Meta Description:** ${audit.data?.meta_tags?.description || 'Not found'}\n\n`;
  md += `**Canonical URL:** ${audit.data?.canonical_url || 'Not specified'}\n\n`;
  md += `**Robots:** ${audit.data?.robots_directive || 'Not specified'}\n\n`;

  // Critical issues - handle both structures
  const issues = audit.issues || (audit.pages && audit.pages[0] && audit.pages[0].issues) || [];
  if (issues && issues.length > 0) {
    md += '### ❌ Critical Issues\n\n';
    issues.forEach((issue) => {
      if (typeof issue === 'string') {
        md += `- ${issue}\n`;
      } else {
        md += `- **${issue.type || 'Issue'}:** ${issue.message || issue}\n`;
      }
    });
    md += '\n';
  }

  // Warnings - handle both structures
  const warnings = audit.warnings || [];
  if (warnings && warnings.length > 0) {
    md += '### ⚠️ Warnings\n\n';
    warnings.slice(0, 10).forEach((warning) => {
      if (typeof warning === 'string') {
        md += `- ${warning}\n`;
      } else {
        md += `- **${warning.type || 'Warning'}:** ${warning.message || warning}\n`;
      }
    });
    if (warnings.length > 10) {
      md += `- ... and ${warnings.length - 10} more warnings\n`;
    }
    md += '\n';
  }

  // Passed checks - handle missing passed array
  const passed = audit.passed || [];
  if (passed && passed.length > 0) {
    md += '### ✅ Passed Checks\n\n';
    passed.slice(0, 10).forEach((pass) => {
      if (typeof pass === 'string') {
        md += `- ${pass}\n`;
      } else {
        md += `- **${pass.type || 'Check'}:** ${pass.message || pass}\n`;
      }
    });
    if (passed.length > 10) {
      md += `- ... and ${passed.length - 10} more passed checks\n`;
    }
    md += '\n';
  }

  // Content analysis
  md += '### Content Analysis\n\n';
  md += '#### Headings\n';
  md += `- **H1 Tags:** ${audit.data?.headings?.h1?.length || 0}\n`;
  md += `- **H2 Tags:** ${audit.data?.headings?.h2?.length || 0}\n`;
  md += `- **H3 Tags:** ${audit.data?.headings?.h3?.length || 0}\n\n`;

  md += '#### Links\n';
  md += `- **Internal Links:** ${audit.data?.links?.internal_count || 0}\n`;
  md += `- **External Links:** ${audit.data?.links?.external_count || 0}\n\n`;

  md += '#### Images\n';
  md += `- **Total Images:** ${audit.data?.images?.total || 0}\n`;
  md += `- **Images without Alt Text:** ${audit.data?.images?.without_alt || 0}\n\n`;

  md += '#### Structured Data\n';
  md += `- **Schema.org Blocks:** ${audit.data?.structured_data_count || 0}\n\n`;

  // Open Graph
  const ogTags = audit.data?.open_graph ? Object.keys(audit.data.open_graph) : [];
  if (ogTags.length > 0) {
    md += '#### Open Graph Tags\n';
    ogTags.forEach((tag) => {
      md += `- **${tag}:** ${audit.data.open_graph[tag]}\n`;
    });
    md += '\n';
  }

  // Recommendations - handle both string and object formats
  const recommendations = audit.recommendations || [];
  if (recommendations && recommendations.length > 0) {
    md += '## Recommendations\n\n';
    recommendations.forEach((rec, index) => {
      if (typeof rec === 'string') {
        md += `${index + 1}. ${rec}\n`;
      } else if (rec && rec.description) {
        const priority = rec.priority ? `[${rec.priority.toUpperCase()}] ` : '';
        md += `${index + 1}. ${priority}${rec.description}\n`;
      }
    });
    md += '\n';
  }

  // Footer
  md += '---\n\n';
  md += '*Generated by Swarm1 SEO Auditor*\n';
  md += `*Timestamp: ${new Date().toISOString()}*\n`;

  return md;
}

/**
 * Generate simple HTML report
 */
function generateHTMLReport(audit) {
  // Handle both structures
  const issues = audit.issues || (audit.pages && audit.pages[0] && audit.pages[0].issues) || [];
  // const warnings = audit.warnings || [];
  // const passed = audit.passed || [];
  const recommendations = audit.recommendations || [];
  const score =
    audit.score ||
    (audit.pages &&
      audit.pages[0] &&
      Math.round((1 - (audit.pages[0].issues || []).length / 10) * 100)) ||
    0;
  const url = audit.url || audit.audit_url || 'Unknown';
  const crawledPages = audit.crawled_pages || 0;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SEO Audit Report - ${url}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
        h2 { color: #34495e; margin-top: 30px; }
        h3 { color: #7f8c8d; }
        .score-badge {
            display: inline-block;
            font-size: 48px;
            font-weight: bold;
            padding: 20px;
            border-radius: 50%;
            width: 100px;
            height: 100px;
            text-align: center;
            line-height: 100px;
            margin: 20px 0;
            color: white;
            background: ${score >= 80 ? '#27ae60' : score >= 60 ? '#f39c12' : '#e74c3c'};
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            border-left: 4px solid #3498db;
        }
        .stat-value { font-size: 24px; font-weight: bold; }
        .stat-label { color: #7f8c8d; font-size: 14px; }
        .issue { color: #e74c3c; }
        .warning { color: #f39c12; }
        .passed { color: #27ae60; }
        ul { padding-left: 20px; }
        code {
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
        }
        .recommendation {
            background: #e8f4f8;
            border-left: 4px solid #3498db;
            padding: 10px 15px;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>SEO Audit Report</h1>
        
        <div class="score-badge">${score}%</div>
        
        <p><strong>URL:</strong> <code>${url}</code></p>
        <p><strong>Date:</strong> ${new Date(audit.timestamp || audit.generated_at || new Date().toISOString()).toLocaleString()}</p>
        <p><strong>Source:</strong> ${audit.source || 'automated'}</p>
        ${crawledPages > 0 ? `<p><strong>Pages Crawled:</strong> ${crawledPages} pages</p>` : ''}
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value passed">${audit.summary?.passed_count || 0}</div>
                <div class="stat-label">Passed Checks</div>
            </div>
            <div class="stat-card">
                <div class="stat-value warning">${audit.summary?.warning_count || (audit.pages && audit.pages[0] && audit.pages[0].warnings) || 0}</div>
                <div class="stat-label">Warnings</div>
            </div>
            <div class="stat-card">
                <div class="stat-value issue">${audit.summary?.issue_count || (issues && issues.length) || 0}</div>
                <div class="stat-label">Issues</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${audit.summary?.total_checks || 10}</div>
                <div class="stat-label">Total Checks</div>
            </div>
        </div>
        
        <h2>Page Information</h2>
        <ul>
            <li><strong>Title:</strong> ${audit.data?.title || 'Not found'}</li>
            <li><strong>Meta Description:</strong> ${audit.data?.meta_tags?.description || 'Not found'}</li>
            <li><strong>Canonical URL:</strong> ${audit.data?.canonical_url || 'Not specified'}</li>
            <li><strong>Robots:</strong> ${audit.data?.robots_directive || 'Not specified'}</li>
        </ul>
        
        ${
          issues && issues.length > 0
            ? `
        <h2 class="issue">Critical Issues</h2>
        <ul>
            ${issues
              .map((issue) => {
                if (typeof issue === 'string') {
                  return `<li>${issue}</li>`;
                } else {
                  return `<li><strong>${issue.type || 'Issue'}:</strong> ${issue.message || issue}</li>`;
                }
              })
              .join('')}
        </ul>
        `
            : ''
        }
        
        ${
          recommendations && recommendations.length > 0
            ? `
        <h2>Recommendations</h2>
        ${recommendations
          .map((rec) => {
            if (typeof rec === 'string') {
              return `<div class="recommendation">${rec}</div>`;
            } else if (rec && rec.description) {
              const priority = rec.priority ? `[${rec.priority.toUpperCase()}] ` : '';
              return `<div class="recommendation">${priority}${rec.description}</div>`;
            }
            return '';
          })
          .join('')}
        `
            : ''
        }
        
        <hr>
        <p><em>Generated by Swarm1 SEO Auditor • ${new Date().toISOString()}</em></p>
    </div>
</body>
</html>`;

  return html;
}

/**
 * Generate payment receipt from payment intent data
 */
function generatePaymentReceipt(paymentData, format) {
  const receipt = paymentData.payment_intent || paymentData;
  const amount = (receipt.amount / 100).toFixed(2);
  // const currency = (receipt.currency || 'usd').toUpperCase();
  const id = receipt.id || 'N/A';
  const status = receipt.status || 'unknown';
  const created = new Date((receipt.created || Date.now() / 1000) * 1000).toISOString();

  const result = {};

  if (format === 'markdown' || format === 'both') {
    let md = '# Payment Receipt\n\n';
    md += `**Transaction ID:** ${id}\n`;
    md += `**Amount:** $${amount}\n`;
    md += `**Status:** ${status}\n`;
    md += `**Date:** ${created}\n\n`;
    md += '---\n';
    md += '*Generated by Swarm1 Payment System*\n';
    result.markdown = md;
  }

  if (format === 'html' || format === 'both') {
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Payment Receipt</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; }
        .receipt { border: 2px solid #333; padding: 30px; }
        h1 { color: #333; }
        .amount { font-size: 24px; font-weight: bold; color: #27ae60; }
        .status { color: ${status === 'succeeded' ? '#27ae60' : '#e74c3c'}; }
    </style>
</head>
<body>
    <div class="receipt">
        <h1>Payment Receipt</h1>
        <p><strong>Transaction ID:</strong> ${id}</p>
        <p class="amount">$${amount}</p>
        <p class="status"><strong>Status:</strong> ${status}</p>
        <p><strong>Date:</strong> ${created}</p>
    </div>
</body>
</html>`;
    result.html = html;
  }

  return result;
}

/**
 * Generate media report from composition metadata
 */
function generateMediaReport(mediaData, format) {
  const metadata = mediaData.metadata || mediaData;
  const duration = metadata.duration_seconds || metadata.duration || 'N/A';
  const resolution = metadata.resolution || 'N/A';
  const fps = metadata.fps || 'N/A';
  const audioTracks = metadata.audio_track ? 1 : metadata.audio_tracks || 0;
  const slideCount = metadata.slides ? metadata.slides.length : 0;

  const result = {};

  if (format === 'markdown' || format === 'both') {
    let md = '# Media Production Report\n\n';
    md += '## Video Details\n\n';
    md += `- **Duration:** ${duration} seconds\n`;
    md += `- **Resolution:** ${resolution}\n`;
    md += `- **Frame Rate:** ${fps} fps\n`;
    md += `- **Audio Tracks:** ${audioTracks}\n`;
    if (slideCount > 0) {
      md += `- **Slides:** ${slideCount} slides\n`;
    }
    md += '\n## Script Preview\n\n';
    md += 'Script content would appear here.\n\n';
    md += '---\n';
    md += '*Generated by Swarm1 Media Pipeline*\n';
    result.markdown = md;
  }

  if (format === 'html' || format === 'both') {
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Media Production Report</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
        .report { background: #f5f5f5; padding: 30px; border-radius: 8px; }
        h1 { color: #333; }
        .properties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .property { background: white; padding: 15px; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="report">
        <h1>Media Production Report</h1>
        <div class="properties">
            <div class="property"><strong>Duration:</strong> ${duration} seconds</div>
            <div class="property"><strong>Resolution:</strong> ${resolution}</div>
            <div class="property"><strong>Frame Rate:</strong> ${fps} fps</div>
            <div class="property"><strong>Audio Tracks:</strong> ${audioTracks}</div>
            ${slideCount > 0 ? `<div class="property"><strong>Slides:</strong> ${slideCount} slides</div>` : ''}
        </div>
    </div>
</body>
</html>`;
    result.html = html;
  }

  return result;
}

/**
 * Generate database report from connectivity, roundtrip, and schema data
 */
function generateDatabaseReport(data, format) {
  const { connectivity = {}, roundtrip = {}, schema = {} } = data;

  // Extract key metrics
  const status = connectivity.status || 'unknown';
  const latency = connectivity.latency_ms || 'N/A';
  const query = roundtrip.query || 'N/A';
  const queryDuration = roundtrip.duration_ms || 'N/A';
  const schemaName = schema.name || 'N/A';
  const tables = schema.tables || [];

  const result = {};

  if (format === 'markdown' || format === 'both') {
    let md = '# Database Report\n\n';
    md += '## Connectivity\n\n';
    md += `- **Status:** ${status}\n`;
    md += `- **Latency:** ${latency}ms\n\n`;
    md += '## Roundtrip Test\n\n';
    md += `- **Query:** \`${query}\`\n`;
    md += `- **Duration:** ${queryDuration}ms\n\n`;
    if (schemaName !== 'N/A') {
      md += '## Schema\n\n';
      md += `- **Name:** ${schemaName}\n`;
      md += `- **Tables:** ${tables.length}\n`;
      if (tables.length > 0) {
        md += '\n### Table Details\n\n';
        tables.forEach((table) => {
          md += `- **${table.name || 'unnamed'}**: ${(table.columns || []).length} columns\n`;
        });
      }
    }
    md += '\n---\n';
    md += '*Generated by Swarm1 Database Manager*\n';
    result.markdown = md;
  }

  if (format === 'html' || format === 'both') {
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Database Report</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
        .report { background: #f5f5f5; padding: 30px; border-radius: 8px; }
        h1, h2 { color: #333; }
        .metric { background: white; padding: 15px; margin: 10px 0; border-radius: 4px; }
        .status-connected { color: #27ae60; font-weight: bold; }
        .status-unknown { color: #95a5a6; }
        code { background: #ecf0f1; padding: 2px 5px; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="report">
        <h1>Database Report</h1>
        
        <h2>Connectivity</h2>
        <div class="metric">
            <strong>Status:</strong> <span class="status-${status}">${status}</span>
        </div>
        <div class="metric">
            <strong>Latency:</strong> ${latency}ms
        </div>
        
        <h2>Roundtrip Test</h2>
        <div class="metric">
            <strong>Query:</strong> <code>${query}</code>
        </div>
        <div class="metric">
            <strong>Duration:</strong> ${queryDuration}ms
        </div>
        
        ${
          schemaName !== 'N/A'
            ? `
        <h2>Schema</h2>
        <div class="metric">
            <strong>Name:</strong> ${schemaName}
        </div>
        <div class="metric">
            <strong>Tables:</strong> ${tables.length}
        </div>
        ${
          tables.length > 0
            ? `
        <h3>Table Details</h3>
        ${tables
          .map(
            (table) => `
        <div class="metric">
            <strong>${table.name || 'unnamed'}:</strong> ${(table.columns || []).length} columns
        </div>
        `,
          )
          .join('')}
        `
            : ''
        }
        `
            : ''
        }
        
        <hr>
        <p><em>Generated by Swarm1 Database Manager • ${new Date().toISOString()}</em></p>
    </div>
</body>
</html>`;
    result.html = html;
  }

  return result;
}

/**
 * Execute document generation
 * @param {Object} params - Execution parameters
 * @param {string} params.template - Template type (seo_report, payment_receipt, media_report)
 * @param {string} params.format - Output format (markdown, html, both)
 * @param {string} params.tenant - Tenant ID (default: 'default')
 * @param {string} params.runId - Run ID for this execution
 * @param {string} params.dataPath - Path to data file for templates
 * @param {string} params.scriptPath - Path to script file
 * @param {string} params.composePath - Path to compose metadata
 * @param {string} params.videoPath - Path to video file
 * @returns {Object} Result with status and artifacts
 */
export async function executeDocGenerate(params) {
  const {
    template = 'seo_report',
    format = 'both',
    tenant = 'default',
    dataPath,
    composePath,
  } = params;

  // Handle payment receipt template
  if (template === 'payment_receipt') {
    const paymentPath = dataPath
      ? path.resolve(dataPath)
      : path.resolve(tenantPath(tenant, 'payments_demo/payment_intent.json'));

    let paymentData;
    if (!fs.existsSync(paymentPath)) {
      // Use fallback data for graceful handling
      paymentData = {
        id: 'N/A',
        amount: 0,
        currency: 'usd',
        status: 'unknown',
        created: Date.now() / 1000,
      };
    } else {
      paymentData = JSON.parse(fs.readFileSync(paymentPath, 'utf-8'));
    }
    const result = generatePaymentReceipt(paymentData, format);
    const artifacts = [];
    let mdPath, htmlPath;

    if (result.markdown) {
      mdPath = path.resolve(tenantPath(tenant, 'payments_demo/receipt.md'));
      fs.writeFileSync(mdPath, result.markdown);
      artifacts.push(mdPath);
    }

    if (result.html) {
      htmlPath = path.resolve(tenantPath(tenant, 'payments_demo/receipt.html'));
      fs.writeFileSync(htmlPath, result.html);
      artifacts.push(htmlPath);
    }

    return {
      success: true,
      status: 'success',
      message: `Generated payment receipt in ${format} format`,
      artifacts:
        format === 'both' && mdPath && htmlPath ? { html: htmlPath, markdown: mdPath } : artifacts,
      metadata: { template, format },
    };
  }

  // Handle media report template
  if (template === 'media_report') {
    const metadataPath = composePath
      ? path.resolve(composePath)
      : path.resolve('media/compose-metadata.json');
    if (!fs.existsSync(metadataPath)) {
      // Create basic metadata if missing
      const basicMetadata = {
        duration: 30,
        resolution: '1920x1080',
        fps: 30,
        audio_tracks: 1,
      };
      fs.mkdirSync('media', { recursive: true });
      fs.writeFileSync(metadataPath, JSON.stringify(basicMetadata, null, 2));
    }

    const mediaData = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    const result = generateMediaReport(mediaData, format);
    const artifacts = [];
    let mdPath, htmlPath;

    if (result.markdown) {
      mdPath = path.resolve('reports/media/production_report.md');
      const mdDir = path.dirname(mdPath);
      if (!fs.existsSync(mdDir)) fs.mkdirSync(mdDir, { recursive: true });
      fs.writeFileSync(mdPath, result.markdown);
      artifacts.push(mdPath);
    }

    if (result.html) {
      htmlPath = path.resolve('reports/media/production_report.html');
      const htmlDir = path.dirname(htmlPath);
      if (!fs.existsSync(htmlDir)) fs.mkdirSync(htmlDir, { recursive: true });
      fs.writeFileSync(htmlPath, result.html);
      artifacts.push(htmlPath);
    }

    return {
      success: true,
      status: 'success',
      message: `Generated media report in ${format} format`,
      artifacts:
        format === 'both' && mdPath && htmlPath ? { html: htmlPath, markdown: mdPath } : artifacts,
      metadata: { template, format },
    };
  }

  // Handle database report template
  if (template === 'database_report') {
    const connectivityPath = params.connectivityPath || params.input?.connectivity;
    const roundtripPath = params.roundtripPath || params.input?.roundtrip;
    const schemaPath = params.schemaPath || params.input?.schema;

    // Read the JSON files safely
    const readJsonSafe = (filepath) => {
      if (!filepath) return {};
      const resolved = path.resolve(filepath);
      if (!fs.existsSync(resolved)) return {};
      try {
        return JSON.parse(fs.readFileSync(resolved, 'utf8'));
      } catch {
        return {};
      }
    };

    const connectivity = readJsonSafe(connectivityPath);
    const roundtrip = readJsonSafe(roundtripPath);
    const schema = readJsonSafe(schemaPath);

    // Generate report
    const result = generateDatabaseReport({ connectivity, roundtrip, schema }, format);
    const artifacts = [];
    let mdPath, htmlPath;

    // Ensure reports/db directory exists
    const dbReportDir = path.resolve('reports/db');
    if (!fs.existsSync(dbReportDir)) {
      fs.mkdirSync(dbReportDir, { recursive: true });
    }

    if (result.markdown) {
      mdPath = path.resolve('reports/db/summary.md');
      fs.writeFileSync(mdPath, result.markdown);
      artifacts.push(mdPath);
    }

    if (result.html) {
      htmlPath = path.resolve('reports/db/summary.html');
      fs.writeFileSync(htmlPath, result.html);
      artifacts.push(htmlPath);
    }

    return {
      success: true,
      status: 'success',
      message: `Generated database report in ${format} format`,
      artifacts:
        format === 'both' && mdPath && htmlPath ? { html: htmlPath, markdown: mdPath } : artifacts,
      metadata: { template, format },
    };
  }

  // Handle narration script template
  if (template === 'narration_script') {
    const content = params.content || params.input?.content || '';
    const scriptPath = params.scriptPath || params.input?.scriptPath;

    // Get the script content
    let scriptText = content;
    if (!scriptText && scriptPath) {
      const resolved = path.resolve(scriptPath);
      if (fs.existsSync(resolved)) {
        scriptText = fs.readFileSync(resolved, 'utf8');
      }
    }

    // Ensure media directory exists
    const mediaDir = path.resolve('media');
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }

    // Write to media/script.txt
    const outputPath = path.resolve('media/script.txt');
    fs.writeFileSync(outputPath, scriptText);

    const artifacts = [outputPath];

    // Optionally create markdown version if format requests it
    if (format === 'markdown' || format === 'both') {
      const mdPath = path.resolve('media/script.md');
      fs.writeFileSync(mdPath, `# Narration Script\n\n${scriptText}`);
      artifacts.push(mdPath);
    }

    return {
      success: true,
      status: 'success',
      message: 'Generated narration script',
      artifacts,
      metadata: { template, format },
    };
  }

  // Default: SEO report (existing functionality)
  // Use dataPath if provided, otherwise default to standard location
  const auditPath = dataPath ? path.resolve(dataPath) : path.resolve('reports/seo/audit.json');

  if (!fs.existsSync(auditPath)) {
    throw new Error(`SEO audit not found at: ${auditPath}. Run seo.audit first.`);
  }

  console.log(`[doc.generate] Reading audit from: ${auditPath}`);

  // Load audit
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf-8'));

  // Handle different audit structures
  const url = audit.url || audit.audit_url || 'Unknown';
  const score =
    audit.score ||
    (audit.pages &&
      audit.pages[0] &&
      Math.round((1 - (audit.pages[0].issues || []).length / 10) * 100)) ||
    0;

  console.log(`[doc.generate] Generating report for URL: ${url} (score: ${score}%)`);

  const artifacts = [];
  let mdPath, htmlPath;

  // Generate markdown
  if (format === 'markdown' || format === 'both') {
    const markdown = generateMarkdownSummary(audit);
    mdPath = path.resolve('reports/seo/summary.md');
    fs.writeFileSync(mdPath, markdown);
    artifacts.push(mdPath);
    console.log(`[doc.generate] Markdown report written to: ${mdPath}`);
  }

  // Generate HTML
  if (format === 'html' || format === 'both') {
    generateMarkdownSummary(audit); // Generate to ensure consistent processing
    const html = generateHTMLReport(audit);
    htmlPath = path.resolve('reports/seo/summary.html');
    fs.writeFileSync(htmlPath, html);
    artifacts.push(htmlPath);
    console.log(`[doc.generate] HTML report written to: ${htmlPath}`);
  }

  // Extract values for return metadata
  const issues = audit.issues || (audit.pages && audit.pages[0] && audit.pages[0].issues) || [];
  const issueCount = Array.isArray(issues) ? issues.length : 0;
  const warningCount = (audit.pages && audit.pages[0] && audit.pages[0].warnings) || 0;

  return {
    success: true,
    status: 'success',
    message: `Generated ${format} report for SEO audit (score: ${score}%)`,
    artifacts:
      format === 'both' && mdPath && htmlPath ? { html: htmlPath, markdown: mdPath } : artifacts,
    metadata: {
      format,
      score,
      url,
      issues: issueCount,
      warnings: warningCount,
    },
  };
}
